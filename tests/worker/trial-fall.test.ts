/**
 * 낙하 생존 — 서버 물리(worker/src/trial/fall/sim.ts)와 회피 기록(stats.ts)을 고정한다.
 *
 *   ① 물체는 중력대로 떨어지고 바닥에서 한 번 튄다 (반발 0.4) · 중력이 크면 더 빨리 닿는다
 *   ② 몸 위로 내려오면 맞는다 · 옆으로 비켜 있으면 안 맞는다
 *   ③ 불필요한 이동 = 나를 향해 떨어지는 게 없을 때 움직이기 시작한 것
 *   ④ 위협이었던 물체가 착지하면 그 순간 얼마나 벗어나 있었는지 잰다 — "딱 20cm" 가 여기 남는다
 */
import { describe, expect, it } from 'vitest';
import { FALL_OBJECT_R, FALL_SPAWN_Y } from '../../src/world/mp/constants';
import { HIT_R, gravityForRound, overlapsBody, spawnObject, stepObject, timeToGround } from '../../worker/src/trial/fall/sim';
import { DodgeStats } from '../../worker/src/trial/fall/stats';

function dropUntilLanded(gravity: number): { o: ReturnType<typeof spawnObject>; ms: number } {
  const o = spawnObject(1, 0, () => 0.5);
  let now = 0;
  while (o.landedAt === null && now < 10_000) {
    now += 50;
    stepObject(o, gravity, 0.05, now);
  }
  return { o, ms: now };
}

describe('sim — 낙하', () => {
  it('중력 100% 에서 8.5m 를 1.3~1.6초 사이에 떨어진다 (공기저항 때문에 자유낙하보다 조금 늦다)', () => {
    const { o, ms } = dropUntilLanded(gravityForRound(1));
    expect(o.landedAt).not.toBeNull();
    expect(ms).toBeGreaterThanOrEqual(1300);
    expect(ms).toBeLessThanOrEqual(1600);
    expect(o.y).toBeCloseTo(FALL_OBJECT_R, 5);
    expect(o.vy).toBeGreaterThan(0); // 한 번 튄다
  });

  it('중력이 클수록 빨리 닿는다 — 60% < 100% < 140%', () => {
    const slow = dropUntilLanded(gravityForRound(2)).ms;
    const base = dropUntilLanded(gravityForRound(1)).ms;
    const fast = dropUntilLanded(gravityForRound(3)).ms;
    expect(fast).toBeLessThan(base);
    expect(base).toBeLessThan(slow);
  });

  it('timeToGround 는 실제 착지 시각과 0.1초 안에서 맞는다', () => {
    const o = spawnObject(1, 0, () => 0.5);
    const predicted = timeToGround(o, gravityForRound(1));
    const actual = dropUntilLanded(gravityForRound(1)).ms / 1000;
    expect(Math.abs(predicted - actual)).toBeLessThan(0.1);
  });

  it('머리 위(키 아래)로 내려온 물체만 몸에 닿는다', () => {
    const o = spawnObject(1, 0, () => 0.5);
    expect(overlapsBody(o, o.x, o.z)).toBe(false); // 아직 8.5m 위
    o.y = 1.0;
    expect(overlapsBody(o, o.x, o.z)).toBe(true);
    expect(overlapsBody(o, o.x + HIT_R + 0.01, o.z)).toBe(false); // 맞는 거리 밖
  });
});

describe('DodgeStats — 회피 기록', () => {
  it('나를 향해 떨어지는 게 없는데 움직이면 불필요한 이동이다', () => {
    const s = new DodgeStats(0, 0, 0);
    s.sample(0, 0, 100, () => false); // 첫 샘플 = 자리 표시. 이동으로 안 센다
    s.sample(0.5, 0, 300, () => false); // 2.5 m/s — 움직였다, 위협 없음
    s.sample(1.0, 0, 500, () => false); // 계속 움직임 — 한 번만 센다
    s.sample(1.0, 0, 900, () => false); // 멈춤
    s.sample(1.5, 0, 1100, () => true); // 위협이 있을 때 움직임 — 안 센다
    const r = s.result('x', 0, 20_000);
    expect(r.metrics.unnecessaryMoves).toBe(1);
  });

  it('위협이었던 물체가 착지하면 그 순간의 거리가 남는다 — 딱 20cm 만 벗어난 사람이 보인다', () => {
    const s = new DodgeStats(0, 0, 0);
    const o = spawnObject(7, 0, () => 0.5);
    o.x = 0;
    o.z = 0; // 정확히 내 머리 위
    s.sample(0, 0, 100, () => false); // 자리 표시
    s.registerThreat(o);
    s.sample(HIT_R + 0.2, 0, 300, () => true); // 맞는 거리에서 20cm 만 벗어난다
    o.y = FALL_OBJECT_R;
    o.landedAt = 1400;
    s.onLanded(o, 1400);
    const r = s.result('x', 0, 20_000);
    expect(r.metrics.minDistanceAvoid).toBeCloseTo(HIT_R + 0.2, 6);
    expect(r.adaptationCurve).toEqual([HIT_R + 0.2]);
    expect(r.errorDirection).toEqual([-1]); // 크게 피한 게 아니다
    expect(r.metrics.hitCount).toBe(0);
  });

  it('맞으면 첫 피격 시각이 생존 시간이 되고, 같은 물체는 한 번만 센다', () => {
    const s = new DodgeStats(0, 0, 0);
    const o = spawnObject(3, 0, () => 0.5);
    expect(s.onHit(o, 4000)).toBe(true);
    expect(s.onHit(o, 4050)).toBe(false);
    const r = s.result('x', 0, 20_000);
    expect(r.metrics.hitCount).toBe(1);
    expect(r.metrics.survivalTime).toBeCloseTo(4, 6);
  });

  it('위협을 한 번도 안 받았으면 회피 거리는 없다(NaN) — 0 이 「완벽」으로 읽히면 안 된다', () => {
    const r = new DodgeStats(0, 0, 0).result('x', 0, 20_000);
    expect(Number.isNaN(r.metrics.minDistanceAvoid)).toBe(true);
    expect(Number.isNaN(r.transitionError)).toBe(true);
    expect(r.metrics.survivalTime).toBeCloseTo(20, 6);
  });
});

describe('spawnObject', () => {
  it('처마 아래 높이에서 정지 상태로 놓인다', () => {
    const o = spawnObject(1, 0, () => 0.5);
    expect(o.y).toBe(FALL_SPAWN_Y);
    expect(o.vy).toBe(0);
    expect(o.landedAt).toBeNull();
  });
});
