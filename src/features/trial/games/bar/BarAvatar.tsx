/**
 * 무대 위의 남 — 실제 사람이든 AI 좌석이든 자리는 서버 스냅샷(barState.playerAt)에서 온다. 이 게임은 사람의 자리도
 * 점프도 서버가 적분하므로 player_moved 가 오지 않는다 — DiscAvatar 와 같은 이유로 여기서 그린다.
 * 점프가 있는 판이라 공중 자세(getAirborne)를 스냅샷의 y 로 읽는다 — DiscAvatar 와 다른 점 하나.
 *
 * 눕기는 **몸에만** 건다(posed 그룹, DiscAvatar 와 같은 짜임). 예전엔 바깥 그룹을 통째로 돌려서 발밑 그림자가
 * 같이 서고 이름표가 머리 위에서 앞으로 굴러떨어졌다. 넘어지는 데 시간을 주는 것도 여기다 (tipOver.ts).
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { Html } from '@react-three/drei';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import { BAR_TOP } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { barState } from './barState';
import { makeTip, tiltOf } from './tipOver';

export function BarAvatar({ id, label, body }: { id: string; label: string; body?: BodyId | null }) {
  const group = useRef<Group>(null);
  /** 눕기 · 방향 — 몸만 돈다 (Euler XYZ = 눕기 다음 방향) */
  const posed = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const anim = useRef<AnimState>('idle');
  const airborne = useRef(false);
  const speed = useRef(0);
  const last = useRef<{ x: number; z: number; at: number } | null>(null);
  const tip = useRef(makeTip());

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const p = barState.playerAt(id, now);
    if (!p) return;
    anim.current = p.moving === 2 ? 'run' : p.moving === 1 ? 'walk' : 'idle';
    airborne.current = !p.fallen && p.y > BAR_TOP + 0.02;
    if (last.current) {
      const dt = Math.max(1, now - last.current.at) / 1000;
      speed.current = Math.hypot(p.x - last.current.x, p.z - last.current.z) / dt;
    }
    last.current = { x: p.x, z: p.z, at: now };
    g.position.set(p.x, p.y, p.z);
    // 누운 몸(맞았거나 떨어졌다)은 넘어간다 — 딱 눕지 않는다 (tipOver.ts)
    if (posed.current) posed.current.rotation.set(tiltOf(tip.current, p.fallen, now), p.heading, 0);
    // 그림자는 무대 위에 있는 동안만 — 맞아 누운 몸도 무대 위다. 무대 밖으로 떨어진 몸(y 가 무대 아래)만 지운다
    if (shadow.current) shadow.current.visible = p.y > BAR_TOP - 0.1;
  });

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <group ref={posed}>
          {body ? (
            <SoldierAvatar body={body} getAnim={() => anim.current} getAirborne={() => airborne.current} getSpeed={() => (anim.current === 'idle' ? 0 : Math.max(speed.current, 1))} />
          ) : (
            <RobotAvatar getAnim={() => anim.current} getAirborne={() => airborne.current} />
          )}
        </group>
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
