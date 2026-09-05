/**
 * 탑 위의 남 — 자리는 서버 스냅샷(towerState.playerAt)에서 온다(사람의 자리도 서버가 적분한다 — DiscAvatar 와 같은 이유로 여기서 그린다).
 * 떨어지는 중이면 점프 클립, 바닥에 누웠으면 눕는다. 그림자는 발밑 발판 높이에 붙는다.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { Html } from '@react-three/drei';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import type { AnimState } from '@/world/mp/protocol';
import { warp } from '@/features/interrogation/scene/warp';
import { towerState } from './towerState';

export function TowerAvatar({ id, label, body }: { id: string; label: string; body?: BodyId | null }) {
  const group = useRef<Group>(null);
  /**
   * 순간이동 중의 몸 — 떨어져 다시 서는 동안 가늘어졌다 다시 선다 (games/common/fallWarp.ts).
   * **눕는 그룹 바깥**이다: 배율과 들림은 세워진 축(월드 y)으로 걸려야 「빨려 올라간다」로 보인다.
   * 안쪽에 걸면 누운 몸이 바닥을 따라 늘어난다
   */
  const warped = useRef<Group>(null);
  /** 눕기 · 방향 — 옛날 그대로 한 줄로 건다 (Euler XYZ = 눕기 다음 방향) */
  const posed = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const anim = useRef<AnimState>('idle');
  const air = useRef(false);
  const speed = useRef(0);
  const last = useRef<{ x: number; z: number; at: number } | null>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const p = towerState.playerAt(id, now);
    if (!p) return;
    anim.current = p.moving === 2 ? 'run' : p.moving === 1 ? 'walk' : 'idle';
    air.current = p.stance === 1;
    if (last.current) {
      const dt = Math.max(1, now - last.current.at) / 1000;
      speed.current = Math.hypot(p.x - last.current.x, p.z - last.current.z) / dt;
    }
    last.current = { x: p.x, z: p.z, at: now };
    g.position.set(p.x, p.y, p.z);
    if (posed.current) posed.current.rotation.set(p.stance === 2 ? -Math.PI / 2 : 0, p.heading, 0);
    // 순간이동 — 바닥에 떨어져 발판에 다시 서기까지 (towerState 의 순간이동, 빛기둥은 TowerStage 의 WarpFx)
    const w = warp.bodyAt(id, now);
    if (warped.current) {
      warped.current.scale.set(w.xz, w.y, w.xz);
      warped.current.position.y = w.lift;
    }
    if (shadow.current) {
      shadow.current.visible = p.stance === 0;
      // 그림자는 몸이 사라지는 만큼 옅어진다 — 눕히지도 들지도 않는다 (늘 발밑이다)
      shadow.current.scale.set(w.xz, w.xz, 1);
    }
  });

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <group ref={warped}>
          <group ref={posed}>
            {body ? (
              <SoldierAvatar body={body} getAnim={() => anim.current} getAirborne={() => air.current} getSpeed={() => (anim.current === 'idle' ? 0 : Math.max(speed.current, 1))} />
            ) : (
              <RobotAvatar getAnim={() => anim.current} getAirborne={() => air.current} />
            )}
          </group>
        </group>
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>
      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div style={{ pointerEvents: 'none', whiteSpace: 'nowrap', borderRadius: 999, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--bone)' }}>
          {label}
        </div>
      </Html>
    </group>
  );
}
