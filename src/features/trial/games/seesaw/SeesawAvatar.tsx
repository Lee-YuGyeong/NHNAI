/**
 * 판자 위의 남 — 실제 사람이든 AI 좌석이든 자리는 서버 스냅샷(seesawState.playerAt)에서 온다. 이 게임은 사람의 자리도
 * 서버가 적분하므로 player_moved 가 오지 않는다 — 그래서 WorldScene 의 Remotes 가 아니라 여기서 그린다 (disc/DiscAvatar 와 같다).
 * 몸은 판과 같이 기울지 않고 서 있다 — 사람은 경사에서도 수직으로 선다.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { Html } from '@react-three/drei';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import type { AnimState } from '@/world/mp/protocol';
import { seesawState, worldOf } from './seesawState';

export function SeesawAvatar({ id, label, body }: { id: string; label: string; body?: BodyId | null }) {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const anim = useRef<AnimState>('idle');
  const speed = useRef(0);
  const last = useRef<{ x: number; z: number; at: number } | null>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const p = seesawState.playerAt(id, now);
    if (!p) return;
    const w = worldOf(p.u, p.v, seesawState.phiAt(now), p.fallen);
    anim.current = p.moving === 2 ? 'run' : p.moving === 1 ? 'walk' : 'idle';
    if (last.current) {
      const dt = Math.max(1, now - last.current.at) / 1000;
      speed.current = Math.hypot(w.x - last.current.x, w.z - last.current.z) / dt;
    }
    last.current = { x: w.x, z: w.z, at: now };
    g.position.set(w.x, w.y, w.z);
    g.rotation.set(p.fallen ? -Math.PI / 2 : 0, p.heading, 0);
    if (shadow.current) shadow.current.visible = !p.fallen;
  });

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {body ? (
          <SoldierAvatar body={body} getAnim={() => anim.current} getAirborne={() => false} getSpeed={() => (anim.current === 'idle' ? 0 : Math.max(speed.current, 1))} />
        ) : (
          <RobotAvatar getAnim={() => anim.current} getAirborne={() => false} />
        )}
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
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
