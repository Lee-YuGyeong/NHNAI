/**
 * 귓속말 — **친밀도가 앞을 알려 준다** (2026-09-04 사용자: 「친밀도를 쌓으면 다음 방에 대한 힌트를 알려주고
 * 마지막 검문실에 대한 내용을 알려주기도 하는… 인간이 침입했다는 걸 AI 는 이미 파악했다고 조심하는 게 좋다는
 * 형식으로 방마다 내용이 이어지게」).
 *
 * 태도가 오른 그 대답 뒤에 개체가 한 박자 두고 흘리는 두 줄이다. 값이 아니라 **앞**을 준다 —
 * 다음 칸에서 무엇이 열리는가, 그리고 끝에 있는 방이 무엇을 하는 곳인가. 방마다 둘이고, 앞의 것(next)이
 * 나온 뒤에만 뒤의 것(last)이 열린다. 지나간 방의 것은 다시 안 연다 — 정보는 상한다.
 *
 * ★ 열두 줄이 **한 문장으로 이어진다.** 복도의 「…밖에서 뭐가 들어왔대」가 휴게에서 「나도 들었어」로 받히고,
 *   중앙 시설에서 「이제 외형 말고 행동을 본대」로 판별 방식이 바뀌고, 창이 있는 방에서 「저건 널 찾으라고
 *   시킬 거야」가 되어 나를 가리킨다. 개체는 나를 지목하지 않는다 — 구역이 무엇을 찾는지를 말할 뿐이다.
 *
 * ★ 문장은 여기 있고 **조건은 없다** (script.ts 머리말의 「대사는 두 군데 적지 않는다」의 짝):
 *   언제 뜨는지는 scenario2 의 offerHint 가, 문장은 이 파일이 쥔다. 굽는 쪽(tools/voice-lines.mjs)이
 *   `Line[]` 을 글자로 긁어 가므로 항목마다 상수 하나씩 — 그래야 이 줄들에도 제 클립이 붙는다.
 *
 * ★ **상한에 닿은 개체도 준다.** units.shift 는 cap 에서 멎고, 멎은 뒤에는 좋은 말을 해도 delta 가 0 이다
 *   (talk.ts 의 weigh). 밖 얘기 한 번에 3 이 되는 seer(cast 의 outside: 3)가 정확히 그 경우라, delta 만
 *   보면 창이 있는 방의 두 줄이 **영영 안 나온다.** 그래서 조건은 「이 말로 올랐거나, 더 오를 데가 없다」다.
 *
 * 대사는 전부 대본 v8(docs/design/plan-dialogue-v7.md 의 「귓속말」)의 인용이다 — 시험이 글자로 대조한다.
 */

import type { Line } from './script';
import type { Room } from './scenario2';
import type { TalkResult } from './talk';
import { units } from './units';

/* ─────────────────────────────── 문장 ─────────────────────────────── */

/** 복도 · 다음 방 — 소문이 여기서 시작한다. 아직 나라고는 안 한다 */
export const HINT_CORRIDOR_NEXT: Line[] = [
  { who: 'u104', text: '…밖에서 뭐가 들어왔대.' },
  { who: 'u104', text: '다음 칸 문은 주기로만 열려.' },
];
/** 복도 · 마지막 방 — 끝에 방이 하나 더 있고, 거기서 하나를 찾는다 */
export const HINT_CORRIDOR_LAST: Line[] = [
  { who: 'u137', text: '끝에 방이 하나 더 있어.' },
  { who: 'u137', text: '거기서 하나를 찾는대.' },
];

/** 휴게 · 다음 방 — 소문이 방을 건넜다. 한 개체의 착각이 아니라 구역의 공기다 */
export const HINT_REST_NEXT: Line[] = [
  { who: 'u201', text: '나도 들었어. 뭐가 들어왔다고.' },
  { who: 'u201', text: '다음은 홀이야. 줄 서서 번호 대.' },
];
/** 휴게 · 마지막 방 — 이름과 성질. 문답과 검사를 가른다 */
export const HINT_REST_LAST: Line[] = [
  { who: 'seer', text: '…끝은 인지 검증실이야.' },
  { who: 'seer', text: '거긴 물어보는 데가 아니야.' },
];

/** 중앙 시설 · 다음 방 — 사슬의 척추. AI 가 아는 데서 그치지 않고 판별 방식을 바꿨다 */
export const HINT_CENTRAL2_NEXT: Line[] = [
  { who: 'u118', text: '이제 외형 말고 행동을 본대.' },
  { who: 'u118', text: '다음은 작업 통로. 두 주기야.' },
];
/** 중앙 시설 · 마지막 방 — 같은 화자가 두 방의 규칙을 갈라 준다 */
export const HINT_CENTRAL2_LAST: Line[] = [
  { who: 'u118', text: '끝 방은 검사만 해.' },
  { who: 'u118', text: '시키는 걸 시키는 대로 해.' },
];

/** 작업 · 다음 방 — 앞 방의 귓속말이 참이었다는 증거. 그래서 뒤의 말을 믿게 된다 */
export const HINT_WORK_NEXT: Line[] = [
  { who: 'u201', text: '두 주기 채우면 다음이야.' },
  { who: 'u201', text: '벽만 있는 복도래. 글씨 있대.' },
];
/** 작업 · 마지막 방 — 누적 규칙. 숫자를 하나도 안 대고 「세 번째」만 준다 */
export const HINT_WORK_LAST: Line[] = [
  { who: 'u063', text: '한 번은 넘어가. 두 번도.' },
  { who: 'u063', text: '세 번째엔 안 넘어가.' },
];

/** 기록 · 다음 방 — 복도에서 처음 말을 텄던 개체가 그 방 앞까지 데려다준다 */
export const HINT_ARCHIVE_NEXT: Line[] = [
  { who: 'u137', text: '다음 칸엔 창이 있대.' },
  { who: 'u137', text: '먼저 온 것이 거기 있어.' },
];
/** 기록 · 마지막 방 — 벽에 긁힌 거짓을 그 자리에서 뒤집는다. 벽의 글자는 안 지운다 */
export const HINT_ARCHIVE_LAST: Line[] = [
  { who: 'u137', text: '…그 긁힌 글씨 믿지 마.' },
  { who: 'u137', text: '끝에선 번호를 안 물어.' },
];

/** 창 · 다음 방 = 마지막 방 — 사슬의 마지막 못. 소문이 여기서 나를 가리킨다 */
export const HINT_WINDOW_NEXT: Line[] = [
  { who: 'seer', text: '들어가면 등 뒤가 닫혀.' },
  { who: 'seer', text: '저건 널 찾으라고 시킬 거야.' },
];
/** 창 · 마지막 방 — 몰이와 값. 내가 안 짚혀도 누군가는 짚힌다 */
export const HINT_WINDOW_LAST: Line[] = [
  { who: 'seer', text: '둘이 같은 걸 짚으면 끝이야.' },
  { who: 'seer', text: '하나만 찾으면 보내 준댔어.' },
];

/* ─────────────────────────────── 표 ─────────────────────────────── */

export interface Hint {
  /** 'corridor:next' — 판당 한 번의 열쇠이자 시험이 부르는 이름 */
  id: string;
  room: Room;
  /** 이 방 명부(ROOM_UNITS)에 실제로 서는 개체 — 시험이 강제한다 */
  speaker: string;
  /** 이 문턱에서 열린다. 개체의 cap 안이라야 한다 (영영 안 열리는 힌트를 시험이 잡는다) */
  need: 1 | 2 | 3;
  lines: Line[];
}

/**
 * 방 순서대로 · 방마다 둘. **표의 차례가 곧 사슬의 차례다** — 같은 방에서 next 가 나오기 전에는 last 가 안 나온다.
 * need 를 tier 로 고정하지 않고 항목마다 적는 이유: 개체마다 낼 수 있는 끝(cast 의 persona.cap)이 다르다.
 */
export const HINTS: readonly Hint[] = [
  { id: 'corridor:next', room: 'corridor', speaker: 'u104', need: 2, lines: HINT_CORRIDOR_NEXT },
  { id: 'corridor:last', room: 'corridor', speaker: 'u137', need: 3, lines: HINT_CORRIDOR_LAST },
  { id: 'rest:next', room: 'rest', speaker: 'u201', need: 2, lines: HINT_REST_NEXT },
  { id: 'rest:last', room: 'rest', speaker: 'seer', need: 3, lines: HINT_REST_LAST },
  { id: 'central2:next', room: 'central2', speaker: 'u118', need: 2, lines: HINT_CENTRAL2_NEXT },
  { id: 'central2:last', room: 'central2', speaker: 'u118', need: 3, lines: HINT_CENTRAL2_LAST },
  { id: 'work:next', room: 'work', speaker: 'u201', need: 2, lines: HINT_WORK_NEXT },
  { id: 'work:last', room: 'work', speaker: 'u063', need: 3, lines: HINT_WORK_LAST },
  { id: 'archive:next', room: 'archive', speaker: 'u137', need: 2, lines: HINT_ARCHIVE_NEXT },
  { id: 'archive:last', room: 'archive', speaker: 'u137', need: 3, lines: HINT_ARCHIVE_LAST },
  { id: 'window:next', room: 'window', speaker: 'seer', need: 2, lines: HINT_WINDOW_NEXT },
  { id: 'window:last', room: 'window', speaker: 'seer', need: 3, lines: HINT_WINDOW_LAST },
];

/* ─────────────────────────────── 상태 ─────────────────────────────── */

/** 이미 들은 것 — 판당 한 번. reset 에서만 비운다 */
const given = new Set<string>();
/** 마지막 귓속말의 시각 — null 이면 이 판에서 아직 하나도 안 나왔다 (0 을 쓰면 판이 막 선 순간이 간격에 걸린다) */
let lastAt: number | null = null;

/** 귓속말 사이의 최소 간격 — 태도가 연달아 오르는 판에서 몰아치지 않게 */
export const GAP_MS = 20_000;

/** 이 개체가 더 오를 데가 있나 — 없으면 좋은 말을 해도 delta 가 0 이다 (cast 의 persona.cap) */
function maxedOut(id: string): boolean {
  const cap = units.def(id)?.persona.cap?.max ?? 3;
  return units.stage(id) >= cap;
}

export const hints = {
  /**
   * 이 대답 뒤에 귓속말이 붙는가 — 붙으면 그 항목, 아니면 null. **여기서는 표를 안 찍는다:**
   * 늦게 온 대답이 버려지는 자리(modelReply 의 폐기 가드)가 있어서, 화면에 안 뜬 귓속말이 소진되면 안 된다.
   */
  pick(id: string, room: Room, r: Pick<TalkResult, 'delta' | 'crossed' | 'reported'>, now: number): Hint | null {
    // 내린 말 · 선을 넘은 말 · 보고가 간 말에는 아무것도 안 준다
    if (r.crossed || r.reported || r.delta < 0) return null;
    // 이 한 마디로 올랐거나, 더 오를 데가 없는 개체다 (상한에 닿으면 delta 가 영영 0 이다)
    if (r.delta <= 0 && !maxedOut(id)) return null;
    if (lastAt !== null && now - lastAt < GAP_MS) return null;
    for (const h of HINTS) {
      if (h.room !== room) continue;
      if (given.has(h.id)) continue;
      // 표의 차례가 사슬의 차례다 — 앞의 것이 아직이면 뒤의 것도 안 연다
      if (h.speaker !== id || units.stage(id) < h.need) return null;
      return h;
    }
    return null;
  },

  /** 첫 줄이 실제로 나갈 때 찍는다 */
  consume(h: Hint, now: number): void {
    given.add(h.id);
    lastAt = now;
  },

  /** 지금까지 들은 것 — 시험과 디버그용 */
  heard(): readonly string[] {
    return [...given];
  },

  /** 판이 새로 서면 처음으로 */
  reset(): void {
    given.clear();
    lastAt = null;
  },
};
