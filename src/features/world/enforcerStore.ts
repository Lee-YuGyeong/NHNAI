/**
 * 무장 심문 AI — 의심도가 100(판정: 인간)이 되면 플레이어를 **사격**한다. 그 뒤 판정 자막, 의심도 초기화, 복귀.
 *
 * 누가 쏘나 (2026-08-30 사용자: "새 로봇이 나오는 게 아니라 돌아다니던 총 든 로봇이 나를 보고 쏴야 한다"):
 *   - unit 이 있으면 — 그 맵의 **순찰 중인 총 든 경비**(AgentRobot body="armed", index === unit)가 순찰을 끊고 달려와 쏘고 순찰로 돌아간다.
 *   - unit 이 없으면(복도처럼 경비가 없는 맵) — 출입구(MapDef.enforcerSpawn)에서 새 몸(Enforcer.tsx)이 나타나 달려온다.
 *
 * 순수 저장소. 몸(달리기·서기·사격·복귀)은 AgentRobot / Enforcer.tsx 가 phase 를 읽어 움직이고, 대사는 bind 된 emit 으로 대화창에 나간다.
 * WorldFeature 의 onThreshold(100) 이 dispatch() 를 부른다. 서버에 없는 내 화면의 연출이다.
 *
 *   idle → run(플레이어 쪽으로) → shoot(SHOOT_MS 동안 사격) → verdict(자막·화면 플래시) → leave(걸어서 돌아감) → idle
 */

import { gunshot } from './sfx';

export type EnforcerPhase = 'idle' | 'run' | 'shoot' | 'verdict' | 'leave';

export interface EnforcerState {
  phase: EnforcerPhase;
  /** 몇 번째 출동인가 — 몸이 리마운트 없이 새 출동을 알아보는 열쇠 */
  seq: number;
  /** 사격 중 총구 섬광이 켜진 순간(ms) — 화면 플래시·조명이 읽는다 */
  flashAt: number;
  /** 이번 출동을 맡은 순찰 경비(AgentRobot index). null 이면 출입구에서 새 몸(Enforcer.tsx)이 온다 */
  unit: number | null;
  /** 대화창에 찍힐 이름 — 순찰 경비면 그 개체 이름, 아니면 ENFORCER */
  unitName: string;
}

export const SHOOT_MS = 2400;
export const VERDICT_MS = 3200;
const LINES = {
  arrive: '판정: 인간. 제거한다.',
  done: '무력화 완료.',
} as const;

const state: EnforcerState = { phase: 'idle', seq: 0, flashAt: 0, unit: null, unitName: 'ENFORCER' };
const listeners = new Set<() => void>();
let emit: ((line: { nickname: string; text: string }) => void) | null = null;
let onVerdict: (() => void) | null = null;
let timer: number | null = null;

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<EnforcerState>) {
  Object.assign(state, p);
  notify();
}
function clearTimer() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}

export const enforcer = {
  get(): EnforcerState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** feature 가 마운트될 때 — 대사 출구와 "판정 뒤"(의심도 초기화) 콜백 */
  bind(fn: typeof emit, verdict: () => void): void {
    emit = fn;
    onVerdict = verdict;
  },
  unbind(): void {
    emit = null;
    onVerdict = null;
    clearTimer();
    Object.assign(state, { phase: 'idle', flashAt: 0, unit: null });
    notify();
  },
  /** 처음으로(다시 시작) — 출동 중이던 것도 없던 일로. 대사 출구는 그대로 둔다 */
  reset(): void {
    clearTimer();
    patch({ phase: 'idle', flashAt: 0, unit: null });
  },
  /**
   * 출동 — 의심도 100. by 를 주면 그 순찰 경비가 맡는다 (index = AgentRobot 순번, name = 대화창 이름).
   * 안 주면 출입구에서 새 몸이 온다
   */
  dispatch(by?: { index: number; name: string }): void {
    if (state.phase !== 'idle') return;
    patch({ phase: 'run', seq: state.seq + 1, unit: by?.index ?? null, unitName: by?.name ?? 'ENFORCER' });
  },
  /** 몸 — 플레이어 앞에 섰다 */
  arrived(): void {
    if (state.phase !== 'run') return;
    emit?.({ nickname: state.unitName, text: LINES.arrive });
    patch({ phase: 'shoot', flashAt: performance.now() });
    clearTimer();
    timer = window.setTimeout(() => {
      patch({ phase: 'verdict' });
      onVerdict?.();
      timer = window.setTimeout(() => {
        emit?.({ nickname: state.unitName, text: LINES.done });
        patch({ phase: 'leave' });
      }, VERDICT_MS);
    }, SHOOT_MS);
  },
  /**
   * 몸 — 사격 한 발 (섬광 + 총성). 소리를 **여기서** 내는 이유: 쏘는 몸이 둘이다 —
   * 출입구에서 온 새 몸(Enforcer)과 순찰하다 맡은 경비(AgentRobot). 둘 다 이 문을 지난다
   * (2026-08-30 사용자: "총 쏠 때 총소리도"). 소리는 검증실 앞 즉결 사격(Chapter2Scene)과 같은 sfx.gunshot 이다
   */
  flash(): void {
    if (state.phase !== 'shoot') return;
    patch({ flashAt: performance.now() });
    gunshot();
  },
  /** 몸 — 돌아갔다 (출입구로 사라졌거나, 순찰 경비가 순찰로 복귀) */
  left(): void {
    if (state.phase !== 'leave') return;
    patch({ phase: 'idle', unit: null });
  },
};
