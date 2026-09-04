/**
 * 방 목록의 데이터 — **등록소에서 받아 온다.** 찾기·정렬·발자국은 화면 쪽 규칙이다.
 *
 * ┌─ 목업이었다 (2026-08-31 에 진짜가 됐다) ─────────────────────────────────┐
 * │ 여기 있던 MOCK_ROOMS 여덟 줄은 그림이었다. 이유가 있었다: 방 하나가        │
 * │ Durable Object 하나이고 (worker/src/index.ts 의 idFromName), DO 는         │
 * │ **인스턴스를 열거할 수 없다.** 그래서 "열린 방 목록"을 만들 방법이 없었고,  │
 * │ 방 제목은 적어 둘 데가 없어서 만들기 화면에서 통째로 빠져 있었다.          │
 * │                                                                          │
 * │ 없던 것은 열거가 아니라 **적어 두는 자리**였다 — 이제 등록소 DO 가 하나     │
 * │ 있다 (worker/src/lobby-do.ts). 방들이 30초마다 자기 인원을 적고, 이 파일이  │
 * │ 그 종이를 읽는다. 그래서 목록의 「2/3」은 진짜로 그 방에 붙어 있는 사람 수다.│
 * │                                                                          │
 * │ 워커가 안 떠 있으면(`npm run dev` 만 돌릴 때) 목록은 **비는 게 아니라       │
 * │ 못 닿았다고 말한다** ('offline'). 그때도 번호를 아는 사람은 그대로 들어간다 │
 * │ — 방은 목록이 아니라 번호로 열리기 때문이다.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 최근 방(recentRooms)은 예나 지금이나 이 브라우저의 것이다 — 서버가 아니라 발자국이다.
 */

import { ROOM_CODE_RE } from '@/world/mp/constants';
import {
  MAX_ROOM_NAME_LEN,
  normalizeRoomName,
  type LobbyRoom,
  type OpenRoomError,
} from '@/world/mp/lobby';

/** 등록소의 계약은 워커와 나눠 쓰는 파일에 있다 — 화면 쪽에서 쓰기 좋게 여기서 다시 낸다 */
export { MAX_ROOM_NAME_LEN, normalizeRoomName };
export type { LobbyRoom, OpenRoomError };

/** 등록소 창구 (worker/src/index.ts 의 라우트). 개발 서버는 이 경로를 워커로 넘긴다 (vite.config.ts) */
const ROOMS_API = '/api/rooms';

/* ═══════════════════════════════ 등록소 ═══════════════════════════════ */

/**
 * 목록을 읽은 결과.
 *
 * ★ 'offline' 을 **빈 목록으로 접지 않는다.** 「지금 열린 방이 없다」와 「목록을 못 읽었다」는
 *   사람이 다음에 할 일이 다르다 — 앞은 방을 만들 차례고, 뒤는 워커를 띄울 차례다.
 *   그 둘을 같은 화면으로 보여 주면 아무도 없는 로비에서 워커가 죽은 걸 못 알아챈다.
 */
export type RoomsSnapshot = { status: 'ok'; rooms: LobbyRoom[] } | { status: 'offline' };

/** 열린 방 목록. 실패는 던지지 않는다 — 목록이 없는 것은 화면이 감당할 상태다 (위 주석) */
export async function fetchRooms(signal?: AbortSignal): Promise<RoomsSnapshot> {
  let res: Response;
  try {
    res = await fetch(ROOMS_API, { headers: { accept: 'application/json' }, signal });
  } catch (e) {
    // 중단은 실패가 아니다 — 화면이 떠난 것이므로 그대로 올려 보내고 호출부가 무시한다
    if ((e as { name?: string }).name === 'AbortError') throw e;
    return { status: 'offline' };
  }
  if (!res.ok) return { status: 'offline' };
  try {
    const body = (await res.json()) as { rooms?: unknown };
    return { status: 'ok', rooms: Array.isArray(body.rooms) ? (body.rooms as LobbyRoom[]) : [] };
  } catch {
    return { status: 'offline' };
  }
}

/** 방 만들기 결과. 실패는 **이유가 있는 실패**다 — 화면이 그 자리에 문구를 적는다 */
export type OpenResult = { ok: true; room: LobbyRoom } | { ok: false; error: OpenRoomError | 'offline' };

/**
 * 방을 등록한다. 번호를 안 주면 등록소가 빈 번호를 뽑아 준다.
 *
 * ★ 값이 없는 키는 아예 싣지 않는다 (원작 lib/api/room.ts 의 주의). `{ name: '' }` 는
 *   그대로 나가서 서버가 다시 접어야 하고, 요청만 봐서는 "이름을 비웠다"와 "안 보냈다"가
 *   구분되지 않는다. 보내는 쪽에서 정리한다.
 */
export async function openRoom({ name, code }: { name?: string; code?: string } = {}): Promise<OpenResult> {
  const body: { name?: string; code?: string } = {};
  const title = normalizeRoomName(name);
  if (title) body.name = title;
  if (code) body.code = code;

  let res: Response;
  try {
    res = await fetch(ROOMS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'offline' };
  }

  let parsed: { room?: LobbyRoom; error?: string } = {};
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    /* 본문이 JSON 이 아니면 아래에서 상태 코드로만 판정한다 */
  }
  if (res.ok && parsed.room) return { ok: true, room: parsed.room };
  const error = parsed.error;
  return { ok: false, error: isOpenError(error) ? error : 'offline' };
}

const OPEN_ERRORS: OpenRoomError[] = ['bad_code', 'code_taken', 'name_taken', 'no_code', 'too_many', 'registry_disabled'];
const isOpenError = (v: unknown): v is OpenRoomError => typeof v === 'string' && (OPEN_ERRORS as string[]).includes(v);

/**
 * 거절당한 이유를 사람 말로. **워커는 뜻만 보내고 문구는 여기 있다** (src/world/mp/lobby.ts) —
 * 서버가 한국어 문장을 들고 있으면 화면의 말투를 고칠 때마다 워커를 배포해야 한다.
 */
export const OPEN_ERROR_TEXT: Record<OpenRoomError | 'offline', string> = {
  bad_code: '방 번호는 숫자 1~6자리',
  code_taken: '그 번호는 이미 열려 있다 — 「코드로 입장」으로 들어가라',
  name_taken: '같은 제목의 방이 이미 있다. 다른 이름을 붙여라',
  no_code: '빈 번호를 못 찾았다. 번호를 직접 정해 보라',
  too_many: '열린 방이 너무 많다. 잠시 뒤에 다시',
  registry_disabled: '이 배포에는 방 등록소가 없다 — 번호를 아는 사람끼리는 그대로 들어간다',
  offline: '등록소에 닿지 못했다 — 워커(npm run worker:dev)가 떠 있나?',
};

/** 화면에 적히는 이름. 제목이 없는 방만 코드가 그 자리를 물려받는다 — 「(제목 없음)」 같은 자리표시자는 넣지 않는다 */
export function roomLabel(room: LobbyRoom): string {
  return room.name ?? `#${room.code}`;
}

/* ───────────────────────────── 찾기 · 정렬 ───────────────────────────── */

/**
 * 맞춰 보기 전에 양쪽을 같은 모양으로 접는다. 대소문자와 **공백**을 지우므로
 * "말 많은"으로 「말많은 방」이 걸린다 — 띄어쓰기를 기억해서 치는 사람은 없다.
 *
 * ★ NFC 로 먼저 합친다. 제목은 등록소가 합쳐서 적어 두는데(normalizeRoomName) 찾는 말은
 *   맥에서 붙여넣으면 자모가 풀린 채로 온다 — 그러면 눈에 같은 글자가 안 걸린다.
 */
export function foldForSearch(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, '');
}

export type SortableCol = 'title' | 'players';
export interface Sort {
  key: SortableCol;
  dir: 'asc' | 'desc';
}

/** 열 이름을 누를 때마다: 같은 열이면 방향만 뒤집고, 다른 열이면 그 열의 기본 방향으로 간다 */
export function nextSort(cur: Sort, col: SortableCol): Sort {
  if (cur.key === col) return { key: col, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
  // 제목은 ㄱ부터, 인원은 많은 쪽부터가 기본이다 — 찾는 이유가 열마다 다르다
  return { key: col, dir: col === 'title' ? 'asc' : 'desc' };
}

/** 정렬은 **베껴서** 한다 — 원본 배열을 뒤집으면 목록이 렌더 도중에 흔들린다 */
export function sortRooms(rooms: LobbyRoom[], sort: Sort): LobbyRoom[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rooms].sort((a, b) => {
    if (sort.key === 'players') {
      const d = a.players - b.players;
      // 인원이 같으면 번호순 — 같은 값끼리 자리가 매번 바뀌면 목록이 살아 움직인다
      return d !== 0 ? d * sign : a.code.localeCompare(b.code);
    }
    return roomLabel(a).localeCompare(roomLabel(b), 'ko') * sign;
  });
}

/* ─────────────────────────── 최근 들어간 방 ─────────────────────────── */

const RECENT_KEY = 'wih:recent-rooms';
/** 적어 두는 최대 줄 수. 왼쪽 기둥은 이 중 앞의 다섯만 본다 */
const RECENT_MAX = 20;

/** 언제 어느 방에 들어갔나. 판의 결과가 아니라 **발자국**이다 */
export interface RoomVisit {
  code: string;
  /** 들어간 시각 (ms) */
  at: number;
}

/**
 * 이 브라우저가 실제로 들어갔던 방. 원작의 「최근 게임」·「기록」 자리에 든다 —
 * 전적 API 가 없어서 승패는 못 적지만, **어디에 언제 있었는지는 진짜로 안다.**
 *
 * localStorage 접근은 전부 try/catch 다 (shared/guest.ts 와 같은 규칙).
 * 옛 모양(코드 문자열만 든 배열)도 읽는다 — 시각을 모르는 줄은 at:0 으로 들어오고,
 * 화면은 그걸 「기록 없음」으로 적는다. 남의 브라우저에 남은 값을 버리지 않기 위해서다.
 */
export function recentRooms(): RoomVisit[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RoomVisit[] = [];
    for (const v of parsed) {
      if (typeof v === 'string' && ROOM_CODE_RE.test(v)) out.push({ code: v, at: 0 });
      else if (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as RoomVisit).code === 'string' &&
        ROOM_CODE_RE.test((v as RoomVisit).code)
      ) {
        const at = (v as RoomVisit).at;
        out.push({ code: (v as RoomVisit).code, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 });
      }
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** 들어간 방을 맨 앞에 적는다. 같은 방을 다시 들어가면 자리만 올라가고 시각이 갱신된다 */
export function rememberRoom(code: string, now = Date.now()): void {
  if (!ROOM_CODE_RE.test(code)) return;
  try {
    const next = [{ code, at: now }, ...recentRooms().filter((v) => v.code !== code)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 못 적으면 기록만 비어 보인다 — 판에는 지장이 없다 */
  }
}

/**
 * 얼마나 지났나. 초 단위는 적지 않는다 — 기록을 들여다보는 사람에게 「43초 전」은
 * 「방금」과 같은 말이고, 숫자만 흔들려서 화면이 살아 움직인다.
 *
 * @param at 0 이면 시각을 모르는 옛 기록이다 (recentRooms 참고)
 */
export function sinceLabel(at: number, now = Date.now()): string {
  if (at <= 0) return '기록 없음';
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}
