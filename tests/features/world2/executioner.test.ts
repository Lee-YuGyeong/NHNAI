/**
 * 걸어오는 것의 **몸과 길** — Executioner.tsx 는 r3f 라 여기서 못 세우지만, 그것이 쓰는 것은 전부 순수하다:
 * 열의 guard21 look(총이 있나), 방마다의 진입점 · 모퉁이 · 80 의 자리(벽 속이 아닌가), 꺾은선 위의 자리 계산(alongRoute).
 *
 * 2026-09-03 「처형도 제대로 안 되고 총 든 glb 가 중앙 시설에 없는 것 같아」 — 문가의 몸이 dress 를 안 받아 총이 없었고, 순찰 guard21 과
 * 따로 서서 둘이었고, 80 의 자리가 진입점→나 직선이라 L 복도의 모서리 벽 속이었다. 여기서 그 셋을 잡아 둔다.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { alongRoute, EXECUTIONER_ID, routeLength } from '../../../src/features/world2/execution';
import { STOP, WATCH_IN } from '../../../src/features/world2/Executioner';
import { EXEC_ROOM, type Room } from '../../../src/features/world2/scenario2';
import { units } from '../../../src/features/world2/units';
import { dress } from '../../../src/features/world2/wear';
import { MAPS2, SPAWN2 } from '../../../src/world2/map';

/** Room2Scene.solidOf 와 같은 눈 — 발을 −1 로 주고 밀려나면 벽·상자 안이다 */
function solidOf(room: Room): (x: number, z: number) => boolean {
  const resolve = MAPS2[room].resolveColliders;
  const foot = new THREE.Vector3();
  return (x, z) => {
    foot.set(x, -1, z);
    resolve(foot, -1);
    return Math.hypot(foot.x - x, foot.z - z) > 0.03;
  };
}

const ROOMS = (Object.keys(EXEC_ROOM) as Room[]).filter((r) => EXEC_ROOM[r] !== null);

describe('집행자의 몸 — 순찰하던 guard21 그대로, 총을 메고', () => {
  // 총은 코드가 얹는 조각이 아니라 s2_guard21 의 메시다 (프롬프트의 「a plain dark carbine hangs SLUNG ACROSS ITS BACK」).
  // 그래서 여기서 세는 것은 「Executioner 가 순찰 몸과 **같은 look 을 입는다**」뿐이다 — 총은 그 몸에 딸려 온다
  it('집행자는 열의 guard21 look 을 그대로 입는다 — 총 든 몸 하나에 무릎이 준 기울기', () => {
    const look = units.def(EXECUTIONER_ID)?.look;
    expect(look).toBeDefined();
    expect(look?.rifle).toBe(true);
    expect(look?.asset).toBe('s2_guard21');
    // 무릎이 닳은 것은 한쪽으로 기운다 — 문가에 선 몸과 순찰하던 몸이 같은 값에서 나온다는 표시
    expect(dress(look!).lean.roll).toBeGreaterThan(0);
  });
});

describe('걸어오는 길 — 진입점 · 모퉁이 · 80 의 자리가 벽 속이 아니다', () => {
  for (const room of ROOMS) {
    const spot = EXEC_ROOM[room]!;
    const solid = solidOf(room);
    it(`${room}: 진입점과 모퉁이가 벽·상자 밖이다`, () => {
      expect(solid(spot.at.x, spot.at.z), `at (${spot.at.x}, ${spot.at.z})`).toBe(false);
      for (const p of spot.path ?? []) expect(solid(p.x, p.z), `path (${p.x}, ${p.z})`).toBe(false);
    });
    it(`${room}: 스폰에서 6 m 들어선 나에게로 가는 길 위의 점들(80 의 자리 포함)이 벽 밖이고, 도착 자리는 내 앞 STOP m 다`, () => {
      // 스폰 그 자리가 아니라 방 안으로 6 m — 휴게의 진입점은 스폰에서 1.6 m 라 거기 서 있으면 걸어올 길이 없다 (90 초를 그 자리에 서 있지 않는다)
      const me = { x: SPAWN2[room].x, z: SPAWN2[room].z - 6 };
      const route = [spot.at, ...(spot.path ?? []), me];
      const len = routeLength(route);
      expect(len).toBeGreaterThan(STOP);
      // 80 — 길의 35 %
      const w = alongRoute(route, len * WATCH_IN);
      expect(solid(w.x, w.z), `watch (${w.x.toFixed(2)}, ${w.z.toFixed(2)})`).toBe(false);
      // 길을 0.5 m 마다 밟아 본다 — 모퉁이 점이 벽을 안 뚫는지
      for (let d = 0; d <= len - STOP; d += 0.5) {
        const p = alongRoute(route, d);
        expect(solid(p.x, p.z), `${room} route @${d.toFixed(1)} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).toBe(false);
      }
      const end = alongRoute(route, len - STOP);
      expect(Math.hypot(end.x - me.x, end.z - me.z)).toBeCloseTo(STOP, 5);
    });
  }
});

describe('alongRoute — 꺾은선 위의 자리', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 0, z: -4 },
    { x: 3, z: -4 },
  ];
  it('길이는 구간의 합이다', () => {
    expect(routeLength(route)).toBe(7);
  });
  it('구간 안의 점과 그 구간의 방향', () => {
    expect(alongRoute(route, 1)).toEqual({ x: 0, z: -1, dx: 0, dz: -1 });
    const p = alongRoute(route, 5);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(-4);
    expect(p.dx).toBeCloseTo(1);
    expect(p.dz).toBeCloseTo(0);
  });
  it('모퉁이에서 방향이 바뀌고, 길이를 넘기면 끝점에 선다', () => {
    expect(alongRoute(route, 4).z).toBeCloseTo(-4);
    expect(alongRoute(route, 100)).toEqual({ x: 3, z: -4, dx: 1, dz: 0 });
    expect(alongRoute(route, -3)).toEqual({ x: 0, z: 0, dx: 0, dz: -1 });
  });
});
