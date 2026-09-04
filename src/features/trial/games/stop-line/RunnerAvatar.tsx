/**
 * AI 좌석(SUBJECT_nn)의 몸 — src/world/scene/WorldScene.tsx 의 RemoteAvatar 와 같은 짜임이다
 * (RobotAvatar + 바닥 그림자 + 이름표, 한 Suspense 안). 실제 사람은 여기서 안 그린다 — 그쪽은
 * 자기 좌표를 보내오므로 WorldScene 의 Remotes 가 그린다. 여기는 서버가 시뮬레이션한 좌석만이다.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Html } from '@react-three/drei';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { runnerState } from './runnerState';
import { laneX, zAt } from './track';

export function RunnerAvatar({ id, label }: { id: string; label: string }) {
  const group = useRef<Group>(null);
  const anim = useRef<'idle' | 'walk'>('idle');

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { x: dist, anim: a } = runnerState.frameAt(id, Date.now());
    anim.current = a;
    g.position.set(laneX(runnerState.laneOf(id)), 0, zAt(dist));
    g.rotation.y = Math.PI; // 아바타 정면은 로컬 +z — 무대 쪽(-z)을 보고 달린다
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
          {label}
        </div>
      </Html>
    </group>
  );
}
