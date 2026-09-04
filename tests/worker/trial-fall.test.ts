/**
 * 낙하 생존 — 서버 물리(worker/src/trial/fall/sim.ts)와 회피 기록(stats.ts)을 고정한다.
 *
 *   ① 물체는 중력대로 떨어지고 바닥에서 한 번 튄다 (반발 0.4) · 중력이 크면 더 빨리 닿는다
 *   ② 몸 위로 내려오면 맞는다 · 옆으로 비켜 있으면 안 맞는다
 *   ③ 불필요한 이동 = 나를 향해 떨어지는 게 없을 때 움직이기 시작한 것
 *   ④ 위협이었던 물체가 착지하면 그 순간 얼마나 벗어나 있었는지 잰다 — "딱 20cm" 가 여기 남는다
 */
import { describe, expect, it } from 'vitest';
import { FALL_BALLS, FALL_SPAWN_Y } from '../../src/world/mp/constants';
import { BALL_DRAG, HIT_R, gravityForPhase, overlapsBody, spawnObject, stepObject, timeToGround } from '../../worker/src/trial/fall/sim';
import { DodgeStats } from '../../worker/src/trial/fall/stats';

const BOWLING = FALL_BALLS.findIndex((b) => b.id === 'bowling');
const PINGPONG = FALL_BALLS.findIndex((b) => b.id === 'pingpong');

function dropUntilLanded(gravity: number, kind = BOWLING): { o: ReturnType<typeof spawnObject>; ms: number } {
  const o = spawnObject(1, 0, () => 0.5, undefined, 0.9, kind);
  let now = 0;
  while (o.landedAt === null && now < 10_000) {
    now += 50;
    stepObject(o, gravity, 0.05, now);
  }
  return { o, ms: now };
}

describe('sim — 낙하', () => {
  it('볼링공은 중력 100% 에서 11.5m 를 거의 자유낙하(1.5~1.7초)로 떨어지고 한 번 튄다', () => {
    const { o, ms } = dropUntilLanded(gravityForPhase(1));
    expect(o.landedAt).not.toBeNull();
    expect(ms).toBeGreaterThanOrEqual(1500);
    expect(ms).toBeLessThanOrEqual(1700);
    expect(o.y).toBeCloseTo(o.r, 5);
    expect(o.vy).toBeGreaterThan(0); // 한 번 튄다
  });

  it('가벼운 탁구공이 무거운 볼링공보다 늦게 닿는다 — 공기저항은 무게로 나뉜다', () => {
    const light = dropUntilLanded(gravityForPhase(1), PINGPONG).ms;
    const heavy = dropUntilLanded(gravityForPhase(1), BOWLING).ms;
    expect(light).toBeGreaterThan(heavy + 1500); // 탁구공 ~3.75s vs 볼링공 ~1.55s — 둥실 내려온다
    expect(BALL_DRAG[PINGPONG]).toBeGreaterThan(BALL_DRAG[BOWLING] * 10);
  });

  it('중력이 클수록 빨리 닿는다 — 60% < 100% < 140%', () => {
    const slow = dropUntilLanded(gravityForPhase(2)).ms;
    const base = dropUntilLanded(gravityForPhase(1)).ms;
    const fast = dropUntilLanded(gravityForPhase(3)).ms;
    expect(fast).toBeLessThan(base);
    expect(base).toBeLessThan(slow);
  });

  it('timeToGround 는 실제 착지 시각과 0.1초 안에서 맞는다', () => {
    const o = spawnObject(1, 0, () => 0.5, undefined, 0.9, PINGPONG);
    const predicted = timeToGround(o, gravityForPhase(1));
    const actual = dropUntilLanded(gravityForPhase(1), PINGPONG).ms / 1000;
    expect(Math.abs(predicted - actual)).toBeLessThan(0.1);
  });

  it('머리 위(키 아래)로 내려온 물체만 몸에 닿는다', () => {
    const o = spawnObject(1, 0, () => 0.5, undefined, 0.9, BOWLING);
    expect(overlapsBody(o, o.x, o.z)).toBe(false); // 아직 8.5m 위
    o.y = 1.0;
    expect(overlapsBody(o, o.x, o.z)).toBe(true);
    expect(overlapsBody(o, o.x + o.r + 0.35 + 0.01, o.z)).toBe(false); // 그 공의 맞는 거리 밖
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
    const r = s.result('x', [0], 0, 60_000);
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
    o.y = o.r;
    o.landedAt = 1400;
    s.onLanded(o, 1400);
    const r = s.result('x', [0], 0, 60_000);
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
    const r = s.result('x', [0], 0, 60_000);
    expect(r.metrics.hitCount).toBe(1);
    expect(r.metrics.survivalTime).toBeCloseTo(4, 6);
  });

  it('위협을 한 번도 안 받았으면 회피 거리는 없다(NaN) — 0 이 「완벽」으로 읽히면 안 된다', () => {
    const r = new DodgeStats(0, 0, 0).result('x', [0], 0, 60_000);
    expect(Number.isNaN(r.metrics.minDistanceAvoid)).toBe(true);
    expect(Number.isNaN(r.transitionError)).toBe(true);
    expect(r.metrics.survivalTime).toBeCloseTo(60, 6);
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
