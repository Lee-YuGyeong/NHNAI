/**
 * 정지선 — 순수 함수뿐이다. 틱 루프가 없다.
 *
 * 서버는 클라의 위치 자기신고를 믿지 않는다. accel(W)·brake(S) 두 시각(둘 다 **서버가 수신
 * 시점으로 찍는다** — protocol.ts 의 trial_accel/trial_brake 주석)만으로 운동방정식을 풀어
 * 브레이크 지점 · 정지 지점을 계산한다. PLANNING §2.2가 "분석 공식으로 충분 — 실시간 물리
 * 시뮬레이션 불필요"라고 적은 것이 정확히 이 게임이다.
 */

import { STOPLINE_ACCEL, STOPLINE_TARGET, STOPLINE_TOP_SPEED, STOPLINE_TRACK_LENGTH } from '../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../src/world/mp/protocol';
import { STOPLINE_FRICTION } from './condition';

/** 마찰 감속에 쓰는 중력가속도 — 물리 상수지 숨겨야 할 조건값이 아니다. */
const GRAVITY_ACCEL = 9.8;

/**
 * 이 바닥에서 실제로 낼 수 있는 가속도(m/s²) — **발이 미는 힘도 마찰이 낸다.**
 * 예전에는 마찰이 브레이크에만 걸리고 가속은 늘 STOPLINE_ACCEL 이었는데, 그러면 빙판에서 콘크리트와
 * 똑같이 튀어나가고 브레이크만 미끄러지는 앞뒤 안 맞는 몸이 된다. 사람이 「출발이 헛돈다」를 첫 0.5초에
 * 알아채는 신호를 그냥 버리고 있었다 — 그게 곧 판별의 새 축(도달 속도)이다.
 *
 * μ 를 모르는 쪽(AI 좌석, npc.ts)은 **자기가 가정한 μ** 를 넣어 브레이크 지점을 역산한다. 판정은 언제나
 * 그 구간의 진짜 μ 로 다시 푼다 — 가정과 실제의 차이가 그대로 오차로 남는다.
 */
export function accelFor(friction: number): number {
  return Math.min(STOPLINE_ACCEL, Math.max(0.01, friction) * GRAVITY_ACCEL);
}

/** 가속 시작부터 탑스피드에 닿기까지 걸리는 시간(초). */
function timeToTop(accel: number): number {
  return STOPLINE_TOP_SPEED / accel;
}

/** accel 시작 후 elapsed(ms) 만큼 달렸을 때 출발선 기준 이동 거리(m). friction 을 안 주면 바닥이 안 잡는 이상적 가속 */
export function runDistance(elapsedMs: number, friction = Number.POSITIVE_INFINITY): number {
  const t = Math.max(0, elapsedMs) / 1000;
  const a = accelFor(friction);
  const tTop = timeToTop(a);
  if (t <= tTop) return 0.5 * a * t * t;
  const distToTop = 0.5 * a * tTop * tTop;
  return distToTop + STOPLINE_TOP_SPEED * (t - tTop);
}

/** 그 순간의 속도(m/s). */
export function runSpeed(elapsedMs: number, friction = Number.POSITIVE_INFINITY): number {
  const t = Math.max(0, elapsedMs) / 1000;
  return Math.min(STOPLINE_TOP_SPEED, accelFor(friction) * t);
}

/** 구간(1~3)의 마찰계수 — phase.ts 의 구간 번호로 읽는다 */
export function frictionForPhase(phase: number): number {
  return STOPLINE_FRICTION[phase - 1] ?? STOPLINE_FRICTION[0];
}

export interface StoplineAttempt {
  /** 이 시행이 속한 구간(1~3) — 마찰이 바뀐 직후의 첫 시행을 가려내는 데 쓴다 */
  phase: number;
  brakePos: number;
  stopPos: number;
  /** stopPos - STOPLINE_TARGET. 초과(+)/미달(-) 부호를 유지한다 — 절대값만 저장하면 판별이 무너진다 (사용자 스펙) */
  stopError: number;
  /** 브레이크를 밟은 순간, 정지선까지 남아 있던 거리 */
  brakeTiming: number;
  /** 브레이크를 밟은 순간 실제로 나 있던 속도(m/s) — 바닥이 미끄러우면 여기부터 다르다 (판별의 새 축) */
  reachedSpeed: number;
}

/**
 * accelAt~brakeAt(둘 다 ms epoch, 서버가 찍은 값)과 그 구간의 숨은 마찰계수로 한 시행을 판정한다.
 * 클라가 신고하는 위치는 어디에도 없다 — 서버가 시각 둘만으로 전부 다시 계산한다.
 */
export function judgeStoplineAttempt(accelAt: number, brakeAt: number, phase: number): StoplineAttempt {
  const elapsed = Math.max(0, brakeAt - accelAt);
  const friction = frictionForPhase(phase);
  // 가속도도 이 바닥의 것이다 — 미끄러운 바닥에서는 애초에 빨리 못 나간다
  const brakePos = Math.min(runDistance(elapsed, friction), STOPLINE_TRACK_LENGTH);
  const v = runSpeed(elapsed, friction);
  const decel = friction * GRAVITY_ACCEL;
  const slide = decel > 0 ? (v * v) / (2 * decel) : 0;
  const stopPos = Math.min(brakePos + slide, STOPLINE_TRACK_LENGTH);
  return {
    phase,
    brakePos,
    stopPos,
    stopError: stopPos - STOPLINE_TARGET,
    brakeTiming: STOPLINE_TARGET - brakePos,
    reachedSpeed: v,
  };
}

/**
 * 한 참가자의 1분치 시행들을 결과 한 줄로 묶는다.
 *
 * transitionError 는 **마찰이 바뀐 직후의 첫 시행들** — 구간마다 첫 시행의 |오차| 평균이다. 새 바닥을
 * 처음 만난 그 시행이 전환 구간에 해당한다. 시행이 없으면 NaN(와이어에선 null) — 0 이 「완벽」으로 읽히면 안 된다.
 * metrics: 부호 있는 마지막 오차 · 마지막 브레이크 시점 · |오차| 평균 · 시행 수.
 */
export function summarizeStoplinePlayer(id: string, attempts: StoplineAttempt[]): TrialPlayerResult {
  const last = attempts.at(-1);
  const firsts: number[] = [];
  const seen = new Set<number>();
  for (const a of attempts) {
    if (seen.has(a.phase)) continue;
    seen.add(a.phase);
    firsts.push(Math.abs(a.stopError));
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : Number.NaN);
  const transitionError = avg(firsts);
  return {
    id,
    metrics: {
      stopError: last?.stopError ?? Number.NaN,
      brakeTiming: last?.brakeTiming ?? Number.NaN,
      meanAbsError: avg(attempts.map((a) => Math.abs(a.stopError))),
      attempts: attempts.length,
      // 마지막 시행에서 실제로 낸 속도 — 바닥이 바뀌면 브레이크보다 **여기가 먼저** 달라진다
      reachedSpeed: last?.reachedSpeed ?? Number.NaN,
      // transitionError 도 metrics 에 한 번 더 넣는다 — groupStats(scoring.ts)가 여길 훑어서
      // 무리 평균을 만들기 때문이다. TrialPlayerResult.transitionError(아래)는 그 값 자체다.
      transitionError,
    },
    transitionError,
    errorDirection: attempts.map((a) => (a.stopError >= 0 ? 1 : -1)),
    adaptationCurve: attempts.map((a) => Math.abs(a.stopError)),
  };
}
