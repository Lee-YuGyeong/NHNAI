/**
 * 개막 배치와 배회 마당 — 들어왔을 때 개체들이 어디에 서고, 그 뒤로 어디까지 흩어지는가.
 *
 * ★ **시행 출발선은 없어졌다** (2026-09-01). 판이 서도 아무도 옮기지 않고 서 있던 자리에서
 *   그대로 출발한다 (ArenaFeature 의 begin) — 그래서 여기 있던 TRIAL_RING 시험도 같이 빠졌다.
 *   「어디서 출발해도 걸리지 않는다」를 잠그는 자리는 이제 tests/lab/quick.test.ts 다.
 *
 * 여기가 틀리면 입장 첫 프레임에 다섯이 한 점에 포개져 태어나거나, 자리가 사람과 개체를 갈라
 * 정체가 샌다 (불변 규칙 I1~I8). 그리고 **화면에 몸이 하나도 안 남는다** — 그게 2026-09-01 의 고장이다.
 */
import { describe, expect, it } from 'vitest';
import { IDLE_ARC, IDLE_DEPTH, IDLE_RING, ROAM, inRoam, ringSpot } from '@/features/arena/lineup';
import { ARENA, START } from '@/lab/arena';
import { OBJECTS } from '@/lab/objects';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** 무대 = 들어온 사람이 보고 있는 쪽 (스폰에서 카메라가 맵의 focus 로 돌아가 있다) */
const STAGE = OBJECTS.find((o) => o.kind === '무대');

/** 화면 정면에서 몇 도 벗어나 있나 — 카메라가 부채꼴 중심(START)에 서므로 곧 화면 밖으로 밀리는 각이다 */
function offAxisDeg(p: { x: number; z: number }): number {
  const to = Math.atan2(p.x - START.x, p.z - START.z);
  const front = Math.atan2((STAGE?.x ?? START.x) - START.x, (STAGE?.z ?? START.z - 1) - START.z);
  return Math.abs(Math.atan2(Math.sin(to - front), Math.cos(to - front))) * (180 / Math.PI);
}

/**
 * 가로 시야의 절반(도). arena3d/input 의 BASE_FOV 60 을 4:3 에서 역산한 값 —
 * 이보다 넓은 창은 더 넓게 보이므로, 여기를 통과하면 어느 창에서도 화면 안이다.
 */
const HALF_H_FOV_DEG = Math.atan(Math.tan((60 / 2) * (Math.PI / 180)) * (4 / 3)) * (180 / Math.PI);

describe('개막 부채꼴', () => {
  it('아무도 같은 자리에 서지 않는다 — 이게 처음 고치려던 고장이다', () => {
    // 깊이가 판마다 다르게 뽑히므로(ringSpot) 한 판만 봐서는 못 잠근다 — 여러 판을 돌린다
    for (let round = 0; round < 200; round += 1) {
      const spots = Array.from({ length: 6 }, (_, i) => ringSpot(i, 6, IDLE_RING));
      for (let i = 0; i < spots.length; i += 1) {
        for (let j = i + 1; j < spots.length; j += 1) {
          // 사람 몸 하나가 들어갈 만큼은 떨어져 있어야 한다
          expect(`${i}-${j}:${(dist(spots[i], spots[j]) > 0.8).toString()}`).toBe(`${i}-${j}:true`);
        }
      }
    }
  });

  /**
   * 깊이는 흩어지되 **자리마다 같은 폭에서 뽑는다** (2026-09-03 사용자: "일렬로 서있을때가 있어").
   * 여태는 전원이 같은 반지름이었다 — 「누구도 더 가깝지 않다」를 그렇게 지켰는데, 그 값이 곧
   * 도열이었다. 뒤로만 흩으면 둘 다 지킨다: 아무도 예전보다 **앞에** 서지 않고, 뽑는 폭이 같으니
   * seat 번호로 유불리가 갈리지도 않는다 (불변 규칙 I1~I8).
   */
  it('아무도 예전 자리보다 앞에 서지 않고, 뒤로 흩어지는 폭은 자리마다 같다', () => {
    for (let round = 0; round < 200; round += 1) {
      for (const i of [0, 1, 2, 3, 4, 5]) {
        const d = dist(ringSpot(i, 6, IDLE_RING), START);
        expect(`${i}:${(d >= IDLE_RING - 1e-6).toString()}`).toBe(`${i}:true`);
        expect(`${i}:${(d <= IDLE_RING + IDLE_DEPTH + 1e-6).toString()}`).toBe(`${i}:true`);
      }
    }
  });

  /**
   * 한 판의 여섯이 우연히 비슷한 깊이로 뽑힐 수는 있다 — 그건 무작위지 고장이 아니다.
   * 그래서 **뽑는 폭 자체**를 본다: 같은 자리를 여러 번 뽑으면 폭 전체가 나와야 한다.
   * 여기가 좁아지면(=예전처럼 고정되면) 다시 도열이 된다.
   */
  it('깊이가 실제로 갈린다 — 여섯이 같은 줄에 서면 그게 도열이다', () => {
    const draws = Array.from({ length: 300 }, () => dist(ringSpot(0, 6, IDLE_RING), START));
    expect(Math.max(...draws) - Math.min(...draws)).toBeGreaterThan(IDLE_DEPTH * 0.8);
  });

  it('등을 보이는 몸은 없다 — 말을 걸 얼굴이 안 보이면 방이 아니다', () => {
    for (let round = 0; round < 200; round += 1) {
      for (const i of [0, 1, 2, 3, 4, 5]) {
        const s = ringSpot(i, 6, IDLE_RING);
        // heading 은 atan2(dx, dz) 규약이다. 안쪽(START)을 향하는 값에서 얼마나 틀어져 있나
        const inward = Math.atan2(START.x - s.x, START.z - s.z);
        const off = Math.abs(Math.atan2(Math.sin(s.heading - inward), Math.cos(s.heading - inward)));
        expect(`${i}:${(off < (25 * Math.PI) / 180).toString()}`).toBe(`${i}:true`);
      }
    }
  });

  it('시선이 한 점에 안 모인다 — 다섯이 눈까지 나를 겨누면 방이 아니라 검문이다', () => {
    // 깊이와 같은 이유로 **뽑는 폭**을 본다 (위 머리말). 0 으로 굳으면 전원이 나만 노려본다
    const offs = Array.from({ length: 300 }, () => {
      const s = ringSpot(0, 6, IDLE_RING);
      const inward = Math.atan2(START.x - s.x, START.z - s.z);
      return Math.atan2(Math.sin(s.heading - inward), Math.cos(s.heading - inward));
    });
    expect(Math.max(...offs) - Math.min(...offs)).toBeGreaterThan((8 * Math.PI) / 180);
  });

  it('전원이 **첫 프레임에 화면 안**이다 — 암전이 걷히면 눈앞에 줄지어 서 있어야 한다', () => {
    // 여태는 둘레 한 바퀴(0°·72°·144°·216°·288°)라 절반이 등 뒤에 태어났고 정면은 비어 있었다
    expect(IDLE_ARC * (180 / Math.PI)).toBeLessThan(HALF_H_FOV_DEG);
    for (let round = 0; round < 60; round += 1) {
      for (const n of [1, 5, 6]) {
        for (let i = 0; i < n; i += 1) {
          const s = ringSpot(i, n, IDLE_RING);
          expect(`${n}/${i}:${(offAxisDeg(s) <= HALF_H_FOV_DEG).toString()}`).toBe(`${n}/${i}:true`);
        }
      }
    }
  });

  it('인원이 0 이어도 좌표가 깨지지 않는다 — 전원이 폐기된 판도 있다', () => {
    const s = ringSpot(0, 0, IDLE_RING);
    expect(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.heading)).toBe(true);
  });
});

describe('배회 마당', () => {
  it('개막 자리는 전부 마당 안이다 — 태어난 자리부터 밖이면 첫 걸음이 되돌아오는 걸음이 된다', () => {
    // 뒤로 물러선 자리(IDLE_DEPTH)까지 전부 마당 안이라야 한다 — 여러 판을 돌려 본다
    for (let round = 0; round < 200; round += 1) {
      for (const n of [5, 6]) {
        for (let i = 0; i < n; i += 1) {
          const s = ringSpot(i, n, IDLE_RING);
          expect(`${n}/${i}:${inRoam(s).toString()}`).toBe(`${n}/${i}:true`);
        }
      }
    }
  });

  it('마당은 홀 안쪽이다 — 벽을 넘은 목적지는 애초에 못 나온다', () => {
    expect(ROAM.minX > ARENA.minX && ROAM.maxX < ARENA.maxX).toBe(true);
    expect(ROAM.minZ > ARENA.minZ && ROAM.maxZ < ARENA.maxZ).toBe(true);
  });

  it('마당은 홀보다 훨씬 좁다 — 홀 전체가 목적지라 20초면 몸이 다 사라졌다', () => {
    const hall = (ARENA.maxX - ARENA.minX) * (ARENA.maxZ - ARENA.minZ);
    const yard = (ROAM.maxX - ROAM.minX) * (ROAM.maxZ - ROAM.minZ);
    expect(yard).toBeLessThan(hall / 2);
  });

  it('옆벽 콘솔은 마당 밖이다 — 배회가 거기 서면 화면 밖이다 (시행은 여전히 보낸다)', () => {
    const consoles = OBJECTS.filter((o) => o.kind === '콘솔');
    expect(consoles.length).toBeGreaterThan(0);
    for (const c of consoles) {
      // 그 물건 "앞" = 홀 안쪽으로 한 걸음 나온 자리 (ArenaFeature 의 ROAM_OBJECTS 와 같은 셈)
      const front = { x: c.x + Math.sign(START.x - c.x) * (c.hw + 1), z: c.z + Math.sign(START.z - c.z) * (c.hd + 1) };
      expect(`${c.id}:${inRoam(front).toString()}`).toBe(`${c.id}:false`);
    }
  });

  it('무대 앞은 마당 안이다 — 들여다볼 물건이 하나도 없으면 배회가 무작위 순찰로 돌아간다', () => {
    expect(STAGE).toBeTruthy();
    const front = { x: STAGE!.x, z: STAGE!.z + STAGE!.hd + 1 };
    expect(inRoam(front)).toBe(true);
  });
});
