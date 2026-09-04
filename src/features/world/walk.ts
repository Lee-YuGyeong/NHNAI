/**
 * 걸어다니는 몸의 **길 찾기 조각** — 순수 함수다 (three.js·React 를 안 쓴다. tests/features/world/walk.test.ts 가 그대로 돌린다).
 *
 * 중앙 시설의 경비(AgentRobot)와 검증실 줄(Chapter2Scene 의 QueueUnit)은 목표를 향해 **직선으로** 걸었다.
 * 홀 한가운데 코어(팔각 충돌, 외접 반경 ≈ 5.4)가 서 있어서, 문 앞 검문 자리·재배치 자리로 가는 직선이
 * 코어를 관통하면 몸이 코어 면에 붙어 **제자리 걸음**을 했다 (2026-08-31 사용자: "가운데 코어에 걸려서 계속 그 자리를 걷는다").
 * 줄에 선 넷은 아예 충돌 판정이 없어 **벽을 뚫고** 지나갈 수 있었다.
 *
 * 그래서 둘을 나눠 고친다:
 *   steerAround  — 코어 같은 원형 금지 구역을 **미리** 접선으로 돌아간다 (부딪히기 전에 튼다)
 *   contactSlide — 그래도 벽·가구에 닿으면 접촉면을 따라 옆으로 비껴 걷는다 (모서리를 돌아 나간다)
 */

/** 돌아가야 하는 원형 구역 — 중심과 반경(몸 반지름·여유를 이미 더한 값) */
export interface Zone {
  x: number;
  z: number;
  r: number;
}

/** 벽에 닿아 비껴 걷는 방향을 유지하는 시간(초) — 모서리를 돌아 나갈 만큼만 */
export const SLIDE_S = 0.6;

/** 걷는다면서 실제로 못 나아가는 속도(m/s) — 이보다 느리면 막힌 것으로 본다 */
export const STUCK_MPS = 0.15;
/** 이만큼 막히면 걸음을 멈추고 선다 — 제자리 걸음은 사람 눈에 곧바로 걸린다 (2026-08-30 사용자) */
export const STUCK_STOP = 0.5;
/** 더 오래 막히면 도는 쪽을 뒤집는다(직선 순찰은 방향을 튼다) — 벽·코어를 향해 영원히 걷지 않게 */
export const STUCK_TURN = 2;

/**
 * 목표로 갈 단위 방향 — 가는 길에 금지 구역이 있으면 그 원의 **접선**으로 튼다.
 * 이미 구역 안이면 밖으로 나가는 방향을 준다. 방향 규약은 화면과 같다: (x, z) = (sin θ, cos θ).
 *
 * side 는 정면으로 마주쳤을 때(중심이 목표 방향과 정확히 겹칠 때) 어느 쪽으로 돌지 — 몸마다 갈라 두면 서로 안 엉킨다.
 */
export function steerAround(x: number, z: number, tx: number, tz: number, zones?: readonly Zone[], side: 1 | -1 = 1): { dx: number; dz: number } {
  let dx = tx - x;
  let dz = tz - z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  if (!zones?.length) return { dx, dz };
  for (const zone of zones) {
    // 목표가 구역 안이면 돌아갈 수 없다 — 곧장 간다 (플레이어가 단 위에 올라섰을 때. 안 그러면 경비가 영영 못 닿아 검문이 멈춘다)
    if (Math.hypot(zone.x - tx, zone.z - tz) <= zone.r) continue;
    const cx = zone.x - x;
    const cz = zone.z - z;
    const d = Math.hypot(cx, cz);
    if (d < 1e-4) continue;
    // 구역 안에 들어와 있다 — 목표보다 먼저 밖으로 나간다
    if (d <= zone.r) return { dx: -cx / d, dz: -cz / d };
    const ahead = cx * dx + cz * dz;
    if (ahead <= 0) continue; // 등 뒤다
    if (ahead >= len) continue; // 목표가 구역 앞이다 — 길에 안 걸린다
    if (Math.abs(cx * dz - cz * dx) >= zone.r) continue; // 스쳐 지나간다
    const cross = cx * dz - cz * dx; // = sin(중심각 − 목표각)
    const turn = cross !== 0 ? -Math.sign(cross) : side;
    const a = Math.atan2(cx, cz) + turn * Math.asin(Math.min(1, zone.r / d));
    dx = Math.sin(a);
    dz = Math.cos(a);
  }
  return { dx, dz };
}

/**
 * 벽에 밀려났을 때 따라 걸을 방향 — 접촉면의 접선 둘 중 **목표 쪽**을 고른다.
 * 정면으로 박았으면(접선 둘 다 목표와 직각) 하던 쪽(prev)을, 그것도 없으면 side 를 쓴다.
 *
 * @param nx,nz   밀려난 방향(접촉면 법선, 단위)
 * @param aimX,aimZ 가려던 방향(단위)
 */
export function contactSlide(nx: number, nz: number, aimX: number, aimZ: number, prev: { x: number; z: number } | null, side: 1 | -1 = 1): { x: number; z: number } {
  const tx = -nz;
  const tz = nx;
  const dot = tx * aimX + tz * aimZ;
  const keep = prev ? tx * prev.x + tz * prev.z : 0;
  const turn = Math.abs(dot) > 0.05 ? Math.sign(dot) : keep !== 0 ? Math.sign(keep) : side;
  return { x: tx * turn, z: tz * turn };
}
