/**
 * 관찰 수첩 — **내가 적어 두는 것**. 방마다 오른쪽에 서는 판(shared/NotePad.tsx)의 저장소다.
 *
 * ┌─ 왜 방마다가 아니라 한 권인가 ───────────────────────────────────────────┐
 * │ 이 게임에서 사람이 하는 일은 **앞 방에서 본 것을 뒷방에서 대조하는 것**이다 — │
 * │ 복도에서 들은 식별번호를 검문소에서 다시 듣고 어긋나는지 본다. 방마다 새      │
 * │ 수첩을 주면 그 대조가 불가능해진다. 그래서 수첩은 한 권이고, 대신 **줄마다**  │
 * │ 어디서 적었는지(room)를 적어 둔다. 그게 이 판이 답해야 할 질문이다:          │
 * │ "이 말을 내가 어디서 들었더라."                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 서버에 안 보낸다. localStorage 한 곳(wih:notes)이다 — 이건 게임의 상태가 아니라 **내 메모**고,
 * 판정에도 방송에도 들어가지 않는다 (shared/sfx.ts 의 스위치와 같은 자리·같은 규칙).
 * 저장이 막힌 브라우저에서도 이번 판 동안은 멀쩡히 적힌다 — 남지만 않는다.
 *
 * ★ Redux 에 넣지 않는다. 화면 하나가 쓰는 값이고, 이 판은 3D 가 도는 방 위에 얹히므로
 *   store 를 안 쓰는 화면(/arena · /scenario2 는 제 상태를 직접 든다)에서도 똑같이 서야 한다.
 *   대신 useSyncExternalStore 가 물 수 있게 구독을 연다 (features/world 의 suspicion·health 와 같은 모양).
 */

export const NOTES_KEY = 'wih:notes';
export const NOTES_OPEN_KEY = 'wih:notes:open';

/** 한 줄 길이 상한 — 수첩은 글을 쓰는 자리가 아니라 **표시하는 자리**다 (채팅 한 줄과 같은 200자) */
export const NOTE_MAX_LEN = 200;
/** 몇 줄까지 드나 — 넘으면 오래된 줄부터 밀려난다 (아래 capNotes 는 표식 찍은 줄을 뒤로 미룬다) */
export const NOTES_MAX = 120;

export interface Note {
  id: string;
  /** 적힌 그대로. 줄바꿈은 없다 (trimNoteText 가 한 줄로 편다) */
  text: string;
  /** 어느 방에서 적었나 — 「복도」·「검증실」처럼 사람이 읽는 이름. 방을 모르면 빈 문자열 */
  room: string;
  ts: number;
  /** 의심 표식 — 눌러서 켠다. 켠 줄은 밀려날 때 제일 늦게 밀려난다 */
  mark: boolean;
}

/* ═══════════════════════════ 순수 규칙 ═══════════════════════════ */

/**
 * 적힌 것을 한 줄로 편다. 줄바꿈·연속 공백을 공백 하나로 접고 앞뒤를 턴 뒤 상한에서 자른다.
 * 빈 줄이면 빈 문자열 — 부르는 쪽이 그걸 보고 안 넣는다.
 */
export function trimNoteText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_LEN);
}

/**
 * 상한을 넘은 만큼 앞에서 덜어 낸다.
 *
 * **표식 찍은 줄을 먼저 살린다** — 표식은 "이건 나중에 다시 볼 것"이라는 뜻이라, 그걸 밀어내면서
 * 안 찍은 새 줄을 남기면 수첩이 제 할 일을 못 한다. 표식뿐이면 그때는 오래된 것부터 민다.
 */
export function capNotes(list: readonly Note[], max = NOTES_MAX): Note[] {
  if (list.length <= max) return [...list];
  const next = [...list];
  let over = next.length - max;
  // ① 표식 없는 줄을 오래된 것부터
  for (let i = 0; i < next.length && over > 0; ) {
    if (next[i].mark) i += 1;
    else {
      next.splice(i, 1);
      over -= 1;
    }
  }
  // ② 그래도 넘치면 표식까지 오래된 것부터
  if (over > 0) next.splice(0, over);
  return next;
}

/** 저장소에서 읽은 값이 수첩인가 — 남의 탭·옛 판이 남긴 쓰레기를 여기서 거른다 */
export function parseNotes(raw: string | null): Note[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Note[] = [];
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const text = typeof r.text === 'string' ? trimNoteText(r.text) : '';
    if (!text) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : nextId(),
      text,
      room: typeof r.room === 'string' ? r.room.slice(0, 24) : '',
      ts: typeof r.ts === 'number' && Number.isFinite(r.ts) ? r.ts : Date.now(),
      mark: r.mark === true,
    });
  }
  return capNotes(out);
}

/* ═══════════════════════════ 저장소 ═══════════════════════════ */

let seq = 0;

function nextId(): string {
  seq += 1;
  return `n${Date.now().toString(36)}-${seq.toString(36)}`;
}

const listeners = new Set<() => void>();

function announce(): void {
  for (const fn of listeners) fn();
}

/**
 * 저장소가 **살아 있나.** 한 번이라도 쓰기가 거절되면(사파리 비공개 모드·저장소 차단) 거짓이 되고,
 * 그 뒤로는 저장소를 진실로 안 본다 — 아래 `fresh()` 가 그걸 보고 비켜난다. 안 그러면 쓰기는
 * 막혔는데 읽기는 되는 브라우저에서 **적을 때마다 빈 저장소가 이번 판의 수첩을 덮어쓴다.**
 */
let storageOk = true;

/* ── 다른 탭 ── */

let stopStorage: (() => void) | null = null;

/**
 * 다른 탭이 수첩을 고쳤다 — 여기도 따라 읽는다.
 *
 * 같은 게임을 탭 둘에 열어 두는 일은 흔하다 (방 두 개, 또는 이야기와 검증실). 저장소는 한 곳인데
 * 화면이 제 기억만 믿으면, B 탭에서 적은 한 줄이 A 탭의 다음 쓰기에 통째로 지워진다.
 * `storage` 이벤트는 **다른 탭의 쓰기**에만 온다 (제 탭의 쓰기에는 안 온다).
 *
 * 여닫힘(NOTES_OPEN_KEY)은 안 따라간다 — 그건 저 탭 화면의 상태이지 수첩의 내용이 아니다.
 * 구독자가 생길 때 붙고 마지막 구독자가 떠날 때 뗀다 (world/input 의 watchPointerKind 와 같은 손).
 */
function watchStorage(): void {
  if (stopStorage || typeof window === 'undefined') return;
  const onStorage = (e: StorageEvent) => {
    // key 가 null 이면 저쪽에서 저장소를 통째로 비운 것이다
    if (e.key !== null && e.key !== NOTES_KEY) return;
    notes = null;
    read();
    announce();
  };
  window.addEventListener('storage', onStorage);
  stopStorage = () => window.removeEventListener('storage', onStorage);
}

/** useSyncExternalStore 용 — 줄 목록과 여닫힘이 같은 구독을 쓴다 (둘 다 이 판 하나가 읽는다) */
export function subscribeNotes(fn: () => void): () => void {
  listeners.add(fn);
  watchStorage();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && stopStorage) {
      stopStorage();
      stopStorage = null;
    }
  };
}

let notes: Note[] | null = null;

function read(): Note[] {
  if (notes) return notes;
  try {
    notes = parseNotes(localStorage.getItem(NOTES_KEY));
  } catch {
    notes = []; // 저장소를 막아 둔 브라우저 — 이번 판 동안만 적힌다
  }
  return notes;
}

/**
 * **고치기 직전의 진짜 수첩.** 저장소를 그 자리에서 다시 읽는다.
 *
 * 화면이 들고 있는 기억은 다른 탭이 그 사이 적은 줄을 모른다 — 그 기억 위에 한 줄을 얹어 쓰면
 * 저쪽 줄이 지워진다. 고칠 때만 다시 읽으므로(누를 때뿐이다) 값은 싸다.
 * 저장이 막힌 브라우저에서는 읽은 값을 안 믿는다 (storageOk) — 거기서는 이번 판의 기억이 진실이다.
 */
function fresh(): Note[] {
  if (!storageOk) return read();
  try {
    return parseNotes(localStorage.getItem(NOTES_KEY));
  } catch {
    return read();
  }
}

function write(next: Note[]): void {
  notes = next;
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    storageOk = false; // 안 남아도 화면은 next 를 그대로 그린다 — 다만 이제 저장소를 진실로 안 본다
  }
  announce();
}

/**
 * ★ **같은 배열을 돌려준다.** useSyncExternalStore 는 스냅샷이 매번 다르면 무한히 다시 그린다 —
 *   바뀔 때만 write 가 새 배열로 갈아 끼운다.
 */
export function getNotes(): readonly Note[] {
  return read();
}

/** 적는다. 빈 줄이면 아무 일도 없다 (null). 새 줄은 맨 뒤 — 목록은 시간순이다 */
export function addNote(raw: string, room = ''): Note | null {
  const text = trimNoteText(raw);
  if (!text) return null;
  const note: Note = { id: nextId(), text, room: room.slice(0, 24), ts: Date.now(), mark: false };
  write(capNotes([...fresh(), note]));
  return note;
}

/** 고쳐 적는다 — 빈 줄로 고치면 지운 것으로 본다 (칸을 비우고 확인하는 손이 자연스럽다) */
export function editNote(id: string, raw: string): void {
  const text = trimNoteText(raw);
  if (!text) return removeNote(id);
  const cur = fresh();
  if (!cur.some((n) => n.id === id)) return;
  write(cur.map((n) => (n.id === id ? { ...n, text } : n)));
}

export function removeNote(id: string): void {
  const cur = fresh();
  const next = cur.filter((n) => n.id !== id);
  if (next.length === cur.length) return;
  write(next);
}

/** 의심 표식을 켜고 끈다 */
export function toggleNoteMark(id: string): void {
  const cur = fresh();
  if (!cur.some((n) => n.id === id)) return;
  write(cur.map((n) => (n.id === id ? { ...n, mark: !n.mark } : n)));
}

/** 수첩을 통째로 비운다 — 부르는 쪽이 먼저 되묻는다 */
export function clearNotes(): void {
  if (read().length === 0) return;
  write([]);
}

/** 저장소를 다시 읽는다 — 시험과, 저장소를 밖에서 갈아 끼운 뒤를 위한 뒷길 */
export function reloadNotes(): void {
  notes = null;
  storageOk = true;
  read();
  announce();
}

/* ═══════════════════════════ 여닫힘 ═══════════════════════════ */

/**
 * 처음 온 사람에게는 **펴 둔다** — 접힌 채로 두면 수첩이 있다는 것을 아무도 모른다.
 * 단 좁은 화면(폰·세로 창)에서는 접는다: 3D 방 위에 판이 하나 더 서면 볼 것을 가린다.
 * 한 번이라도 접거나 펴면 그 결정이 남고, 그 뒤로는 화면 너비를 안 본다.
 */
function defaultOpen(): boolean {
  try {
    return window.matchMedia('(min-width: 900px)').matches;
  } catch {
    return true;
  }
}

let open: boolean | null = null;

export function notesOpen(): boolean {
  if (open !== null) return open;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(NOTES_OPEN_KEY);
  } catch {
    /* 못 읽으면 기본값 */
  }
  open = saved === 'open' ? true : saved === 'shut' ? false : defaultOpen();
  return open;
}

export function setNotesOpen(next: boolean): void {
  if (notesOpen() === next) return;
  open = next;
  try {
    localStorage.setItem(NOTES_OPEN_KEY, next ? 'open' : 'shut');
  } catch {
    /* 안 남아도 이번 판에서는 열린다 */
  }
  announce();
}

/** 여닫힘도 저장소에서 다시 읽는다 (시험용 뒷길) */
export function reloadNotesOpen(): void {
  open = null;
  announce();
}
