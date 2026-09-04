/**
 * 미닫이 문짝 — 열리면 천장으로 올라가고 닫히면 바닥으로 내려온다.
 *
 * 중앙 시설의 문 넷(Central2Doors)이 하던 것을 한 부품으로 뽑았다: 다른 다섯 방의 나가는 문도 같은 문짝을 쓴다.
 * 문짝 자체는 아무것도 판단하지 않는다 — `open()` 이 매 프레임 답하고, 문짝은 그 답을 향해 1.1 m/s 로 움직일 뿐이다.
 *
 * 첫 프레임은 **바로 목표 자리**에 놓는다 — 이미 열려 있어야 하는 문이 0 에서 올라가기 시작하면 들어서는 3 초 동안 문이 열리는 연출이 된다.
 * 방 전환은 key={room} 재마운트라 첫 프레임이 곧 입장이다.
 *
 * 충돌은 안 만든다 — 끝벽의 충돌(room.ts makeRoom)이 문간까지 통째로 막고 있어 문짝이 열려도 걸어서 넘어가지 않는다.
 * 나가는 것은 문 앞(atExit)에서 이야기가 방을 바꾸는 것이다. 중앙 시설만 닫힌 문짝을 충돌로 세운다(락다운이 자리를 가둔다).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';

import type { Fit, InstanceItem } from '@/world/map/corridor/part';
import { Parts } from '@/world/map/parts';

/** 문짝이 오르내리는 속도 (m/s) — 본판 격납문과 같다 */
export const LEAF_SPEED = 1.1;
/** 다 열렸을 때 문짝 아래가 개구 위로 이만큼 더 올라간다 */
const LEAF_LIFT = 0.2;

export function SlidingLeaf({
  open,
  h,
  fit,
  items,
  material,
  name = '문짝',
}: {
  /** 지금 열려 있어야 하나 — 매 프레임 묻는다 */
  open: () => boolean;
  /** 문짝 높이 — 이만큼 올라가면 개구가 다 비는다 */
  h: number;
  fit: Fit;
  items: InstanceItem[];
  material: THREE.Material;
  name?: string;
}) {
  const group = useRef<THREE.Group>(null);
  const settled = useRef(false);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const targetY = open() ? h + LEAF_LIFT : 0;
    const dy = targetY - g.position.y;
    if (Math.abs(dy) >= 1e-3) {
      const step = LEAF_SPEED * Math.min(delta, 0.1);
      g.position.y += settled.current ? Math.sign(dy) * Math.min(Math.abs(dy), step) : dy;
    }
    settled.current = true;
  });
  return (
    <group name={name} ref={group}>
      <Parts id="sci_blast_door" fit={fit} items={items} material={material} />
    </group>
  );
}
