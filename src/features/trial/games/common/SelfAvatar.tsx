/**
 * 내 로봇 — 3인칭이라 보인다. 자세는 selfPose(가변)에서 매 프레임 읽는다. WorldScene 의 RemoteAvatar 와 같은 짜임
 * (RobotAvatar + 바닥 그림자, 한 Suspense 안). 이름표는 없다 — 내 머리 위에 내 이름을 띄울 이유가 없다.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { selfPose } from './selfPose';

export function SelfAvatar() {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(selfPose.x, selfPose.y, selfPose.z);
    g.rotation.y = selfPose.heading;
    // 그림자는 늘 바닥에 — 점프가 "위로 간 것"으로 읽히게 (WorldScene 의 RemoteAvatar 와 같다)
    if (shadow.current) {
      shadow.current.position.y = 0.02 - selfPose.y;
      const k = Math.max(0.45, 1 - selfPose.y * 0.35);
      shadow.current.scale.set(k, k, 1);
    }
  });
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <RobotAvatar getAnim={() => selfPose.anim} getAirborne={() => selfPose.y > 0.02} />
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>
    </group>
  );
}
