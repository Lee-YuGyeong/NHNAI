/**
 * 정지선 트랙의 **방 안 배치** — 심문소 홀(src/world/map/interrogation/layout.ts) 좌표계로 적는다.
 *
 * 홀은 z 12(등 뒤 벽) → -20(무대 벽), 무대 앞면 -14. 출발선을 z 10 에 두고 무대 쪽(-z)으로 달린다 —
 * STOPLINE_TRACK_LENGTH(24) 가 딱 무대 앞면에서 끝난다. 레인은 x 방향으로 나란히: 실제 사람은 좌석 순서로
 * 앞 세 레인, AI 좌석(SUBJECT_nn)은 그 옆 세 레인.
 *
 * 서버는 이 파일을 모른다 — 판정은 거리(m)로만 하고(worker/src/trial/stopline.ts), 어느 레인의 어느 z 인지는
 * 순전히 화면의 일이다.
 */
import { ROOM_MAX_PLAYERS, STOPLINE_TARGET, STOPLINE_TRACK_LENGTH } from '@/world/mp/constants';

export const START_Z = 10;
export const LANE_GAP = 2.2;
/** 실제 사람 자리 + AI 자리. AI 는 runtime.ts 의 TRIAL_PARTY_SIZE(4) - 실제 인원이라 최대 3 */
export const LANES = ROOM_MAX_PLAYERS + 3;

export function laneX(lane: number): number {
  return (lane - (LANES - 1) / 2) * LANE_GAP;
}

/** 출발선에서 distance(m) 만큼 달린 자리의 z */
export function zAt(distance: number): number {
  return START_Z - distance;
}

export const TARGET_Z = zAt(STOPLINE_TARGET);
export const END_Z = zAt(STOPLINE_TRACK_LENGTH);

/** "SUBJECT_01" → 레인 3, "SUBJECT_02" → 4 … 실제 사람은 좌석(1~3) - 1 */
export function laneForAi(id: string): number | null {
  const m = /^SUBJECT_(\d+)$/.exec(id);
  return m ? ROOM_MAX_PLAYERS + (Number(m[1]) - 1) : null;
}
