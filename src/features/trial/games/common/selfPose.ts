/**
 * 내 몸의 자세 — 프레임마다 바뀌는 값이라 Redux 밖(가변)이다 (src/world/core/WorldState.ts 규칙).
 * 리그(TrialRig · DodgeRig)가 매 프레임 쓰고, SelfAvatar 가 읽어 내 로봇을 그린다.
 * 3인칭이라 내 몸이 보인다 (2026-09-04 사용자: "3인칭으로 만들어줘. 내 뒷모습 앞에 보이게").
 */
import type { AnimState } from '@/world/mp/protocol';

export interface SelfPose {
  x: number;
  z: number;
  /** 발 높이 — 점프 중이면 > 0 */
  y: number;
  /** 몸이 보는 방향(rad) — 아바타의 앞면은 로컬 +z 라 rotation.y 에 그대로 넣는다 */
  heading: number;
  anim: AnimState;
}

export const selfPose: SelfPose = { x: 0, z: 0, y: 0, heading: Math.PI, anim: 'idle' };
