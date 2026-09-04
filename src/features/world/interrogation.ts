/**
 * 감시 AI 의 추궁 — 복도·중앙 시설의 에이전트(AgentRobot) 두셋이 플레이어의 행동을 본다.
 *
 *   의심도가 TRIGGER 이상으로 **오르는 순간**(점프·뒷걸음·감정·말투) 하나가 걸어와 **그 행동을 근거로** 묻는다.
 *   플레이어의 다음 한 마디가 답(채팅으로도 그대로 나간다) → LLM(POST /api/world/interrogate, src/lab/interrogate.ts)이 "AI 답게 답했나"
 *   판정 → 의심도 ±, 되묻기 → 최대 3차례. 답이 없으면 +8. LLM 이 없으면 정규식 폴백(judgeLine).
 *   끝났을 때 의심도가 WATCH 이상이면 그 에이전트가 **뒤를 따라다니며 감시**한다(watch) — WATCH_OFF 아래로 내려가야 놓아준다.
 *   아무 일 없어도 가끔 잡담을 걸기도 한다 (IDLE_EVERY 마다 IDLE_CHANCE).
 *
 * 순수 저장소 + 진행. 몸(걸어오기·서기·따라다니기)은 AgentRobot 이 이 상태를 읽어 움직이고, 대사는 bind 된 emit 으로 대화창에 나간다.
 */

import { judgeLine, suspicion, type Reason } from '@/world/mp/suspicion';
import type { InterrogateRequest, InterrogateResponse, InterrogateTurn } from '@/lab/interrogate';

import { dossier } from './dossier';

export type InterrogationPhase = 'idle' | 'approach' | 'wait' | 'judge' | 'done';

export interface InterrogationState {
  phase: InterrogationPhase;
  /** 어느 에이전트가 맡았나 (AgentRobot 의 인덱스) */
  unit: number | null;
  unitName: string;
  round: number;
  /** 플레이어 위치 — 에이전트가 여기로 걸어온다 */
  target: { x: number; z: number } | null;
  /** 감시 중인 에이전트 — 뒤를 따라다닌다 */
  watch: number | null;
}

const TRIGGER = 20;
const COOLDOWN_MS = 40_000;
const IDLE_EVERY_MS = 75_000;
const IDLE_CHANCE = 0.4;
const ANSWER_TIMEOUT_MS = 18_000;
/** 추궁이 끝났을 때 이 값 이상이면 감시가 붙고, 이 값 아래로 내려가면 풀린다 (의심도 문턱 40 과 같은 자리 — mp/suspicion.THRESHOLDS) */
const WATCH_ON = 40;
const WATCH_OFF = 28;

/**
 * 다가온 이유별 첫 질문 — 플레이어의 행동을 짚는다.
 * 경비는 **한 호흡에 끝나는 말**만 한다 (2026-08-29): 사람이 말을 거는 길이지 보고서 낭독이 아니다.
 */
const OPENERS: Record<Reason | 'default', string[]> = {
  돌발: ['방금 그 동작. 왜.', '왜 그렇게 움직였나.'],
  뒷걸음: ['왜 물러서나.', '어디 가나.'],
  감정: ['그건 뭐지.', '왜 그러나.'],
  말투: ['다시 말해라.', '방금 뭐라고.'],
  침착: ['정지. 식별 코드.'],
  보고: ['정지. 식별 코드.'],
  default: ['정지. 임무는.'],
};
const SMALL_TALK = ['코어 동기화 07:00.', '이 구간 이상 없음.', '계속 가라.'];
const TIMEOUT_LINE = '응답 없음.';
/** 감시가 붙었을 때 먼저 보고하면 — 이 개체가 순찰로 돌아간다 */
const REPORT_OK = '확인. 순찰 복귀.';
/** 그 보고로 내려가는 값. WATCH_OFF 아래로 확실히 떨어질 만큼 (문턱 40 에서 붙었으니 40 → 24) */
const REPORT_DROP = 16;
const WATCH_LINE = '따라간다.';
const RELEASE_LINE = '됐다. 가라.';

const state: InterrogationState = { phase: 'idle', unit: null, unitName: 'UNIT-07', round: 0, target: null, watch: null };
let unitNames: string[] = ['UNIT-07', 'UNIT-12'];
/** 그중 총 든 경비의 순번 — 비어 있으면 전부가 후보 */
let armedUnits: readonly number[] = [];
const listeners = new Set<() => void>();
let emit: ((line: { nickname: string; text: string }) => void) | null = null;
let log: InterrogateTurn[] = [];
let cause = '';
let lastEnd = -Infinity;
let lastIdle = 0;
let timer: number | null = null;
let unsub: (() => void) | null = null;
/** 이야기(chapter2)가 검문·테스트를 직접 굴리는 동안 — 의심도 추궁·잡담을 걸지 않는다 */
let paused = false;

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<InterrogationState>) {
  Object.assign(state, p);
  notify();
}
function clearTimer() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}
function say(text: string, who = state.unitName) {
  emit?.({ nickname: who, text });
}
/** 추궁하러 오는 개체 — 총 든 경비가 있으면 그중에서 (2026-08-30 사용자: 다가와서 묻는 쪽은 총 든 로봇), 없으면 아무나 */
function pick(): number {
  if (armedUnits.length) return armedUnits[Math.floor(Math.random() * armedUnits.length)];
  return Math.floor(Math.random() * unitNames.length);
}

/** 에이전트가 플레이어 앞에 섰다 — AgentRobot 이 부른다 */
function arrived() {
  if (state.phase !== 'approach') return;
  const pool = OPENERS[(cause as Reason) || 'default'] ?? OPENERS.default;
  const opener = pool[Math.floor(Math.random() * pool.length)];
  log = [{ who: 'ai', text: opener }];
  say(opener);
  patch({ phase: 'wait', round: 1 });
  armTimeout();
}

function armTimeout() {
  clearTimer();
  timer = window.setTimeout(() => {
    if (state.phase !== 'wait') return;
    say(TIMEOUT_LINE);
    suspicion.bump(8, '말투');
    finish();
  }, ANSWER_TIMEOUT_MS);
}

function finish() {
  clearTimer();
  lastEnd = performance.now();
  const unit = state.unit;
  const watch = suspicion.get().value >= WATCH_ON ? unit : null;
  if (watch !== null && state.watch !== watch) say(WATCH_LINE);
  patch({ phase: 'done', target: null, watch });
  timer = window.setTimeout(() => patch({ phase: 'idle', unit: null, round: 0 }), 4000);
}

async function judge(text: string) {
  patch({ phase: 'judge' });
  const req: InterrogateRequest = { kind: 'interrogate', unit: state.unitName, cause: cause || '순찰 중 정지', suspicion: suspicion.get().value, log, round: state.round };
  let res: InterrogateResponse | null = null;
  try {
    const r = await fetch('/api/world/interrogate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
    if (r.ok) res = (await r.json()) as InterrogateResponse;
  } catch {
    /* 폴백으로 */
  }
  if (!res) {
    const j = judgeLine(text);
    const delta = j ? j[0] : text.length < 4 ? 8 : 0;
    res = { reply: state.round >= 3 ? (delta <= 0 ? '통행 허가.' : '기록해 둔다.') : delta > 0 ? '불명확하다. 다시.' : '소속은.', delta, done: state.round >= 3, why: j ? j[1] : '' };
  }
  if (state.phase !== 'judge') return;
  suspicion.bump(res.delta, res.delta > 0 ? '말투' : '보고');
  // 추궁의 결론도 구역의 기억에 쌓인다 — 안쪽 검문의 감독이 이걸 읽는다 (dossier.ts)
  if (res.why) dossier.note(`복도 추궁 — ${res.why}`);
  log.push({ who: 'ai', text: res.reply });
  say(res.reply);
  if (res.done) {
    finish();
    return;
  }
  patch({ phase: 'wait', round: state.round + 1 });
  armTimeout();
}

export const interrogation = {
  get(): InterrogationState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** feature 가 마운트될 때 — 대사 출구와 이 맵의 에이전트 이름. 의심도 저장소를 구독해 트리거·감시 해제를 본다 */
  bind(fn: typeof emit, names: string[], armed: readonly number[] = []): void {
    emit = fn;
    unitNames = names.length ? names : unitNames;
    armedUnits = armed;
    unsub?.();
    unsub = suspicion.subscribe(() => {
      const s = suspicion.get();
      // 감시 해제
      if (state.watch !== null && s.value < WATCH_OFF && state.phase === 'idle') {
        say(RELEASE_LINE, unitNames[state.watch] ?? state.unitName);
        patch({ watch: null });
      }
      if (paused || state.phase !== 'idle' || !s.last || s.last.delta <= 0) return;
      if (s.value < TRIGGER || performance.now() - lastEnd < COOLDOWN_MS) return;
      if (performance.now() - s.last.at > 100) return;
      interrogation.begin(s.last.reason);
    });
  },
  unbind(): void {
    unsub?.();
    unsub = null;
    emit = null;
    clearTimer();
    Object.assign(state, { phase: 'idle', unit: null, round: 0, target: null, watch: null });
    notify();
  },
  /**
   * 문턱 40 — 추궁이 없어도 감시가 붙는다 (2026-08-30: 게이지가 오르면 세계가 달라져야 한다).
   * 이미 누가 보고 있으면 그대로 둔다
   */
  watchFrom(unit: number): void {
    if (state.watch !== null || state.phase !== 'idle') return;
    patch({ watch: unit });
    say(WATCH_LINE, unitNames[unit] ?? `UNIT-${unit}`);
  },
  /**
   * **감시에 대한 대응** — 따라붙은 개체에게 내가 먼저 상태 보고를 한 마디 하면 순찰로 돌아간다
   * (2026-08-30 사용자: "AI 로봇이 따라올 때도 대응 방안이 있었으면 좋겠다"). 조력자가 붙는 순간
   * **딱 한 번** 알려 준다 (chapter1.advise('watch') — WorldFeature 가 감시가 붙는 순간을 본다).
   *
   * 받아 주는 말은 **AI 다운 말**뿐이다 — 말투 판정(judgeLine)이 내려가는 쪽으로 읽은 한 마디(보고·침착).
   * 사람 티가 나는 말은 여기서 안 먹히고 그냥 의심도가 오른다. 받았으면 true (부르는 쪽은 말투 판정을 건너뛴다).
   */
  report(text: string): boolean {
    if (state.watch === null || state.phase !== 'idle') return false;
    const judged = judgeLine(text);
    if (!judged || judged[0] > 0) return false;
    const who = unitNames[state.watch] ?? state.unitName;
    // 먼저 떼고 값을 내린다 — 순서가 반대면 구독(감시 해제)이 같은 순간에 한 번 더 말한다
    patch({ watch: null });
    suspicion.bump(-REPORT_DROP, judged[1]);
    say(REPORT_OK, who);
    return true;
  },
  /** 추궁 시작 — 감시 중인 에이전트가 있으면 그가, 아니면 아무나 걸어온다 */
  begin(reason: string): void {
    if (state.phase !== 'idle') return;
    cause = reason;
    const unit = state.watch ?? pick();
    patch({ phase: 'approach', unit, unitName: unitNames[unit] ?? `UNIT-${unit}`, round: 0 });
  },
  /** AgentRobot 이 프레임마다 — 플레이어 위치, 앞에 섰는지 */
  track(x: number, z: number, arrivedNow: boolean): void {
    if (state.phase === 'idle' || state.phase === 'done') return;
    state.target = { x, z };
    if (arrivedNow) arrived();
  },
  /** 플레이어의 한 마디 — 기다리는 중이면 답으로 받는다. 받았으면 true */
  answer(text: string): boolean {
    if (state.phase !== 'wait') return false;
    clearTimer();
    log.push({ who: 'player', text });
    void judge(text);
    return true;
  },
  /** 아무 일 없을 때 가끔 — 걸어와서 한 마디만 하고 간다 (질문 아님). 프레임마다 불러도 된다 */
  setPaused(v: boolean): void {
    paused = v;
  },
  maybeSmallTalk(now: number): void {
    if (paused || state.phase !== 'idle' || state.watch !== null) return;
    if (now - lastIdle < IDLE_EVERY_MS) return;
    lastIdle = now;
    if (Math.random() > IDLE_CHANCE) return;
    const unit = pick();
    cause = '';
    patch({ phase: 'approach', unit, unitName: unitNames[unit] ?? `UNIT-${unit}`, round: 0 });
    window.setTimeout(() => {
      if (state.phase === 'approach') {
        say(SMALL_TALK[Math.floor(Math.random() * SMALL_TALK.length)]);
        finish();
      }
    }, 5000);
  },
};
