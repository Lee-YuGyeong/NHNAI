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

/** 낙하 생존 3구간의 중력(m/s²) — 100% · 60% · 140%. 1구간이 기준. 공기저항·반발은 공마다 공개 표(mp/constants FALL_BALLS)다 */
export const FALL_GRAVITY: readonly number[] = [9.8, 5.88, 13.72];

/** 색 사냥 3라운드의 차단 파장. PR2(색 사냥)에서 쓴다. */
export const COLORHUNT_BLOCK: readonly (string | null)[] = [null, 'red', 'green'];

/**
 * 회전 원판 3구간의 표면 마찰계수 — 강판(기준) → 젖은 강판 → 고무 깔개. μg 가 곧 「버틸 수 있는 원심가속도」다:
 * 0.6·9.8 ≈ 5.9 · 3.4 · 8.3 m/s². 각속도 1.6 rad/s 면 버티는 반지름이 2.3m · 1.3m · 3.3m 로 달라진다 (worker/src/trial/disc/sim.ts).
 */
export const DISC_GRIP: readonly number[] = [0.6, 0.35, 0.85];
