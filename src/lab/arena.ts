/**
 * 아레나 — 시행(몸 쓰는 검사)이 벌어지는 **2D 평면**.
 *
 * ★ 3D 월드(src/world, features/world, worker/room-do)와 **아무것도 공유하지 않는다.**
 *   좌표계도 여기서 따로 정의한다. 저쪽은 저쪽대로 두고 이쪽만 굴린다.
 *
 * 규칙은 하나뿐이다: **정확히 T초에 자기 지점에 도착한다.**
 * 조작도 하나뿐이다 — 언제 출발할지. 거리가 제각각이라 남을 보고 따라 출발하면 반드시 틀린다.
 * (기계는 거리/속도를 계산해서 출발하고, 사람은 눈대중으로 한다. 그 차이가 이 검사의 전부다)
 */

/**
 * 아레나 = 격납고 홀(창고 3D 맵) 바닥. 숫자는 3D 격납고 홀(src/world/map/warehouse/layout.ts)의 실제 치수를
 * 벽(±12 · -20~12)에서 0.6 들여 **값으로 옮겨 적은 것**이다. (2026-08-30 심문소 → 창고 3D 맵. 게임은 그대로다)
 * import 하지 않는다 — 이 파일은 워커에서도 번들되므로 three.js 를 끌어오면 빌드가 깨진다.
 *
 * ★ 베낀 값이라 어긋날 수 있다. 사람은 3D 맵의 충돌 박스에 막히고 개체는 이 사각형 안을 걷는데,
 *   둘이 갈라지면 **한쪽만 벽을 통과하는** 그림이 된다 (2026-09-01 사용자). 두 수가 같은지는
 *   tests/features/arena/inside-room.test.ts 의 「방의 선과 진짜 벽」이 지킨다.
 */
export const ARENA = {
  minX: -11.4,
  maxX: 11.4,
  minZ: -19.4,
  maxZ: 11.4,
} as const;

export interface Pt {
  x: number;
  z: number;
}

/** 이동 속도(m/s). 전원 동일 — 그래서 출발 시각만 남는다 */
export const SPEED = 2.6;

/** 옆벽에 붙은 콘솔 16개 (layout.ts CONSOLE_BAYS × 양쪽, x = ±(12 − 0.35)). 지점을 여기 겹치게 두면 검증에서 걷어낸다 */
export const PILLARS = [-18, -14, -10, -6, -2, 2, 6, 10].flatMap((z) => [
  { x: -11.65, z },
  { x: 11.65, z },
]);

/**
 * 전원이 출발하는 자리 = 격납고 홀 스폰 원 중심 (layout.ts: 중심 (0,-2.5) 반지름 3.4).
 * 스폰 원 위에는 아무것도 놓지 않는다는 것이 맵의 규칙이라, 여기는 항상 빈 바닥이다.
 */
export const START: Pt = { x: 0, z: -2.5 };

/** 지점에 이만큼 가까워지면 도착으로 친다 */
export const ARRIVE_RADIUS = 0.9;

/**
 * 두 몸의 중심이 이보다 가까우면 겹쳐 보인다(m) — 몸끼리는 서로를 통과하지 못하고
 * 겹친 만큼 밀려난다 (features/arena/separate 의 separateBots).
 *
 * 3D 쪽 몸 반지름의 두 배(arena3d/net/remote-players 의 BODY_R 0.43)를 **값으로 옮겨 적은 것**이다 —
 * ARENA 치수와 같은 규칙이다 (이 파일은 워커에서도 번들되므로 3D 를 import 하지 않는다).
 * 두 수가 어긋나지 않는지는 tests/features/arena/separate.test.ts 가 지킨다.
 */
export const BODY_GAP = 0.86;

/** 몸 반지름 — 중심이 아니라 **몸통**이 방 안에 있어야 벽을 안 뚫는다 */
const BODY_R = BODY_GAP / 2;

/**
 * 이 자리에 몸이 **통째로** 들어오는가 — 중심이 아니라 몸통이 기준이다.
 *
 * ARENA 는 벽에서 이미 0.6 들인 값이고 여기서 몸 반지름만큼 더 보므로, 이 안이면 몸통이
 * 벽면(±12 · -20~12)을 스치지 않는다. **정당한 목적지는 하나도 못 막는다**: 시행 지점은
 * ARENA 에서 0.6(validateTrial), 배회 목적지는 0.9(ArenaFeature 의 free) 들인 자리까지만
 * 허용되는데 둘 다 0.43 보다 깊다.
 */
export function insideArena(p: Pt): boolean {
  return (
    p.x >= ARENA.minX + BODY_R &&
    p.x <= ARENA.maxX - BODY_R &&
    p.z >= ARENA.minZ + BODY_R &&
    p.z <= ARENA.maxZ - BODY_R
  );
}

/** 이 자리를 방 안으로 되돌린다 — 제자리에서 고친다 (separate 의 nudge 와 같은 결) */
export function keepInside(p: Pt): void {
  p.x = Math.min(ARENA.maxX - BODY_R, Math.max(ARENA.minX + BODY_R, p.x));
  p.z = Math.min(ARENA.maxZ - BODY_R, Math.max(ARENA.minZ + BODY_R, p.z));
}

export interface TrialPoint {
  /** 지점 이름 (A, B, …) — 사람에게는 무작위로 배정된다 */
  name: string;
  x: number;
  z: number;
  /** 빈 바닥이 아니라 **홀에 있는 물건**을 목표로 삼았을 때 그 이름 */
  object?: string;
  /** 그 물건 위에 올라서야 하는가, 앞에 서야 하는가 */
  mode?: 'mount' | 'stand';
  /** 올라서야 하는 높이(m). 마커를 그 높이에 띄운다 */
  y?: number;
}

/**
 * 시행 원자 — **리더가 고르는 게임의 종류**.
 *
 * 하나뿐일 때는 리더가 좌표와 초만 바꾼 같은 게임을 계속 냈다. 종류가 있어야 발명이 된다.
 *   arrive  정확히 T초에 자기 지점에 도착   — 거리 계산과 눈치보기를 가른다
 *   beat    신호에 맞춰 N번 제자리 점프      — 박자는 사람이 못 숨긴다
 *   zone    질문에 해당하는 구역으로 이동     — 몸으로 하는 투표. 소수파가 드러난다
 */
export type TrialAtom = 'arrive' | 'beat' | 'zone';

/** zone 원자가 쓰는 구역 하나 */
export interface TrialZone {
  /** 보기 문구 — 바닥에 뜬다 */
  label: string;
  x: number;
  z: number;
  /** 반지름(m) */
  r: number;
}

/** 리더가 만들어 내는 것 */
export interface TrialSpec {
  atom: TrialAtom;
  concept: string;
  announce: string;
  /** arrive · beat 가 쓴다 */
  points: TrialPoint[];
  /** zone 이 쓴다 */
  zones?: TrialZone[];
  /** zone 이 던지는 질문 */
  question?: string;
  /** beat: 박자 간격(ms) */
  beatMs?: number;
  /** beat: 몇 번 */
  reps?: number;
  /** 목표 시각(초). arrive 는 도착 시각, zone 은 이동 제한 시간 */
  seconds: number;
  why: string;
}

export interface TrialResult {
  who: string;
  point: TrialPoint;
  /** 출발 시각(초). 안 움직였으면 null */
  startedAt: number | null;
  /** 도착 시각(초). 못 갔으면 null */
  arrivedAt: number | null;
  /** 목표 시각과의 오차(초). 무응답은 최대치 */
  error: number;
  grade: 'normal' | 'warn' | 'alert';
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 가구를 피해 도는 여유. 아바타 반폭 + 조금 */
export const AVOID_PAD = 0.75;

/** 가구 위에 올라서는 데 걸리는 시간(초). 점프하고 자리를 잡는 만큼 */
export const MOUNT_TIME = 0.6;

export interface Obstacle {
  id: string;
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/**
 * 선분이 이 가구(패딩 사각형)를 지나가는가 — Liang-Barsky 클리핑.
 * 처음엔 원(max(hw,hd) 반지름)으로 근사했는데, 무대(20×6m)가 들어오자 방 한복판이
 * 통째로 "막힌 원"이 됐다. 납작하거나 긴 물건은 발자국 그대로 봐야 한다.
 */
function hits(from: Pt, to: Pt, o: Obstacle): boolean {
  const hw = o.hw + AVOID_PAD;
  const hd = o.hd + AVOID_PAD;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [from.x - (o.x - hw), o.x + hw - from.x, from.z - (o.z - hd), o.z + hd - from.z];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // 그 축에서 평행 + 상자 밖
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

/**
 * 가구를 피해 가는 경로. 경유점을 **하나만** 넣는다.
 *
 * A* 까지 갈 필요가 없다 — 방 안 물건은 성겨서 한 번 비켜서면 거의 다 풀린다.
 * 봇이 소파를 뚫고 지나가면 도착 시각이 실제보다 빨라져서 판정이 통째로 거짓말이 된다.
 */
export function pathFor(from: Pt, to: Pt, obstacles: Obstacle[], skipId?: string): Pt[] {
  const obs = obstacles.filter((o) => o.id !== skipId);
  const blocking = obs.find((o) => hits(from, to, o));
  if (!blocking) return [to];

  const r = Math.max(blocking.hw, blocking.hd) + AVOID_PAD;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  // 진행 방향의 법선으로 밀어낸다. 양쪽 중 짧은 쪽을 고른다
  const nx = -dz / len;
  const nz = dx / len;
  const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
  const cand = [
    { x: blocking.x + nx * r * 1.25, z: blocking.z + nz * r * 1.25 },
    { x: blocking.x - nx * r * 1.25, z: blocking.z - nz * r * 1.25 },
  ].sort((p, q) => distance(mid, p) - distance(mid, q));

  /*
   * ★ 우회점은 **방 밖에 설 수 있다** — 물건 반지름의 1.25배만큼 옆으로 밀어낸 자리라
   *   가장자리의 물건에서는 그 계산이 벽 너머를 가리킨다 (2026-09-01 사용자: "로봇이 벽 통과하는 것처럼
   *   사라졌다가 온다"). 무대(반폭 6)를 옆으로 도는 경로가 z −25 를 짚었다 — 뒤벽이 −20 이다.
   *   목적지는 검증(validateTrial)·배회(free)가 방 안으로 잡아 두는데, 그 사이에 끼는 이 한 점만
   *   아무도 안 보고 있었다. 경로는 곧은 두 선분이고 방은 볼록한 사각형이라 —
   *   **양 끝과 이 점만 방 안이면 걷는 동안 밖으로 나갈 수 없다.**
   *
   *   밖으로 나간 후보는 **접지 않고 뺀다.** 접으면 벽에 바짝 붙은 점이 되는데, 그건 물건을 도는
   *   자리가 아니면서 원래 직선과 거의 겹쳐 있어 "제일 가까운 우회점"으로 뽑혀 버린다 —
   *   벽을 안 넘는 대신 **가구를 뚫는** 것으로 바뀐다 (옆벽 콘솔을 따라 걷는 길에서 실제로 그랬다,
   *   tests/lab/free.test.ts). 둘 다 밖일 때만 접어서 하나는 남긴다: 그때도 방을 나가진 않는다.
   */
  const usable = cand.filter(insideArena);
  if (!usable.length) {
    cand.forEach(keepInside);
    usable.push(...cand);
  }

  const via = usable.find((p) => !obs.some((o) => hits(from, p, o) || hits(p, to, o))) ?? usable[0];
  return [via, to];
}

export function pathLength(from: Pt, path: Pt[]): number {
  let total = 0;
  let cur = from;
  for (const p of path) {
    total += distance(cur, p);
    cur = p;
  }
  return total;
}

/**
 * 그 지점까지 걸어가는 데 걸리는 시간(초).
 * **직선이 아니라 실제로 도는 경로**로 잰다 — 그래야 봇이 제때 출발한다.
 */
export function travelTime(from: Pt, to: TrialPoint, obstacles: Obstacle[] = []): number {
  const walk = pathLength(from, pathFor(from, to, obstacles, to.object)) / SPEED;
  return walk + (to.mode === 'mount' ? MOUNT_TIME : 0);
}

/**
 * 검증 게이트 — 리더가 준 좌표가 실제로 쓸 수 있는 배치인가.
 * 통과 못 하면 사유를 돌려주고 다시 만들게 한다. 이게 "자유를 주면서도 판이 안 깨지는" 장치다.
 */
export function validateTrial(
  spec: TrialSpec,
  count: number,
  start: { x: number; z: number },
  objects?: { id: string; mountable: boolean; x: number; z: number; hw: number; hd: number }[],
): string[] {
  const obstacles: Obstacle[] = (objects ?? []).map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
  const bad: string[] = [];
  const pts = spec.points ?? [];

  const atom: TrialAtom = spec.atom ?? 'arrive';
  const seconds = Number(spec.seconds);
  if (!Number.isFinite(seconds) || seconds < 3 || seconds > 20) bad.push('seconds 는 3~20 사이여야 한다');

  if (atom === 'zone') {
    const zs = spec.zones ?? [];
    if (zs.length < 2 || zs.length > 4) bad.push(`구역이 ${zs.length}개다. 2~4개여야 한다`);
    if (!spec.question?.trim()) bad.push('zone 인데 question 이 없다');
    zs.forEach((z) => {
      if (!Number.isFinite(z.x) || !Number.isFinite(z.z)) return bad.push(`${z.label}: 좌표가 없다`);
      if (!(z.r >= 1 && z.r <= 3.5)) bad.push(`${z.label}: 반지름은 1~3.5m 여야 한다 (지금 ${z.r})`);
      if (z.x < ARENA.minX + z.r || z.x > ARENA.maxX - z.r || z.z < ARENA.minZ + z.r || z.z > ARENA.maxZ - z.r) {
        bad.push(`${z.label}: 구역이 방 밖으로 나간다`);
      }
    });
    for (let i = 0; i < zs.length; i += 1) {
      for (let j = i + 1; j < zs.length; j += 1) {
        if (distance(zs[i], zs[j]) < zs[i].r + zs[j].r + 0.8) bad.push(`${zs[i].label} 와 ${zs[j].label} 가 겹친다`);
      }
    }
    // 구역까지 시간 안에 갈 수 있어야 한다
    zs.forEach((z) => {
      const t = pathLength(start, pathFor(start, z, obstacles)) / SPEED;
      if (t > seconds * 0.9) bad.push(`${z.label}: ${seconds}초 안에 못 간다 (${t.toFixed(1)}초 필요)`);
    });
    return bad;
  }

// 홀의 물건을 목표로 삼았을 때의 규칙. zone 은 지점을 안 쓰므로 건너뛴다
  // (zone 은 위에서 이미 return 했다 — 여기 오는 건 arrive · beat 뿐이다)
  if (objects) {
    // 빈 바닥만 쓰면 이 방을 쓸 이유가 없다. 말로 시키면 안 해서 게이트로 막는다
    if (pts.filter((p) => p.object).length < 2) {
      bad.push('빈 바닥만 썼다 — 최소 2개는 방에 있는 물건 앞(object/stand)으로 잡아라');
    }
    const used = new Set<string>();
    pts.forEach((p) => {
      if (!p.object) return;
      const o = objects.find((x) => x.id === p.object);
      if (!o) {
        bad.push(`${p.name}: 그런 물건이 없다 (${p.object})`);
        return;
      }
      if (p.mode === 'mount' && !o.mountable) bad.push(`${p.name}: ${o.id} 에는 올라설 수 없다 (너무 높다)`);
      if (used.has(o.id)) bad.push(`${p.name}: ${o.id} 를 두 사람이 같이 쓴다`);
      used.add(o.id);
    });
  }

  if (atom === 'beat') {
    const ms = Number(spec.beatMs);
    const reps = Number(spec.reps);
    if (!(ms >= 500 && ms <= 2000)) bad.push(`박자는 500~2000ms 여야 한다 (지금 ${spec.beatMs})`);
    if (!(reps >= 4 && reps <= 12)) bad.push(`횟수는 4~12 여야 한다 (지금 ${spec.reps})`);
  }

  if (pts.length !== count) bad.push(`지점이 ${pts.length}개다. 참가자 수(${count})와 같아야 한다`);

  pts.forEach((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
      bad.push(`${p.name}: 좌표도 물건도 없다`);
      return;
    }
    if (p.x < ARENA.minX + 0.6 || p.x > ARENA.maxX - 0.6 || p.z < ARENA.minZ + 0.6 || p.z > ARENA.maxZ - 0.6) {
      bad.push(`${p.name}: 방 밖 (${p.x}, ${p.z})`);
    }
    // 콘솔은 전부 벽에 붙어 있어 경계 검사(0.6 인셋)에 먼저 걸린다.
    // 그래도 남겨 둔다 — 나중에 바닥 한가운데 물건이 들어오면 이 검사만 살아 있게 된다.
    // 물건을 목표로 삼은 지점은 장애물 검사에서 뺀다 — 그 물건이 곧 목표다
    if (p.object) return;
    PILLARS.forEach((o) => {
      if (distance(p, o) < 1.2) bad.push(`${p.name}: 콘솔과 겹친다`);
    });
    const t = travelTime(start, p, obstacles);
    if (t > seconds * 0.95) bad.push(`${p.name}: ${seconds}초 안에 못 간다 (${t.toFixed(1)}초 필요)`);
    if (t < 1) bad.push(`${p.name}: 너무 가깝다 (${t.toFixed(1)}초) — 출발 타이밍이 안 갈린다`);
  });

  // 거리가 다 비슷하면 "남을 보고 따라가기"가 통해 버린다 (arrive 에서만 문제다)
  if (atom === 'arrive' && pts.length > 1) {
    const times = pts.map((p) => travelTime(start, p, obstacles));
    if (Math.max(...times) - Math.min(...times) < 0.8) {
      bad.push('지점들이 전부 비슷한 거리다 — 남을 따라 출발해도 맞아 버린다');
    }
  }

  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      if (distance(pts[i], pts[j]) < 1.5) bad.push(`${pts[i].name} 와 ${pts[j].name} 가 너무 붙어 있다`);
    }
  }
  return bad;
}

/**
 * 등급 컷은 **원자마다 다르다.**
 * 도착은 0.45초까지 봐주지만 박자는 0.12초만 흔들려도 눈에 띈다 — 재는 게 다르기 때문이다.
 * (같은 컷을 쓰다가 "사람처럼 0.3초씩 흔들려도 정상"이 나와서 테스트에 걸렸다)
 */
export const GRADE_CUTS: Record<TrialAtom, { warn: number; alert: number }> = {
  arrive: { warn: 0.45, alert: 1.1 },
  beat: { warn: 0.12, alert: 0.3 },
  zone: { warn: 0.5, alert: 2 },
};

export function gradeOf(error: number, atom: TrialAtom = 'arrive'): TrialResult['grade'] {
  const cut = GRADE_CUTS[atom] ?? GRADE_CUTS.arrive;
  if (error <= cut.warn) return 'normal';
  if (error <= cut.alert) return 'warn';
  return 'alert';
}

/**
 * AI 개체의 출발 시각을 정한다.
 *
 * 기계는 거리/속도를 계산해서 "T초에 딱 도착"하도록 출발한다 — 다만 완벽하지는 않다.
 * 개체마다 숨은 정확도가 있어서 대부분은 촘촘하고 하나둘은 눈에 띄게 흔들린다.
 * **이게 없으면 사람만 혼자 오차가 커서 첫 판에 끝난다.**
 */
export function aiStartTime(
  spec: TrialSpec,
  point: TrialPoint,
  start: { x: number; z: number },
  sloppiness: number,
  obstacles: Obstacle[] = [],
): number {
  const need = travelTime(start, point, obstacles);
  const jitter = (Math.random() * 2 - 1) * sloppiness;
  return Math.max(0, spec.seconds - need + jitter);
}

/**
 * zone: 기계들이 어느 구역으로 몰릴지.
 *
 * 리더가 던지는 질문은 "기계라면 답이 갈리지 않을" 것이라 개체들은 같은 답에 모인다.
 * 다만 전원이 똑같으면 사람이 첫 판에 드러나므로, 개체 하나쯤은 딴 데로 간다 —
 * **정답을 아는 게 아니라 판단이 갈린 것**이고, 그게 사람이 숨을 자리를 만든다.
 */
export function botZoneChoices(zoneCount: number, botCount: number, rng: () => number = Math.random): number[] {
  const majority = Math.floor(rng() * zoneCount);
  return Array.from({ length: botCount }, () => {
    if (rng() < 0.82) return majority;
    let other = majority;
    while (other === majority && zoneCount > 1) other = Math.floor(rng() * zoneCount);
    return other;
  });
}

/**
 * beat: 신호 시각들. 카운트다운이 끝난 뒤 beatMs 간격으로 reps 번.
 * 중간에 박자가 바뀌는 변주(twist)까지 리더가 걸 수 있게 열어 둔다.
 */
export function beatTimes(beatMs: number, reps: number): number[] {
  const out: number[] = [];
  let t = beatMs / 1000;
  for (let i = 0; i < reps; i += 1) {
    out.push(Number(t.toFixed(3)));
    t += beatMs / 1000;
  }
  return out;
}

/** 점프 시각들을 신호에 맞춰 채점한다 — 가장 가까운 신호와의 오차 평균 */
export function beatError(signals: number[], jumps: number[]): number {
  if (!signals.length) return 0;
  const miss = signals.length - Math.min(signals.length, jumps.length);
  const errs = signals.slice(0, jumps.length).map((s, i) => Math.abs(jumps[i] - s));
  const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
  // 빠뜨린 박자는 큰 오차로 친다
  return Number((mean + miss * 0.5).toFixed(3));
}

/** 개체별 숨은 정확도 — 화면에 노출하지 않는다 */
export function dealSloppiness(count: number): number[] {
  return Array.from({ length: count }, () => (Math.random() < 0.25 ? 0.5 + Math.random() * 0.7 : Math.random() * 0.35));
}
