/**
 * AI 좌석(SUBJECT_nn)의 몸 — 자리는 서버 스냅샷(fallState.aiAt)에서 온다. 정지선의 RunnerAvatar 와 같은 짜임.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Html } from '@react-three/drei';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { fallState } from './fallState';

export function DodgerAvatar({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const anim = useRef<'idle' | 'walk'>('idle');
  const last = useRef({ x: 0, z: 0 });

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = fallState.aiAt(id, Date.now());
    if (!p) return;
    anim.current = p.moving ? 'walk' : 'idle';
    // 걷는 쪽을 본다 — 멈추면 마지막 방향 그대로
    const dx = p.x - last.current.x;
    const dz = p.z - last.current.z;
    if (Math.hypot(dx, dz) > 0.01) g.rotation.y = Math.atan2(dx, dz);
    last.current = { x: p.x, z: p.z };
    g.position.set(p.x, 0, p.z);
  });

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <RobotAvatar getAnim={() => anim.current} getAirborne={() => false} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>
      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.6)',
            padding: '2px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--bone)',
          }}
        >
          {id}
        </div>
      </Html>
    </group>
  );
}
