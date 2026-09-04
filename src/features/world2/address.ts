/**
 * 말 걸어오기 — **개체가 나에게 와서 말하고, 내가 답할 시간을 준다.**
 *
 * 2026-09-03 사용자: 「너 여기 처음이지? 이런 것도 로봇이 직접 나에게 다가와서 얘기해 주고, 내가 대답할 시간을 주고 해야 하는데
 * 트리거가 너무 혼잣말 형식으로 진행된다」. 그동안 개체의 말은 자리와 무관하게 대화창에 떨어졌다 — 8 m 밖의 것이 벽을 보고 선 채로
 * 「…너 여기 처음이지.」라고 하면 그건 대사가 아니라 자막이다. 문장은 한 글자도 안 바꾼다(script.ts). 바뀌는 것은 **무대**뿐이다:
 *
 *   ① 다가온다   approachTo(1.9 m)보다 멀면 patrol.approach 로 걸어와 앞에 선다. 도착(still · 거리 안)을 기다린다. maxWaitMs 가 지나도
 *                **말 거는 거리(TALK_DIST_M 2.6 m) 안이어야** 말한다 — 밖이면 계속 걸어오고, giveUpMs 까지 못 오면 말하지 않고 거둔다(onDropped).
 *                멀리서 한 말은 대사가 아니라 자막이다 (2026-09-03 사용자: 「아무것도 안 했는데 트리거가 지혼자」— 8 m 밖에서 4.5 초 만에 말하던 것)
 *   ② 본다       말하는 동안 · 내가 답하는 동안 patrol.stare 로 나를 본다. 몸이 도는 것이 「누가 말했나」다
 *   ③ 조용해지면  앞 줄이 아직 화면에 흐르면 그 뒤에 — 읽지도 못한 줄 밑에 묻히는 말은 없는 말이다 (host.busyUntil)
 *   ④ 답할 창    answerMs 가 있으면 곁(near)을 그 개체로 고정하고 목표 자리에 OBJ_TALK 「개체에게 말을 걸 수 있다 — Enter」를 세운다.
 *                창은 **줄이 끝난 시각부터** 센다. 입력줄은 저절로 안 열린다 — Enter 가 연다(D1). 치는 동안은 창이 멈춘다(hold).
 *                한 마디가 오면 onAnswer(text), 창이 다 닫히면 onSilent(). 그리고 푼다: patrol.release · 곁 해제 · 목표 복원
 *   ⑤ 하나씩     동시에 하나뿐이다. 새 것은 줄을 서고, 방이 바뀌면 줄에서 지운다. enterRoom 이 cancel 로 전부 거둔다.
 *                집행(execution ≠ none) · 검문(gate) · 경비의 물음(openers) 동안은 **멎는다** — 그것들은 제 무대를 따로 가진다
 *   ⑥ 뜸         **저쪽이 먼저 거는 말(solicited 아님)은 20 초(ADDRESS_GAP_MS)에 하나뿐이다.** 소문 · 코어권 · 서성임이 연달아 오면 판이 나를 붙들고
 *                떠드는 것이 된다. 내가 걸어가서 · 말을 걸어서 받은 답(solicited)은 뜸을 안 둔다. 창이 열려 있는 동안은 다른 줄도 안 든다 —
 *                blockedUntil 을 scenario2.play 가 본다(SYSTEM 방송만 예외)
 *   ⑦ 걸음이 곧 허락 **저쪽이 먼저 거는 말은 걸어오는 것을 내가 본 뒤에만 나간다** — 아래 ADDRESS_EXEMPT 표에 없으면 예외가 없다
 *
 * ★ 2026-09-03 사용자(기획): 「다른 객체가 말을 거는 건 중앙시설, 특별한 상황을 제외하고, 내가 말을 걸 때나, 꼭 말해야 하는 상황이거나,
 *   다른 객체가 다가와서 말을 하는 경우에만 얘기하도록 해줘」. 그래서 규칙을 **한 곳**에 모았다 — 자리마다 조건을 흩뿌리면 다음 장면에서 또 샌다.
 *
 *   면제가 아닌 모든 「저쪽이 먼저 거는 말」은 **걸음(beat)** 을 통과해야 한다:
 *     · 내 앞 APPROACH_STOP_M(1.4 m)까지 걸어와 APPROACH_NEAR_M(1.5 m) 안에 들고
 *     · 그동안 실제로 움직였고(APPROACH_TRAVEL_M 0.8 m — 처음부터 1.4 m 안에 있었으면 그만큼은 못 걸으니 그 자리까지만)
 *     · 나를 보고 선다(APPROACH_FACE_RAD)
 *   못 오는 몸(자는 것 · 붙잡힌 것 · 순찰이 멎은 것 · 길이 막힌 것 · 아예 몸이 없는 것)은 **한 줄도 안 하고 조용히 거둔다**(onDropped).
 *   한 발짝도 안 떼는 것은 giveUpMs 까지 기다릴 것 없이 APPROACH_STUCK_MS(6 초)에 거둔다 — 그 사이 줄이 서 있으면 판이 벙어리가 된다.
 *
 * 순수 상태기 + host 콜백이다(corridor.ts 와 같은 꼴). 시계는 tick(now) 가 쥔다 — 시험이 가짜 host 로 돌린다.
 */

import { TALK_DIST_M, type Vec2 } from './corefield';
import { OBJ_TALK, type CastLine } from './script';

export interface AddressHost {
  now(): number;
  me(): Vec2;
  room(): string;
  /**
   * 개체의 자리 · 서 있는지 · 보는 쪽(rad, patrol.of 의 heading). 아직 안 적혔으면 null.
   * 면제된 말은 자리를 몰라도 그냥 나가지만, **걸음이 필요한 말은 자리를 모르면 아예 안 나간다** — 못 오는 몸과 구별할 길이 없다.
   * heading 이 없으면(시험의 가짜 판 · 순찰에 안 올라온 몸) 「나를 본다」는 안 묻는다
   */
  unitAt(id: string): (Vec2 & { still: boolean; heading?: number }) | null;
  approach(id: string, to: Vec2, opts: { stopAt: number; then: 'stand' | 'resume' }): void;
  stare(id: string, ms: number): void;
  release(id: string): void;
  /** 지금 흐르는 대사가 끝나는 시각 */
  busyUntil(): number;
  /** 「개체 (곁)」이 섞인 대본을 튼다 — 길이(ms)를 돌려준다 */
  playCast(lines: readonly CastLine[], unitId: string | null, startAt?: number): number;
  /** 곁을 이 개체로 고정한다 — null 이면 푼다. 고정된 동안 Enter 한 마디는 이 개체에게 간다 */
  pinNear(id: string | null): void;
  objective(): string | null;
  setObjective(text: string | null): void;
  /** 입력줄이 열려 있나 — 줄이 끝나는 순간 이미 치고 있으면 창은 멈춘 채로 열린다 */
  talking(): boolean;
  /** 답할 창을 화면에 알린다 — null 이면 내린다. paused 는 멈춘 채 남은 ms(치는 중) */
  answerWindow(w: { until: number; span: number; paused: number | null } | null): void;
  /** 이 장치가 멎어야 하는 국면인가 — 집행 · 검문 · 경비의 물음 */
  frozen(): boolean;
}

export interface AddressOpts {
  /** 이만큼 앞에 와 선다(m). 이보다 가까우면 안 걸어온다 */
  approachTo: number;
  /** 도착을 기다리는 상한(ms) — 지나면 **말 거는 거리 안일 때만** 말한다. 밖이면 giveUpMs 까지 더 걸어온다 */
  maxWaitMs: number;
  /** 이만큼 지나도 말 거는 거리 안에 못 왔으면 말하지 않고 거둔다(onDropped). 막힌 몸이 멀리서 말하는 것보다 안 하는 편이 맞다 */
  giveUpMs: number;
  /** 내가 부른 말인가 — 걸어가서 · 말을 걸어서 받는 답. true 면 ⑥ 의 뜸도 ⑦ 의 걸음도 없다 */
  solicited: boolean;
  /**
   * 장면 이름 — ⑦ 의 면제표(ADDRESS_MUST_SPEAK)를 찾는 열쇠. 빈 문자열이면 표에 없는 것이고, 그러면 걸어와야 한다.
   * **이름은 대본 상수 이름을 그대로 쓴다** — 표를 읽는 사람이 script.ts 에서 그 줄을 바로 찾을 수 있게
   */
  scene: string;
  /**
   * 바로 앞 말이 만든 걸음 위에 이어 붙는 두 번째 마디인가 — 그 개체가 아직 내 앞(APPROACH_NEAR_M)에 서 있는 동안만.
   * 한 걸음에 두 마디를 하는 자리(기록 복도의 A-137)가 이걸 쓴다. 걸음을 두 번 시키면 왔다가 다시 오는 그림이 된다.
   * 앞 말이 못 나갔으면(걸음이 거둬졌으면) 이 표는 안 서고, 그러면 이 말도 제 걸음을 요구받는다 — 즉 같이 조용해진다
   */
  continues: boolean;
  /** 답할 창(ms). 0 이면 창이 없다 — 말만 하고 간다 */
  answerMs: number;
  /** 말하기 전 최소 숨(ms) — 대답 줄의 700 같은 것 */
  delayMs: number;
  /** 풀 때 순찰로 돌아가나(resume) · 그 자리에 서나(stand) */
  then: 'stand' | 'resume';
  onAnswer?: (text: string) => void;
  onSilent?: () => void;
  /** 끝내 못 와서 거뒀다 — 아무 줄도 안 나갔다. 부르는 쪽이 표를 되돌릴 자리 */
  onDropped?: () => void;
  /** 줄이 나가기 시작했다 — 길이(ms)를 준다. 그 뒤에 이어 붙일 줄(속마음 · 곁의 한마디)이 이걸 쓴다 */
  onSpoken?: (lineMs: number) => void;
}

/** 기본값 — 1.9 m 앞 · 4.5 초 뒤부터는 2.6 m 안이면 말한다 · 18 초에 못 오면 거둔다 · 창 없음 · 그 자리에 선다 · 저쪽이 먼저 거는 말 */
export const ADDRESS_DEFAULT: AddressOpts = {
  approachTo: 1.9,
  maxWaitMs: 4500,
  giveUpMs: 18_000,
  answerMs: 0,
  delayMs: 0,
  then: 'stand',
  solicited: false,
  scene: '',
  continues: false,
};
/** 도착 판정의 여유 — approach 는 stopAt + 0.12 에서 서고, 사람이 반 걸음 물러나도 도착이다 */
const ARRIVE_SLACK = 0.3;
/** 저쪽이 먼저 거는 말 사이의 뜸(ms) — 이 안에 또 오는 것은 줄에서 기다린다 (⑥) */
export const ADDRESS_GAP_MS = 20_000;

/* ─────────────────────────────── ⑦ 걸음이 곧 허락 — 값과 면제표 ─────────────────────────────── */

/**
 * 걸음의 목적지 — 내 앞 이만큼(m)에 와 선다. 말 거는 거리(2.6 m)가 아니라 **얼굴이 보이는 거리**다.
 * 순찰(patrol.ts)은 stopAt + 0.12 에서 「닿았다」고 하고 거기서 멈추므로, 아래 APPROACH_NEAR_M 은 그 여유를 품어야 한다 —
 * 안 그러면 0.12 m 때문에 영영 도착이 안 되고 모든 줄이 조용히 거둬진다 (2026-09-03 헤드리스에서 실제로 그랬다)
 */
export const APPROACH_STOP_M = 1.35;
/** 이 안에 들어야 말한다(m) — 걸음의 끝을 재는 자. APPROACH_STOP_M + 순찰의 0.12 보다 넉넉하다 */
export const APPROACH_NEAR_M = 1.5;
/**
 * 「왔다」고 하려면 이만큼은 걸어야 한다(m) — 다만 **걸을 수 있는 만큼만** 요구한다:
 * 처음 거리에서 APPROACH_NEAR_M 을 뺀 것이 상한이다. 이미 내 앞(1.5 m 안)에 서 있던 것에게는 0 — 그때의 걸음은 「돌아서서 나를 본다」다
 */
export const APPROACH_TRAVEL_M = 0.8;
/** 나를 보고 섰나 — 이 각(rad) 안. 걸어오는 몸은 오는 내내 이쪽으로 돌아 있어서 넉넉히 잡아도 걸리지 않는다 */
const APPROACH_FACE_RAD = Math.PI / 2;
/**
 * 이만큼(ms) 동안 나에게 **한 뼘도 못 가까워지면** 못 오는 몸이다 — giveUpMs(18 초)까지 줄을 붙들고 있을 까닭이 없다.
 * 한 발짝도 안 뗀 것(자는 것 · 붙잡힌 것)과 걷다가 막힌 것을 같은 자로 잰다: 둘 다 「안 오고 있다」는 같은 그림이다
 */
export const APPROACH_STUCK_MS = 6000;
/** 내가 이만큼(m) 옮겨 갔으면 걸음의 목적지를 다시 준다 — 내가 걸어가 버린 자리에 와 서는 것은 다가온 것이 아니다 */
const RETARGET_M = 1;
/** 걸어온 것이 아직 내 앞에 서 있다고 치는 시간(ms) — continues 가 이 안에서만 선다 */
const BEAT_HOLD_MS = 15_000;
/** 한 발짝으로 안 치는 움직임(m) — 프레임 흔들림 */
const STUCK_EPS_M = 0.1;

/**
 * **걸음 없이 말해도 되는 자리 — 표는 여기 하나뿐이다.**
 *
 * ① 방  — 중앙 시설(central2). 소문 · 재회 · 검문이 그 방의 일이다: 그 방에서 개체가 나에게 말을 거는 것이 곧 그 장면이라,
 *         걸음을 요구하면 코어권에서 몸을 읽는 것도 락다운에 자리를 고수한 것도 말을 못 하게 된다.
 *         (CORE_RING · RECOGNIZED_* · RUMOR_ARRIVES · SHADOW_LINGER · LOCK_STAY_CALM · DARK_CORE · 관문의 줄)
 * ② 장면 — 아래 표. **판이 말하는 것**이지 잡담이 아니다. 표에 없는 개체의 말은 전부 걸어와야 한다.
 */
export const ADDRESS_EXEMPT_ROOMS: readonly string[] = ['central2'];

/** ② 꼭 말해야 하는 장면 — 열쇠는 대본 상수 이름, 값은 왜 면제인가 */
export const ADDRESS_MUST_SPEAK: Readonly<Record<string, string>> = {
  /* 소각로 — 앞이 그은 선. 장치와 SYSTEM 의 줄, 그리고 불에 넣어지는 A-201 의 「어… 나?」. 불려 가는 것에게 걸어오라고 할 수는 없다.
     (지금은 furnace.ts 가 이 줄들을 play/playCast 로 곧장 내보내 address 를 안 탄다 — 타게 되는 날을 위해 표에 적어 둔다) */
  FURNACE: '불에 넣어지는 자리 — 판이 말한다',
  THE_FURNACE: '불에 넣어지는 자리 — 판이 말한다',
  /* 경비의 물음 — openers.ts 가 제 approach 로 이미 내 앞에 와 선다. 걸음을 두 번 시킬 까닭이 없다 */
  OPENERS: '경비가 이미 걸어와 선다 (openers.ts)',
  WATCH: '경비가 이미 걸어와 선다 (openers.ts)',
  /* 검문 — gates.ts. 줄을 세운 것이 판이라 개체가 나에게 올 수 있는 판이 아니다 */
  GATE: '검문 — 줄은 판이 세웠다 (gates.ts)',
  /* 집행 — execution.ts. 총 든 것 앞에서 아무도 안 움직인다(patrol.freeze). 그 정적이 이 장면이다 */
  EXECUTION: '집행 — 아무도 안 움직이는 방 (execution.ts)',
};

/** 이 말이 걸음을 요구받나 — ⑦ 의 판정 한 곳. 여기 말고 다른 데서 이 질문을 하지 않는다 */
function beatRequired(a: Address, now: number): boolean {
  if (a.opts.solicited) return false;
  if (continuing(a, now)) return false;
  if (ADDRESS_EXEMPT_ROOMS.includes(a.room)) return false;
  return !Object.hasOwn(ADDRESS_MUST_SPEAK, a.opts.scene);
}

type Phase = 'approach' | 'quiet' | 'speaking' | 'window' | 'held' | 'done';

interface Address {
  id: string;
  lines: readonly CastLine[];
  opts: AddressOpts;
  room: string;
  phase: Phase;
  /** 걸어오라고 했다 — 풀 때 release 가 필요하다 */
  approached: boolean;
  /** ⑦ 의 걸음을 요구받는 말인가 — 그러면 도착 판정이 approachTo 가 아니라 APPROACH_NEAR_M + 걸은 거리 + 보는 쪽이다 */
  beat: boolean;
  /** 걸음이 시작된 자리 — 여기서 얼마나 걸었나를 잰다. 걸음이 없는 말이면 null */
  from: Vec2 | null;
  /** 걸음의 목적지로 준 점 — 내가 여기서 멀어지면 다시 준다 (RETARGET_M) */
  aim: Vec2 | null;
  /** 이번 걸음에 걸어야 하는 거리(m) — 처음 거리에서 정해진다 */
  need: number;
  /** 여태 나에게 가장 가까웠던 거리(m) — 이게 안 줄면 안 오고 있는 것이다 */
  best: number;
  /** 이 시각까지 더 안 가까워지면 못 오는 몸이다 (phase 'approach' · beat) */
  moveBy: number;
  /** 이 시각까지는 도착을 기다린다 (phase 'approach') · 말하기 전 숨 (phase 'quiet') */
  waitUntil: number;
  /** 이 시각까지도 말 거는 거리 안에 못 오면 거둔다 (phase 'approach') */
  giveUpAt: number;
  /** 줄이 끝나는 시각 (phase 'speaking') */
  lineEnd: number;
  /** 창이 닫히는 시각 (phase 'window') */
  windowUntil: number;
  /** Enter 로 멈춘 순간 남아 있던 시간 (phase 'held') */
  heldLeft: number;
  /** 줄이 흐르는 동안 Enter 를 눌렀다 — 창은 열리는 순간 멈춘 채로 연다 */
  holdWanted: boolean;
  /** 목표를 덮었다 — 풀 때 아직 그 글이면 되돌린다 */
  prevObjective: string | null;
  hinted: boolean;
}

let host: AddressHost | null = null;
let current: Address | null = null;
const queue: Address[] = [];
/** 멎기 시작한 시각 — 풀릴 때 기한들을 그만큼 뒤로 민다 (멎은 동안 창이 닫히면 안 된다) */
let frozenAt: number | null = null;
/** 저쪽이 먼저 건 말이 마지막으로 나간 시각 — ⑥ 의 뜸은 여기서 센다. null 이면 아직 없다 (0 도 시각이다 — 시험은 0 에서 시작한다) */
let lastUnsolicitedAt: number | null = null;
/** 방금 내 앞에 와 선 개체 — continues 가 이걸 보고 걸음을 한 번 더 시키지 않는다 (⑦) */
let beatBy: { id: string; until: number } | null = null;

function dist(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 줄의 화자 자리에 개체를 세운 대본 — 문자열 목록은 전부 'unit' 이다 */
export function cast(texts: readonly string[]): CastLine[] {
  return texts.map((text) => ({ who: 'unit', text }));
}

/** 저쪽이 먼저 거는 말의 뜸이 아직 안 지났나 — 지난 것에서 ADDRESS_GAP_MS 안 */
function gapOpen(now: number): boolean {
  return lastUnsolicitedAt !== null && now - lastUnsolicitedAt < ADDRESS_GAP_MS;
}

/** 다음 것을 꺼내 시작한다 — 방이 다른 것은 버린다. 저쪽이 먼저 거는 말은 뜸이 지나야 꺼낸다(줄의 머리에서 기다린다) */
function startNext(now: number): void {
  if (!host || current) return;
  while (queue.length > 0) {
    const a = queue[0];
    if (a.room !== host.room()) {
      queue.shift();
      continue;
    }
    if (!a.opts.solicited && !continuing(a, now) && gapOpen(now)) return;
    queue.shift();
    current = a;
    begin(a, now);
    return;
  }
}

/** 앞 말이 만든 걸음이 아직 서 있나 — 그 개체가, 아직, 내 앞에 (⑦ 의 continues) */
function continuing(a: Address, now: number): boolean {
  if (!a.opts.continues || !host) return false;
  if (!beatBy || beatBy.id !== a.id || now >= beatBy.until) return false;
  const u = host.unitAt(a.id);
  return !u || dist(u, host.me()) <= APPROACH_NEAR_M + ARRIVE_SLACK;
}

/** 나를 보고 섰나 — 보는 쪽을 모르면 묻지 않는다(가짜 판 · 순찰 밖의 몸) */
function facingMe(u: Readonly<Vec2 & { heading?: number }>, me: Readonly<Vec2>): boolean {
  if (u.heading === undefined) return true;
  let d = u.heading - Math.atan2(me.x - u.x, me.z - u.z);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) <= APPROACH_FACE_RAD;
}

/** 걸음이 끝났나 — 앞에 왔고(1.5 m), 그만큼 걸었고, 나를 본다. 셋 다여야 한다 (⑦) */
function beatDone(a: Address): boolean {
  if (!host) return true;
  const u = host.unitAt(a.id);
  if (!u || !a.from) return false;
  const me = host.me();
  if (dist(u, me) > APPROACH_NEAR_M) return false;
  if (dist(u, a.from) + 0.01 < a.need) return false;
  return facingMe(u, me);
}

/**
 * 안 오고 있나 — 가까워진 것이 있으면 시계를 미루고, APPROACH_STUCK_MS 동안 한 뼘도 못 가까워졌으면 못 오는 몸이다.
 * 자는 것 · 붙잡힌 것 · 순찰에 없는 것 · 걷다가 길이 막힌 것이 전부 여기서 걸린다 (⑦).
 * 내가 걸어가 버렸으면 걸음의 목적지도 여기서 다시 준다 — 내가 섰던 자리에 와 서는 것은 다가온 것이 아니다
 */
function beatStuck(a: Address, now: number): boolean {
  if (!host) return false;
  const u = host.unitAt(a.id);
  // 몸이 사라졌다(vanish · 방을 떴다) — 올 것이 없다
  if (!u || !a.from) return true;
  const me = host.me();
  const d = dist(u, me);
  if (d < a.best - STUCK_EPS_M) {
    a.best = d;
    a.moveBy = now + APPROACH_STUCK_MS;
  }
  // 내가 걸어가 버렸다 — 목적지를 다시 준다. 걷는 사람을 따라오는 동안은 「안 오고 있다」로 안 친다
  if (a.aim && dist(a.aim, me) > RETARGET_M) {
    a.aim = { x: me.x, z: me.z };
    host.approach(a.id, a.aim, { stopAt: Math.min(a.opts.approachTo, APPROACH_STOP_M), then: a.opts.then });
    a.best = d;
    a.moveBy = now + APPROACH_STUCK_MS;
  }
  return now >= a.moveBy;
}

function begin(a: Address, now: number): void {
  if (!host) return;
  const u = host.unitAt(a.id);
  const me = host.me();
  a.beat = beatRequired(a, now);
  if (a.beat) {
    // 자리를 모르는 몸은 걸어올 수도, 왔는지 볼 수도 없다 — 멀리서 들리는 자막이 되느니 조용히 거둔다
    if (!u) {
      drop(a);
      return;
    }
    a.from = { x: u.x, z: u.z };
    a.best = dist(u, me);
    // 걸을 수 있는 만큼만 요구한다 — 이미 1.5 m 안이면 0 이고, 그때의 걸음은 「돌아서서 나를 본다」다
    a.need = Math.min(APPROACH_TRAVEL_M, Math.max(0, a.best - APPROACH_NEAR_M));
    a.aim = { x: me.x, z: me.z };
    host.approach(a.id, a.aim, { stopAt: Math.min(a.opts.approachTo, APPROACH_STOP_M), then: a.opts.then });
    a.approached = true;
    a.phase = 'approach';
    a.waitUntil = now + a.opts.maxWaitMs;
    a.giveUpAt = now + Math.max(a.opts.maxWaitMs, a.opts.giveUpMs);
    a.moveBy = now + APPROACH_STUCK_MS;
    return;
  }
  if (u && dist(u, me) > a.opts.approachTo) {
    host.approach(a.id, { x: me.x, z: me.z }, { stopAt: a.opts.approachTo, then: a.opts.then });
    a.approached = true;
    a.phase = 'approach';
    a.waitUntil = now + a.opts.maxWaitMs;
    a.giveUpAt = now + Math.max(a.opts.maxWaitMs, a.opts.giveUpMs);
  } else {
    a.phase = 'quiet';
    a.waitUntil = now + a.opts.delayMs;
  }
}

/** 도착했나 — 서 있고, 앞에 와 있다 */
function arrived(a: Address): boolean {
  if (!host) return true;
  const u = host.unitAt(a.id);
  return !u || (u.still && dist(u, host.me()) <= a.opts.approachTo + ARRIVE_SLACK);
}
/** 말 거는 거리 안인가 — 서지 않았어도 여기까지 왔으면 말할 수 있다. 자리를 모르는 것(아직 안 적힌 개체)은 거리도 모르니 그대로 둔다 */
function nearEnough(a: Address): boolean {
  if (!host) return true;
  const u = host.unitAt(a.id);
  return !u || dist(u, host.me()) <= TALK_DIST_M;
}

function speak(a: Address, now: number): void {
  if (!host) return;
  if (!a.opts.solicited) lastUnsolicitedAt = now;
  // 내 앞에 서서 하는 말이면 그 자리를 표로 남긴다 — 이어 붙는 두 번째 마디(continues)가 걸음을 다시 안 시키게 (⑦)
  const at = host.unitAt(a.id);
  if (!at || dist(at, host.me()) <= APPROACH_NEAR_M + ARRIVE_SLACK) beatBy = { id: a.id, until: now + BEAT_HOLD_MS };
  const t = host.playCast(a.lines, a.id, 0);
  // 말하는 동안 · 답하는 동안 나를 본다. 걸어온 몸은 도착하며 이미 이쪽을 보고 섰다 — 그래도 건다: 서 있던 것은 고개를 돌려야 한다
  host.stare(a.id, t + a.opts.answerMs);
  a.phase = 'speaking';
  a.lineEnd = now + t;
  // 창이 있는 말이면 줄이 흐르는 동안부터 곁이다 — Enter 는 곁이 있어야 열린다(talkOpenKey). 목표의 힌트는 줄이 끝난 뒤에
  if (a.opts.answerMs > 0) host.pinNear(a.id);
  a.opts.onSpoken?.(t);
}

function openWindow(a: Address, now: number): void {
  if (!host) return;
  a.prevObjective = host.objective();
  host.setObjective(OBJ_TALK);
  a.hinted = true;
  // 창은 **줄이 끝난 시각**부터 — 프레임이 늦게 와도 그만큼 길어지지 않는다. 스킵으로 앞당겨졌으면 지금부터
  const from = Math.min(now, a.lineEnd);
  // 줄이 흐르는 동안 이미 Enter 를 눌렀다(치는 중) — 창은 열리자마자 멈춘 채다. 치는 사이에 창이 닫히면 안 된다
  if (a.holdWanted || host.talking()) {
    a.holdWanted = false;
    a.phase = 'held';
    a.heldLeft = a.opts.answerMs;
    host.answerWindow({ until: from + a.heldLeft, span: a.opts.answerMs, paused: a.heldLeft });
    return;
  }
  a.phase = 'window';
  a.windowUntil = from + a.opts.answerMs;
  host.answerWindow({ until: a.windowUntil, span: a.opts.answerMs, paused: null });
}

/** 푼다 — 몸 · 곁 · 목표 · 화면. 콜백은 부르는 쪽이 먼저 불렀다 */
function finish(a: Address): void {
  a.phase = 'done';
  if (host) {
    if (a.approached) host.release(a.id);
    if (a.opts.answerMs > 0) host.pinNear(null);
    // 창 동안 다른 것이 목표를 바꿨으면(폭행 그림 → 「안쪽으로」) 그건 그대로 — 내 힌트만 거둔다
    if (a.hinted && host.objective() === OBJ_TALK) host.setObjective(a.prevObjective);
    host.answerWindow(null);
  }
  if (current === a) current = null;
}

/** 끝내 못 왔다 — 아무 줄도 없이 거둔다. 부르는 쪽에 알린다(onDropped) */
function drop(a: Address): void {
  const fn = a.opts.onDropped;
  finish(a);
  fn?.();
}

/** 한 프레임의 한 걸음 — 걸어오기 · 정적 · 줄 끝 · 창. 끝났으면 current 가 비어 있다 */
function step(a: Address, now: number): void {
  if (!host) return;
  if (a.phase === 'approach') {
    // ⑦ 의 걸음 — 앞에 와 · 걸어와 · 나를 볼 때까지는 아무 줄도 없다. 못 오는 몸은 6 초에, 못 닿은 몸은 giveUpMs 에 거둔다
    if (a.beat) {
      if (beatDone(a)) {
        a.phase = 'quiet';
        a.waitUntil = now + a.opts.delayMs;
      } else if (now >= a.giveUpAt || beatStuck(a, now)) {
        drop(a);
        return;
      } else return;
    }
    // 도착했거나, 기다림이 지났는데 말 거는 거리 안이면 — 말한다. 밖이면 더 걸어오고, 끝내 못 오면 말없이 거둔다
    else if (arrived(a) || (now >= a.waitUntil && nearEnough(a))) {
      a.phase = 'quiet';
      a.waitUntil = now + a.opts.delayMs;
    } else if (now >= a.giveUpAt) {
      drop(a);
      return;
    } else return;
  }
  if (a.phase === 'quiet') {
    if (now < a.waitUntil || host.busyUntil() > now) return;
    speak(a, now);
    return;
  }
  if (a.phase === 'speaking') {
    // 스킵(Space)은 줄을 앞당긴다 — busyUntil 이 0 이 되면 줄은 끝난 것이다
    if (now < a.lineEnd && host.busyUntil() > now) return;
    if (a.opts.answerMs > 0) openWindow(a, now);
    else finish(a);
    return;
  }
  if (a.phase === 'window' && now >= a.windowUntil) {
    a.opts.onSilent?.();
    finish(a);
  }
}

export const address = {
  bind(h: AddressHost): void {
    address.reset();
    host = h;
  },

  /**
   * 개체가 나에게 말을 건다 — 지금 하나가 진행 중이면 줄을 선다. 방이 바뀌면 줄에서 지운다.
   * 같은 개체가 같은 줄로 이미 줄에 서 있으면 두 번 세우지 않는다
   */
  request(id: string, lines: readonly CastLine[], opts: Partial<AddressOpts> = {}): void {
    if (!host) return;
    const a: Address = {
      id,
      lines,
      opts: { ...ADDRESS_DEFAULT, ...opts },
      room: host.room(),
      phase: 'quiet',
      approached: false,
      beat: false,
      from: null,
      aim: null,
      need: 0,
      best: Infinity,
      moveBy: 0,
      waitUntil: 0,
      lineEnd: 0,
      windowUntil: 0,
      giveUpAt: 0,
      heldLeft: 0,
      holdWanted: false,
      prevObjective: null,
      hinted: false,
    };
    queue.push(a);
    if (!current && !host.frozen()) startNext(host.now());
  },

  /** 한 프레임 — 걸어오기 · 조용해지기 · 줄 끝 · 창 */
  tick(now: number): void {
    if (!host) return;
    if (host.frozen()) {
      if (frozenAt === null) frozenAt = now;
      return;
    }
    if (frozenAt !== null) {
      // 멎어 있던 만큼 기한을 민다 — 창이 멎은 동안에 닫혀 있으면 「말이 없네」가 억울하다
      const shift = now - frozenAt;
      frozenAt = null;
      if (current) {
        current.waitUntil += shift;
        current.lineEnd += shift;
        current.windowUntil += shift;
        // 걸음의 기한도 민다 — 멎은 동안엔 아무도 안 걷는다(patrol.freeze). 그 정지를 「안 오고 있다」로 읽으면 집행이 끝나자마자 다 거둬진다
        current.giveUpAt += shift;
        current.moveBy += shift;
        if (current.phase === 'window') host.answerWindow({ until: current.windowUntil, span: current.opts.answerMs, paused: null });
      }
    }
    // 앞 것이 이 프레임에 끝났으면 다음 것을 **같은 프레임에** 세운다 — 줄 선 말이 한 프레임을 헛되이 기다리지 않게
    for (let n = 0; n < 2; n += 1) {
      if (!current) startNext(now);
      const a = current;
      if (!a) return;
      step(a, now);
      if (current === a) return;
    }
  },

  /** 지금 답할 수 있는 말이 걸려 있나 — say() 가 이걸 보고 answer 로 돌린다. 줄이 흐르는 동안의 한 마디도 답이다 */
  pending(): boolean {
    return current !== null && current.opts.answerMs > 0 && (current.phase === 'speaking' || current.phase === 'window' || current.phase === 'held');
  },
  /**
   * 이 시각까지는 다른 줄이 들면 안 된다 — 창이 있는 말이 흐르는 중이거나 창이 열려 있는 동안 (⑥). 없으면 0.
   * 멎어 있으면(집행 · 검문) 0 — 그것들의 줄까지 막으면 서로 기다리다 판이 선다. scenario2.play 가 SYSTEM 방송 밖의 줄을 이 뒤로 민다
   */
  blockedUntil(now: number): number {
    const a = current;
    if (!a || a.opts.answerMs <= 0 || frozenAt !== null) return 0;
    if (a.phase === 'speaking') return a.lineEnd + a.opts.answerMs;
    if (a.phase === 'window') return a.windowUntil;
    if (a.phase === 'held') return now + a.heldLeft;
    return 0;
  },
  /** 저쪽이 먼저 건 말이 마지막으로 나간 시각 — 아직 없으면 −Infinity(뜸이 없다). 경비의 잡담(openers)이 같은 뜸을 지키는 데 쓴다 */
  lastUnsolicitedAt(): number {
    return lastUnsolicitedAt ?? -Infinity;
  },
  /** 곁으로 고정된 개체 — track 이 near 를 이것으로 덮는다 (8 m 밖에서 걸어온 말이라 2.6 m 안이 아닐 수 있다) */
  pinned(): string | null {
    return address.pending() ? current!.id : null;
  },
  /** 지금 말하고 있거나 오고 있는 개체 — 시험 · 확인용 */
  speaker(): string | null {
    return current && current.phase !== 'done' ? current.id : null;
  },
  phase(): Phase | null {
    return current?.phase ?? null;
  },
  queued(): number {
    return queue.length;
  },

  /** Enter 를 눌렀다 — 창을 멈춘다 (D1). 줄이 아직 흐르는 중이면 창이 열릴 때 멈춘 채로 열린다 */
  hold(): void {
    if (!host || !current || current.opts.answerMs <= 0) return;
    const a = current;
    if (a.phase === 'speaking') {
      a.holdWanted = true;
      return;
    }
    if (a.phase !== 'window') return;
    a.phase = 'held';
    a.heldLeft = Math.max(0, a.windowUntil - host.now());
    host.answerWindow({ until: a.windowUntil, span: a.opts.answerMs, paused: a.heldLeft });
  },
  /** 입력줄을 닫았다(ESC) — 남은 창이 다시 흐른다. 줄이 흐르는 중에 닫았으면 멈춰 달라던 표만 거둔다 */
  release(): void {
    if (!host || !current) return;
    const a = current;
    if (a.phase === 'speaking') {
      a.holdWanted = false;
      return;
    }
    if (a.phase !== 'held') return;
    a.phase = 'window';
    a.windowUntil = host.now() + a.heldLeft;
    host.answerWindow({ until: a.windowUntil, span: a.opts.answerMs, paused: null });
  },

  /** 한 마디가 왔다 — 걸려 있는 말의 답이면 onAnswer 로 보내고 true. 아니면 false (say 는 제 갈래로 간다) */
  answer(text: string): boolean {
    if (!address.pending()) return false;
    const a = current!;
    const fn = a.opts.onAnswer;
    finish(a);
    fn?.(text);
    return true;
  },

  /** 방을 나간다 — 걸린 것 · 줄 선 것을 **아무것도 틀지 않고** 거둔다. 몸은 풀고 곁과 목표는 되돌린다 */
  cancel(): void {
    queue.length = 0;
    frozenAt = null;
    // 방이 바뀌면 앞의 걸음도 없던 것이다 — 다른 방에서 내 앞에 섰던 표로 이 방의 말이 걸음을 건너뛰면 안 된다
    beatBy = null;
    if (current) finish(current);
  },

  reset(): void {
    address.cancel();
    host = null;
    lastUnsolicitedAt = null;
  },
};
