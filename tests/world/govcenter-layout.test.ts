/**
 * 특수인공지능대응센터 홀의 충돌 — 격납고 홀의 상자에서 **무대·계단만 뺀** 것이어야 한다 (2026-09-05 사용자: "단상 없애줘").
 * 격납고의 COLLIDERS 는 순서로 읽히는 카탈로그라 거기서 빼면 안 되고(lab/objects.ts), 이 홀이 제 목록에서 거른다.
 */
import { describe, expect, it } from 'vitest';

import { HALL_COLLIDERS, STAGE_Z } from '@/world/map/govcenter/layout';
import { COLLIDERS, DOCK, DOCK_XS, NEAR_Z, STAGE, STEPS, STAGE_FRONT_Z } from '@/world/map/warehouse/layout';
import { groundHeightAt } from '@/world/mp/collide';

describe('HALL_COLLIDERS — 단상이 없는 홀', () => {
  it('격납고 상자에서 무대 1 · 계단 n · 도크 4 만 빠진다 — 벽·리브·콘솔·컨테이너는 그대로', () => {
    expect(HALL_COLLIDERS.length).toBe(COLLIDERS.length - 1 - STEPS.n - DOCK_XS.length);
    for (const c of HALL_COLLIDERS) expect(COLLIDERS).toContain(c);
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
});
