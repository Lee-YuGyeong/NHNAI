/**
 * 내 몸의 자세 — features/trial 의 common/selfPose.ts 와 같은 자리 (chase.ts 머리말 — 다른 세션 소유라 옮겨 왔다).
 * FreeRig · StopRig 가 매 프레임 쓰고, SelfAvatar 가 읽어 내 로봇을 그린다.
 */
import type { AnimState } from '@/world/mp/protocol';

export interface SelfPose {
  x: number;
  z: number;
  /** 발 높이 — 점프 중이면 > 0. SeatAvatar 가 남의 몸에 쓰는 y 와 같은 규약(그 자리 바닥 기준) */
  y: number;
  heading: number;
  anim: AnimState;
}

export const selfPose: SelfPose = { x: 0, z: 0, y: 0, heading: Math.PI, anim: 'idle' };
