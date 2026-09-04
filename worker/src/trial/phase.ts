/**
 * 미니게임 하나(1분) 안의 구간 — 20초마다 조건이 바뀐다(mp/constants 의 TRIAL_PHASE_MS).
 * 구간 번호는 1·2·3 이고 condition.ts 의 표를 그 번호로 읽는다. 클라이언트는 구간이 **언제** 바뀌는지는
 * 알지만(공개 상수) 값이 무엇인지는 모른다.
 */
import { TRIAL_GAME_MS, TRIAL_PHASE_MS } from '../../../src/world/mp/constants';

export const PHASES = Math.ceil(TRIAL_GAME_MS / TRIAL_PHASE_MS);

/** 시작 후 elapsed(ms) 가 속한 구간 번호(1~PHASES) */
export function phaseAt(elapsedMs: number): number {
  return Math.min(PHASES, Math.max(1, Math.floor(elapsedMs / TRIAL_PHASE_MS) + 1));
}

/** 각 구간이 시작되는 시각(ms epoch) */
export function phaseStarts(startedAt: number): number[] {
  return Array.from({ length: PHASES }, (_, i) => startedAt + i * TRIAL_PHASE_MS);
}
