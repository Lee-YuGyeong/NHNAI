/**
 * 폭발 충격파 피하기 — 클라이언트(무대 · HUD)와 워커(엔진 · 봇)가 **같이 보는** 순수 파일 (mp/platform.ts 와 같은 규칙).
 * three 를 끌어오지 않는다.
 *
 * 여기 있는 것은 전부 **공개** 값이다: 장애물 배치(눈에 보인다), 몸이 가려졌는지(눈에 보인다), 거리에 따른 감쇠의 **모양**.
 * 숨은 값은 폭약의 세기 하나(worker/src/trial/condition.ts 의 BLAST_YIELD) — 같은 통이 구간마다 다르게 터진다. 그것은 여기 없다.
 *
 * 물리 (사용자 스펙 "힘 + 거리 + 충격량 + 포물선"):
 *   충격량  J = m · v,  v = Y · BLAST_STRENGTH / (1 + (d / BLAST_FALLOFF)²)  — 압력이 거리 제곱으로 줄어드는 모양. d 는 폭심에서 몸까지(m)
 *     가려졌으면(장애물이 폭심과 몸 사이) × BLAST_COVER_K,  낮은 자세면 × BLAST_CROUCH_K (둘 다면 둘 다)
 *   속도  v 가 BLAST_LAUNCH_V 를 넘으면 몸이 뜬다 — 수평은 폭심 반대쪽, 수직은 v · BLAST_LIFT(낮은 자세면 거의 없다) → 포물선(GRAVITY)
 *   몸무게  같은 J 라도 무거운 몸(mp/bodies.ts mass 1.8)은 속도가 1/1.8 — 비만 군인이 덜 날아간다. 이 판에서는 무거운 몸이 유리하다
 */
import { FALL_ARENA } from './constants';

export const BLAST_ARENA = FALL_ARENA;

/** 몸 반지름(m) — 장애물 · 벽에 이만큼 못 붙는다 */
export const BLAST_BODY_R = 0.35;
/** 서 있을 때 · 낮은 자세일 때 충격을 받는 높이(m) — 가림 판정의 시선 높이 */
export const BLAST_STAND_Y = 0.9;
export const BLAST_CROUCH_Y = 0.45;

/** 거리 감쇠의 반값 거리(m) — d 가 이만큼이면 v 가 절반. 상수 하나로 「가까우면 엄청 멀리」의 가파름이 정해진다 */
export const BLAST_FALLOFF = 1.4;
/** 폭심에서 이보다 가까우면 이 거리로 본다 — 0 에서 무한대가 되지 않게 */
export const BLAST_MIN_D = 0.5;
/** 이 거리(m) 밖은 아무 일도 없다 */
export const BLAST_R = 7;
/** 기준 세기 — d = 0 · 기준 몸무게 · 기준 폭약(Y = 1)에서 몸이 얻는 속도(m/s). 12 면 35° 로 약 12m 날아간다 */
export const BLAST_STRENGTH = 13;
/** 뜨는 문턱(m/s) — 이 아래면 밀리기만 한다(발이 미끄러진다) */
export const BLAST_LAUNCH_V = 2.4;
/** 수직 몫 — 충격파가 몸을 들어 올리는 비율. 낮은 자세면 BLAST_CROUCH_LIFT */
export const BLAST_LIFT = 0.6;
export const BLAST_CROUCH_LIFT = 0.12;
/** 가려졌을 때 · 낮은 자세일 때 남는 충격의 비율 */
export const BLAST_COVER_K = 0.15;
export const BLAST_CROUCH_K = 0.4;

/** 걷기 · 달리기(Shift) · 낮은 자세(C) 속도(m/s) */
export const BLAST_WALK_SPEED = 2.6;
export const BLAST_RUN_SPEED = 4.8;
export const BLAST_CROUCH_SPEED = 1.1;

/** 폭약이 놓이고(빨간 등이 깜박이기 시작) 터지기까지(ms) — 달려서 8m 갈 시간 */
export const BLAST_FUSE_MS = 1800;
/** 다음 폭약까지(ms) 최소 · 최대, 동시에 놓이는 상한 */
export const BLAST_EVERY_MS = [1500, 2600] as const;
export const BLAST_MAX_ARMED = 4;
/** 연쇄 — 터진 폭심에서 이 안(m)의 다른 폭약은 이만큼(ms) 뒤에 따라 터진다 */
export const BLAST_CHAIN_R = 3.4;
export const BLAST_CHAIN_DELAY_MS = 220;
/** 착지 뒤 쓰러져 있는 시간(ms) = 기본 + 착지 속도(m/s) × 계수. 미끄러지는 감속(m/s²) */
export const BLAST_DOWN_BASE_MS = 500;
export const BLAST_DOWN_PER_MS = 110;
export const BLAST_SLIDE_DECEL = 6;
/** 서버 틱 · 스냅샷 · 걷기 명령 유효 시간(ms) */
export const BLAST_TICK_MS = 50;
export const BLAST_SNAPSHOT_MS = 100;
export const BLAST_WALK_STALE_MS = 1500;
/** 스냅샷에 실어 주는 「최근 폭발」의 시간 창(ms) — 클라 연출용. 이 안의 폭발만 실린다 */
export const BLAST_BOOM_KEEP_MS = 1500;

export type CoverKind = 'barrier' | 'sandbag' | 'crate';

/** 장애물 하나 — 축 정렬 상자. 가운데(x, z) · 절반 크기(hx, hz) · 높이 */
export interface Cover {
  kind: CoverKind;
  x: number;
  z: number;
  hx: number;
  hz: number;
  h: number;
  /** 그리기용 y 회전(rad) — 긴 쪽이 x 면 0, z 면 π/2 */
  rotY: number;
}

const BAR = { hx: 1.5, hz: 0.32, h: 1.1 } as const;
const BAG = { hx: 1.2, hz: 0.42, h: 0.9 } as const;
const BOX = { hx: 0.6, hz: 0.6, h: 1.2 } as const;

/**
 * 장애물 배치 — 마당(x −6~6 · z −11~8) 안에 여덟. 어느 자리에서도 5m 안에 숨을 곳이 하나는 있게, 그러나 가운데는 비워 둔다
 * (숨을 곳이 없는 자리가 있어야 「자세를 잡는다」가 뜻이 있다). 서버가 충돌 · 가림에 쓰고 클라가 같은 표로 세운다
 */
export const BLAST_COVERS: readonly Cover[] = [
  { kind: 'barrier', x: -3.6, z: -7.5, ...BAR, rotY: 0 },
  { kind: 'barrier', x: 3.6, z: -7.5, ...BAR, rotY: 0 },
  { kind: 'barrier', x: 0, z: -3.2, hx: BAR.hz, hz: BAR.hx, h: BAR.h, rotY: Math.PI / 2 },
  { kind: 'sandbag', x: -4.3, z: -0.8, ...BAG, rotY: 0 },
  { kind: 'sandbag', x: 4.3, z: -0.8, ...BAG, rotY: 0 },
  { kind: 'barrier', x: 0, z: 2.6, ...BAR, rotY: 0 },
  { kind: 'crate', x: -3.6, z: 5.8, ...BOX, rotY: 0 },
  { kind: 'crate', x: 3.6, z: 5.8, ...BOX, rotY: 0 },
];

/** 점이 장애물 안(몸 반지름만큼 넉넉히)인가 */
export function insideCover(x: number, z: number, pad = BLAST_BODY_R): Cover | null {
  for (const c of BLAST_COVERS) if (Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz + pad) return c;
  return null;
}

/** 몸을 장애물 · 마당 밖으로 밀어낸다 — 가장 얕은 축으로 */
export function pushOut(p: { x: number; z: number }, pad = BLAST_BODY_R): void {
  for (const c of BLAST_COVERS) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const ox = c.hx + pad - Math.abs(dx);
    const oz = c.hz + pad - Math.abs(dz);
    if (ox <= 0 || oz <= 0) continue;
    if (ox < oz) p.x = c.x + Math.sign(dx || 1) * (c.hx + pad);
    else p.z = c.z + Math.sign(dz || 1) * (c.hz + pad);
  }
  p.x = Math.min(BLAST_ARENA.maxX - pad, Math.max(BLAST_ARENA.minX + pad, p.x));
  p.z = Math.min(BLAST_ARENA.maxZ - pad, Math.max(BLAST_ARENA.minZ + pad, p.z));
}

/**
 * 폭심(x0, z0, 바닥)에서 몸(x1, z1, 높이 y1)까지의 시선이 장애물에 막히나 — 2D 선분 · 상자 교차(slab) 뒤 그 지점의 시선 높이가 장애물보다 낮으면 막힌다.
 * 폭심은 바닥(y ≈ 0.25)에 있고 장애물은 전부 사람 가슴 높이 이상이라, 장애물 뒤는 **거리와 상관없이** 그늘이다 — 낮은 폭원의 그림자는 길다.
 * 높이 검사는 장애물이 낮아지거나(무릎 높이 상자) 폭원이 높아지면(공중 폭발) 그때 뜻이 생긴다 — 지금 배치에서는 늘 참이다
 */
export function isShielded(x0: number, z0: number, x1: number, z1: number, y1: number): boolean {
  const y0 = 0.25;
  for (const c of BLAST_COVERS) {
    const t = segmentBoxHit(x0, z0, x1, z1, c);
    if (t === null) continue;
    const yAt = y0 + (y1 - y0) * t;
    if (yAt <= c.h) return true;
  }
  return false;
}

/** 선분이 상자와 처음 만나는 매개 t(0~1) — 안 만나면 null */
function segmentBoxHit(x0: number, z0: number, x1: number, z1: number, c: Cover): number | null {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  for (const [d, o, lo, hi] of [
    [dx, x0, c.x - c.hx, c.x + c.hx],
    [dz, z0, c.z - c.hz, c.z + c.hz],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** 거리 감쇠 — 기준 세기 1 에서 d(m) 의 몸이 얻는 속도 배율(0~1). 숨은 세기는 서버가 여기에 곱한다 */
export function falloff(d: number): number {
  if (d >= BLAST_R) return 0;
  const dd = Math.max(BLAST_MIN_D, d) / BLAST_FALLOFF;
  return 1 / (1 + dd * dd);
}

/** 이 자리에서 이 폭약이 얼마나 위험한가(0~1) — HUD 계기 · 봇의 판단. 세기를 모르니 기준(Y = 1)으로 본다 */
export function dangerAt(x: number, z: number, crouched: boolean, cx: number, cz: number): number {
  const d = Math.hypot(x - cx, z - cz);
  let k = falloff(d);
  if (isShielded(cx, cz, x, z, crouched ? BLAST_CROUCH_Y : BLAST_STAND_Y)) k *= BLAST_COVER_K;
  if (crouched) k *= BLAST_CROUCH_K;
  return k;
}
