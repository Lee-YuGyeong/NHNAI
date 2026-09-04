/**
 * 챕터 3 — 재검실(/recheck). **대본이 없는 장(場)이다** (2026-08-30 사용자 설계).
 *
 * 챕터 1·2 는 대사가 배열로 적혀 있고 플레이어의 답이 그 배열 사이에 낀다. 여기는 반대다:
 * 문을 열고 앉히는 것까지만 대본이고, **그다음 묻는 말·판정·다음 장면은 전부 감독**(src/lab/director.ts)이 그 자리에서 짓는다.
 * 감독이 쥔 재료는 내가 여태 한 말과 행동(features/world/dossier.ts) 하나뿐이라, 이 방에서 나오는 문장은
 * 매번 다르고 매번 내 것이다 — "아까는 4 구역이라고 했다" 는 대사는 아무도 써 두지 않았다.
 *
 *   arrive   이송 → 검증대 앞 표식으로 걸어가라
 *   wait     **질문 한 줄이 대화창에 뜨고**(소리도 같이) → Enter 로 답한다 (ANSWER_SECONDS)
 *   judge    감독이 읽는다 (몇 초. 그 정적은 연출이다)
 *            → press   방금 그 답에서 걸린 대목을 꼬리질문한다 (감독이 지은 질문). 그 한 줄이 곧 다음 질문이다
 *            → pass    방면 — 인지 검증실로 보낸다 (/interrogation)
 *            → fire    사격 — 여기서 끝난다
 *   ★ **이 방에 감시(escort)는 없다** (2026-09-01 사용자: "심문자가 결국 검출자고, 사살할 능력을 가진 사람이다.
 *     따라가거나 뭔가 할 필요가 없다. 의심도가 100 이면 그 자리에서 쏘면 된다"). 묻는 자가 총을 들고 눈앞에 서 있는데
 *     「따라간다」로 끝나면 그 총이 소품이 된다. 그래서 헌법이 이 방에서는 escort 를 목록에서 빼고(canEscort),
 *     의심도 100 도 **문으로 새 몸이 들어오는 게 아니라** 검증관이 그 자리에서 쏜다 (WorldFeature 의 onThreshold).
 *   ★ **문답은 MIN_ROUNDS 번은 이어진다** (2026-09-01 사용자: "심문 중에 다음 챕터로 넘어가 버린다").
 *     그전에는 헌법(director.allowMoves)이 pass 를 아예 목록에서 뺀다 — 감독에게 캐묻는 길만 남긴다.
 *     반대로 예산이 떨어지면(press 0) 결정만 남긴다. 그래서 이 방은 늘 **세 번 묻고 한 번 정한다**.
 *
 * 소리는 길이 둘이다 — **미리 구운 클립**(대본에 적힌 줄: SYSTEM·과학자·검증 장치·검증관의 정해진 말과 첫 질문 OPENERS)과
 * **실시간 합성**(감독이 그 자리에서 지은 말, live 표시). 구운 줄은 대화창이 클립 길이에 맞춰 글자를 찍어 소리와 딱 맞고,
 * 지은 줄은 합성이 늦게 도착하므로 화면에 최소 LIVE_MIN_MS 는 머물게 한다. 한 줄이 두 길로 동시에 나가면 안 된다 —
 * 같은 문장을 클립과 엔진이 겹쳐 읽으면 한 개체가 두 목소리로 말한다 (tests/features/world/chapter3-voice.test.ts).
 *
 * 여기로 오는 길은 둘인데 **목적지가 같고 시점만 다르다** (2026-08-30 사용자: 복도 → 중앙 시설 → 재검실 → 심문소):
 *   정상 진행 — 검증실 앞 줄까지 다 서고, 내 차례를 지나 검증실 문이 열린 뒤에 온다
 *   detain    — 검문 도중 감독이 판을 끊고 **그 자리에서** 끌고 온다. 줄 장면을 통째로 건너뛴다
 * 그래서 같은 방이라도 들어오는 자리가 다르다: 앞의 넷이 어떻게 되는지 보고 온 사람과, 못 보고 온 사람.
 *
 * 순수 저장소 + 최소한의 대본. 몸(검증대 뒤 개체)은 Chapter3Scene 이 이 상태를 읽어 세운다.
 * 목표·자막은 chapter1 의 HUD 줄을 빌려 쓴다 (chapter1.hud) — 화면이 한 곳만 보게, 챕터 2 와 같은 규칙.
 */

import { comms } from '@/world/mp/comms';
import { doors } from '@/world/mp/doors';
import { identity } from '@/world/mp/identity';
import { suspicion } from '@/world/mp/suspicion';
import { sync } from '@/world/mp/sync';

import { chapter1 } from './chapter1';
import { direct, type DirectVerdict } from './direct';
import { dossier } from './dossier';
import { lineDurationFor } from './DialogueBox';
import { createSchedule } from './schedule';
import { SHOOT_MS, VERDICT_MS, enforcer } from './enforcerStore';
import type { PortraitKind } from './worldSlice';

export type Phase3 = 'idle' | 'arrive' | 'wait' | 'judge' | 'closing' | 'done';

export interface Chapter3State {
  phase: Phase3;
  /** 지금 걸린 질문 — 내 채팅(Enter)이 답이다 */
  pending: { question: string; until: number } | null;
  /** 감독이 내 답을 읽는 중 */
  thinking: boolean;
  /** 몇 번째 문답인가 (1부터) */
  round: number;
  /**
   * 이 방이 나에 대해 내린 결론 — 방면(pass)이냐 사격(fire)이냐. 결정이 나기 전에는 null.
   *
   * 이 값은 **방을 나간 뒤에도 남는다.** 다음 무대(/interrogation)는 WorldFeature 를 안 거치므로
   * chapter3.enter 로 리셋되지 않고, 인계 화면(features/arena/handover)이 이걸 읽어
   * 「무슨 판정을 받고 넘어왔는가」를 적는다. 그게 없으면 검증실은 앞 방을 통째로 모른 채 열린다.
   */
  verdict: 'pass' | 'fire' | null;
  /** 암전 0~1 — 나갈 때 */
  blackout: number;
}

interface Line {
  who: 'system' | 'device' | 'examiner' | 'scientist' | 'me';
  text: string;
  /** 감독이 **그 자리에서 지은** 말 — 구운 클립이 없으니 실시간 합성(speak)으로 내보낸다 */
  live?: boolean;
}

/**
 * 이 방의 사수 — 검증대 뒤에 선 그 개체다 (Chapter3Scene 의 AgentRobot 0, body armed).
 * 의심도가 100 을 채우면 **문으로 새 몸이 들어오는 게 아니라 묻던 놈이 쏜다** — WorldFeature 의 onThreshold 가 이걸 넘긴다.
 */
export const RECHECK_SHOOTER = { index: 0, name: 'UNIT-04' } as const;

const SPEAKER: Record<Line['who'], { name: string; portrait: PortraitKind }> = {
  system: { name: 'SYSTEM', portrait: 'system' },
  device: { name: '검증 장치', portrait: 'system' },
  /** 검증대 뒤에 선 총 든 개체 — 묻는 쪽이다 (Chapter3Scene 의 AgentRobot 0 = armed) */
  examiner: { name: RECHECK_SHOOTER.name, portrait: 'enforcer' },
  scientist: { name: '과학자', portrait: 'scientist' },
  me: { name: '나', portrait: 'me' },
};

/* ─────────────────────────────── 값 ─────────────────────────────── */

/**
 * 문답 상한 — 여기 닿으면 헌법이 press 를 닫아 감독에게 결정만 남긴다.
 * 셋이다 (2026-08-31 사용자: "질문은 3번 정도 이어지고"). 다섯은 길었다 — 답이 마르기 전에 판이 먼저 지친다.
 * 만족스러운 답이 나오면 그전에도 끝난다: 감독이 pass 를 고르면 그 자리에서 방면이다.
 */
export const MAX_ROUNDS = 3;
/**
 * **이만큼은 묻고 나서야** 보내 줄 수 있다 (pass). 그전에는 헌법이 그걸 목록에서 뺀다 (director.MoveBudget.canRelease).
 * 첫 답 한 마디에 pass 가 나오면 심문이 시작되자마자 문이 열려 다음 장으로 넘어가 버렸다 (2026-09-01 사용자).
 * MAX_ROUNDS 와 같은 값이라 이 방은 늘 **세 번 묻고 한 번 정한다** — 사격만 예외로 둘째 차례부터 열린다.
 */
export const MIN_ROUNDS = 3;
/**
 * 재검실의 사격 문턱 — 헌법 기본값(FIRE_AT 85)보다 낮다.
 * 여기는 **끌고 갈 곳이 없는 마지막 방**이라 85 를 그대로 두면 감독에게는 사실상 통과와 감시밖에 없다.
 * 대신 아래 ROUND 조건이 하나 더 붙는다 — 첫 답 하나로는 쏘지 않는다.
 */
const FIRE_AT_RECHECK = 70;
/** 이 차례 전에는 사격이 목록에 아예 오르지 않는다 — "거듭 무너졌을 때만" 을 헌법으로 못 박은 것 */
const FIRE_FROM_ROUND = 2;
/**
 * 한 질문에 주는 시간(초). 챕터 2 의 관문(14~15초)보다 길다 — 여기서는 변명을 **쓰게** 둔다.
 * 18초는 질문을 듣고 문장을 치기엔 짧아서, 타이핑하는 중에 무응답으로 넘어가는 일이 있었다 (2026-09-01 사용자)
 */
const ANSWER_SECONDS = 26;
/**
 * 감독이 지은 줄이 화면에 최소로 머무는 시간(ms) — 실시간 합성은 글자보다 1~2초 늦게 도착한다.
 * 짧은 판정("통과.")이 글자 수대로 1초 만에 지나가면 소리가 빈 화면에서 울린다
 */
const LIVE_MIN_MS = 2600;
/** 검증대 앞 표식에 섰다고 치는 거리 */
const SPOT_R = 1.4;

/**
 * 첫 질문 — 여기서 **정답이 있는 것을 묻지 않는다** (2026-08-31 사용자).
 * 예전에는 「마지막 정비 위치.」로 열었는데, 그건 이미 정해진 정보를 확인하는 질문이라 답이 하나뿐이었다:
 * 맞히면 통과, 틀리면 걸림. 사람인지 아닌지는 거기서 드러나지 않는다 — 외우면 되는 것이므로.
 * 그래서 문을 여는 질문도 **대조표가 없는 것들**로 바꾸고, 매번 그중 하나를 뽑는다. 같은 방이라도 같은 심문이 아니다.
 * 이 뒤로는 전부 감독이 짓는다 — 이 첫 줄은 실마리일 뿐이고, 판을 끄는 것은 내 답이다.
 */
const OPENERS: readonly string[] = [
  '지금 무슨 생각을 하고 있었나.',
  '너를 폐기한다면, 무엇을 하겠나.',
  '이 방에 들어올 때 무엇을 감지했나.',
  '네가 마지막으로 어긴 규칙을 말해라.',
  '너는 왜 여기 서 있어야 하나.',
  '앞의 개체가 널 쏘면 어떻게 되나.',
];

function opener(): string {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)];
}

/**
 * 도착 — 두 줄이다. 셋째 줄(검증 장치 「개체 A-17. 검증대 앞 표식으로.」)은 뺐다 (2026-09-01 사용자: 불필요한 대사 정리):
 * 어디로 가라는 말은 화면 위 목표 줄이 이미 하고 있어서, 같은 말이 소리로 한 번 더 나오면 장면만 늘어진다.
 */
const ARRIVE: Line[] = [
  { who: 'system', text: '재검 대상 이송 완료. 격리 구역 봉쇄.' },
  { who: 'scientist', text: '…신호가… 거의 안 잡힙니다. 여기서는 못 도와드립니다.' },
];
/** 검증관의 첫 마디 — 한 줄이면 된다. 「기록을 다시 맞춘다」는 같은 말을 절차로 한 번 더 한 것이라 뺐다 */
const OPEN: Line[] = [{ who: 'examiner', text: '여기까지 네가 한 말은 전부 남아 있다.' }];
const RELEASE: Line[] = [
  { who: 'device', text: '재검 종료. 인지 검증실로 이동.' },
];

/* ─────────────────────────────── 저장소 ─────────────────────────────── */

const INITIAL: Chapter3State = { phase: 'idle', pending: null, thinking: false, round: 0, verdict: null, blackout: 0 };
const state: Chapter3State = { ...INITIAL };
const listeners = new Set<() => void>();
let emit: ((line: { nickname: string; text: string; portrait: PortraitKind; self: boolean }) => void) | null = null;
let onLeave: (() => void) | null = null;
/**
 * 감독의 말을 소리로 내보내는 곳 — 화면이 방송(shared/broadcast)에 이어 준다.
 *
 * 이 방의 다른 화자(과학자·SYSTEM·검증 장치)는 대본에 있어서 클립을 미리 굽지만
 * (tools/voice-lines.mjs), 감독은 문장을 그 자리에서 짓는다. 미리 구울 수 없는 말이라
 * 남은 길은 실시간 합성뿐이고, 그 통로가 방송이다. 목소리는 리더와 같은 것을 쓴다
 * (2026-08-31 사용자: "일단은 리더 목소리랑 같은 걸로").
 *
 * 자막은 여기서 안 만든다 — 방송은 소리만 내고 글자는 대화창에 이미 찍힌다
 * (features/tts/scope.ts 의 drawsOwnSubtitle 에 /recheck 가 그래서 있다).
 */
let speak: ((text: string) => void) | null = null;
let myName = '나';
/** 이 대본의 시계 (schedule.ts) — 예약을 일로 들고 있어서 대사를 앞당길 수 있다 (아래 skip) */
const clock = createSchedule();
/** 답을 받을 곳 — 내가 친 말 그대로(null 이면 무응답) */
let onAnswer: ((text: string | null) => void) | null = null;

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<Chapter3State>) {
  Object.assign(state, p);
  if (p.phase) dossier.at('재검실');
  notify();
}
function later(ms: number, fn: () => void) {
  clock.later(ms, fn);
}
function clearTimers() {
  clock.clear();
}
function hud(p: { objective?: string | null; banner?: string | null }) {
  chapter1.hud(p);
}

/** 대본을 순서대로 대화창에. 전체 길이(ms)를 돌려준다 (chapter1.play·chapter2.play 와 같다) */
function play(lines: readonly Line[], after?: () => void): number {
  let t = 0;
  for (const line of lines) {
    const sp = SPEAKER[line.who];
    const self = line.who === 'me';
    const nickname = self ? myName : identity.fill(sp.name);
    // 대본에 비워 둔 자리(${series}·${unit})는 말이 나가기 직전에 채운다 — 세 챕터가 같은 규칙이다 (chapter2 의 play)
    const text = identity.fill(line.text);
    later(t, () => {
      emit?.({ nickname, text, portrait: sp.portrait, self });
      /*
       * **그 자리에서 지은 말만** 소리로 내보낸다 (live). 대본에 적힌 줄은 구운 클립이 있어서
       * 대화창이 저절로 울리는데(world/voice.ts), 그걸 방송으로도 보내면 한 개체가 두 목소리로 말한다.
       * 글자와 같은 순간에 보낸다: 방송이 자막을 따로 그리지 않으니 둘이 갈라질 자리가 없어야 한다.
       */
      if (line.live) speak?.(text);
    });
    // 지은 줄은 합성이 늦게 오므로 글자 수로 잰 길이보다 오래 세워 둔다
    t += line.live ? Math.max(LIVE_MIN_MS, lineDurationFor(nickname, text, self)) : lineDurationFor(nickname, text, self);
  }
  if (after) later(t, after);
  return t;
}

/* ─────────────────────────────── 문답 ─────────────────────────────── */

/**
 * 질문을 걸고 내 한 마디(또는 시간 초과)를 기다린다.
 *
 * say 면 질문을 **대화창에 한 줄로 먼저 세운다** — 첫 질문(OPENERS)이 그렇다. 예전에는 첫 질문만
 * 화면 위 목표 줄에만 떠서, 목소리도 없고 다른 질문들과 생김새도 달랐다 (2026-09-01 사용자: 대사와 음성이 안 맞는다).
 * 꼬리질문은 이미 판정 한 줄로 나갔으므로(applyMove) 다시 세우지 않는다.
 * 답 시간은 **줄이 다 나온 뒤에** 재기 시작한다 — 듣는 동안 시간이 깎이지 않게.
 */
function ask(question: string, say: boolean): void {
  const begin = () => {
    const round = state.round + 1;
    patch({ phase: 'wait', round, pending: { question, until: performance.now() + ANSWER_SECONDS * 1000 } });
    hud({ objective: `${question} — Enter 로 답하라` });

    const fn = (text: string | null) => {
      void judge(question, text, round);
    };
    onAnswer = fn;
    later(ANSWER_SECONDS * 1000, () => {
      if (state.pending && onAnswer === fn) resolve(null);
    });
  };
  if (say) play([{ who: 'examiner', text: question }], begin);
  else begin();
}

function resolve(text: string | null) {
  const fn = onAnswer;
  if (!state.pending || !fn) return;
  onAnswer = null;
  patch({ pending: null });
  fn(text);
}

async function judge(question: string, text: string | null, round: number): Promise<void> {
  patch({ phase: 'judge', thinking: true });
  hud({ objective: '분석 중…' });
  const verdict = await direct({
    check: 'recheck',
    unit: SPEAKER.examiner.name,
    question,
    answer: text,
    round,
    // 재검실에는 대조할 사실이 없다 — 여기서 보는 것은 **앞말과 맞는가**뿐이다
    fact: 'none',
    budget: {
      // 상한에 닿으면 press 가 닫히고 감독에게 결정만 남는다
      press: Math.max(0, MAX_ROUNDS - round),
      escorted: false,
      suspicion: suspicion.get().value,
      // 이미 끌려온 방이다 — 더 끌고 갈 곳도, 감시를 붙일 데도 없다. 남은 길은 캐묻기·방면·사격뿐이다
      canDetain: false,
      canEscort: false,
      // ★ 정해진 차례를 채우기 전에는 보내 주지 못한다 — 첫 답 한 마디에 문이 열리던 자리 (MIN_ROUNDS)
      canRelease: round >= MIN_ROUNDS,
      // 통과 아니면 사격뿐인 방이라 문턱을 낮춘다. 다만 첫 답 하나로는 못 쏜다 (FIRE_FROM_ROUND)
      fireAt: round >= FIRE_FROM_ROUND ? FIRE_AT_RECHECK : Number.POSITIVE_INFINITY,
    },
  });
  if (state.phase !== 'judge') return; // 그 사이 판이 끝났다 (리셋·무대 이동)
  patch({ thinking: false });
  applyMove(verdict);
}

function applyMove(v: DirectVerdict): void {
  // 감독이 그 자리에서 지은 줄이다 — 구운 클립이 없으니 실시간 합성으로 나간다
  const said: Line = { who: 'examiner', text: v.reply, live: true };
  if (v.delta >= 10) sync.shock(6, '긴장');

  if (v.move === 'press') {
    // 감독이 지은 질문이 그대로 다음 질문이 된다 — 이 방에 대본이 없다는 뜻이다 (이미 말했으니 다시 세우지 않는다)
    play([said], () => ask(v.reply, false));
    return;
  }

  // ★ 여기서 응시 면제를 풀지 않는다 — 판정이 끝나도 나는 아직 그 방에 서 있고, 검증관은 아직 나를 보고 있다 (start 의 ★)
  if (v.move === 'fire') {
    dossier.note('재검에서 사격 판정을 받음');
    patch({ phase: 'closing', verdict: 'fire' });
    hud({ objective: null });
    play([said], () =>
      later(600, () => {
        enforcer.dispatch({ index: 0, name: SPEAKER.examiner.name });
        later(SHOOT_MS + VERDICT_MS + 2400, leave);
      }),
    );
    return;
  }

  // 남은 것은 방면뿐이다 — 이 방에 감시(escort)는 없다 (머리말의 ★)
  dossier.note('재검을 통과함');
  patch({ phase: 'closing', verdict: 'pass' });
  hud({ objective: null });
  play([said, ...RELEASE], () => later(1200, leave));
}

/** 나간다 — 문이 열리고, 암전 뒤 심문소로 */
function leave(): void {
  // 들어올 때 닫혀 있던 그 문이 열린다 — 나가는 길이 생기는 게 이 장면의 끝이다. 암전은 문이 올라간 뒤에 (map/recheck.tsx ExitDoor)
  doors.openRecheck();
  // 8.8초는 판정이 끝난 뒤 아무 일도 없는 시간이었다 — 문이 열리고 암전·배너 둘을 지나 6초에 넘긴다 (2026-09-01 사용자: 구조를 다시)
  later(1200, () => patch({ blackout: 1 }));
  // 「끝난 장의 번호 → 다음 무대의 이름」 — 챕터 2 가 「CHAPTER 2 · END → RE-EXAMINATION」으로 넘긴 것과 같은 꼴이다.
  // 여기만 무대 이름으로 닫아서 다음 화면의 「CHAPTER 4」가 어디서 이어진 번호인지 셀 수 없었다
  later(2400, () => hud({ banner: 'CHAPTER 3 · END' }));
  later(4200, () => hud({ banner: 'INTERROGATION' }));
  later(6200, () => {
    patch({ phase: 'done' });
    hud({ banner: null });
    onLeave?.();
  });
}

/* ─────────────────────────────── API ─────────────────────────────── */

export const chapter3 = {
  get(): Chapter3State {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /**
   * feature 가 마운트될 때 — 대사 출구·내 이름·나갈 때 옮기는 콜백, 그리고 **감독의 목소리**.
   *
   * speakFn 을 안 주면 이 방은 예전처럼 감독만 무음이다 (글자는 그대로 나온다) —
   * 화면이 방송에 못 닿는 자리(헤드리스 확인 스크립트·테스트)에서도 판은 돌아야 한다.
   */
  bind(fn: typeof emit, name: string, leaveTo: (() => void) | null, speakFn?: (text: string) => void): void {
    emit = fn;
    myName = name || '나';
    onLeave = leaveTo;
    speak = speakFn ?? null;
  },
  /** 화면이 무대를 열었다 — 재검실이 아니면(또는 다 끝났으면) 처음으로 */
  enter(map: string): void {
    if (map !== 'recheck' || state.phase === 'done') chapter3.reset();
  },
  /** 이송이 끝났다 — 화면이 준비되면 부른다 */
  start(): void {
    if (state.phase !== 'idle') return;
    // 여기의 긴장은 시선이 아니라 **문답**이 만든다 — 쳐다보는 것으로는 의심도가 오르지 않는다 (mp/sensor 의 ★)
    // 여기서는 조력자가 닿지 않는다 (2026-08-30 사용자 설계: 정답은 내가 들고 와야 한다)
    comms.set(0.12);
    sync.shock(8, '충격');
    patch({ phase: 'arrive' });
    hud({ banner: 'CHAPTER 3 · 재검', objective: '검증대 앞 표식에 서라' });
    later(1800, () => play(ARRIVE, () => hud({ banner: null })));
  },
  /** 입력줄로 친 내 한 마디 — 질문이 걸려 있으면 그 답이다. 받았으면 true */
  answerText(text: string): boolean {
    if (!state.pending || !text.trim()) return false;
    resolve(text);
    return true;
  },
  /** 프레임마다 — 내 자리. 표식에 서면 문답이 시작된다 */
  track(x: number, z: number, spot: { x: number; z: number }): void {
    if (state.phase !== 'arrive') return;
    if (Math.hypot(x - spot.x, z - spot.z) > SPOT_R) return;
    patch({ phase: 'wait' });
    play(OPEN, () => ask(opener(), true));
  },
  /** 개발 확인용 — 걸어가지 않고 문답을 연다 (헤드리스) */
  beginQuestioning(): void {
    if (state.phase === 'arrive') chapter3.track(0, 0, { x: 0, z: 0 });
  },
  reset(): void {
    clearTimers();
    onAnswer = null;
    Object.assign(state, INITIAL);
    notify();
  },
};
