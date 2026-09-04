/**
 * 개체는 방을 안 나간다 — **걷는 동안 한 프레임도.**
 *
 * 2026-09-01 사용자: "로봇이 벽 통과하는 것처럼 사라졌다가 와. 근데 그 쪽에 사용자가 갔는데
 * 사용자가 그 벽을 통과하진 못했어." 사람 좌표는 맵의 충돌 박스(world/mp/collide)를 지나지만
 * 개체는 2D 평면(lab/arena) 위를 걷는다 — 두 세계가 벽을 각자 지키고 있어서 한쪽만 통과했다.
 *
 * 여기서 지키는 것은 **합성**이다: 목적지가 방 안이고(검증·배회) 우회점도 방 안이면(pathFor),
 * 그 사이를 걷는 몸도 방 안이어야 한다. 셋 중 하나만 어긋나도 여기서 걸린다.
 * 마지막 방어선(keepInside)이 걸음 루프마다 실제로 걸려 있는지는 아래 마지막 describe 가 본다 —
 * 처음 고칠 때 배회·시행 둘만 보고 **폐기 행진을 빠뜨렸고**, 그 검사가 그 자리에서 잡았다.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ARENA, BODY_GAP, SPEED, insideArena, keepInside, pathFor, type Obstacle, type Pt } from '@/lab/arena';
import { OBJECTS } from '@/lab/objects';
import { ROAM } from '@/features/arena/lineup';
import { FAR_Z, NEAR_Z, WALL_X } from '@/world/map/warehouse/layout';

const OBSTACLES: Obstacle[] = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));

/** 방 밖인가 — 몸 반지름은 안 본다. 벽선(ARENA) 자체를 넘었는지만 */
const outOfRoom = (p: Pt) => p.x < ARENA.minX || p.x > ARENA.maxX || p.z < ARENA.minZ || p.z > ARENA.maxZ;

describe('insideArena · keepInside — 방의 선', () => {
  it('벽 너머는 방 밖이다', () => {
    expect(insideArena({ x: 0, z: -25 })).toBe(false);
    expect(insideArena({ x: 13.7, z: 0 })).toBe(false);
    expect(insideArena({ x: 0, z: -2.5 })).toBe(true);
  });

  it('되돌린 자리는 언제나 방 안이다', () => {
    for (const p of [
      { x: 99, z: 99 },
      { x: -99, z: -99 },
      { x: 13.74, z: -4.74 },
      { x: -0.83, z: -25.4 },
    ]) {
      keepInside(p);
      expect(insideArena(p), `${p.x}, ${p.z}`).toBe(true);
    }
  });

  /**
   * 이 선이 **정당한 목적지를 막으면 안 된다.** 시행 지점은 ARENA 에서 0.6(validateTrial),
   * 배회 목적지는 0.9(ArenaFeature 의 free) 안쪽까지 허용되는데, 되돌리는 선은 몸 반지름(0.43)이다.
   * 이 순서가 뒤집히면 개체가 제 목적지 앞에서 보이지 않는 벽에 막혀 선다 — 화면으로는 원인을 못 찾는다.
   */
  it('갈 수 있는 자리는 하나도 안 막는다 — 시행 0.6 · 배회 0.9 가 전부 이 선 안쪽이다', () => {
    for (const [x, z] of [
      [ARENA.minX + 0.6, 0],
      [ARENA.maxX - 0.6, 0],
      [0, ARENA.minZ + 0.6],
      [0, ARENA.maxZ - 0.6],
      [ROAM.minX, ROAM.minZ],
      [ROAM.maxX, ROAM.maxZ],
    ]) {
      const p = { x, z };
      keepInside(p);
      expect(p, `${x}, ${z} 가 밀렸다`).toEqual({ x, z });
    }
  });

  it('무대 위(0, -17)도 그대로다 — 「무대에 올라서라」가 살아 있어야 한다', () => {
    const stage = OBJECTS.find((o) => o.id === '무대')!;
    const p = { x: stage.x, z: stage.z };
    keepInside(p);
    expect(p).toEqual({ x: stage.x, z: stage.z });
  });
});

describe('걷는 동안 — 한 프레임도 방을 안 나간다', () => {
  /** 경로를 실제 걸음(초당 SPEED, 60fps)으로 밟아 본다 — 지나가는 자리를 전부 본다 */
  function walk(from: Pt, path: Pt[]): Pt[] {
    const seen: Pt[] = [];
    const body = { x: from.x, z: from.z };
    const step = SPEED / 60;
    for (const target of path) {
      for (let guard = 0; guard < 5000; guard += 1) {
        const d = Math.hypot(target.x - body.x, target.z - body.z);
        if (d <= step) {
          body.x = target.x;
          body.z = target.z;
        } else {
          body.x += ((target.x - body.x) / d) * step;
          body.z += ((target.z - body.z) / d) * step;
        }
        keepInside(body); // ArenaFeature 의 두 걸음 루프가 하는 것과 같은 순서
        seen.push({ ...body });
        if (d <= step) break;
      }
    }
    return seen;
  }

  it('방 안 아무 데서 아무 데로 — 천 번을 걸어도 밖이 없다', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const spot = () => ({
      x: ARENA.minX + rnd() * (ARENA.maxX - ARENA.minX),
      z: ARENA.minZ + rnd() * (ARENA.maxZ - ARENA.minZ),
    });
    const escaped: Pt[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const from = spot();
      const to = spot();
      for (const p of walk(from, pathFor(from, to, OBSTACLES))) if (outOfRoom(p)) escaped.push(p);
    }
    expect(escaped.slice(0, 3), `방을 나간 자리 ${escaped.length}개`).toEqual([]);
  });

  it('벽 너머를 목적지로 줘도 벽에서 선다 — 목적지를 짓는 쪽이 새도 몸은 안 샌다', () => {
    const from = { x: 0, z: -2.5 };
    const seen = walk(from, [{ x: 0, z: -40 }]);
    expect(seen.every((p) => !outOfRoom(p))).toBe(true);
    expect(seen[seen.length - 1].z).toBeGreaterThanOrEqual(ARENA.minZ);
  });
});

/**
 * 마지막 방어선이 **실제로 걸려 있는가.** 두 루프(배회·시행)는 컴포넌트 안에 있어 여기서 못 돌린다 —
 * 걸음이 좌표를 옮기는 자리마다 keepInside 가 붙어 있는지만 글자로 지킨다. 한쪽에서 빠지면
 * 그 판에서만 개체가 새는데, 그건 눈으로만 알 수 있고 한참 뒤에야 발견된다.
 */
describe('걸음 루프마다 걸려 있다', () => {
  const src = readFileSync('src/features/arena/ArenaFeature.tsx', 'utf8');

  it('걸음이 있는 루프마다 keepInside 를 부른다', () => {
    expect([...src.matchAll(/keepInside\(/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('걸음이 좌표를 옮기는 자리마다 붙어 있다 — 새 루프가 생기면 여기서 알린다', () => {
    // 주석을 걷어내고 본다 — 이 파일은 주석이 길어서, 안 걷으면 창을 넓히다 검사가 헐거워진다
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const walks = [...bare.matchAll(/\.x \+= \(\(\w+\.x - /g)];
    /*
     * 배회 · 시행 — 두 자리다. 예전에는 넷이었다: 폐기 행진이 무대까지 걷고 무대 위로 오르느라
     * 걸음을 둘 더 들고 있었는데, 그 행진을 걷어냈다 (2026-09-03 사용자: 「그 자리에서 쓰러지는
     * 걸로」 — 선고받은 몸은 이제 한 발짝도 안 걷는다). 걸음이 없어진 만큼 방어선도 준 것이고,
     * **남은 두 자리에는 여전히 붙어 있어야 한다** — 그것이 아래 for 문이 지키는 것이다.
     */
    expect(walks.length).toBeGreaterThanOrEqual(2);
    for (const m of walks) {
      expect(bare.slice(m.index!, m.index! + 220), `${m.index} 근처의 걸음에 방어선이 없다`).toContain('keepInside(');
    }
  });
});

/**
 * 방의 선이 **진짜 벽과 같은가** — 이 버그의 뿌리 자리다.
 *
 * 개체는 2D 평면(lab/arena 의 ARENA) 위를 걷고, 사람은 3D 맵의 충돌 박스(world/mp/collide)에 막힌다.
 * 두 세계가 벽을 각자 들고 있고, ARENA 는 격납고 홀 치수(world/map/warehouse/layout.ts)를 **손으로
 * 베낀 값**이다 — 그 파일을 import 하지 않는 것은 lab 이 워커에도 번들되기 때문이다.
 *
 * 베낀 값은 언젠가 어긋난다. 홀을 넓히고 ARENA 를 안 고치면 개체만 옛 벽에 갇히고, 반대로 홀을 줄이면
 * 개체가 벽 밖을 걷는다 — 사람은 여전히 못 넘으니 **한쪽만 통과하는 그림**이 그대로 돌아온다.
 * 그래서 두 수를 여기서 맞대 놓는다. 이 시험은 lab 을 워커에서 떼어 놓은 채로도 돌아간다.
 */
describe('방의 선과 진짜 벽', () => {
  const BODY_R = BODY_GAP / 2;

  it('ARENA 가 격납고 홀 벽 안에 있다 — 몸통까지 들어오고도 남게', () => {
    expect(ARENA.maxX).toBeLessThanOrEqual(WALL_X - BODY_R);
    expect(ARENA.minX).toBeGreaterThanOrEqual(-WALL_X + BODY_R);
    expect(ARENA.maxZ).toBeLessThanOrEqual(NEAR_Z - BODY_R);
    expect(ARENA.minZ).toBeGreaterThanOrEqual(FAR_Z + BODY_R);
  });

  it('벽에서 0.6 들인 값 그대로다 — 홀을 옮기면 여기가 먼저 알린다', () => {
    expect({ ...ARENA }).toEqual({ minX: -WALL_X + 0.6, maxX: WALL_X - 0.6, minZ: FAR_Z + 0.6, maxZ: NEAR_Z - 0.6 });
  });

  it('가장자리 물건(콘솔)은 방 밖이다 — 개체가 거기 설 수 없는 것이 지금의 규칙이다', () => {
    const console1 = OBJECTS.find((o) => o.id === '콘솔1')!;
    expect(insideArena(console1)).toBe(false);
  });
});
