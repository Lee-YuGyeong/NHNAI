/**
 * 중앙 시설(시나리오 2) 의 지도 — 치수 · 코어 자리 · 슬롯이 어느 구역에 있나 · 문이 막는가.
 *
 * 이 방의 규칙은 전부 코어까지의 거리(features/world2/corefield)에서 나온다. 그래서 시험이 쥐는 것은 값이 아니라
 * **자리와 규칙의 합의**다: 스폰이 홀이어야 「제일 밝다」가 참이고, 씨앗 슬롯이 코어권이어야 「전파 ×3」이 붙고,
 * 재회 슬롯이 문 ① 정면이어야 「먼저 와 있다」가 보인다. 방을 고치면 여기가 먼저 깨진다.
 */

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import { central2 } from '../../../src/features/world2/central2';
import { CORE_CENTER, FIELD, zone } from '../../../src/features/world2/corefield';
import {
  CENTRAL2,
  CENTRAL2_CONSOLE,
  CENTRAL2_CORE,
  CENTRAL2_DOORS,
  CENTRAL2_EXIT,
  CHECK_SPOTS,
  REUNION_SLOTS,
  SEED_SLOTS,
  central2AtExit,
  central2DoorColliders,
  resolveCentral2Colliders,
} from '../../../src/world2/map/central2';
import { SPAWN2 } from '../../../src/world2/map/index';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const SPAWN = SPAWN2.central2;
/** 자리 규칙(patrol.BG_GAP)과 같은 값 — 여기 다시 적는 것은 지도가 그 규칙을 **모른 채** 지켜야 하기 때문이다 */
const GAP = 3.2;

beforeEach(() => {
  central2.reset();
});

describe('치수 — 레벨 설계 챕터 3', () => {
  it('26 × 26 m · 천장 10 — 지름 26 의 홀을 상자 한 변으로', () => {
    expect(CENTRAL2.profile.wallX * 2).toBe(26);
    expect(CENTRAL2.profile.nearZ - CENTRAL2.profile.farZ).toBe(26);
    expect(CENTRAL2.profile.ceilingY).toBe(10);
  });

  it('본판 WORLD 클램프(x ±14 · z −23~15) 안이다 — bounds 없이 걷는다', () => {
    expect(CENTRAL2.profile.wallX).toBeLessThan(14);
    expect(CENTRAL2.profile.farZ).toBeGreaterThan(-23);
    expect(CENTRAL2.profile.nearZ).toBeLessThan(15);
  });

  it('코어 중심은 corefield 의 약속값 그 객체다', () => {
    expect(CENTRAL2_CORE).toBe(CORE_CENTER);
    expect(CENTRAL2_CORE).toEqual({ x: 0, z: -10.5 });
  });
});

describe('자리 — 어느 동심원에 서 있나', () => {
  it('스폰은 홀이다 — 「밝다. 여기가 제일 밝다」가 벽 그늘에서 나오면 거짓이다', () => {
    expect(zone(SPAWN)).toBe('hall');
    expect(dist(SPAWN, CENTRAL2_CORE)).toBeLessThanOrEqual(FIELD.hall.r);
  });

  it('재회 슬롯 둘은 문 ① 정면 좌우의 홀이다', () => {
    for (const s of REUNION_SLOTS) expect(zone(s)).toBe('hall');
    expect(REUNION_SLOTS[0].x).toBeLessThan(0);
    expect(REUNION_SLOTS[1].x).toBeGreaterThan(0);
    expect(REUNION_SLOTS[0].z).toBe(REUNION_SLOTS[1].z);
    // 문 ① 쪽(코어보다 +z) — 들어서며 판독 거리에 든다
    for (const s of REUNION_SLOTS) expect(s.z).toBeGreaterThan(CENTRAL2_CORE.z);
  });

  it('씨앗 슬롯 둘은 코어권이되 코어 우회 원(5.9) 밖이다', () => {
    for (const s of SEED_SLOTS) {
      expect(zone(s)).toBe('core');
      expect(dist(s, CENTRAL2_CORE)).toBeGreaterThanOrEqual(5.9);
      expect(dist(s, CENTRAL2_CORE)).toBeLessThanOrEqual(FIELD.core.r);
    }
  });

  it('검문 둘은 스폰 4 m 안 — 들어서자마자 보이되 말 반경(2.6) 밖', () => {
    for (const s of CHECK_SPOTS) {
      expect(dist(s, SPAWN)).toBeLessThanOrEqual(4);
      expect(dist(s, SPAWN)).toBeGreaterThan(2.6);
    }
  });

  it('이름 붙은 자리 전부가 서로 3.2 m 이상 — 배경 개체 간격 규칙', () => {
    const spots = [SPAWN, ...REUNION_SLOTS, ...SEED_SLOTS, ...CHECK_SPOTS];
    for (let i = 0; i < spots.length; i += 1)
      for (let j = i + 1; j < spots.length; j += 1) expect(dist(spots[i], spots[j])).toBeGreaterThanOrEqual(GAP);
  });

  it('자리 전부가 방 안이다', () => {
    const { wallX, farZ, nearZ } = CENTRAL2.profile;
    for (const s of [SPAWN, ...REUNION_SLOTS, ...SEED_SLOTS, ...CHECK_SPOTS, CENTRAL2_CONSOLE]) {
      expect(Math.abs(s.x)).toBeLessThan(wallX);
      expect(s.z).toBeGreaterThan(farZ);
      expect(s.z).toBeLessThan(nearZ);
    }
  });

  it('콘솔은 서남쪽 벽(−x · 문 ① 쪽 절반)의 벽 그늘이다 — 소리 지르는 일은 조용한 자리에서만', () => {
    expect(CENTRAL2_CONSOLE.x).toBeLessThan(-12);
    expect(CENTRAL2_CONSOLE.z).toBeGreaterThan(CENTRAL2_CORE.z);
    expect(zone(CENTRAL2_CONSOLE)).toBe('shadow');
    // 벽을 본다 (−x)
    expect(CENTRAL2_CONSOLE.look).toEqual({ dx: -1, dz: 0 });
    expect(Math.sin(CENTRAL2_CONSOLE.facing)).toBeCloseTo(-1, 6);
  });
});

describe('문 넷', () => {
  it('① 가까운 끝 · ② 먼 끝 · ③ ④ 옆벽 코어 높이', () => {
    const { wallX, farZ, nearZ } = CENTRAL2.profile;
    expect(CENTRAL2_DOORS.d1.x).toBe(0);
    expect(CENTRAL2_DOORS.d1.z).toBeCloseTo(nearZ - 0.195, 3);
    expect(CENTRAL2_DOORS.d2.x).toBe(0);
    expect(CENTRAL2_DOORS.d2.z).toBeCloseTo(farZ + 0.195, 3);
    expect(CENTRAL2_DOORS.d3.x).toBeCloseTo(-(wallX - 0.195), 3);
    expect(CENTRAL2_DOORS.d4.x).toBeCloseTo(wallX - 0.195, 3);
    expect(CENTRAL2_DOORS.d3.z).toBe(CENTRAL2_CORE.z);
    expect(CENTRAL2_DOORS.d4.z).toBe(CENTRAL2_CORE.z);
  });

  it('나가는 문은 ② — 문 앞에서 참, 스폰에서 거짓', () => {
    expect(CENTRAL2_EXIT).toBe(CENTRAL2_DOORS.d2);
    expect(central2AtExit(CENTRAL2_EXIT.x, CENTRAL2_EXIT.z)).toBe(true);
    // 닫힌 문짝 앞(문짝 반두께 + 몸 반지름)에서도 참 — 나갈 수 있는지는 canLeave 의 몫
    expect(central2AtExit(0, CENTRAL2_EXIT.z + 0.53)).toBe(true);
    expect(central2AtExit(SPAWN.x, SPAWN.z)).toBe(false);
    expect(central2AtExit(0, CENTRAL2_EXIT.z + 2.1)).toBe(false);
  });

  it('닫힌 문짝만 충돌이 된다 — 넷 다 닫히면 넷, 다 열리면 없음', () => {
    const closed = central2DoorColliders({ d1: false, d2: false, d3: false, d4: false });
    expect(closed).toHaveLength(4);
    for (const id of ['d1', 'd2', 'd3', 'd4'] as const) {
      const at = CENTRAL2_DOORS[id];
      expect(closed.some((c) => c.x === at.x && c.z === at.z && c.top === 3.7)).toBe(true);
    }
    expect(central2DoorColliders({ d1: true, d2: true, d3: true, d4: true })).toHaveLength(0);
    expect(central2DoorColliders({ d1: true, d2: false, d3: true, d4: true })).toHaveLength(1);
  });

  it('락다운이 문을 닫으면 문 ② 앞에서 몸이 밀린다 — 밝음 국면에서는 안 밀린다', () => {
    const justInside = () => new THREE.Vector3(0, 0, CENTRAL2_EXIT.z + 0.3);

    central2.enter(0);
    const open = justInside();
    resolveCentral2Colliders(open, 0);
    expect(open.z).toBeCloseTo(CENTRAL2_EXIT.z + 0.3, 6);

    // 90 초가 지나면 코어권에 안 들어갔어도 락다운이다 (central2 계약) — 문 넷이 한꺼번에 닫힌다
    central2.tick(90_000, { x: SPAWN.x, z: SPAWN.z }, 'hall');
    expect(central2.get().phase).toBe('lockdown');
    expect(central2.get().doors).toEqual({ d1: false, d2: false, d3: false, d4: false });
    const shut = justInside();
    resolveCentral2Colliders(shut, 0);
    expect(shut.z).toBeGreaterThan(CENTRAL2_EXIT.z + 0.3);
    expect(shut.z).toBeGreaterThanOrEqual(CENTRAL2_EXIT.z + 0.175 + 0.35 - 1e-6);
  });
});
