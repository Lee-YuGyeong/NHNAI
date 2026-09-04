/**
 * 중앙 시설의 길 찾기 — 코어에 걸려 제자리 걸음을 하던 걸 막는다 (src/features/world/walk.ts).
 *
 * 2026-08-31 사용자: 「챕터 2 중앙 시설에서 로봇이 벽을 뚫거나 가운데 코어에 걸려 계속 그 자리를 걷는다」.
 * 검문 경비(코어 뒤 궤도 순찰)가 문 앞 검문 자리로 갈 때 직선이 코어를 관통해서, 몸이 코어 면에 붙어 걸음만 놀렸다.
 * 여기서는 그 걸음을 프레임 단위로 그대로 돌려 본다 — 옛 직선 걸음은 못 닿고, steerAround 는 코어를 돌아 닿는다.
 */
import { describe, expect, it } from 'vitest';

import { SLIDE_S, STUCK_MPS, contactSlide, steerAround } from '@/features/world/walk';
import { COLLIDERS, CORE_KEEPOUT, DAIS } from '@/world/map/central/layout';
import { resolveCollisions } from '@/world/mp/collide';

const ROLL_SPOT = { x: -1.3, z: 2.4 };
/** 코어 뒤 — 궤도 순찰(r 7.5)이 가장 먼 자리에 있을 때 */
const BEHIND_CORE = { x: 0, z: -18 };
const DT = 1 / 60;
const WALK = 1.8;

/** 경비 한 걸음 — AgentRobot 의 프레임과 같은 차례다 (조향 → 이동 → 충돌 → 접촉면 따라 비끼기) */
function march(from: { x: number; z: number }, to: { x: number; z: number }, opts: { around: boolean }) {
  const w = { x: from.x, z: from.z, sx: 0, sz: 0, slide: 0, side: 1 as 1 | -1 };
  let stuck = 0;
  let worstStuck = 0;
  let inCore = 0;
  for (let i = 0; i < 60 * 40; i += 1) {
    const dx = to.x - w.x;
    const dz = to.z - w.z;
    const d = Math.hypot(dx, dz);
    // 남은 거리를 0.15 로 좁히며 다가간다 — 0.16 안에 들었으면 닿은 것으로 본다(부동소수 잔여)
    if (d <= 0.16) return { arrived: true, seconds: i * DT, worstStuck, inCore };
    const aim = opts.around ? steerAround(w.x, w.z, to.x, to.z, [CORE_KEEPOUT], w.side) : { dx: dx / d, dz: dz / d };
    const ux = w.slide > 0 ? w.sx : aim.dx;
    const uz = w.slide > 0 ? w.sz : aim.dz;
    const step = Math.min(d - 0.15, WALK * DT);
    const bx = w.x + ux * step;
    const bz = w.z + uz * step;
    const hit = resolveCollisions(bx, bz, 0, undefined, COLLIDERS);
    const moved = Math.hypot(hit.x - w.x, hit.z - w.z);
    w.x = hit.x;
    w.z = hit.z;
    const nx = hit.x - bx;
    const nz = hit.z - bz;
    const nl = Math.hypot(nx, nz);
    if (opts.around && nl > 1e-4) {
      const t = contactSlide(nx / nl, nz / nl, aim.dx, aim.dz, w.slide > 0 ? { x: w.sx, z: w.sz } : null, w.side);
      w.sx = t.x;
      w.sz = t.z;
      w.slide = SLIDE_S;
    } else w.slide = Math.max(0, w.slide - DT);
    stuck = moved < STUCK_MPS * DT ? stuck + DT : 0;
    worstStuck = Math.max(worstStuck, stuck);
    // 코어 팔각(받침 박스 hw 3.8, 하나는 45°) 안에 들어간 프레임 — 몸이 코어를 뚫은 것이다
    if (Math.max(Math.abs(w.x - DAIS.x), Math.abs(w.z - DAIS.z)) < 3.6 && Math.abs(w.x - DAIS.x) + Math.abs(w.z - DAIS.z) < 5.1) inCore += 1;
  }
  return { arrived: false, seconds: Infinity, worstStuck, inCore };
}

describe('steerAround', () => {
  it('길이 비어 있으면 목표로 곧장 간다', () => {
    const d = steerAround(0, 0, 0, 10, [CORE_KEEPOUT]);
    expect(d.dx).toBeCloseTo(0, 6);
    expect(d.dz).toBeCloseTo(1, 6);
  });

  it('등 뒤의 구역은 상관하지 않는다', () => {
    const d = steerAround(DAIS.x, DAIS.z + 8, 0, 14, [CORE_KEEPOUT]);
    expect(d.dz).toBeCloseTo(1, 6);
  });

  it('가는 길에 코어가 있으면 접선으로 튼다 — 코어를 스치지 않는다', () => {
    const d = steerAround(BEHIND_CORE.x, BEHIND_CORE.z, ROLL_SPOT.x, ROLL_SPOT.z, [CORE_KEEPOUT]);
    // 중심까지의 거리에서 접선을 그으면 직선(코어 관통)과는 다른 방향이다
    const straight = Math.hypot(ROLL_SPOT.x - BEHIND_CORE.x, ROLL_SPOT.z - BEHIND_CORE.z);
    expect(Math.abs(d.dx - (ROLL_SPOT.x - BEHIND_CORE.x) / straight)).toBeGreaterThan(0.15);
    // 접선 방향으로 한참 가도 코어 반경 밖이다
    const px = BEHIND_CORE.x + d.dx * 8;
    const pz = BEHIND_CORE.z + d.dz * 8;
    expect(Math.hypot(px - CORE_KEEPOUT.x, pz - CORE_KEEPOUT.z)).toBeGreaterThanOrEqual(CORE_KEEPOUT.r - 1e-6);
  });

  it('목표가 구역 안이면(플레이어가 단 위) 돌지 않고 곧장 간다 — 안 그러면 경비가 영영 못 닿는다', () => {
    const onDais = { x: DAIS.x + 4.2, z: DAIS.z };
    const d = steerAround(0, 4, onDais.x, onDais.z, [CORE_KEEPOUT]);
    const len = Math.hypot(onDais.x - 0, onDais.z - 4);
    expect(d.dx).toBeCloseTo(onDais.x / len, 6);
    expect(d.dz).toBeCloseTo((onDais.z - 4) / len, 6);
  });

  it('구역 안에 들어와 있으면 밖으로 나가는 방향을 준다', () => {
    const d = steerAround(DAIS.x + 1, DAIS.z, DAIS.x, DAIS.z + 20, [CORE_KEEPOUT]);
    expect(d.dx).toBeCloseTo(1, 6);
  });
});

describe('contactSlide', () => {
  it('접촉면의 접선 둘 중 목표 쪽을 고른다', () => {
    // +z 로 밀려났다(=z 쪽 면에 닿았다). 목표는 오른쪽 앞이다
    const t = contactSlide(0, 1, 0.8, -0.6, null);
    expect(t.z).toBeCloseTo(0, 6);
    expect(t.x).toBeCloseTo(1, 6);
  });

  it('정면으로 박았으면 하던 쪽을 이어 간다', () => {
    const t = contactSlide(0, 1, 0, -1, { x: -1, z: 0 });
    expect(t.x).toBeCloseTo(-1, 6);
  });
});

describe('중앙 시설 — 코어 뒤에서 문 앞 검문 자리까지', () => {
  it('직선으로 걸으면 코어에 붙어 제자리 걸음을 한다 (고치기 전의 버그)', () => {
    const r = march(BEHIND_CORE, ROLL_SPOT, { around: false });
    expect(r.arrived).toBe(false);
    expect(r.worstStuck).toBeGreaterThan(2);
  });

  it('코어를 돌아가면 닿는다 — 막히지도, 코어를 뚫지도 않는다', () => {
    const r = march(BEHIND_CORE, ROLL_SPOT, { around: true });
    expect(r.arrived).toBe(true);
    expect(r.seconds).toBeLessThan(20);
    expect(r.worstStuck).toBeLessThan(0.5);
    expect(r.inCore).toBe(0);
  });

  it('재배치 자리(먼 문 옆)로 가는 앞줄 경비도 코어를 돌아 닿는다', () => {
    const r = march({ x: 5, z: 1.4 }, { x: -2.6, z: -20.3 }, { around: true });
    expect(r.arrived).toBe(true);
    expect(r.inCore).toBe(0);
  });
});
