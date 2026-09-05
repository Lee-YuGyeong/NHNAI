/**
 * 무너지는 타워 생존 — 클라이언트(무대 · HUD)와 워커(엔진 · 봇)가 **같이 보는** 순수 파일 (mp/blast.ts · mp/platform.ts 와 같은 규칙).
 * three 를 끌어오지 않는다.
 *
 * 홀 가운데 마당에 높이 TOWER_TOP 의 탑이 서고, 그 위에 발판(강판) 5×5 가 격자로 깔린다. 발판 하나는 가운데 기둥 위에 얹혀 있어
 * **무게가 한쪽으로 몰리면 그쪽으로 기울고**(토크 · 중심 이동), 기울기가 TOWER_TILT_BREAK 를 넘으면 떨어져 나간다(무너짐).
 * 8초부터는 바깥 고리의 발판이 하나씩 경고(TOWER_WARN_MS 동안 붉게 깜박임) 뒤 떨어진다 — 설 곳이 가운데로 좁아진다.
 * 사람은 서로 밀 수 있다(E) — 밀린 몸은 발판 위를 미끄러지고, 끝을 넘으면 떨어진다. 끝까지 안 떨어지면 이긴다.
 * 뛸 수 있다(Space, 2026-09-05 사용자) — 몸의 점프 속도(mp/bodies.ts)로 뜨고, 달리며 뛰면 빈 자리 한 칸을 건넌다. **착지는 충격**이다:
 * 발판 중심에서 떨어진 자리에 내려앉으면 그 무게 × 속도 × 거리만큼 발판이 기운다(TOWER_IMPACT_K) — 닳은 발판 끝에 뛰어내리면 무너진다.
 * 발판이 **전부** 떨어지면 그 순간 판을 닫고 기록을 띄운다 — 남은 시간을 기다리지 않는다.
 *
 * 평평한 땅이 아니다 (2026-09-05 사용자: "타워가 평평하지 않고 좀 더 트리거가 있었으면"):
 *   계단   고리마다 높이가 다르다 — 가운데가 가장 높고 바깥으로 TOWER_STEP 씩 낮다(ringBaseY). 가운데로 올라가는 것이 곧 살아남는 길이다.
 *   마모   서 있는 발판은 닳는다 — 무게 × 시간으로 wear 가 차고(사람 하나가 TOWER_WEAR_S 초 서면 1), 차면 경고 뒤 떨어진다.
 *          닳을수록 가라앉고 붉어진다. 한 자리에 오래 서 있을 수 없다 — 옮겨 다녀야 한다.
 *   진동   TOWER_QUAKE_EVERY_MS 마다 탑이 흔들린다 — 1초 전부터 발판이 떨고(경고), 그 순간 전 발판의 기울기에 무작위 각속도가 얹히고
 *          전원의 발에 무작위 미끄러짐이 얹힌다. 미끄러운 구간에 진동이 오면 끝까지 밀린다.
 *
 * 물리 (사용자 스펙 "중력 + 질량 + 충돌 + 토크 + 중심 이동"):
 *   발판   기울기 벡터 t(낮은 쪽을 가리키고 크기가 tan φ). I·ẗ = g·Σ mᵢdᵢ − c·ṫ − k·t — 무게 mᵢ 가 발판 중심에서 dᵢ 에 서면 그쪽이 내려간다.
 *          k 는 사람 하나가 끝(1.2m)에 서면 9° 에서 멎는 세기 — 둘이면 17°, 셋이면 부서진다(22°). 무거운 몸(mass 1.8)은 둘 몫이다.
 *          감쇠는 임계(ζ≈1) — 처음 800 으로 두었더니 발판이 트램펄린처럼 되튀었다 (2026-09-05 사용자: "무너지는 게 부자연스러워").
 *   몸     기울어진 발판 위에서 발이 미끄러지는 조건은 |t| > μ — μ 가 숨은 조건(worker/src/trial/condition.ts TOWER_GRIP)이다.
 *          밀린 속도도 같은 마찰로 줄어든다: 미끄러운 구간에는 한 번 밀리면 끝까지 간다.
 *   밀치기 앞 TOWER_PUSH_R 안의 몸에 TOWER_PUSH_V × (내 질량 / 그 질량)의 속도. 무거운 몸은 세게 밀고 잘 안 밀린다. 쿨다운 1초, 반동 조금.
 *   충돌   몸끼리 겹치면 질량 반비례로 밀어낸다 (net/remote-players.pushOut 과 같은 규칙).
 *   낙하   발판이 없는 자리(떨어진 발판 · 격자 밖)로 나가면 그 순간 「떨어졌다」 — 홀 바닥(0)까지 포물선으로 떨어져 잠시 누웠다가
 *          가운데 가까운 성한 발판에 다시 선다.
 * 여기 있는 것은 전부 **공개** 값이다 — 격자 · 발판 상태 · 기울기 · 밀치기 힘. 숨은 것은 μ 하나.
 */

export const TOWER_CENTER = { x: 0, z: -1.5 } as const;
/** 격자 한 변의 발판 수 · 발판 한 변(m) · 발판 사이 틈(그리기용) */
export const TOWER_N = 5;
/** 2.0 으로 시작했는데 달리면 0.4초에 한 장을 넘어 자꾸 떨어졌다 (2026-09-05 사용자: "걷는 게 자연스럽지 않아") — 2.6 이면 한 장이 한 걸음의 자리다 */
export const TOWER_SLAB = 2.6;
export const TOWER_GAP = 0.06;
/**
 * 발판 윗면 높이(m) · 발판 두께. 4.5 로 시작했는데 추격 카메라(발 위 약 3.5m)가 /trial 홀의 천장 트러스(7~8m)에 박혔다
 * (2026-09-05 헤드리스 확인) — 3.0 이면 카메라가 6.5m 로 트러스 밑이다. 3m 낙하도 「탑에서 떨어졌다」로 읽힌다
 */
export const TOWER_TOP = 3.0;
export const TOWER_SLAB_H = 0.25;
export const TOWER_BODY_R = 0.35;
export const TOWER_BODY_MASS = 75;
/** 발판 질량(kg) · 중심축 둘레 관성(정사각 판 M·L²/6) · 복원 스프링(N·m/rad) · 감쇠(N·m·s) */
export const TOWER_SLAB_MASS = 400;
export const TOWER_SLAB_INERTIA = (TOWER_SLAB_MASS * TOWER_SLAB * TOWER_SLAB) / 6;
export const TOWER_SPRING = 5600;
/** 임계 감쇠 2·√(k·I) ≈ 3175 */
export const TOWER_DAMPING = 3200;
/** 이 기울기(tan)를 넘으면 발판이 떨어져 나간다 (≈ 22°) */
export const TOWER_TILT_BREAK = 0.4;
/** 계단 — 고리 하나 바깥으로 갈 때 낮아지는 높이(m). 가운데(고리 0)가 TOWER_TOP */
export const TOWER_STEP = 0.45;
/** 마모 — 사람 하나(기준 질량)가 이만큼(s) 서 있으면 발판이 다 닳아 경고가 뜬다. 닳을수록 이만큼(m)까지 가라앉는다 */
export const TOWER_WEAR_S = 9;
export const TOWER_WEAR_SINK = 0.18;
/** 진동 — 첫 진동 · 간격(ms, 최소·최대) · 예고(ms) · 발판 각속도 kick(rad/s) · 발의 미끄러짐 kick(m/s) */
export const TOWER_QUAKE_FROM_MS = 6000;
export const TOWER_QUAKE_EVERY_MS = [8000, 12000] as const;
export const TOWER_QUAKE_WARN_MS = 1000;
export const TOWER_QUAKE_KICK = 2.4;
export const TOWER_QUAKE_SHOVE = 0.9;
export const TOWER_WALK_SPEED = 2.6;
export const TOWER_RUN_SPEED = 4.8;
/** 밀치기 — 닿는 거리(m) · 주는 속도(m/s, 질량비를 곱한다) · 앞쪽으로 보는 폭(내적 문턱) · 쿨다운(ms) · 반동(m/s) */
export const TOWER_PUSH_R = 1.4;
export const TOWER_PUSH_V = 3.6;
export const TOWER_PUSH_ARC = 0.3;
export const TOWER_PUSH_COOLDOWN_MS = 1000;
export const TOWER_PUSH_RECOIL = 0.5;
/** 철거 — 시작 뒤 이때부터, 이 간격으로 바깥 고리의 발판 하나가 경고(TOWER_WARN_MS) 뒤 떨어진다. 가운데 발판은 철거하지 않는다 */
export const TOWER_DEMOLISH_FROM_MS = 8000;
/** 2600 이었는데 마모까지 더해지자 34초에 25장 중 11장만 남았다(헤드리스) — 3200 으로 늦춘다 */
export const TOWER_DEMOLISH_EVERY_MS = 3200;
export const TOWER_WARN_MS = 1800;
/** 떨어진 뒤 다시 서기까지(ms) */
export const TOWER_RESPAWN_MS = 3000;
/** 착지 충격 — 발판 각속도에 더하는 몫: K × (질량비 × 착지 속도 × 중심에서의 거리) / 관성 */
export const TOWER_IMPACT_K = 75;
/** 점프 사이 최소 간격(ms) */
export const TOWER_JUMP_GAP_MS = 250;
export const TOWER_TICK_MS = 50;
export const TOWER_SNAPSHOT_MS = 100;
export const TOWER_WALK_STALE_MS = 1500;
/** 떨어지는 발판을 스냅샷에 싣는 시간(ms) — 클라가 떨어지는 연출을 그린다 */
export const TOWER_FALL_KEEP_MS = 2500;

/** 발판 상태 — 0 성함 · 1 경고(곧 떨어진다) · 2 떨어지는 중 · 3 없다 */
export type SlabState = 0 | 1 | 2 | 3;

const HALF = (TOWER_N * TOWER_SLAB) / 2;
export const TOWER_MIN_X = TOWER_CENTER.x - HALF;
export const TOWER_MIN_Z = TOWER_CENTER.z - HALF;

/** (x, z) 아래 발판 번호(0~24) — 격자 밖이면 −1 */
export function slabIndexAt(x: number, z: number): number {
  const i = Math.floor((x - TOWER_MIN_X) / TOWER_SLAB);
  const j = Math.floor((z - TOWER_MIN_Z) / TOWER_SLAB);
  if (i < 0 || j < 0 || i >= TOWER_N || j >= TOWER_N) return -1;
  return j * TOWER_N + i;
}

export function slabCenter(idx: number): { x: number; z: number } {
  const i = idx % TOWER_N;
  const j = Math.floor(idx / TOWER_N);
  return { x: TOWER_MIN_X + (i + 0.5) * TOWER_SLAB, z: TOWER_MIN_Z + (j + 0.5) * TOWER_SLAB };
}

/** 가운데에서 몇 번째 고리인가 — 가운데 0, 바깥 2 */
export function ringOf(idx: number): number {
  const i = idx % TOWER_N;
  const j = Math.floor(idx / TOWER_N);
  const c = (TOWER_N - 1) / 2;
  return Math.max(Math.abs(i - c), Math.abs(j - c));
}

/** 이웃(상하좌우) 발판 번호들 */
export function neighborsOf(idx: number): number[] {
  const i = idx % TOWER_N;
  const j = Math.floor(idx / TOWER_N);
  const out: number[] = [];
  if (i > 0) out.push(idx - 1);
  if (i < TOWER_N - 1) out.push(idx + 1);
  if (j > 0) out.push(idx - TOWER_N);
  if (j < TOWER_N - 1) out.push(idx + TOWER_N);
  return out;
}

/** 발판의 기준 높이 — 고리마다 계단. 가운데가 TOWER_TOP */
export function ringBaseY(idx: number): number {
  return TOWER_TOP - TOWER_STEP * ringOf(idx);
}

/**
 * 기울어진 발판 위 (x, z) 의 윗면 높이 — t 는 기울기 벡터(낮은 쪽, tan). 발판 중심에서 d 만큼 떨어진 자리는 t·d 만큼 낮다.
 * wear(0~1)만큼 가라앉는다. 클라(발 높이 · 그림자)와 워커(몸의 y)가 같은 식을 쓴다
 */
export function slabSurfaceY(idx: number, tx: number, tz: number, x: number, z: number, wear = 0): number {
  const c = slabCenter(idx);
  return ringBaseY(idx) - wear * TOWER_WEAR_SINK - (tx * (x - c.x) + tz * (z - c.z));
}
