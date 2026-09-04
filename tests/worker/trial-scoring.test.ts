/**
 * worker/src/trial/scoring.ts — 평균 · 표준편차뿐이고 등급을 매기지 않는다는 것을 고정한다
 * (PLANNING P2, worker/src/trial/scoring.ts 머리말).
 */
import { describe, expect, it } from 'vitest';
import { groupStats, mean, stdDev } from '../../worker/src/trial/scoring';

describe('mean/stdDev', () => {
  it('평균은 산술 평균이다', () => {
    expect(mean([1, 2, 3])).toBeCloseTo(2, 10);
    expect(mean([])).toBe(0);
  });

  it('표준편차는 모집단 표준편차다 — 그 판 전원이 모집단이지 표본이 아니다', () => {
    expect(stdDev([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3), 10);
    expect(stdDev([5])).toBe(0);
    expect(stdDev([])).toBe(0);
  });
});

describe('groupStats', () => {
  it('참가자 전원의 metrics 에서 키별 평균 · 표준편차를 뽑는다', () => {
    const players = [{ metrics: { stopError: 1 } }, { metrics: { stopError: -1 } }, { metrics: { stopError: 4 } }];
    const stats = groupStats(players);
    expect(stats.mean.stopError).toBeCloseTo(4 / 3, 10);
    expect(stats.stdDev.stopError).toBeGreaterThan(0);
  });

  it('참가자마다 키가 달라도 죽지 않는다 — 있는 값만으로 계산한다', () => {
    const players = [{ metrics: { a: 1, b: 2 } }, { metrics: { a: 3 } }];
    const stats = groupStats(players);
    expect(stats.mean.a).toBeCloseTo(2, 10);
    expect(stats.mean.b).toBeCloseTo(2, 10); // b는 한 명뿐이라 그 값 그대로
    expect(stats.stdDev.b).toBe(0);
  });

  it('아무도 없으면 빈 값을 낸다', () => {
    const stats = groupStats([]);
    expect(stats.mean).toEqual({});
    expect(stats.stdDev).toEqual({});
  });

  it('절대 등급·라벨을 만들지 않는다 — 반환 모양에 mean/stdDev 두 필드뿐이다', () => {
    const stats = groupStats([{ metrics: { x: 1 } }]);
    expect(Object.keys(stats).sort()).toEqual(['mean', 'stdDev']);
  });
});
