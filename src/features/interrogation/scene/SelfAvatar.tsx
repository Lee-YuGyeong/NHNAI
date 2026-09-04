/**
 * 내 몸 — 3인칭 (카메라·조작은 features/trial 의 common/SelfAvatar.tsx 짜임 그대로다, 2026-09-04 사용자:
 * "물리게임 3인칭 … 그대로 가져다가 쓰고싶어"). 몸 자체는 로봇이 아니다 — 남의 몸(SeatAvatar)과 똑같이
 * 서버가 배정한 군인(SoldierAvatar)을 쓴다 (2026-09-04 사용자: "로봇트 하지말라고, 사람 모양 노원상이
 * 해준거 그대로 쓰라고"). 옛 워커라 몸이 없을 때만 로봇으로 대신한다 — SeatAvatar 와 같은 대체 규칙.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import { platformState } from './platformState';
import { selfPose } from './selfPose';

export function SelfAvatar({ body }: { body: BodyId | null }) {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(selfPose.x, selfPose.y, selfPose.z);
    g.rotation.y = selfPose.heading;
    if (shadow.current) {
      shadow.current.position.y = 0.02 - selfPose.y;
      const k = Math.max(0.45, 1 - selfPose.y * 0.35);
      shadow.current.scale.set(k, k, 1);
    }
  });
  const getAnim = () => selfPose.anim;
  // 발판 위(움직이는 플랫폼)는 공중이 아니다 — SeatAvatar 와 같은 규칙
  const getAirborne = () => selfPose.y > platformState.groundAt(selfPose.x, selfPose.z, selfPose.y) + 0.02;
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {body ? <SoldierAvatar body={body} getAnim={getAnim} getAirborne={getAirborne} /> : <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} />}
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>
    </group>
  );
}
