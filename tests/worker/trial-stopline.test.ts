/**
 * worker/src/trial/stopline.ts — accel/brake 두 시각만으로 운동방정식을 풀어 정지 지점을
 * 계산하는 순수 함수를 고정 값(v · μ · 브레이크 시각)으로 검증한다. 클라 위치 자기신고는
 * 어디에도 없다는 것이 이 파일의 핵심이라, 시험도 시각 두 개만으로 판정한다.
 *
 * 트랙 상수(src/world/mp/constants.ts): STOPLINE_ACCEL=4, STOPLINE_TOP_SPEED=6,
 * STOPLINE_TARGET=16, STOPLINE_TRACK_LENGTH=24. 마찰(worker/src/trial/condition.ts):
 * [0.6, 0.05, 0.9]. 감속에 쓰는 중력가속도는 stopline.ts 안의 9.8 상수.
 */
import { describe, expect, it } from 'vitest';
import { frictionForRound, judgeStoplineAttempt, runDistance, runSpeed, summarizeStoplinePlayer } from '../../worker/src/trial/stopline';

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

describe('frictionForRound', () => {
  it('라운드 1~3이 콘크리트→빙판→고무다', () => {
    expect(frictionForRound(1)).toBeCloseTo(0.6, 10);
    expect(frictionForRound(2)).toBeCloseTo(0.05, 10);
    expect(frictionForRound(3)).toBeCloseTo(0.9, 10);
  });
});

describe('judgeStoplineAttempt', () => {
  it('1라운드(콘크리트) — v=6 에서 감속 5.88로 미끄러진 뒤 목표보다 미달한다', () => {
    const a = judgeStoplineAttempt(0, 2000, 1);
    expect(a.brakePos).toBeCloseTo(7.5, 10);
    expect(a.stopPos).toBeCloseTo(7.5 + 36 / 11.76, 6);
    expect(a.stopError).toBeCloseTo(a.stopPos - 16, 10);
    expect(a.stopError).toBeLessThan(0); // 미달 — 부호가 음수로 유지된다
    expect(a.brakeTiming).toBeCloseTo(8.5, 10);
  });

  it('2라운드(빙판) — 거의 안 멈춰서 트랙 끝(24)에서 캡된다', () => {
    const a = judgeStoplineAttempt(0, 2000, 2);
    expect(a.stopPos).toBeCloseTo(24, 10); // Math.min(..., STOPLINE_TRACK_LENGTH)
    expect(a.stopError).toBeCloseTo(8, 10);
    expect(a.stopError).toBeGreaterThan(0); // 초과 — 부호가 양수
  });

  it('3라운드(고무) — 급감속이라 1라운드보다도 더 못 미친다', () => {
    const a = judgeStoplineAttempt(0, 2000, 3);
    expect(a.stopPos).toBeCloseTo(7.5 + 36 / 17.64, 6);
    expect(a.stopError).toBeLessThan(0);
  });

  it('같은 라운드라도 accelAt 이 다르면(경과시간이 다르면) 결과가 다르다 — 클라 위치가 아니라 시각만 본다', () => {
    const early = judgeStoplineAttempt(0, 500, 1);
    const late = judgeStoplineAttempt(0, 2000, 1);
    expect(early.brakePos).toBeLessThan(late.brakePos);
  });
});

describe('summarizeStoplinePlayer', () => {
  it('transitionError 는 1회차의 |오차|, adaptationCurve/errorDirection 은 시행 전체다', () => {
    const attempts = [judgeStoplineAttempt(0, 500, 1), judgeStoplineAttempt(0, 1200, 1), judgeStoplineAttempt(0, 1800, 1)];
    const r = summarizeStoplinePlayer('SUBJECT_01', attempts);

    expect(r.id).toBe('SUBJECT_01');
    expect(r.transitionError).toBeCloseTo(Math.abs(attempts[0].stopError), 10);
    expect(r.adaptationCurve).toEqual(attempts.map((a) => Math.abs(a.stopError)));
    expect(r.errorDirection).toEqual(attempts.map((a) => (a.stopError >= 0 ? 1 : -1)));
    expect(r.errorDirection).toHaveLength(3);
    // metrics 는 마지막(가장 적응이 끝난) 시행의 값을 대표값으로 쓴다
    expect(r.metrics.stopError).toBeCloseTo(attempts.at(-1)!.stopError, 10);
    expect(r.metrics.brakeTiming).toBeCloseTo(attempts.at(-1)!.brakeTiming, 10);
  });

  it('시행이 하나도 없으면 0으로 방어한다', () => {
    const r = summarizeStoplinePlayer('x', []);
    expect(r.transitionError).toBe(0);
    expect(r.adaptationCurve).toEqual([]);
    expect(r.errorDirection).toEqual([]);
  });
});
