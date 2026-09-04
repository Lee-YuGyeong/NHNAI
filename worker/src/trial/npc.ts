/**
 * AI("SUBJECT") 좌석의 물리 입력 — PLANNING P9: "AI 참가자의 물리 조작 입력은 LLM이 실시간으로
 * 만들지 않는다. 서버가 인간 반응 분포에서 파라미터를 뽑아 시뮬레이션한다."
 *
 * 정지선에서 "입력"은 accel~brake 사이의 경과 시간 하나뿐이다. 사람처럼 **자기가 익숙한 마찰을
 * 가정하고 브레이크 지점을 고른 뒤**, 매 시행마다 그 가정을 실제 마찰 쪽으로 조금씩 당긴다 —
 * 그래서 adaptationCurve 가 실제로 우하향한다(사람의 적응을 흉내 낸 것이지 정답을 아는 게 아니다).
 */

import { STOPLINE_TARGET } from '../../../src/world/mp/constants';
import { frictionForPhase, runDistance, runSpeed } from './stopline';

export interface StoplineProfile {
  /** 이 좌석이 "평소 감각"으로 여기는 마찰계수 — 1라운드(기준 조건)에 맞춰져 있다가 매 시행마다 조금씩 갱신된다 */
  assumedFriction: number;
  /** 반응 지연·근육 오차를 흉내 내는 잡음 폭(ms) */
  jitterMs: number;
  /** 한 시행마다 assumedFriction 이 실제 값 쪽으로 얼마나 당겨지는가(0~1) */
  adaptRate: number;
}

const GRAVITY_ACCEL = 9.8;
/** 브레이크 시점을 찾는 이분탐색 대신 쓰는 선형 스텝(ms)과 그 상한. 트랙이 짧아 8초면 늘 넘친다 */
const SEARCH_STEP_MS = 20;
const SEARCH_MAX_MS = 8000;

/**
 * @param precision 0(사람 같음)~1(기계 같음). 없으면 사람 분포에서 무작위 — engine.ts 의 SeatTuning.
 *   기계 쪽일수록 잡음이 작고, 새 마찰에 한 번에 맞춘다(adaptRate → 1).
 */
export function makeStoplineProfile(precision?: number): StoplineProfile {
  const p = precision === undefined ? Math.random() * 0.4 : Math.min(1, Math.max(0, precision));
  return {
    assumedFriction: frictionForPhase(1), // 다들 첫 구간(기준=콘크리트)에 맞춰 시작한다
    jitterMs: 200 - 180 * p + (precision === undefined ? Math.random() * 60 : 0),
    adaptRate: 0.3 + 0.7 * p,
  };
}

/**
 * 이번 시행의 accel~brake 경과 시간(ms)을 만든다. profile.assumedFriction 을 실제 마찰 쪽으로
 * 한 걸음 당긴 **뒤에** 그 값으로 "이 감각이면 목표 정지선에 서려면 언제 브레이크를 밟아야 하는가"를
 * 역산한다 — 그래서 한 구간의 뒤 시행일수록 실제 마찰에 더 가깝게 반응한다(사람의 "몇 번
 * 겪으면 는다"를 흉내).
 */
export function nextStoplineElapsedMs(profile: StoplineProfile, phase: number): number {
  const trueFriction = frictionForPhase(phase);
  profile.assumedFriction += profile.adaptRate * (trueFriction - profile.assumedFriction);

  const decel = Math.max(0.01, profile.assumedFriction * GRAVITY_ACCEL);
  let elapsed = 0;
  while (elapsed < SEARCH_MAX_MS) {
    // 가속도도 **가정한** 마찰에서 나온다 — 미끄러운 바닥을 콘크리트로 착각하면 브레이크 지점만이 아니라
    // "지금쯤 얼마나 나 있겠지"까지 함께 틀린다. 판정(stopline.ts)은 진짜 마찰로 다시 푼다.
    const predictedStop = runDistance(elapsed, profile.assumedFriction) + runSpeed(elapsed, profile.assumedFriction) ** 2 / (2 * decel);
    if (predictedStop >= STOPLINE_TARGET) break;
    elapsed += SEARCH_STEP_MS;
  }

  const jitter = (Math.random() - 0.5) * 2 * profile.jitterMs;
  return Math.max(100, elapsed + jitter);
}
