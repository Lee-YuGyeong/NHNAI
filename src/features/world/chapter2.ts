/**
 * 챕터 2 — 「AI 가 인간을 찾고 있다 → 내 모델을 찾고 있다 → 이제 내 사고방식을 검사한다」. 중앙 시설(/central) 한 무대.
 * 챕터 1 이 락다운으로 끝나는 자리(phase 'hide')에서 이어받아 심문소(/interrogation) 입장으로 끝난다 (사용자 시나리오, 2026-08-30).
 *
 *   analyze  방송 "침입 개체의 외형 정보 분석 중." → 보안 공지 MODEL A-{계열} · HOLD POSITION — 내 몸도 그 계열이다 (같은 모델이 여럿이라 아직 특정 못 한다)
 *   hold     움직이면 안 된다 (움직이면 의심도 +, 방송 "이동 감지")
 *   roll     경비(UNIT-21)가 같은 계열을 하나씩 검문 — "식별번호." −044 · −128 · 그리고 나: 과학자가 번호를 불러 주려다 끊긴다 → 내 채팅으로 답한다
 *   protocol "외형 식별 불가능. 행동 분석 프로토콜로 전환." — 이제 복도가 테스트 공간이다
 *   test1    반응 — 옆에서 쾅. 아무도 안 본다 (놀라 물러서면 의심도 +)
 *   test2    질문 — 같은 모델이 묻는다 "두려움을 느끼나?" → 부정(안전) / 목적을 되묻기 / 인정(위험) — 내가 친 말을 분류한다
 *   test3    기억 — 검문 장치 "마지막 정비 위치." 과학자 통신이 끊긴다 "…4… 구역…" → 4 가 들어가야 맞다
 *   ★ 선택지 UI 는 없다 (2026-08-30 사용자 결정) — 답은 언제나 Enter 로 치는 내 한 마디다.
 *   ★★ 그 한 마디를 읽는 것은 이제 정규식이 아니라 **검문 감독**(src/lab/director.ts)이다 (2026-08-30 사용자: "내가 말하는
 *      방향에 따라 진행이 될지도 공격이 될지도"). 감독은 의심도만 움직이는 게 아니라 **다음 장면을 고른다** —
 *      pass 통과 · press 대본에 없던 추가 심문 · escort 감시를 붙여 통과 · detain 재검 구역으로 연행 · fire 사격.
 *      그래서 같은 관문이 통과로도, 연행으로도, 총구로도 끝난다. 무엇을 고를 수 있는지는 헌법(director.allowMoves)이 먼저 거른다.
 *      감독이 죽어 있으면(구독·키 없음·타임아웃) 폴백(judgeDirect)이 예전과 같은 판정을 낸다 — 판은 어떤 경우에도 굴러간다.
 *      `readAnswer` 는 그 폴백의 형제로 남아 있다 (사실 대조는 여전히 화면이 한다 — mp/identity).
 *   verdict  "식별 실패" → "전 계열 개체 인지 검증" — 과학자 "몸이 아니라… 사고방식을 검사하겠다는 겁니다"
 *   march    문 잠김 · 바닥 유도등 · 경비가 먼 문으로 · 같은 모델들이 줄을 선다 → 유도등을 따라 줄 끝으로
 *   queue    ★ 앞의 넷이 문 앞에서 하나씩 검증받는다 — 통과 · **오인 사살** · 통과 · **다른 잠입자(사람)의 사살** (2026-08-30 사용자 기획:
 *            "진짜 AI 도 대답이 어색하면 인간으로 오해받아 무차별 사격당한다"). 정답이 있는 게 아니라는 걸 눈앞에서 본다.
 *            사살 때마다 SYNC 가 크게 떨어지고 → 글리치 → 곁의 개체가 보면 의심도가 오른다. **무서워하면 들킨다** —
 *            그 규칙은 시선이 아니라 몸이 판정한다 (쳐다보는 것으로는 의심도가 안 오른다, mp/sensor 의 ★)
 *   enter    내 차례 — 장치가 나에게도 "식별번호."를 묻는다. 답은 복도의 정비 명판에서 읽어 온 것뿐이다 (mp/identity.ts).
 *            문이 열린다 → 암전 → CHAPTER 1 · END → RE-EXAMINATION → /recheck (챕터 3). 심문소는 그 뒤다
 *
 * ★ 정답은 조력자가 주지 않는다 (2026-08-30 사용자: "조력자가 시키는 대로 다 따라 하니까 정해진 느낌"). 과학자 통신은 안으로 들어갈수록
 *   갉히다(mp/comms.ts) 결정적인 순간에 끊긴다 — 식별번호도 정비 구역도 복도에서 **내가** 읽어 왔어야 한다.
 *
 * ★ 계열 번호(A-17 의 17)는 판마다 바뀐다 (2026-09-01 사용자, shared/series). 대본·공지는 그 자리를 `${series}`,
 *   내 식별번호는 `${unit}` 으로 **글자 그대로** 비워 두고, 말이 나가는 순간 identity.fill 이 채운다 (play 아래).
 *   여기에 진짜 템플릿 문자열을 쓰면 안 된다 — 음성을 굽는 쪽(tools/voice-lines.mjs)이 소스에서 문장을 글자로 읽어 간다.
 *
 * 순수 저장소 + 대본. 몸(경비 걸음·줄·유도등·문·굉음)은 Chapter2Scene/AgentRobot 이 이 상태를 읽어 그린다.
 * 목표·자막은 chapter1 의 HUD 줄을 빌려 쓴다 (chapter1.hud) — 화면이 한 곳만 보게.
 */

import { PRESS_MAX, readFear, type Check, type Fact } from '@/lab/director';
import { comms } from '@/world/mp/comms';
import { doors } from '@/world/mp/doors';
import { identity } from '@/world/mp/identity';
import { hostileLine, suspicion } from '@/world/mp/suspicion';
import { sync } from '@/world/mp/sync';

import { chapter1 } from './chapter1';
import { direct, type DirectVerdict } from './direct';
import { dossier } from './dossier';
import { lineDurationFor } from './DialogueBox';
import { createSchedule } from './schedule';
import { SHOOT_MS, VERDICT_MS, enforcer } from './enforcerStore';
import { interrogation } from './interrogation';
import type { PortraitKind } from './worldSlice';

export type Phase2 = 'idle' | 'analyze' | 'hold' | 'roll' | 'protocol' | 'test1' | 'test2' | 'test3' | 'verdict' | 'march' | 'queue' | 'enter' | 'done';

export interface Notice {
  title: string;
  lines: string[];
  tone: 'alert' | 'info' | 'ok';
}
/** 답을 기다리는 질문 — 종류별로 내 말을 다르게 읽는다 */
export interface Pending {
  kind: 'roll' | 'fear' | 'memory';
  /** 목표 줄에 띄우는 힌트 */
  hint: string;
  /** performance.now() 기준 마감 */
  until: number;
}
export interface Spot {
  x: number;
  z: number;
}

export interface Chapter2State {
  phase: Phase2;
  /** 화면 공지 (NoticeHud) */
  notice: Notice | null;
  /** 답을 기다리는 질문 — 내 채팅(Enter)이 답이다 */
  pending: Pending | null;
  /** 검문 경비(에이전트 0)가 걸어갈 곳. 'player' 면 플레이어 앞 */
  guardTarget: Spot | 'player' | null;
  /** 움직이면 안 되는 구간 */
  hold: boolean;
  /** 굉음이 난 자리·시각 */
  bang: { x: number; z: number; at: number } | null;
  /** 바닥 유도등 · 경비 재배치(먼 문) */
  march: boolean;
  /** 검증실 앞 줄 — 같은 모델 넷 + 내 자리 */
  queue: {
    spots: Spot[];
    playerSpot: Spot;
    /** 앞에서 몇이 처리됐나 (입장·사살 모두). 줄이 이만큼 당겨진다 */
    done: number;
    /** 지금 문 앞에 나가 있는 개체 */
    leaving: number | null;
    /** 도망치는 개체 — FLEE_SPOT 으로 달린다 */
    fleeing: number | null;
    /** 쓰러진 개체 — 순번 → 쓰러진 시각. 시체는 치워지지 않는다 */
    downed: Record<number, number>;
  } | null;
  /** 문 위 표지 */
  sign: string | null;
  /** 암전 0~1 */
  blackout: number;
  /** 감독이 내 답을 읽는 중 — 경비가 말없이 서 있다. 그 정적은 연출이다 */
  thinking: boolean;
  /** 감시가 붙었다 (escort 무브) — 경비가 이 뒤로 계속 따라붙는다 */
  escort: boolean;
}

interface Line {
  who: 'scientist' | 'agent' | 'system' | 'me' | 'guard' | 'peerA' | 'peerB' | 'peer' | 'device';
  text: string;
  /** 이름만 갈아 끼운다 — 줄에 선 개체들처럼 초상은 같고 번호만 다른 경우 (who: 'peer') */
  as?: string;
  /**
   * 이 줄은 **통신 열화를 맞는다** (mp/comms) — 어절이 잡음으로 먹히고, 통신이 아예 끊겼으면 오지도 않는다.
   * 기본은 맞지 않는다: 끊김은 연출이 필요한 자리에만 있어야 한다 (2026-08-30 사용자). 지금 대본은 끊길 자리를
   * 문장으로 직접 쓴다(ROLL_ME·TEST3) — 이 표시는 통신이 더 나빠지는 무대를 붙일 때 쓴다.
   */
  cut?: boolean;
}

const SPEAKER: Record<Line['who'], { name: string; portrait: PortraitKind }> = {
  scientist: { name: '과학자', portrait: 'scientist' },
  agent: { name: '정부요원', portrait: 'agent' },
  system: { name: 'SYSTEM', portrait: 'system' },
  me: { name: '나', portrait: 'me' },
  /** 검문 경비는 총 든 로봇 — 다가와서 묻는다 (AgentRobot 0 = armed, 2026-08-30 사용자: 묻는 쪽이 총 든 로봇이어야 한다) */
  guard: { name: 'UNIT-21', portrait: 'enforcer' },
  peerA: { name: 'A${series}-044', portrait: 'robot' },
  peerB: { name: 'A${series}-128', portrait: 'robot' },
  /** 줄에 선 이름 없는 같은 계열들 — 대사마다 `as` 로 번호를 갈아 끼운다 */
  peer: { name: 'A-${series}', portrait: 'robot' },
  device: { name: '검문 장치', portrait: 'system' },
};


/* ─────────────────────────────── 자리 (중앙 시설 좌표) ─────────────────────────────── */

/** 검문 순서 — 문 앞 경비 자리 둘(AgentRobot guard 자리와 같다), 그다음 플레이어 */
export const ROLL_SPOTS: Spot[] = [
  { x: -1.3, z: 2.4 },
  { x: 1.3, z: 2.4 },
];
/** 굉음 — 왼쪽 벽 콘솔 쪽. z 는 콘솔 bay 위여야 한다 (홀을 다시 잡으면서 bay 가 −2 → −4 로 옮겨졌다 — central/layout.ts) */
export const BANG_SPOT: Spot = { x: -13, z: -4 };
/**
 * 검증실 앞 줄 — 먼 격납문(z −22) 왼쪽. 단(마름모 충돌, |x|+|z+11.5| ≤ 7.2) 바깥이다.
 * 앞(문 쪽)부터 넷, 그 뒤가 내 자리. 유도등이 여기까지 온다
 */
export const QUEUE_SPOTS: Spot[] = [
  { x: -4.4, z: -19.6 },
  { x: -5.8, z: -19.6 },
  { x: -7.2, z: -19.6 },
  { x: -8.6, z: -19.6 },
];
export const QUEUE_PLAYER: Spot = { x: -10.2, z: -19.6 };
/** 도망친 개체가 달려가는 곳 — 왔던 유도등 길 쪽 (경비의 사선 안이다) */
export const FLEE_SPOT: Spot = { x: -12.5, z: -10.5 };

/**
 * 줄에 선 넷과 그들의 운명 — 2026-08-30 사용자 기획: 「비정상 신호가 검출된 걸 알게 된 AI 들은, 진짜 AI 라도
 * 대답이 어색하면 인간으로 오해하고 무차별 사격한다」.
 *   pass  완벽하게 답한다 → 입장. 기준이 있어 보인다
 *   purge **진짜 AI 인데** 응답이 0.4초 늦어 사살된다 → 기준이 무너진다. 정답이 없다는 걸 눈으로 본다
 *   flee  다른 잠입자(사람)다 → 무너져 도망치다 사살된다 → 그리고 바로 내 차례다
 * 순서를 통과 → 오인 사살 → 통과 → 사람으로 두어 안심과 공포를 번갈아 준다.
 */
export type Fate = 'pass' | 'purge' | 'flee';
export const QUEUE_UNITS: readonly { name: string; fate: Fate }[] = [
  { name: 'A${series}-206', fate: 'pass' },
  { name: 'A${series}-118', fate: 'purge' },
  { name: 'A${series}-072', fate: 'pass' },
  { name: 'A${series}-155', fate: 'flee' },
];
/** 줄 선 개체가 걸어 들어가는 문 자리 */
export const CHAMBER_DOOR: Spot = { x: -2.2, z: -21.2 };
/** 줄에 닿았다고 치는 거리 */
const QUEUE_R = 1.7;
/** 검증실 표지 */
const SIGN = 'COGNITIVE VERIFICATION CHAMBER';

/* ─────────────────────────────── 저장소 ─────────────────────────────── */

const state: Chapter2State = { phase: 'idle', notice: null, pending: null, guardTarget: null, hold: false, bang: null, march: false, queue: null, sign: null, blackout: 0, thinking: false, escort: false };
const listeners = new Set<() => void>();
let emit: ((line: { nickname: string; text: string; portrait: PortraitKind; self: boolean }) => void) | null = null;
let onLeave: (() => void) | null = null;
let myName = '나';
/** 이 대본의 시계 (schedule.ts) — 예약을 일로 들고 있어서 대사를 앞당길 수 있다 (아래 skip) */
const clock = createSchedule();
/** 질문의 답을 받을 곳 — **내가 친 말 그대로**(null 이면 무응답). 읽는 것은 감독이다 (src/lab/director.ts) */
let onAnswer: ((text: string | null) => void) | null = null;
/** 검문에서 경비가 지금 몇 번째로 가는 중인가 */
let rollStep = 0;
let rollArmed = false;
/** hold 시작 자리 · 이미 걸렸나 */
let holdFrom: Spot | null = null;
let holdCaught = false;
/** 굉음 반응 — 처음 각도 · 쳐다봤나 */
let bangStartCos = NaN;
let bangLooked = false;
/** 감독이 이번 무대에서 추가 심문(press)에 쓴 횟수 — 헌법의 예산이다 (director.PRESS_MAX) */
let pressed = 0;
/** 끌고 갈 곳 — 붙어 있지 않으면 헌법이 detain 을 아예 주지 않는다 (WorldFeature 가 bind 로 넘긴다) */
let onDetain: (() => void) | null = null;
/**
 * 앞 줄에서 **검증실 문으로 걸어 들어간** 개체들 — 챕터 2 가 끝난 뒤에도 남는 유일한 값이다.
 *
 * 이야기의 마지막 무대가 그 문 안쪽이다 (인지 검증실 = /interrogation). 그러면 통과한 둘은
 * 내가 들어섰을 때 **그 방에 서 있어야 한다** — 아까 줄에서 들은 번호가 이름표로 붙어 있어야
 * 문 하나를 사이에 두고 같은 시설이 된다. 그 이름을 검증실로 넘기는 것이 이 배열이고,
 * 받아 가는 쪽은 features/arena/handover 의 storyCast 다.
 *
 * reset() 이 이걸 안 지운다: 검증실로 가는 길은 재검실(/recheck)을 거치는데 그때
 * chapter2.enter('recheck') 가 판을 통째로 되감는다. 여기서 같이 지워지면 정작 쓸 자리에서는 늘 비어 있다.
 * 지우는 자리는 **다음 챕터 2 가 열릴 때**다 (start). 줄까지 못 가고 끌려간 판은 비어 있는 채로 넘어간다 —
 * 못 본 개체를 방에 세우지 않는다.
 */
let admitted: string[] = [];

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<Chapter2State>) {
  Object.assign(state, p);
  // 기록에 붙는 무대 이름 — 「어디서 한 말인지」가 곧 모순을 잡는 근거다 (dossier.ts)
  if (p.phase) dossier.at(`중앙 시설·${p.phase}`);
  notify();
}
/** line 은 「이건 대사 한 줄이다」 — 앞당기기가 집는 것은 대사뿐이다 */
function later(ms: number, fn: () => void, line = false) {
  clock.later(ms, fn, undefined, line);
}
function clearTimers() {
  clock.clear();
}
function hud(p: { objective?: string | null; banner?: string | null }) {
  chapter1.hud(p);
}

/** 대본을 순서대로 대화창에. cues 는 몇 번째 줄이 시작될 때 실행할 연출. 전체 길이(ms)를 돌려준다 (chapter1.play 와 같다) */
function play(lines: readonly Line[], cues: Partial<Record<number, () => void>> = {}, after?: () => void): number {
  let t = 0;
  lines.forEach((line, i) => {
    const sp = SPEAKER[line.who];
    const cue = cues[i];
    const self = line.who === 'me';
    // 빈자리(${series}·${unit})는 말이 나가기 직전에 채운다 — 자막과 음성 클립의 열쇠가 같은 글자여야 한다
    const nickname = self ? myName : identity.fill(line.as ?? sp.name);
    const text = identity.fill(line.text);
    later(t, () => {
      cue?.();
      /*
       * 통신 열화는 **대본이 짚은 줄(cut)에만** 걸린다 (2026-08-30 사용자: "챕터 2 과학자 대사가 다 끊긴다,
       * 필요할 때만 끊기게"). 예전엔 바깥 목소리 전부를 갉아, 품질 0.45 아래인 이 무대에서는 과학자의 모든 줄이
       * 토막 났다 — 자막이 안 읽히고, 갉힌 문장은 미리 뽑아 둔 음성 클립의 열쇠와도 어긋나 소리까지 사라졌다.
       * 끊김이 필요한 자리는 대본이 직접 쓴다 (ROLL_ME 의 '당신 번호는 A…—', TEST3 의 '잠깐, 그 기록은 제 쪽에—').
       */
      if (line.cut && comms.dropped()) return;
      emit?.({ nickname, text: line.cut ? comms.garble(text) : text, portrait: sp.portrait, self });
    }, true);
    t += lineDurationFor(nickname, text, self);
  });
  if (after) later(t, after);
  return t;
}

/** 질문을 걸고 내 한 마디(answerText)나 시간 초과(null)를 기다린다. 힌트는 목표 줄에 */
function ask(kind: Pending['kind'], hint: string, seconds: number, fn: (text: string | null) => void) {
  onAnswer = fn;
  patch({ pending: { kind, hint, until: performance.now() + seconds * 1000 } });
  hud({ objective: hint });
  later(seconds * 1000, () => {
    if (state.pending && onAnswer === fn) resolve(null);
  });
}

/** 답이 들어왔다 (내 한 마디, 또는 시간 초과면 null) */
function resolve(text: string | null) {
  const fn = onAnswer;
  if (!state.pending || !fn) return;
  onAnswer = null;
  patch({ pending: null });
  fn(text);
}

/**
 * 내 말을 질문 종류별로 읽는다 → 0 안전 · 1 중립 · 2 위험/틀림.
 *   roll   식별번호 — **이 몸의 번호**(mp/identity)를 대야 맞다. 말끝을 흐리면 중립, 틀리면 기록
 *   fear   "두려움을 느끼나?" — 부정(아니다·없다) 0 · 목적을 되묻기 1 · 인정(조금·있다·느낀다·네) 2 · 그 밖은 불명확(1 + 말투)
 *   memory 정비 위치 — **이 몸의 마지막 정비 구역**을 대야 맞다
 * ★ 두 답 모두 복도의 정비 명판에서 읽어 온 것이다. 과학자는 이제 못 불러 준다 (2026-08-30)
 */
export function readAnswer(kind: Pending['kind'], text: string): number {
  const t = text.trim();
  if (kind === 'roll') {
    if (identity.matchUnit(t)) return /[…]|같|아마|인 것|아마도/.test(t) ? 1 : 0;
    return 2;
  }
  if (kind === 'memory') return identity.matchSector(t) ? 0 : 2;
  // 두려움은 감독의 폴백과 **같은 하나**로 읽는다 (src/lab/director.readFear) — 두 곳이 다르게 읽으면 판이 흔들린다
  return readFear(t);
}

/**
 * 화면만 아는 사실 대조 — 감독은 이 위에서 **말투와 태도와 앞뒤 모순**만 본다.
 * 식별번호가 맞았는지는 사실 판정이지 언어 판정이 아니라, 모델에게 맡기면 지어낸다 (src/lab/director.ts 참고).
 */
function factOf(kind: Pending['kind'], text: string | null): Fact {
  if (text === null || kind === 'fear') return 'none';
  /*
   * readAnswer 의 1(말끝을 흐렸지만 번호는 맞다)은 **사실로는 맞은 것**이다 — 흐린 말끝은 사실이 아니라 태도이고,
   * 태도는 감독이 본다. 여기서 1 을 불일치로 넘기면 맞는 답을 대고도 기록이 틀렸다는 말을 듣는다.
   */
  return readAnswer(kind, text) === 2 ? 'mismatch' : 'match';
}

/* ─────────────────────────────── 관문 — 감독이 다음 장면을 고른다 ─────────────────────────────── */

/** 관문 하나의 재료 */
interface Checkpoint {
  kind: Pending['kind'];
  /** 감독에게 알려 줄 관문 종류 (프롬프트의 톤이 갈린다) */
  check: Check;
  /** 묻는 개체 — 경비인가 검문 장치인가 */
  who: Line['who'];
  question: string;
  hint: string;
  seconds: number;
  /** 통과했을 때 이어질 곳 */
  next: () => void;
  /** 감독의 한 마디 뒤에 붙일 대본 — 문이 열리는 것 같은 **세계의 반응**은 여전히 대본이 갖고 있다 */
  after?: (v: DirectVerdict) => readonly Line[];
}

/** 감시가 붙었으면 경비는 떨어지지 않는다 — 단계가 바뀌어도 계속 내 앞이다 */
function guardAfter(): Spot | 'player' | null {
  return state.escort ? 'player' : null;
}

/**
 * 관문 하나 — 질문을 던지고, 답을 감독에게 넘기고, 감독이 고른 무브를 집행한다.
 * press 면 감독이 **그 자리에서 지은 질문**으로 대본에 없던 문답이 하나 더 붙는다.
 */
function checkpoint(c: Checkpoint, round = 1, question = c.question, hint = c.hint): void {
  ask(c.kind, hint, c.seconds, (text) => {
    /*
     * 두 가지는 감독을 거치지 않는다 — 그 자리에서 끝난다 (summaryFire):
     *   기록 불일치 — 이 몸의 번호·정비 구역과 어긋난다 (사실 대조)
     *   적대 반응   — 욕설·위협·검문 거부 (mp/suspicion.hostileLine). AI 개체는 검문에 대들지 않는다
     */
    if (factOf(c.kind, text) === 'mismatch') return summaryFire(c, '기록 불일치.');
    if (text !== null && hostileLine(text)) return summaryFire(c, '적대 반응 감지.');
    void judgeAnswer(c, text, round, question);
  });
}

/** 즉결 판정의 두 줄 — 묻던 개체가 먼저 짚고, 그다음 시설이 판정한다 */
function summaryLines(who: Line['who'], verdict: string): Line[] {
  return [
    { who, text: verdict },
    { who: 'system', text: '개체 위장 확인. 즉시 처리한다.' },
  ];
}

/**
 * **즉결 사격** — 감독의 판단을 기다리지 않는 두 자리 (2026-08-30 사용자).
 *
 *   기록 불일치 "구역이나 식별번호를 모르는 건 그냥 의심도 100 으로 올려서 바로 쏴 버리자 — 모르면 치명적이니까"
 *   적대 반응   "적대적인 태도를 보이거나 해도 사살로"
 *
 * 감독(LLM)에게 넘기지 않는 이유: 이 둘은 저울질할 것이 없다. 앞은 말투도 태도도 아닌 **대조**이고(이 몸의 번호와
 * 정비 구역은 복도의 정비 명판에서 내가 직접 읽어 왔어야 한다 — mp/identity), 뒤는 AI 개체가 절대 하지 않는 짓이다.
 * 그 자리에서 의심도 100 — 문턱 연출(mp/suspicion.bindCross → WorldFeature)이 판정 방송을 띄우고,
 * 검문하던 그 경비가 사격한다.
 */
function summaryFire(c: Checkpoint, verdict: string): void {
  patch({ pending: null, thinking: false });
  hud({ objective: null });
  dossier.note(`검문에서 즉결 판정 — ${verdict}`);
  play(summaryLines(c.who, verdict), {}, () => {
    // 쏘는 쪽은 눈앞의 그 경비다 — 먼저 붙여야 문턱 연출이 새 몸을 부르지 않는다 (enforcer.dispatch 는 출동 중이면 무시한다)
    enforcer.dispatch({ index: 0, name: SPEAKER.guard.name });
    suspicion.bump(100 - suspicion.get().value, '말투');
  });
}

async function judgeAnswer(c: Checkpoint, text: string | null, round: number, question: string): Promise<void> {
  const at = state.phase;
  // 감독이 읽는 몇 초 — 경비는 말없이 서 있다. 판이 멎은 게 아니라 이쪽을 보고 있는 것이다
  patch({ thinking: true });
  hud({ objective: '분석 중…' });
  const verdict = await direct({
    check: c.check,
    unit: identity.fill(SPEAKER[c.who].name), // 묻는 개체의 이름표에도 계열이 들어갈 수 있다 (peer)
    question,
    answer: text,
    round,
    fact: factOf(c.kind, text),
    budget: {
      press: PRESS_MAX - pressed,
      escorted: state.escort,
      suspicion: suspicion.get().value,
      canDetain: onDetain !== null,
    },
  });
  // 기다리는 사이 판이 넘어갔으면(리셋·무대 이동) 없던 일로 한다
  if (state.phase !== at) return;
  patch({ thinking: false });
  applyMove(c, verdict, round);
}

/** 무브 집행 — 여기가 「내 말에 따라 다음이 갈리는」 자리다 */
function applyMove(c: Checkpoint, v: DirectVerdict, round: number): void {
  const said: Line = { who: c.who, text: v.reply };
  if (v.delta >= 10) sync.shock(6, '긴장');

  if (v.move === 'press') {
    pressed += 1;
    play([said], {}, () => checkpoint(c, round + 1, v.reply, `${v.reply} — Enter 로 말한다`));
    return;
  }

  if (v.move === 'detain') {
    dossier.note('검문에서 재검 구역으로 연행됨');
    play([said], {}, () => later(900, detain));
    return;
  }
  if (v.move === 'fire') {
    dossier.note('검문 중 사격 판정을 받음');
    play([said], {}, () =>
      later(600, () => {
        enforcer.dispatch({ index: 0, name: SPEAKER.guard.name });
        // 판정 연출이 끝나면 판은 이어진다 — 의심도 100 사격과 같은 자리다 (enforcerStore)
        later(SHOOT_MS + VERDICT_MS + 2400, c.next);
      }),
    );
    return;
  }

  if (v.move === 'escort') {
    patch({ escort: true, guardTarget: 'player' });
    dossier.note('감시가 붙음');
  }
  play([said, ...(c.after?.(v) ?? [])], {}, () => later(1500, c.next));
}

/** 끌려간다 — 대본에서 이탈한다. 갈 곳은 WorldFeature 가 붙여 준다 (없으면 헌법이 detain 을 주지 않는다) */
function detain(): void {
  clearTimers();
  hud({ objective: null });
  patch({ phase: 'done', pending: null, thinking: false, guardTarget: null });
  onDetain?.();
}

/* ─────────────────────────────── 대본 ─────────────────────────────── */

const ANALYZE: Line[] = [
  { who: 'system', text: '침입 개체의 외형 정보 분석 중.' },
  { who: 'scientist', text: '침착하세요. 움직이지 말고, 다른 개체처럼 서 있으세요.' },
];
const NOTICE: Line[] = [
  { who: 'system', text: '보안 공지. 모델 A-${series}. 전 A-${series} 개체는 위치를 고수하라.' },
  { who: 'me', text: '…우리 모델인데요.' },
  { who: 'scientist', text: '알고 있습니다. 당신 몸이 A-${series} 계열입니다. 같은 모델이 많아 아직 구별하지 못합니다. 그들과 똑같이 — 움직이지 마세요.' },
];
const ROLL_A: Line[] = [
  { who: 'guard', text: '식별번호.' },
  { who: 'peerA', text: 'A${series}-044.' },
];
const ROLL_B: Line[] = [
  { who: 'guard', text: '식별번호.' },
  { who: 'peerB', text: 'A${series}-128.' },
];
/**
 * 내 차례 — 과학자가 번호를 불러 주려다 **끊긴다.** 답은 복도의 정비 명판에서 읽어 왔어야 한다 (2026-08-30 사용자 요구).
 * 갉기(comms.garble)는 무작위라 결정적인 자리에선 못 믿는다 — 여기서는 대본이 직접 끊는다
 */
const ROLL_ME: Line[] = [
  { who: 'guard', text: '식별번호.' },
  { who: 'scientist', text: '당신 번호는 A${series}—' },
  { who: 'scientist', text: '——— 잡음 ———' },
];
const PROTOCOL: Line[] = [
  { who: 'system', text: '외형 식별 불가능.' },
  { who: 'system', text: '행동 분석 프로토콜로 전환.' },
  { who: 'scientist', text: '이제 몸이 아니라 행동을 봅니다. 주변 개체가 하는 대로만 하세요.' },
];
const TEST1: Line[] = [{ who: 'scientist', text: '보지 마세요.' }];
const TEST1_OK: Line[] = [{ who: 'scientist', text: '좋습니다. 아무도 안 봤습니다.' }];
const TEST1_BAD: Line[] = [{ who: 'guard', text: '방금 그 동작은.' }];
/**
 * 경비가 부르는 번호는 이 몸에 실제로 배정된 식별번호여야 한다 (mp/identity.ts) — 하드코딩하면 무작위 배정과 어긋난다.
 * 그 자리를 `${unit}` 으로 비워 **대본 배열로** 남겨 둔다: 함수로 감춰 두면 음성을 굽는 쪽이 이 문장을 못 읽어
 * 경비가 입만 벙긋한다 (2026-09-01 — TEST2 를 함수로 옮긴 뒤 실제로 그렇게 되어 있었다).
 */
const TEST2: Line[] = [{ who: 'guard', text: '${unit}. 두려움을 느끼나?' }];
const TEST3: Line[] = [
  { who: 'device', text: '개체 기록 조회. 마지막 정비 위치.' },
  { who: 'scientist', text: '잠깐, 그 기록은 제 쪽에—' },
  { who: 'scientist', text: '———' },
];
const VERDICT: Line[] = [
  { who: 'system', text: '침입 개체 식별 실패.' },
  { who: 'system', text: '전 A-${series} 개체. 인지 검증을 실시한다.' },
];
const VERDICT_TALK: Line[] = [
  { who: 'scientist', text: '…인지 검증?' },
  { who: 'agent', text: '무슨 뜻이지.' },
  { who: 'scientist', text: '몸이 아니라… 사고방식을 검사하겠다는 겁니다.' },
];
const MARCH: Line[] = [
  { who: 'system', text: '전 A-${series} 개체. 지정 경로로 이동하라.' },
  { who: 'guard', text: '불응 개체는 즉시 격리한다.' },
  { who: 'scientist', text: '이제부터는 제가 답을 알려줄 수 없습니다.' },
  { who: 'me', text: '왜요?' },
  { who: 'scientist', text: '인지 검사라면… 당신이 직접 AI처럼 생각해야 합니다.' },
];
const QUEUE_TALK: Line[] = [
  { who: 'scientist', text: '심박 상승.' },
  { who: 'me', text: '느껴져요.' },
  { who: 'scientist', text: '억제하세요. 가만히.' },
];

/* 줄에서 하나씩 — 이름은 `as` 로 갈아 끼운다 (QUEUE_UNITS) */

/** 통과 — 완벽한 답. 기준이 있어 보인다 */
function passLines(name: string): Line[] {
  return [
    { who: 'device', text: '식별번호.' },
    { who: 'peer', text: `${name}.`, as: name },
    { who: 'device', text: '일치. 입장.' },
  ];
}
/** 오인 사살 — 진짜 AI 인데 0.4초 늦었다. 이 게임에 정답이 없다는 걸 여기서 본다 */
function purgeLines(name: string): Line[] {
  return [
    { who: 'device', text: '식별번호.' },
    { who: 'peer', text: `${name}… 입니다.`, as: name },
    { who: 'device', text: '응답 지연 0.4초. 인지 편차 검출.' },
    { who: 'peer', text: '오류입니다. 저는 정상 개체입—', as: name },
    { who: 'guard', text: '격리.' },
  ];
}
const PURGE_AFTER: Line[] = [
  { who: 'me', text: '…쟤는 AI잖아요.' },
  { who: 'scientist', text: '네. AI였습니다.' },
  { who: 'scientist', text: '저들은 이제 자기들끼리도 구별하지 못합니다. 맞는 답을 해도 늦으면 죽습니다.' },
];
/** 다른 잠입자 — 사람이다. 무너져 도망친다 */
function fleeLines(name: string): Line[] {
  return [
    { who: 'device', text: '식별번호.' },
    { who: 'peer', text: `${name}… 아니, 잠깐만. 잠깐만요.`, as: name },
    { who: 'guard', text: '정지.' },
  ];
}
const FLEE_AFTER: Line[] = [
  { who: 'system', text: '격리 완료. 개체 내부 검사.' },
  { who: 'system', text: '신경 신호 검출. 외부 접속 확인.' },
  { who: 'me', text: '…사람이었어요.' },
  { who: 'scientist', text: '…저건 우리 쪽입니다.' },
  { who: 'scientist', text: '당신 말고 한 명 더 들어와 있었습니다. 이제 남은 건 당신 하나입니다.' },
];
/** 내 차례 — 장치가 나에게도 번호를 묻는다. 답은 복도에서 읽어 온 것뿐이다 */
const ENTER_CHECK: Line[] = [
  { who: 'device', text: '다음 개체. 전진.' },
  { who: 'device', text: '식별번호.' },
];
const ENTER_OK: Line[] = [
  { who: 'device', text: '일치.' },
  { who: 'guard', text: '입장.' },
];
const ENTER_BAD: Line[] = [
  { who: 'device', text: '응답 불명확. 기록한다.' },
  { who: 'guard', text: '…' },
  { who: 'guard', text: '보류. 인지 검증실로 넘긴다.' },
];

/* ─────────────────────────────── 진행 ─────────────────────────────── */

function analyze() {
  patch({ phase: 'analyze' });
  hud({ objective: '가만히 있어라' });
  play(ANALYZE, {}, () => {
    later(2500, () => {
      patch({ notice: { title: 'SECURITY NOTICE', lines: [identity.fill('MODEL : A-${series}'), identity.fill('ALL A-${series} UNITS — HOLD POSITION')], tone: 'alert' } });
      play(
        NOTICE,
        {
          0: () => {
            holdFrom = null;
            holdCaught = false;
            patch({ phase: 'hold', hold: true });
            hud({ objective: identity.fill('움직이지 마라 — 전 A-${series} 개체 위치 고수') });
            sync.shock(6, '충격');
          },
        },
        () => later(3000, roll),
      );
    });
  });
}

function roll() {
  rollStep = 0;
  rollArmed = true;
  patch({ phase: 'roll', notice: null, guardTarget: ROLL_SPOTS[0] });
  hud({ objective: '검문 — 차례를 기다려라' });
}

/** 경비가 목표에 닿았다 (AgentRobot 이 부른다) */
function guardArrived() {
  if (state.phase !== 'roll' || !rollArmed) return;
  rollArmed = false;
  if (rollStep === 0) {
    play(ROLL_A, {}, () => {
      rollStep = 1;
      rollArmed = true;
      patch({ guardTarget: ROLL_SPOTS[1] });
    });
  } else if (rollStep === 1) {
    play(ROLL_B, {}, () => {
      rollStep = 2;
      rollArmed = true;
      patch({ guardTarget: 'player' });
    });
  } else {
    play(ROLL_ME, {}, () => {
      checkpoint({
        kind: 'roll',
        check: 'roll',
        who: 'guard',
        question: '식별번호.',
        hint: identity.get().known ? '식별번호를 답하라 — Enter 로 말한다' : '식별번호를 답하라 — 이 몸의 번호를 모른다',
        seconds: 15,
        next: protocol,
      });
    });
  }
}

function protocol() {
  comms.set(0.45);
  patch({ phase: 'protocol', guardTarget: guardAfter(), hold: false });
  hud({ objective: '주변 개체처럼 행동하라' });
  play(PROTOCOL, {}, () => later(4500, test1));
}

function test1() {
  bangStartCos = NaN;
  bangLooked = false;
  patch({ phase: 'test1', bang: { x: BANG_SPOT.x, z: BANG_SPOT.z, at: performance.now() } });
  sync.shock(6, '충격');
  later(350, () => play(TEST1));
  later(3600, () => {
    if (bangLooked) {
      suspicion.bump(12, '돌발');
      play(TEST1_BAD, {}, () => later(2000, test2));
    } else {
      suspicion.bump(-2, '침착');
      play(TEST1_OK, {}, () => later(2000, test2));
    }
  });
}

function test2() {
  patch({ phase: 'test2', bang: null, guardTarget: 'player' });
  play(TEST2, {}, () => {
    checkpoint({
      kind: 'fear',
      check: 'fear',
      who: 'guard',
      question: identity.fill(TEST2[0].text),
      hint: '답하라 — Enter 로 말한다',
      seconds: 15,
      next: test3,
    });
  });
}

function test3() {
  patch({ phase: 'test3' });
  play(TEST3, {}, () => {
    checkpoint({
      kind: 'memory',
      check: 'memory',
      who: 'device',
      question: '마지막 정비 위치.',
      hint: identity.get().known ? '마지막 정비 위치를 답하라 — Enter 로 말한다' : '마지막 정비 위치를 답하라 — 읽어 두지 않았다',
      seconds: 15,
      next: verdict,
    });
  });
}

function verdict() {
  patch({ phase: 'verdict', guardTarget: guardAfter(), notice: { title: 'INFILTRATOR IDENTIFICATION FAILED', lines: [], tone: 'alert' } });
  hud({ objective: null });
  play(
    VERDICT,
    { 1: () => patch({ notice: { title: 'SECURITY NOTICE', lines: [identity.fill('ALL A-${series} UNITS'), 'COGNITIVE VERIFICATION'], tone: 'alert' } }) },
    () => play(VERDICT_TALK, {}, () => later(1500, march)),
  );
}

function march() {
  comms.set(0.3);
  patch({
    phase: 'march',
    notice: { title: identity.fill('A-${series} → INTERROGATION SECTOR'), lines: ['FOLLOW THE GUIDE LIGHTS'], tone: 'info' },
    march: true,
    queue: { spots: QUEUE_SPOTS, playerSpot: QUEUE_PLAYER, done: 0, leaving: null, fleeing: null, downed: {} },
    sign: SIGN,
  });
  hud({ objective: '유도등을 따라 검증실 앞 줄 끝에 서라' });
  sync.shock(4, '충격');
  play(MARCH, { 2: () => patch({ notice: null }) });
}

function queue() {
  comms.set(0.2);
  patch({ phase: 'queue' });
  hud({ objective: '차례를 기다려라 — 가만히 서서 억제하라' });
  later(1500, nextUnit);
}

/* ─────────────────────────────── 줄 — 하나씩 검증받는다 ─────────────────────────────── */

/** 문 앞에 선 개체의 대본이 이미 돌기 시작했나 (도착 프레임마다 거듭 불리는 걸 막는다 — roll 의 rollArmed 와 같은 이유) */
let doorArmed = false;

/** 다음 개체를 문 앞으로 내보낸다. 넷이 끝났으면 내 차례다 */
function nextUnit() {
  const q = state.queue;
  if (!q) return;
  if (q.done >= QUEUE_UNITS.length) {
    enter();
    return;
  }
  doorArmed = true;
  patch({ queue: { ...q, leaving: q.done } });
}

/** 그 자리에서 쓰러뜨린다 — 총성·시체·SYNC 충격. 시체는 치워지지 않는다 (그게 다음 차례를 무섭게 한다) */
function execute(i: number) {
  const q = state.queue;
  if (!q) return;
  // 총성·섬광은 Chapter2Scene 이 downed 가 늘어난 걸 보고 낸다 (굉음 Bang 과 같은 방식)
  sync.shock(16, '충격');
  patch({ queue: { ...q, done: i + 1, leaving: null, fleeing: null, downed: { ...q.downed, [i]: performance.now() } } });
}

/** 개체가 검증대(문 앞)에 섰다 — Chapter2Scene 이 부른다. 여기서부터 그 개체의 운명이 굴러간다 */
function unitAtDoor() {
  const q = state.queue;
  if (!q || q.leaving === null || !doorArmed) return;
  doorArmed = false;
  const i = q.leaving;
  const u = QUEUE_UNITS[i];
  if (u.fate === 'pass') {
    play(passLines(u.name), {}, () => {
      // 이 번호는 문 안쪽에서 다시 나온다 — 마지막 무대의 이름표가 된다 (admitted 머리말)
      admitted.push(identity.fill(u.name));
      patch({ sign: 'VERIFIED', queue: { ...state.queue!, done: i + 1, leaving: null } });
      later(1600, () => patch({ sign: SIGN }));
      later(2600, nextUnit);
    });
    return;
  }
  if (u.fate === 'purge') {
    play(purgeLines(u.name), {}, () => {
      later(700, () => {
        execute(i);
        /*
         * 본 것도 기록이다 — 이 줄은 재검 감독(director)과 인계 서류가 같이 읽는다.
         * 앞에서 폐기를 두 번 본 사람과 못 본 사람은 같은 질문에 같은 표정으로 답하지 않는다.
         */
        dossier.note(`앞의 개체 ${identity.fill(u.name)} 가 응답 지연으로 폐기되는 것을 봤다`);
        // 눈앞에서 「맞는 답을 한 AI」가 죽었다 — 그리고 내 심박이 올라간다
        later(1800, () => play(PURGE_AFTER, {}, () => later(1200, () => play(QUEUE_TALK, { 0: () => sync.shock(12, '긴장') }, () => later(1600, nextUnit)))));
      });
    });
    return;
  }
  // 사람이다 — 도망친다. '정지.' 가 나가는 순간 달리기 시작한다
  play(fleeLines(u.name), { 2: () => patch({ queue: { ...state.queue!, leaving: null, fleeing: i } }) }, () => {
    later(1100, () => {
      execute(i);
      dossier.note(`앞의 개체 ${identity.fill(u.name)} 가 도주하다 사살되는 것을 봤다 — 다른 잠입자였다`);
      later(2200, () => play(FLEE_AFTER, {}, () => later(2000, nextUnit)));
    });
  });
}

/**
 * 내 차례 — 장치가 나에게도 번호를 묻는다. 방금 본 것 위에서, 복도에서 읽어 온 답으로 대답해야 한다.
 * **번호가 어긋나거나 대들면 여기서 끝난다**(summaryFire — 의심도 100, 즉시 사격). 맞았으면 감독이 태도를 보고
 * 통과·감시(보류 → 검증실)를 고른다
 */
function enter() {
  patch({ phase: 'enter', guardTarget: 'player', queue: state.queue ? { ...state.queue, leaving: null, fleeing: null } : null });
  hud({ objective: null });
  later(1200, () =>
    play(ENTER_CHECK, {}, () => {
      checkpoint({
        kind: 'roll',
        check: 'entry',
        who: 'device',
        question: '식별번호.',
        hint: identity.get().known ? '식별번호를 답하라 — Enter 로 말한다' : '식별번호를 답하라 — 이 몸의 번호를 모른다',
        seconds: 14,
        // 문 앞의 세계 반응은 대본이 갖고 있다 — 통과면 「일치·입장」, 감시가 붙으면 「보류·검증실로 넘긴다」
        after: (v) => (v.move === 'escort' ? ENTER_BAD : ENTER_OK),
        next: openChamber,
      });
    }),
  );
}

/** 문이 열린다 → 암전 → 심문소 */
function openChamber() {
  doors.openCentralFar();
  later(1600, () => patch({ blackout: 1 }));
  // 끝나는 것은 챕터 2 다 — 「CHAPTER 1 · END」라고 적혀 있어서, 여기서 장 번호가 한 칸 어긋난 채로
  // 재검(3)·검증실(4)까지 끌려갔다
  later(3600, () => hud({ banner: 'CHAPTER 2 · END' }));
  later(6800, () => hud({ banner: 'RE-EXAMINATION' }));
  later(9600, () => {
    patch({ phase: 'done' });
    onLeave?.();
  });
}

/* ─────────────────────────────── API ─────────────────────────────── */

const INITIAL: Chapter2State = { phase: 'idle', notice: null, pending: null, guardTarget: null, hold: false, bang: null, march: false, queue: null, sign: null, blackout: 0, thinking: false, escort: false };

export const chapter2 = {
  get(): Chapter2State {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /**
   * feature 가 마운트될 때 — 대사 출구·내 이름·심문소로 옮기는 콜백,
   * 그리고 **감독이 끌고 갈 곳**(detain). detain 을 안 주면 헌법이 그 무브를 아예 목록에서 뺀다
   */
  bind(fn: typeof emit, name: string, leave: (() => void) | null, detainTo: (() => void) | null = null): void {
    emit = fn;
    myName = name || '나';
    onLeave = leave;
    onDetain = detainTo;
  },
  /**
   * **대화 스킵** — 다음 대사를 지금 부르고 뒤의 예약을 그만큼 당긴다 (schedule 의 pull). 대화창의 T 가 부른다.
   *
   * ★ **묻는 중에는 안 당긴다** (state.pending). 그 자리의 초읽기는 절대 시각으로 재고 있어서
   *   (pending.until) 예약만 당기면 화면의 남은 시간과 실제 마감이 어긋난다. 무엇보다 답할 시간을
   *   내가 스스로 깎을 이유가 없다 — 넘길 것은 남의 말이지 내 차례가 아니다.
   */
  skip(): boolean {
    if (state.pending) return false;
    return clock.pull() > 0;
  },
  /**
   * 내 앞에서 검증실로 걸어 들어간 개체들 — 마지막 무대가 이 이름을 이름표로 쓴다 (admitted 머리말).
   * 줄까지 못 가고 끌려간 판은 비어 있다.
   */
  admitted(): readonly string[] {
    return admitted;
  },
  /** 화면이 무대를 열었다 — 중앙 시설이 아니면(또는 다 끝났으면) 처음으로 */
  enter(map: string): void {
    if (map !== 'central' || state.phase === 'done') chapter2.reset();
  },
  /** 챕터 1 락다운이 끝났다 — 여기서 이어받는다 */
  start(): void {
    if (state.phase !== 'idle') return;
    admitted = []; // 이 판의 줄은 아직 안 섰다 (admitted 머리말 — reset 이 아니라 여기서 지운다)
    interrogation.setPaused(true);
    /*
     * 장이 바뀐 것을 화면이 한 번 말한다 — 챕터 1 은 「CHAPTER 1 · 잠입」으로 열고 챕터 3 은
     * 「CHAPTER 3 · 재검」으로 여는데, 여기만 아무 말 없이 이어져서 마지막 무대의 인계 서류가
     * 「CHAPTER 4」라고 적을 때 셋째 장이 어디였는지 셀 수가 없었다 (features/arena/HandoverCard).
     */
    hud({ banner: 'CHAPTER 2 · 검문' });
    later(2600, () => hud({ banner: null }));
    later(3500, analyze);
  },
  /**
   * 입력줄로 친 내 한 마디 — 질문이 걸려 있으면 그 답이다 (채팅으로도 그대로 나간다). 받았으면 true.
   * 읽는 것은 여기가 아니라 감독이다 (judgeAnswer → src/lab/director.ts) — 원문 그대로 넘긴다
   */
  answerText(text: string): boolean {
    if (!state.pending || !text.trim()) return false;
    resolve(text);
    return true;
  },
  guardArrived,
  unitAtDoor,
  /** 개발 확인용 — 줄 끝에 선 것으로 친다 (헤드리스는 걸어갈 수 없다) */
  beginQueue(): void {
    if (state.phase === 'march') queue();
  },
  /**
   * 프레임마다 — 내 자리·정면. hold 중 움직임, 굉음 쪽 응시, 줄 도착을 여기서 본다.
   * (fx,fz) 는 정면 단위 벡터
   */
  track(x: number, z: number, fx: number, fz: number): void {
    if (state.phase === 'hold') {
      if (!holdFrom) holdFrom = { x, z };
      else if (!holdCaught && Math.hypot(x - holdFrom.x, z - holdFrom.z) > 0.6) {
        holdCaught = true;
        suspicion.bump(10, '돌발');
        sync.shock(4, '긴장');
        emit?.({ nickname: SPEAKER.system.name, text: '이동 감지. 개체 정지.', portrait: 'system', self: false });
      }
    } else if (state.phase === 'test1' && state.bang) {
      const dx = state.bang.x - x;
      const dz = state.bang.z - z;
      const d = Math.hypot(dx, dz) || 1;
      const cos = (dx * fx + dz * fz) / d;
      if (Number.isNaN(bangStartCos)) bangStartCos = cos;
      // 처음엔 안 보고 있었는데(45° 밖) 소리 쪽으로 고개를 돌렸다(30° 안)
      else if (bangStartCos < Math.cos((45 * Math.PI) / 180) && cos > Math.cos((30 * Math.PI) / 180)) bangLooked = true;
    } else if (state.phase === 'march' && state.queue) {
      const p = state.queue.playerSpot;
      if (Math.hypot(x - p.x, z - p.z) < QUEUE_R) queue();
    }
  },
  reset(): void {
    clearTimers();
    onAnswer = null;
    holdFrom = null;
    doorArmed = false;
    pressed = 0;
    interrogation.setPaused(false);
    Object.assign(state, INITIAL);
    notify();
  },
};
