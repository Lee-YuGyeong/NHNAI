/**
 * 물리 미니게임의 숨겨진 조건값 — ★ `src/` 밑에서 이 파일을 절대 import 하지 않는다.
 *
 * PLANNING.md P8("물리 테스트의 조건값은 클라이언트에 원값을 절대 내려주지 않는다")을
 * 컨벤션이 아니라 빌드 경계 사실로 강제한다: 클라이언트 코드가 이 파일을 import 하면
 * 그 자체로 설계가 깨졌다는 신호다. 와이어로 나가는 것은 항상 `TrialResultWire`
 * (`src/world/mp/protocol.ts`)뿐이고, 조건값이 실린 `TrialResult`(`./types.ts`)는 여기
 * `worker/src/trial/` 밖으로 넘기지 않는다.
 */

/**
 * 정지선 3라운드의 마찰계수. 1라운드가 기준(콘크리트) — PLANNING §3 "1라운드는 기준 조건으로
 * 진행한다: 평상시 기록이 있어야 조건이 바뀌었을 때 편차가 보인다."
 */
export const STOPLINE_FRICTION: readonly number[] = [0.6, 0.05, 0.9];

/** 낙하 생존 3구역의 중력(m/s²). PR3(낙하 생존)에서 쓴다 — 지금은 표만 미리 고정해 둔다. */
export const FALL_GRAVITY: readonly number[] = [9.8, 5.88, 13.72];

/** 색 사냥 3라운드의 차단 파장. PR2(색 사냥)에서 쓴다. */
export const COLORHUNT_BLOCK: readonly (string | null)[] = [null, 'red', 'green'];
