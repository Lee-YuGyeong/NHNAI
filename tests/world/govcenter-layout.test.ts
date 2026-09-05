/**
 * 특수인공지능대응센터 홀의 충돌 — 격납고 홀의 상자에서 **무대·계단만 뺀** 것이어야 한다 (2026-09-05 사용자: "단상 없애줘").
 * 격납고의 COLLIDERS 는 순서로 읽히는 카탈로그라 거기서 빼면 안 되고(lab/objects.ts), 이 홀이 제 목록에서 거른다.
 * 빼기만 하는 목록은 아니다 — 끝벽 앞의 처형자 몸 하나를 여기서 더한다 (2026-09-06 사용자: "그거 몸이 뚫리는데").
 */
import { describe, expect, it } from 'vitest';

import { HALL_COLLIDERS, STAGE_Z } from '@/world/map/govcenter/layout';
import { COLLIDERS, DOCK, DOCK_XS, NEAR_Z, STAGE, STEPS, STAGE_FRONT_Z } from '@/world/map/warehouse/layout';
import { PLAYER_R, groundHeightAt, resolveCollisions } from '@/world/mp/collide';

describe('HALL_COLLIDERS — 단상이 없는 홀', () => {
  it('격납고 상자에서 무대 1 · 계단 n · 도크 4 가 빠지고 처형자 1 이 는다 — 벽·리브·콘솔·컨테이너는 그대로', () => {
    expect(HALL_COLLIDERS.length).toBe(COLLIDERS.length - 1 - STEPS.n - DOCK_XS.length + 1);
    // 처형자만 이 홀 것이다 — 목록 맨 끝에 붙는다. 나머지는 전부 격납고에서 그대로 온 상자다
    for (const c of HALL_COLLIDERS.slice(0, -1)) expect(COLLIDERS).toContain(c);
    expect(HALL_COLLIDERS.some((c) => c.z === STAGE_Z && c.top === STAGE.h)).toBe(false);
    // 등 뒤 벽의 도크(2026-09-05 사용자: "거치대가 좀 이상한데")도 없다 — 그 자리는 철문이고 벽이 막는다
    expect(HALL_COLLIDERS.some((c) => c.top === DOCK.h && c.z > NEAR_Z - DOCK.depth - 1e-6)).toBe(false);
    for (const x of DOCK_XS) expect(groundHeightAt(x, NEAR_Z - DOCK.depth / 2, 3, HALL_COLLIDERS)).toBe(0);
  });

  it('옛 무대 가운데도 계단 자리도 바닥은 0 이다 — 처형자와 사람이 같은 높이에 선다', () => {
    expect(groundHeightAt(0, STAGE_Z, 1, HALL_COLLIDERS)).toBe(0);
    for (let i = 0; i < STEPS.n; i++) expect(groundHeightAt(0, STAGE_FRONT_Z + STEPS.run * (i + 0.5), 1, HALL_COLLIDERS)).toBe(0);
    // 격납고 목록으로 재면 무대가 있다 — 두 목록이 실제로 다르다는 대조
    expect(groundHeightAt(0, STAGE_Z, 1, COLLIDERS)).toBe(STAGE.h);
  });

  it('처형자의 몸은 통과되지 않는다 — 옛 무대 위 평지가 되면서 이 몸만 뚫려 있었다', () => {
    // 그의 자리로 걸어 들어가면 밖으로 밀린다. 상자 반폭(0.35) + 사람 반지름 만큼 떨어진다
    const into = resolveCollisions(0, STAGE_Z, 0, undefined, HALL_COLLIDERS);
    expect(Math.hypot(into.x - 0, into.z - STAGE_Z)).toBeCloseTo(0.35 + PLAYER_R, 6);
    // 정면(z +)으로 다가가면 그쪽으로 밀린다 — 몸을 지나쳐 벽 쪽으로 넘어가지 않는다
    const front = resolveCollisions(0, STAGE_Z + 0.5, 0, undefined, HALL_COLLIDERS);
    expect(front.z).toBeCloseTo(STAGE_Z + 0.35 + PLAYER_R, 6);
    // 옆으로 한 걸음 비키면 아무것도 안 막는다 — 끝벽 앞을 지나다닐 수는 있어야 한다
    const beside = resolveCollisions(1.2, STAGE_Z, 0, undefined, HALL_COLLIDERS);
    expect(beside).toEqual({ x: 1.2, z: STAGE_Z });
  });
});
