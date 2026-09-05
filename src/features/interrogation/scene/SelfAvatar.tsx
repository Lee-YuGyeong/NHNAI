/**
 * 내 몸 — 3인칭 (카메라·조작은 features/trial 의 common/SelfAvatar.tsx 짜임 그대로다, 2026-09-04 사용자:
 * "물리게임 3인칭 … 그대로 가져다가 쓰고싶어"). 몸 자체는 로봇이 아니다 — 남의 몸(SeatAvatar)과 똑같이
 * 서버가 배정한 군인(SoldierAvatar)을 쓴다 (2026-09-04 사용자: "로봇트 하지말라고, 사람 모양 노원상이
 * 해준거 그대로 쓰라고"). 옛 워커라 몸이 없을 때만 로봇으로 대신한다 — SeatAvatar 와 같은 대체 규칙.
 *
 * **머리 위에 내 의심도 막대**가 붙는다 (2026-09-05 사용자: "내 의심도도 내 머리 위에 보이게 해줘") —
 * 남의 몸과 같은 부품(SuspicionBar.tsx)이라 색·눈금이 같은 규칙으로 읽힌다. 다른 점 둘:
 *
 *   · **이름표는 없다** — 내 이름은 내가 안다. 카메라가 1.9m 뒤(chase.ts)라 머리 위 글씨는 시야 한가운데를
 *     가릴 뿐이다. 막대만 있으면 된다.
 *   · **거리 배율(distanceFactor)을 안 쓴다** — 남의 표는 멀수록 작아지지만, 내 몸과 카메라의 거리는 늘
 *     1.9m 로 고정이라 배율이 할 일이 없다. 그 거리에 남의 배율(9)을 그대로 쓰면 막대가 화면의 네 배로
 *     커지고, 고개를 내려다볼수록 또 커진다. 그래서 픽셀로 못 박는다 — 자는 남의 것(60×7)의 두 배.
 *     남의 막대가 3m 거리에서 보이는 크기와 비슷하다.
 *
 * `getSuspicion` · `seatId` 는 선택이다 — 물리 테스트 연습판(features/trial 의 PlatformScene, 다른 세션 소유)도 이 몸을
 * 그대로 쓰는데 거기엔 의심도도 처형도 없다. 안 주면 막대도 없고 넘어지지도 않는다.
 *
 * **처형당하면 이 몸도 넘어간다** (scene/Downed) — 남의 몸(SeatAvatar)과 같은 부품, 같은 그림이다.
 * 죽는 법이 나와 남이 다르면 그 홀은 두 규칙으로 도는 셈이다 (/arena 의 처형 행진을 걷어 낸 이유와 같다).
 * 머리 위 의심도 막대는 **같이 안 눕는다** — 나를 끝까지 민 그 100 이 마지막 화면에 서 있어야 왜 쏘는지가
 * 읽힌다 (2026-09-03 사용자, /arena 의 같은 결정).
 */
import { Suspense, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import { Downed } from './Downed';
import { hallGroundAt } from './ground';
import { selfPose } from './selfPose';
import { SuspicionBar } from './SuspicionBar';

export function SelfAvatar({ body, getSuspicion, seatId = null }: { body: BodyId | null; getSuspicion?: () => number; seatId?: string | null }) {
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
  const getSelfPose = () => ({ x: selfPose.x, z: selfPose.z, heading: selfPose.heading });
  // 발판(움직이는 플랫폼) 위도 원판(회전 원판) 위도 공중이 아니다 — SeatAvatar 와 같은 규칙 (scene/ground.ts)
  const getAirborne = () => selfPose.y > hallGroundAt(selfPose.x, selfPose.z, selfPose.y) + 0.02;
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {/* 그림자는 안 눕는다 — 넘어가는 것은 몸뿐이고 그림자는 늘 바닥에 붙어 있다 */}
        <Downed id={seatId} getPose={getSelfPose}>
          {body ? <SoldierAvatar body={body} getAnim={getAnim} getAirborne={getAirborne} /> : <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} />}
        </Downed>
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>

      {/* 내 의심도 — 남의 몸과 같은 높이(2.0). 배율 없이 픽셀 고정 (머리말) */}
      {getSuspicion ? (
        <Html position={[0, 2.0, 0]} center zIndexRange={[10, 0]}>
          <div style={{ pointerEvents: 'none' }}>
            <SuspicionBar getValue={getSuspicion} width={120} height={14} />
          </div>
        </Html>
      ) : null}
    </group>
  );
}
