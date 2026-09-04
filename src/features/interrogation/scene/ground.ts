/**
 * 발밑 바닥 높이 — 홀에는 바닥이 셋이다: 홀 바닥(0) · 움직이는 발판(PAD_TOP) · 회전 원판 윗면(DISC_TOP).
 *
 * 아바타는 이 값으로 「공중인가」를 가린다. 이게 없으면 원판 위에 선 몸(y = 0.75)이 전부 **점프 중**으로
 * 읽혀 서 있는 내내 뛰는 클립이 돈다 — 발판 때 이미 겪은 문제라(SeatAvatar 의 getAirborne) 같은 자리에서
 * 같은 방식으로 푼다. 시험마다 무대가 하나뿐이라 둘이 겹칠 일은 없지만, 겹쳐도 높은 쪽이 이긴다.
 */
import { DISC_CENTER, DISC_R, DISC_TOP } from '@/world/mp/constants';
import { discState } from '@/features/trial/games/disc/discState';
import { platformState } from './platformState';

/** 원판이 서 있고 (x, z) 가 원판 위면 그 윗면, 아니면 0 */
function discGroundAt(x: number, z: number): number {
  if (!discState.has()) return 0;
  return Math.hypot(x - DISC_CENTER.x, z - DISC_CENTER.z) <= DISC_R ? DISC_TOP : 0;
}

export function hallGroundAt(x: number, z: number, feetY: number, now = Date.now()): number {
  return Math.max(platformState.groundAt(x, z, feetY, now), discGroundAt(x, z));
}
