/**
 * 코어 동심원 — **값의 단일 출처.** 레벨 설계 「누가 듣고 있나」 · 중앙 시설, 그리고 「어디서 죽을 것인가」 수치 초안.
 *
 * 중앙 시설의 규칙은 하나다 — **코어까지의 거리가 곧 노출량.** 전파도 조명도 판독도 반지름 하나로 움직인다.
 * 코어권 6 m 에서 건 말은 방 전체에 퍼지고 몸이 다 읽힌다 · 홀 10 m 가 기본값 · 벽 그늘은 ×0.4 에 어둡다.
 * 그 배율을 죽음에도 물린다 — 많이 목격되는 자리가 곧 살 가능성이 높은 자리다. 조용히 죽을 것인가, 보이며 살 것인가.
 *
 * ★ 레벨 문서가 수치의 기준이듯 코드에서는 **이 파일이 기준이다.** 배율 · 반경 · 콘솔 비용 · 경보 +25 · 어둠 40 % / 4 m / 2 분 ·
 *   도주각 ±35° — execution · fragments · scenario2 · central2 어디에도 같은 숫자를 다시 적지 않는다. 두 곳에 적히는 순간
 *   밸런싱이 두 곳을 쫓아다닌다. 코어의 배율을 바꾸고 싶으면 이 파일 하나다.
 * ★ 순수 데이터다. 렌더도 네트워크도 모델도 모른다 — 방(central2)이 어디에 코어를 세우는지도 모른다. 코어 중심은 인자로 받는다.
 *   기본값 CORE_CENTER 는 central2 가 코어를 둘 자리일 뿐, 이 모듈이 지도를 아는 것이 아니다.
 * ★ 경보도는 **아무도 지목하지 않는다**(헌법 9). 처형 +25 · 콘솔 +12 는 위치와 무관하게 고정이다 — 위치가 경보도를 바꾸면
 *   남은 요원들이 죽은 자리를 역산해 서로를 지목한다. 위치는 조각(witnessRadius)에만 남는다.
 */

export type Zone = "core" | "hall" | "shadow";

export interface Vec2 {
  x: number;
  z: number;
}

/** central2 가 코어를 세울 자리 — 모듈이 지도를 아는 게 아니라, 호출자가 안 넘겼을 때의 약속값 */
export const CORE_CENTER: Readonly<Vec2> = { x: 0, z: -10.5 };

/**
 * 동심원 셋 — 「누가 듣고 있나」 · 중앙 시설 01–03 그대로. 새 수치를 만들지 않는다.
 *   r      코어 중심에서의 반경(m). shadow 는 「그 바깥 전부」라 r 이 없다
 *   spread 전파 배율 — 목격 반경 = hall.r × spread
 *   read   판독 — max 몸이 다 읽힌다 · base 기본 · none 내 몸도 남의 마모도 안 읽힌다
 *   light  조명 — 판독과 같이 움직인다 (전파 · 조명 · 판독이 반지름 하나)
 *   reach  개입 가능 **인원** — 이 자리에서 죽으면 나서 줄 수 있는 개체 수의 상한. 거리가 아니다 (INTERVENE_R 참고)
 */
export const FIELD = {
  core: { r: 6, spread: 3, read: "max", light: "max", reach: 6 },
  hall: { r: 10, spread: 1, read: "base", light: "base", reach: 3 },
  shadow: { spread: 0.4, read: "none", light: "dim", reach: 1 },
} as const;

/**
 * 개입 발동 거리(m) — 「어디서 죽을 것인가」 수치 초안: 총을 내리는 1.5 초 안에 사이에 설 수 있는 거리.
 * 락다운이 내 자리를 고정하는 순간 4 m 안의 개체가 목격자 · 감싸 줄 개체 · 개입 후보다 (중앙 시설 06).
 * zone 은 이 거리를 바꾸지 않는다 — zone 이 바꾸는 것은 그 거리 안에 **몇이 서 있을 수 있는가**(FIELD.reach)다.
 */
export const INTERVENE_R = 4;

/** 콘솔 — 중앙 시설 규칙 04. 15 초간 전파 ×0.4 · 조명 하강, 본 개체 전원 태도 −1, 경보 +12. 소리를 지르는 것과 같다 */
export const CONSOLE = {
  dimMs: 15_000,
  spread: 0.4,
  attitude: -1,
  alert: 12,
} as const;

/** 처형 시 경보도 증가 — 위치 무관 고정 (헌법 9). 의심도 단일 증가 상한 25 와 같은 값이라 한 번에 문턱 둘을 못 넘긴다 */
export const DEATH_ALERT = 25;

/** 어둠 국면 — 중앙 시설 08. 코어 출력 하강: 조명 40 % · 판독 4 m · 전파 ×1 · 문 ② 는 2 분 뒤 열린다. 콘솔은 이 국면에서 무효 */
export const DARK = {
  light: 0.4,
  read: 4,
  spread: 1,
  durationMs: 120_000,
} as const;

/**
 * 락다운 — 중앙 시설 06. 「위치를 고수하라」 허용 이동 0.6 m, 그 이상 움직이면 의심도 +10.
 * interveneR 는 INTERVENE_R 과 같은 수 — 락다운이 개입 반경을 고정한다는 뜻이지 다른 값이 아니다
 */
export const LOCKDOWN = {
  holdM: 0.6,
  suspicion: 10,
  interveneR: INTERVENE_R,
} as const;

/** 벽 그늘 서성임 — 중앙 시설 03. 조용히 말 걸 유일한 자리이자, 그래서 30 초 넘게 서성이면 그 자체가 수상하다 (본 개체 태도 −1) */
export const SHADOW_LINGER = { ms: 30_000, attitude: -1 } as const;

/** 코어권에서 몸이 읽힐 때의 의심도 — 몸이 다 읽히는 자리라 안 닳은 몸이 그대로 값이 된다. 작게, 대신 머무는 동안 계속 */
export const CORE_READ_SUSPICION = 2;

/**
 * 도주 판정 각 — 문 방향 ±35° 만 도주다. 그 외의 이동은 자유 (「어디서 죽을 것인가」 개정 3).
 * 플레이테스트 항목: 개체 쪽으로 가는데 도주로 찍히는 오판정이 한 번이라도 나오면 좁힌다. 그래서 상수다
 */
export const FLEE_ANGLE_DEG = 35;

/**
 * 여덟 걸음의 「관측 수준 하향」 — 집행 설계 「걸어오는 것」의 두 값. 둘 다 **내리는 값**이다(100 에서 시작하는 걸음이라):
 *   answered 90  걸음 4–5 에 개체가 말로 막고, 한 번 더 물은 데 내가 답했을 때
 *   spared   60  걸음 8 에 「나를 위해 나선 적 있다」 개체가 대신 부서졌을 때
 * 절댓값이지만 올리는 쪽으로는 안 쓴다 — 의심도 단일 증가 25 상한(헌법 13)은 여기서도 그대로다
 */
export const EXEC_LOWER = { answered: 90, spared: 60 } as const;

/**
 * 소각로 — 대본 THE_FURNACE 의 수. 8 초 동안 목표가 안 뜨고, 막으면 의심 +30(D12 — 대본이 정한 사건이라 25 관례를 깬다) ·
 * 경보 +15 · 본 개체 전원 +1 · A-063 +3 한 번에. 안 막으면 0 / 0 / A-063 선(cross).
 * 막는 법 둘: 걷는 A-201 과 1.2 m 안(몸) · A-201 이 4 m 안일 때 말(D11)
 */
export const FURNACE = {
  ms: 8000,
  suspicion: 30,
  alert: 15,
  witness: 1,
  u063: 3,
  bodyM: 1.2,
  sayM: 4,
} as const;

/**
 * 작업 두 주기 — WORK_STATION 2 m 안 누적 40 초 × 2 (D14). 소각로는 첫 주기 누적 12 초에, 안 오면 진입 25 초 폴백.
 * LEAVE_WORK 는 두 주기 끝 또는 소각로 해결 150 초 뒤 — 어느 쪽이든 문은 결국 열린다
 */
export const WORK_CYCLE = {
  ms: 40_000,
  cycles: 2,
  stationM: 2,
  firstFireMs: 12_000,
  fallbackMs: 25_000,
  leaveAfterMs: 150_000,
} as const;

/**
 * 경비의 말 걸기(OPENERS) — 의심도 20 을 넘는 순간 한 줄, 판당 한 번. 그 뒤 잡담은 75 초마다 40 %, 3 m 안을 지날 때.
 * 무응답 18 초 +8 · 보고 수용 −16 · 스캔(60) 3.8 초 · 0.45 m 넘게 움직이면 실패 +16(본판 scan FAIL 과 같은 값, D26).
 * 이유의 우선순위(D10)도 여기 수다 — 직전 5 초 안의 발화가 「발화」, 벽화를 3 초 넘게 본 것이 「그림」
 */
export const OPENER = {
  at: 20,
  chatMs: 75_000,
  chatChance: 0.4,
  chatM: 3,
  silentMs: 18_000,
  silent: 8,
  accept: -16,
  standM: 1.8,
  scanM: 2,
  scanMs: 3800,
  scanMoveM: 0.45,
  scanFail: 16,
  sayWindowMs: 5000,
  gazeMs: 3000,
} as const;

/**
 * 개체가 나를 보는 시간(ms) — 복도의 NOTICE 응시와 작업 구역의 「앞이 그은 것」이 같은 1.2 초다.
 * 같은 수가 두 파일에 적혀 있으면 하나만 고쳐지는 날이 온다 — 그래서 여기 하나다 (corridor 와 furnace 가 여기서 가져다 쓴다)
 */
export const STARE_MS = 1200;

/** 말을 걸 수 있는 거리(m) — scenario2.TALK_DIST 와 같은 수. 기록 복도의 THE_OTHER_HAND 가 「곁」을 이 수로 잰다 */
export const TALK_DIST_M = 2.6;

function dist(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 코어 중심 거리로만 판정한다 — 경계 위(정확히 6 m · 10 m)는 안쪽 구역이다. 문턱을 밟은 건 아직 안 나간 것 */
export function zone(
  pos: Readonly<Vec2>,
  center: Readonly<Vec2> = CORE_CENTER,
): Zone {
  const d = dist(pos, center);
  if (d <= FIELD.core.r) return "core";
  if (d <= FIELD.hall.r) return "hall";
  return "shadow";
}

/**
 * 목격 반경(m) — fragments 가 부른다. 홀 10 m 가 기본값이고 배율이 그것을 늘리고 줄인다:
 * 코어 30(방 전체) · 홀 10 · 그늘 4. 콘솔 · 어둠 국면은 호출자가 spread 를 따로 곱한다 (CONSOLE.spread · DARK.spread)
 */
export function witnessRadius(z: Zone): number {
  return FIELD.hall.r * FIELD[z].spread;
}

/**
 * 개입 반경(m) — execution 이 부른다. zone 과 무관하게 INTERVENE_R 이다.
 * 반경을 zone 으로 줄이면 그늘에서 곁에 선 +3 개체가 1 m 밖이라 못 나서는 판이 생긴다 — 그건 「나서 줄 개체가 없다」가
 * 아니라 「있는데 못 나선다」라서 설명이 안 되는 죽음이다. 그늘이 조용한 이유는 거리가 아니라 머릿수(reachCount)여야 한다
 */
export function interveneRadius(_z: Zone): number {
  return INTERVENE_R;
}

/** 개입 가능 인원 상한 — 코어 6 · 홀 3 · 그늘 1. 반경 안에 그보다 많이 서 있어도 나서는 건 여기까지 */
export function reachCount(z: Zone): number {
  return FIELD[z].reach;
}

/**
 * 이동이 도주인가 — 이동 방향과 나→문 방향 사이 각이 ±FLEE_ANGLE_DEG 안이면 도주.
 * 제자리(dir 0) · 문 위에 서 있음(me = door) 은 방향이 없으니 도주가 아니다 — 판정을 못 하면 무죄다
 */
export function isFleeDirection(
  dir: Readonly<{ dx: number; dz: number }>,
  me: Readonly<Vec2>,
  door: Readonly<Vec2>,
): boolean {
  const len = Math.hypot(dir.dx, dir.dz);
  const tx = door.x - me.x;
  const tz = door.z - me.z;
  const tlen = Math.hypot(tx, tz);
  if (len === 0 || tlen === 0) return false;
  const cos = (dir.dx * tx + dir.dz * tz) / (len * tlen);
  return cos >= Math.cos((FLEE_ANGLE_DEG * Math.PI) / 180);
}

/** 반경 안의 개체 id — 순서는 입력 그대로. 반경 위(정확히 radius)는 안쪽이다, zone 과 같은 약속 */
export function witnessesWithin(
  units: ReadonlyArray<{ id: string; x: number; z: number }>,
  me: Readonly<Vec2>,
  radius: number,
): string[] {
  return units.filter((u) => dist(u, me) <= radius).map((u) => u.id);
}

/**
 * 엿듣기 — 배회 개체 둘이 스치며 주고받는 두 마디 (대본 v7 OVERHEAR · D5). 값은 여기 하나다:
 *   perRun  판당 횟수 — 문서의 기본 3 (튜닝 2~5)
 *   meetM   둘이 이 안에 들면 「스쳤다」 — 복도 배회 선(±0.7)의 간격 1.4 가 이 안이어야 한다 (patrol.ts BEATS.corridor)
 *   replyMs 첫 마디 뒤 둘째 마디까지
 */
export const OVERHEAR_RULE = { perRun: 3, meetM: 1.5, replyMs: 1200 } as const;
