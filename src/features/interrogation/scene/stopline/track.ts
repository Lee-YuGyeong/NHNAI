/**
 * 정지선 트랙의 **방 안 배치** — 심문소 홀(src/world/map/interrogation/layout.ts) 좌표계.
 * features/trial 의 track.ts 와 같은 트랙이지만 레인이 다르다: 이 판에서는 **좌석 번호(1..N)가 곧 레인**이다 —
 * 실제 사람 · 대역 · AI 가 같은 줄에 나란히 선다. 어느 레인이 사람인지 트랙은 모른다.
 *
 * 서버는 이 파일을 모른다 — 판정은 거리(m)로만 하고, 어느 레인의 어느 z 인지는 순전히 화면의 일이다.
 */
import { STOPLINE_TARGET, STOPLINE_TRACK_LENGTH } from '@/world/mp/constants';

export const START_Z = 10;
export const LANE_GAP = 2.2;
/** 좌석 상한 — 사람 8 + AI 1 (PLANNING §1.1) */
export const LANES = 9;
/** 한 테스트에서 허용되는 시행 수 상한 — 서버(worker/src/trial)와 같은 값. 화면은 이걸로 W 를 더 받을지 본다 */
export const MAX_ATTEMPTS = 9;

export function laneX(lane: number): number {
  return (lane - (LANES - 1) / 2) * LANE_GAP;
}

/** 출발선에서 distance(m) 만큼 달린 자리의 z */
export function zAt(distance: number): number {
  return START_Z - distance;
}

export const TARGET_Z = zAt(STOPLINE_TARGET);
export const END_Z = zAt(STOPLINE_TRACK_LENGTH);
