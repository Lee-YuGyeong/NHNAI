/**
 * 폭발 마당의 남 — 자리는 서버 스냅샷(blastState.playerAt)에서 온다(사람의 자리도 서버가 적분한다 — DiscAvatar 와 같은 이유로 여기서 그린다).
 * 공중이면 점프 클립, 쓰러졌으면 눕고, 낮은 자세면 몸을 낮춘다(웅크리는 클립이 없어 세로로 줄인다).
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { Html } from '@react-three/drei';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import type { AnimState } from '@/world/mp/protocol';
import { blastState } from './blastState';

export const CROUCH_SCALE = 0.72;

export function BlastAvatar({ id, label, body }: { id: string; label: string; body?: BodyId | null }) {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const anim = useRef<AnimState>('idle');
  const air = useRef(false);
  const speed = useRef(0);
  const last = useRef<{ x: number; z: number; at: number } | null>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const p = blastState.playerAt(id, now);
    if (!p) return;
    anim.current = p.moving === 2 ? 'run' : p.moving === 1 ? 'walk' : 'idle';
    air.current = p.stance === 1;
    if (last.current) {
      const dt = Math.max(1, now - last.current.at) / 1000;
      speed.current = Math.hypot(p.x - last.current.x, p.z - last.current.z) / dt;
    }
    last.current = { x: p.x, z: p.z, at: now };
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(p.stance === 2 ? -Math.PI / 2 : 0, p.heading, 0);
    g.scale.y = p.crouch && p.stance === 0 ? CROUCH_SCALE : 1;
    if (shadow.current) {
      shadow.current.position.y = 0.02 - p.y;
      const k = Math.max(0.45, 1 - p.y * 0.35);
      shadow.current.scale.set(k, k, 1);
    }
  });

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {body ? (
          <SoldierAvatar body={body} getAnim={() => anim.current} getAirborne={() => air.current} getSpeed={() => (anim.current === 'idle' ? 0 : Math.max(speed.current, 1))} />
        ) : (
          <RobotAvatar getAnim={() => anim.current} getAirborne={() => air.current} />
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
