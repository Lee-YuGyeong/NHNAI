/**
 * 복도 카탈로그 — 충돌 데이터에서 물건을 제대로 끌어오는지 잠근다.
 * collide.ts 의 그룹 순서(벽 4 → 리브 16 → 콘솔 14)가 어긋나면 여기서 걸린다.
 */

import { describe, expect, it } from 'vitest';
import { CORRIDOR, OBJECTS, findObject, objectTable, targetSpot } from '../../src/lab/corridor-objects';

describe('복도 오브젝트 카탈로그', () => {
  it('리브 16 · 콘솔 14 — 벽은 물건이 아니다', () => {
    const count = (kind: string) => OBJECTS.filter((o) => o.kind === kind).length;
    expect(count('리브')).toBe(16);
    expect(count('콘솔')).toBe(14);
    expect(OBJECTS).toHaveLength(30);
  });

  it('이름이 겹치지 않고, 콘솔은 양쪽 벽을 이어 콘솔1~콘솔14 이다', () => {
    expect(new Set(OBJECTS.map((o) => o.id)).size).toBe(OBJECTS.length);
    expect(findObject('콘솔14')).toBeDefined();
    expect(findObject('콘솔15')).toBeUndefined();
  });

  it('리브는 벽 취급, 콘솔(윗면 0.85)은 점프로 올라선다', () => {
    for (const o of OBJECTS) expect(o.mountable).toBe(o.kind === '콘솔');
  });

  it('전부 벽 안에 있고 스폰 원(중심 (0,-2.5) 반지름 3.4)을 침범하지 않는다', () => {
    for (const o of OBJECTS) {
      expect(o.x).toBeGreaterThan(CORRIDOR.minX);
      expect(o.x).toBeLessThan(CORRIDOR.maxX);
      expect(o.z).toBeGreaterThan(CORRIDOR.minZ);
      expect(o.z).toBeLessThan(CORRIDOR.maxZ);
      const gap = Math.hypot(o.x, o.z + 2.5) - Math.max(o.hw, o.hd);
      expect(gap).toBeGreaterThan(3.4);
    }
  });

  it('리더 목록에 전 물건이 들어간다', () => {
    const table = objectTable();
    for (const o of OBJECTS) expect(table).toContain(o.id);
  });

  it('"앞에 서기" 자리는 발자국 밖이다 — 물건에 막히는 자리를 주지 않는다', () => {
    const from = { x: 0, z: -2.5 };
    for (const o of OBJECTS) {
      const spot = targetSpot(o, 'stand', from);
      const outside = Math.abs(spot.x - o.x) > o.hw || Math.abs(spot.z - o.z) > o.hd;
      expect(outside).toBe(true);
    }
  });
});
