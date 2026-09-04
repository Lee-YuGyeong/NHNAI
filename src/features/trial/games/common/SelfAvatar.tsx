/**
 * 내 로봇 — 3인칭이라 보인다. 자세는 selfPose(가변)에서 매 프레임 읽는다. WorldScene 의 RemoteAvatar 와 같은 짜임
 * (RobotAvatar + 바닥 그림자, 한 Suspense 안). 이름표는 없다 — 내 머리 위에 내 이름을 띄울 이유가 없다.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { selfPose } from './selfPose';

export function SelfAvatar() {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(selfPose.x, 0, selfPose.z);
    g.rotation.y = selfPose.heading;
  });
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <RobotAvatar getAnim={() => selfPose.anim} getAirborne={() => false} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>
    </group>
  );
}
