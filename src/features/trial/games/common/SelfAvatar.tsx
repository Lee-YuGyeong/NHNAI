/**
 * 내 몸 — 3인칭 게임(낙하 생존 · 정지선)에서만 보인다. 자세는 selfPose(가변)에서 매 프레임 읽는다.
 * WorldScene 의 RemoteAvatar 와 같은 짜임(아바타 + 바닥 그림자, 한 Suspense 안). 이름표는 없다 —
 * 내 머리 위에 내 이름을 띄울 이유가 없다.
 *
 * 몸(body)이 오면 **군인**(SoldierAvatar, mp/bodies.ts)이다 — 서버가 입장 때 방 안에서 겹치지 않게
 * 뽑아 준 그 몸 그대로 (2026-09-04 사용자: "나도 군인이여야해"). 없으면(옛 워커) 로봇 폴백.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import { SELF_WARP, warp } from '@/features/interrogation/scene/warp';
import { selfPose } from './selfPose';

/**
 * @param groundY 발이 닿는 바닥 높이 — 회전 원판(0.75m 단) 위에서는 그 높이가 「땅」이다. 없으면 0.
 *   함수면 프레임마다 묻는다 — 무게 중심 다리처럼 발밑이 오르내리는 판 위에서는 「땅」이 곧 지금 발 높이다(점프가 없으니)
 */
export function SelfAvatar({
  body,
  groundY = 0,
  pose,
}: {
  body?: BodyId | null;
  groundY?: number | (() => number);
  /** 프레임마다 묻는 덧자세 — 쓰러짐(눕는다) · 세로 배율. 무너지는 타워가 바닥에 떨어진 몸을 눕히는 데 쓴다. 없으면 서 있는 몸 */
  pose?: () => { lie: boolean; scaleY: number };
}) {
  const group = useRef<Group>(null);
  /**
   * 순간이동 중의 몸 — 떨어져 다시 서는 동안 가늘어졌다 다시 선다 (games/common/fallWarp.ts).
   * **눕는 그룹 바깥**이다: 배율과 들림은 세워진 축(월드 y)으로 걸려야 「빨려 올라간다」로 보인다.
   * 걸린 것이 없으면 배율 1 이라 이 그룹은 없는 것과 같다 — 낙하 생존 · 정지선 · 색 사냥은 아무것도 안 건다
   */
  const warped = useRef<Group>(null);
  /** 눕기 · 방향 · 세로 배율 — 한 그룹에 옛날 그대로 건다 (Euler XYZ = 눕기 다음 방향) */
  const posed = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const ground = () => (typeof groundY === 'function' ? groundY() : groundY);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(selfPose.x, selfPose.y, selfPose.z);
    const x = pose?.();
    if (posed.current) {
      posed.current.rotation.set(x?.lie ? -Math.PI / 2 : 0, selfPose.heading, 0);
      posed.current.scale.y = x?.scaleY ?? 1;
    }
    const w = warp.bodyAt(SELF_WARP);
    if (warped.current) {
      warped.current.scale.set(w.xz, w.y, w.xz);
      warped.current.position.y = w.lift;
    }
    // 그림자는 늘 바닥에 — 점프가 "위로 간 것"으로 읽히게 (WorldScene 의 RemoteAvatar 와 같다)
    if (shadow.current) {
      const gy = ground();
      shadow.current.position.y = 0.02 - (selfPose.y - gy);
      // 순간이동 중이면 몸이 사라지는 만큼 옅어진다 — 눕지도 들리지도 않는다 (늘 바닥이다)
      const k = Math.max(0.45, 1 - (selfPose.y - gy) * 0.35) * w.xz;
      shadow.current.scale.set(k, k, 1);
    }
  });
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <group ref={warped}>
          <group ref={posed}>
            {body ? (
              <SoldierAvatar body={body} getAnim={() => selfPose.anim} getAirborne={() => selfPose.y > ground() + 0.02} />
            ) : (
              <RobotAvatar getAnim={() => selfPose.anim} getAirborne={() => selfPose.y > ground() + 0.02} />
            )}
          </group>
        </group>
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>
    </group>
  );
}
