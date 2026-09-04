/**
 * 정지선의 **공개** 가속 구간 공식 — worker/src/trial/stopline.ts 와 같은 식이지만
 * 여기서 새로 적는다. 그쪽 파일은 condition.ts(숨겨진 마찰값)를 import 하므로, 클라이언트가
 * 그 파일을 조금이라도 끌어오면 마찰표가 번들에 실려 나간다(P8 위반). 마찰이 전혀 안 들어가는
 * 가속 구간만 이렇게 따로 둔다 — 브레이크 이후(정지 지점)는 서버가 준 값을 그대로 쓴다.
 */

import { STOPLINE_ACCEL, STOPLINE_TOP_SPEED } from '@/world/mp/constants';

const T_TOP = STOPLINE_TOP_SPEED / STOPLINE_ACCEL;
const DIST_TO_TOP = 0.5 * STOPLINE_ACCEL * T_TOP * T_TOP;

/** accel 시작 후 elapsed(ms) 만큼 달렸을 때 출발선 기준 이동 거리(m). */
export function runDistance(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs) / 1000;
  if (t <= T_TOP) return 0.5 * STOPLINE_ACCEL * t * t;
  return DIST_TO_TOP + STOPLINE_TOP_SPEED * (t - T_TOP);
}

/** runDistance 의 역함수 — 이 거리까지 달리는 데 걸리는 시간(ms). 달리기 시작 알림을 놓쳤을 때 출발 시각을 역산한다 */
export function runTimeMs(distance: number): number {
  const d = Math.max(0, distance);
  if (d <= DIST_TO_TOP) return Math.sqrt((2 * d) / STOPLINE_ACCEL) * 1000;
  return (T_TOP + (d - DIST_TO_TOP) / STOPLINE_TOP_SPEED) * 1000;
}
