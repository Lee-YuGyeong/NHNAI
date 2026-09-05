/**
 * 내 몸 — 3인칭 (카메라·조작은 features/trial 의 common/SelfAvatar.tsx 짜임 그대로다, 2026-09-04 사용자:
 * "물리게임 3인칭 … 그대로 가져다가 쓰고싶어"). 몸 자체는 로봇이 아니다 — 남의 몸(SeatAvatar)과 똑같이
 * 서버가 배정한 군인(SoldierAvatar)을 쓴다 (2026-09-04 사용자: "로봇트 하지말라고, 사람 모양 노원상이
 * 해준거 그대로 쓰라고"). 옛 워커라 몸이 없을 때만 로봇으로 대신한다 — SeatAvatar 와 같은 대체 규칙.
 *
 * **머리 위에 내 의심도 막대**가 붙는다 (2026-09-05 사용자: "내 의심도도 내 머리 위에 보이게 해줘") —
 * 남의 몸과 같은 부품(SuspicionBar.tsx)이라 색·눈금이 같은 규칙으로 읽힌다. 다른 점 둘:
 *
 *   · **말풍선은 있다** (2026-09-05 사용자: "내 대화 친 것도 말풍선 보이게") — 내가 친 말이 서버를 돌아오면
 *     남의 것과 같은 상자(ChatBubble)가 막대 위에 뜬다 — 남의 것과 같은 자리, 같은 아래 꼬리다 (옆으로 비켜 세운
 *     판은 「옆으로 설 때가 있다」로 돌아와 걷었다, 2026-09-05 사용자). 글은 selfBubble 이 들고, 다시 그리는 신호는
 *     남의 것과 같은 bubbleTick 이다. 크기는 한 벌 크다(big) — 픽셀 고정이라 남의 것 크기로 두면 1.9m 앞의
 *     내 몸 옆에서 너무 작다 (2026-09-05 사용자: "대화 텍스트창 너무 작은데").
 *   · **이름표는 없다** — 내 이름은 내가 안다. 카메라가 1.9m 뒤(chase.ts)라 머리 위 글씨는 시야 한가운데를
 *     가릴 뿐이다. 막대만 있으면 된다.
 *   · **거리 배율(distanceFactor)을 안 쓴다** — 남의 표는 멀수록 작아지지만, 내 몸과 카메라의 거리는 늘
 *     1.9m 로 고정이라 배율이 할 일이 없다. 그 거리에 남의 배율(9)을 그대로 쓰면 막대가 화면의 네 배로
 *     커지고, 고개를 내려다볼수록 또 커진다. 그래서 픽셀로 못 박는다 — 자는 남의 것(60×7)의 두 배.
 *     남의 막대가 3m 거리에서 보이는 크기와 비슷하다.
 *
 * `getSuspicion` 은 선택이다 — 물리 테스트 연습판(features/trial 의 PlatformScene, 다른 세션 소유)도 이 몸을
 * 그대로 쓰는데 거기엔 의심도가 없다. 안 주면 막대도 없다.
 */
import { Suspense, useEffect, useReducer, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { SoldierAvatar } from '@/world/avatar/SoldierAvatar';
import type { BodyId } from '@/world/mp/bodies';
import { ChatBubble } from './ChatBubble';
import { hallGroundAt } from './ground';
import { selfBubble } from './selfBubble';
import { selfPose } from './selfPose';
import { SuspicionBar } from './SuspicionBar';

/** 내 막대의 높이(m) — 모델 키(SoldierAvatar TARGET_HEIGHT 1.72) 바로 위. 막대 반높이(7px)가 헬멧에 닿지 않을 만큼만 띄운다 */
const SELF_BAR_Y = 1.8;

export function SelfAvatar({ body, getSuspicion, bubbleTick = 0 }: { body: BodyId | null; getSuspicion?: () => number; bubbleTick?: number }) {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);

  // 내 말풍선 — 수명이 끝나는 그 시각에 한 번 다시 그린다 (SeatAvatar 와 같은 수법). bubbleTick 은 새 말이 왔다는 신호다
  const bubble = selfBubble.at(performance.now());
  void bubbleTick;
  const [, expire] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!bubble) return;
    const left = selfBubble.until - performance.now();
    if (left <= 0) return;
    const id = window.setTimeout(expire, left + 16);
    return () => window.clearTimeout(id);
  }, [bubble, bubbleTick]);
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
  // 발판(움직이는 플랫폼) 위도 원판(회전 원판) 위도 공중이 아니다 — SeatAvatar 와 같은 규칙 (scene/ground.ts)
  const getAirborne = () => selfPose.y > hallGroundAt(selfPose.x, selfPose.z, selfPose.y) + 0.02;
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {body ? <SoldierAvatar body={body} getAnim={getAnim} getAirborne={getAirborne} /> : <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} />}
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>

      {/*
        내 의심도 — 헬멧 바로 위(SELF_BAR_Y). 배율 없이 픽셀 고정 (머리말).
        남의 몸과 같은 2.0 에 뒀더니 벽 화면 높이까지 떠 보였다 (2026-09-05 사용자: "내 캐릭터의 의심바가 너무 높아") —
        모델 키가 1.72 라 머리 위 0.28m 인데, 카메라가 1.9m 뒤에 바짝 붙어 있어 그 틈이 화면에서 100px 가까이 된다.
        남의 것은 이름표·말풍선이 같이 서고 거리 배율로 작아지므로 2.0 이 맞고, 내 것은 막대 하나라 머리에 붙인다.
      */}
      {getSuspicion || bubble ? (
        /* z 는 남의 것(10~0)보다 위 — 내 몸이 카메라에 제일 가까우니 내 표가 남의 표에 가려지면 안 된다 */
        <Html position={[0, SELF_BAR_Y, 0]} center zIndexRange={[20, 11]}>
          <div style={{ position: 'relative', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ChatBubble text={bubble} big />
            {getSuspicion ? <SuspicionBar getValue={getSuspicion} width={120} height={14} /> : <span style={{ display: 'block', width: 120, height: 14 }} />}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
