import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { worldState } from '../core/WorldState';

/** 캐릭터 1명. 위치는 useFrame 에서 worldState 를 읽어 갱신 (리렌더 없음) */
export function Avatar({ id }: { id: string }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const t = worldState.get(id);
    if (t && ref.current) ref.current.position.set(t.x, t.y, t.z);
  });
  return (
    <group ref={ref}>
      <mesh><capsuleGeometry args={[0.3, 1]} /><meshStandardMaterial /></mesh>
    </group>
  );
}
