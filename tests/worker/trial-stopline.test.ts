/**
 * worker/src/trial/stopline.ts — accel/brake 두 시각만으로 운동방정식을 풀어 정지 지점을
 * 계산하는 순수 함수를 고정 값(v · μ · 브레이크 시각)으로 검증한다. 클라 위치 자기신고는
 * 어디에도 없다는 것이 이 파일의 핵심이라, 시험도 시각 두 개만으로 판정한다.
 *
 * 트랙 상수(src/world/mp/constants.ts): STOPLINE_ACCEL=4, STOPLINE_TOP_SPEED=6,
 * STOPLINE_TARGET=16, STOPLINE_TRACK_LENGTH=24. 마찰(worker/src/trial/condition.ts):
 * [0.6, 0.15, 0.9]. 감속에 쓰는 중력가속도는 stopline.ts 안의 9.8 상수.
 *
 * **가속도도 바닥이 정한다**: a = min(STOPLINE_ACCEL, μg). 기준 바닥(0.6)은 μg=5.88 > 4 라 예전과 같은 4 지만,
 * 젖은 타일(0.15)은 μg=1.47 이라 애초에 빨리 못 나간다 — 발이 미는 힘도 마찰이 낸다.
 */
import { describe, expect, it } from 'vitest';
import { accelFor, frictionForPhase, judgeStoplineAttempt, runDistance, runSpeed, summarizeStoplinePlayer } from '../../worker/src/trial/stopline';

describe('runDistance/runSpeed — 가속 구간의 운동방정식', () => {
  it('탑스피드 전(t=1s)에는 등가속도 공식대로다', () => {
    expect(runDistance(1000)).toBeCloseTo(2, 10); // 0.5 * 4 * 1^2
    expect(runSpeed(1000)).toBeCloseTo(4, 10); // 4 * 1
  });

  it('탑스피드 이후(t=2s)에는 등속 구간이 더해진다', () => {
    expect(runDistance(2000)).toBeCloseTo(7.5, 10); // 4.5(탑스피드까지) + 6*0.5
    expect(runSpeed(2000)).toBeCloseTo(6, 10); // 탑스피드에서 더 안 오른다
  });
});

describe('frictionForPhase', () => {
  it('구간 1~3이 콘크리트→젖은 타일→고무다', () => {
    expect(frictionForPhase(1)).toBeCloseTo(0.6, 10);
    expect(frictionForPhase(2)).toBeCloseTo(0.15, 10);
    expect(frictionForPhase(3)).toBeCloseTo(0.9, 10);
  });
});

describe('judgeStoplineAttempt', () => {
  it('구간 1(콘크리트) — v=6 에서 감속 5.88로 미끄러진 뒤 목표보다 미달한다', () => {
    const a = judgeStoplineAttempt(0, 2000, 1);
    expect(a.brakePos).toBeCloseTo(7.5, 10);
    expect(a.stopPos).toBeCloseTo(7.5 + 36 / 11.76, 6);
    expect(a.stopError).toBeCloseTo(a.stopPos - 16, 10);
    expect(a.stopError).toBeLessThan(0); // 미달 — 부호가 음수로 유지된다
    expect(a.brakeTiming).toBeCloseTo(8.5, 10);
  });

  it('구간 2(젖은 타일) — 발이 미는 힘도 마찰이라 애초에 느리게 나간다: 도달 속도부터 다르다', () => {
    const a = judgeStoplineAttempt(0, 2000, 2);
    const accel = 0.15 * 9.8; // 1.47 — STOPLINE_ACCEL(4) 보다 작아 이쪽이 상한이다
    expect(a.reachedSpeed).toBeCloseTo(accel * 2, 6); // 탑스피드(6)에 못 닿는다
    expect(a.brakePos).toBeCloseTo(0.5 * accel * 4, 6);
    expect(a.stopPos).toBeCloseTo(a.brakePos + a.reachedSpeed ** 2 / (2 * accel), 6);
    expect(a.stopPos).toBeLessThan(24); // 트랙 끝 클램프에 안 붙는다 — 예전(μ=0.05)에는 전원이 +8 로 똑같이 찍혔다
    expect(a.stopError).toBeLessThan(0);
  });

  it('accelFor — 잘 잡는 바닥에서는 몸의 상한(4), 미끄러운 바닥에서는 μg 가 상한이다', () => {
    expect(accelFor(0.6)).toBeCloseTo(4, 10); // μg 5.88 > 4
    expect(accelFor(0.9)).toBeCloseTo(4, 10); // μg 8.82 > 4
    expect(accelFor(0.15)).toBeCloseTo(1.47, 10);
    // 기준 바닥의 가속 구간은 예전과 완전히 같다 — 판이 이미 맞춰 둔 감각을 안 흔든다
    expect(runDistance(1000, 0.6)).toBeCloseTo(runDistance(1000), 10);
    expect(runSpeed(1000, 0.15)).toBeCloseTo(1.47, 10);
  });

  it('구간 3(고무) — 급감속이라 구간 1보다도 더 못 미친다', () => {
    const a = judgeStoplineAttempt(0, 2000, 3);
    expect(a.stopPos).toBeCloseTo(7.5 + 36 / 17.64, 6);
    expect(a.stopError).toBeLessThan(0);
  });

  it('같은 구간이라도 accelAt 이 다르면(경과시간이 다르면) 결과가 다르다 — 클라 위치가 아니라 시각만 본다', () => {
    const early = judgeStoplineAttempt(0, 500, 1);
    const late = judgeStoplineAttempt(0, 2000, 1);
    expect(early.brakePos).toBeLessThan(late.brakePos);
  });
});

describe('summarizeStoplinePlayer', () => {
  it('transitionError 는 구간마다 첫 시행의 |오차| 평균, adaptationCurve/errorDirection 은 시행 전체다', () => {
    const attempts = [judgeStoplineAttempt(0, 500, 1), judgeStoplineAttempt(0, 1200, 1), judgeStoplineAttempt(0, 1800, 2)];
    const r = summarizeStoplinePlayer('SUBJECT_01', attempts);

    expect(r.id).toBe('SUBJECT_01');
    // 구간 1 의 첫 시행(attempts[0])과 구간 2 의 첫 시행(attempts[2])
    expect(r.transitionError).toBeCloseTo((Math.abs(attempts[0].stopError) + Math.abs(attempts[2].stopError)) / 2, 10);
    expect(r.metrics.attempts).toBe(3);
    expect(r.adaptationCurve).toEqual(attempts.map((a) => Math.abs(a.stopError)));
    expect(r.errorDirection).toEqual(attempts.map((a) => (a.stopError >= 0 ? 1 : -1)));
    expect(r.errorDirection).toHaveLength(3);
    // metrics 는 마지막(가장 적응이 끝난) 시행의 값을 대표값으로 쓴다
    expect(r.metrics.stopError).toBeCloseTo(attempts.at(-1)!.stopError, 10);
    expect(r.metrics.brakeTiming).toBeCloseTo(attempts.at(-1)!.brakeTiming, 10);
  });

  it('시행이 하나도 없으면 값이 없다(NaN) — 0 이 「완벽」으로 읽히면 안 된다', () => {
    const r = summarizeStoplinePlayer('x', []);
    expect(Number.isNaN(r.transitionError)).toBe(true);
    expect(r.adaptationCurve).toEqual([]);
    expect(r.errorDirection).toEqual([]);
  });
});
