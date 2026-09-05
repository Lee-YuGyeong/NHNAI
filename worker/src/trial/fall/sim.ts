/**
 * 낙하 생존의 물리 — 순수 함수. 범용 엔진(cannon-es 등) 없이 직접 적분한다:
 * 공은 서로 부딪히지 않고 바닥·사람과만 만나므로 필요한 식이 셋뿐이다 —
 * 중력 + 공기저항 적분, 바닥 반발, 원기둥(사람) 대 구(공) 겹침.
 *
 * 공마다 무게가 다르다(mp/constants FALL_BALLS): 공기저항 가속도는 k·v² 이고 k = ρ·Cd·A / 2m —
 * 단면적이 크고 가벼운 탁구공은 k 가 커서 금방 종단속도에 닿아 둥실 내려오고, 볼링공은 거의 자유낙하다.
 * 중력만 숨겨진 조건이다(condition.ts). 공기저항은 공의 공개된 무게·크기에서 나온다.
 *
 * 클라이언트는 이 결과(스냅샷)를 그릴 뿐 스스로 떨어뜨리지 않는다 — 판정 대상(맞았나 · 얼마나 벗어났나)을
 * 계산하는 쪽이 서버여야 한다(PLANNING §5.1). 그래서 결정론이 필요 없다.
 */
import { FALL_ARENA, FALL_BALLS, FALL_BODY_R, FALL_DRAG_GAIN, FALL_OBJECT_R, FALL_SPAWN_Y } from '../../../../src/world/mp/constants';
import { FALL_GRAVITY } from '../condition';

/** 사람 키(m) — 공 아랫면이 이 아래로 내려오면 몸에 닿을 수 있다 */
export const BODY_H = 1.8;
/** 착지한 공이 바닥에 남아 있는 시간(ms) — 지나면 치운다 */
export const LINGER_MS = 1000;
/** "나를 향해 떨어진다"고 보는 반경 — 맞는 거리보다 넉넉히 */
export const THREAT_R = FALL_OBJECT_R + FALL_BODY_R + 0.6;
/** 대표 공으로 잰 맞는 거리 — 회피 방향(크게/딱 맞게)의 기준. 실제 판정은 공마다 자기 반지름 */
export const HIT_R = FALL_OBJECT_R + FALL_BODY_R;

const AIR_DENSITY = 1.225;
const SPHERE_CD = 0.47;

/** 공 종류별 공기저항 계수 k (1/m): a = -k·v·|v| */
export const BALL_DRAG: readonly number[] = FALL_BALLS.map((b) => (FALL_DRAG_GAIN * AIR_DENSITY * SPHERE_CD * Math.PI * b.realR * b.realR) / (2 * b.mass));

export interface FallObject {
  id: number;
  /** FALL_BALLS 의 인덱스 */
  kind: number;
  /** 화면·충돌 반지름(m) */
  r: number;
  /** 낙하 지점 = 스폰 지점 (수직 낙하) */
  x: number;
  z: number;
  y: number;
  vy: number;
  /** 직전 틱의 y — 한 틱에 1.5m 씩 내려오는 볼링공이 몸을 **건너뛰지** 못하게, 겹침을 이 구간으로 본다 */
  prevY: number;
  spawnedAt: number;
  /** 첫 바닥 접촉 시각. null 이면 아직 공중 */
  landedAt: number | null;
  bounced: boolean;
}

export function gravityForPhase(phase: number): number {
  return FALL_GRAVITY[phase - 1] ?? FALL_GRAVITY[0];
}

/**
 * 새 공. at 을 주면 그 근처(반지름 aimR 안)로 — 통제실이 참가자를 **겨냥해** 떨어뜨릴 때다.
 * 마당이 넓어 아무 데나 떨어뜨리면 한 판에 사람 머리 위로 오는 게 거의 없다 — 그러면
 * 회피 기록이 비어 판별이 안 선다. 겨냥한 것도 마당 밖으로는 안 나간다.
 *
 * 겨냥 반경 0.9m 는 맞는 거리(공 0.24 + 몸 0.35 = 0.59m)보다 넓어서, 겨냥한 공의 절반 남짓이 애초에
 * 빗나가 있었다 — 가만히 서 있어도 안 맞는 공이다. 0.65m 로 좁힌다 (2026-09-05 사용자: "공 난이도도
 * 높여줘") — 겨냥했으면 **피해야** 안 맞는다. 그래도 정확히 머리 위는 아니다: 어디로 피할지 고르는
 * 여지가 남아야 회피 방향이 기록으로 남는다 (stats.ts 의 minDistanceAvoid).
 */
export function spawnObject(id: number, now: number, rand: () => number = Math.random, at?: { x: number; z: number }, aimR = 0.65, kind?: number): FallObject {
  let x = FALL_ARENA.minX + rand() * (FALL_ARENA.maxX - FALL_ARENA.minX);
  let z = FALL_ARENA.minZ + rand() * (FALL_ARENA.maxZ - FALL_ARENA.minZ);
  if (at) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * aimR;
    x = Math.min(Math.max(at.x + Math.cos(a) * r, FALL_ARENA.minX), FALL_ARENA.maxX);
    z = Math.min(Math.max(at.z + Math.sin(a) * r, FALL_ARENA.minZ), FALL_ARENA.maxZ);
  }
  const k = kind ?? Math.floor(rand() * FALL_BALLS.length) % FALL_BALLS.length;
  return {
    id,
    kind: k,
    r: FALL_BALLS[k].r,
    x,
    z,
    y: FALL_SPAWN_Y,
    vy: 0,
    prevY: FALL_SPAWN_Y,
    spawnedAt: now,
    landedAt: null,
    bounced: false,
  };
}

/** 한 틱 적분. dtSec 는 초. 첫 바닥 접촉이면 landedAt 을 찍고 그 공의 반발계수로 한 번 튄다 */
export function stepObject(o: FallObject, gravity: number, dtSec: number, now: number): void {
  if (o.landedAt !== null && o.bounced && Math.abs(o.vy) < 0.05 && o.y <= o.r + 0.001) return; // 바닥에 누웠다
  o.prevY = o.y;

  // 공기저항은 속도 제곱에 비례하고 운동 반대 방향 — 가벼운 공일수록 금방 종단속도에 닿는다
  const k = BALL_DRAG[o.kind] ?? BALL_DRAG[0];
  o.vy += (-gravity - k * o.vy * Math.abs(o.vy)) * dtSec;
  o.y += o.vy * dtSec;

  if (o.y <= o.r && o.vy < 0) {
    o.y = o.r;
    if (o.landedAt === null) o.landedAt = now;
    if (!o.bounced) {
      o.bounced = true;
      o.vy = -o.vy * (FALL_BALLS[o.kind]?.restitution ?? 0.4);
    } else {
      o.vy = 0;
    }
  }
}

/** 지금 상태에서 바닥까지 남은 시간(초). 공중이 아니면 0. 수치 적분이라 공식이 없어도 된다 */
export function timeToGround(o: FallObject, gravity: number, maxSec = 6): number {
  if (o.landedAt !== null) return 0;
  const k = BALL_DRAG[o.kind] ?? BALL_DRAG[0];
  let y = o.y;
  let vy = o.vy;
  const dt = 0.02;
  for (let t = 0; t < maxSec; t += dt) {
    vy += (-gravity - k * vy * Math.abs(vy)) * dt;
    y += vy * dt;
    if (y <= o.r) return t + dt;
  }
  return maxSec;
}

export function horizontalDist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * 공이 사람 몸에 닿는가 — 수평으로 겹치고, **이번 틱 동안 지나간 세로 구간**이 몸(발 높이 py 부터 py+키)과 만난다.
 *
 * 둘이 달라졌다:
 *   ① 점 판정이 아니라 **쓸고 지나간 구간**(prevY~y)으로 본다 — 틱이 밀리면 볼링공(15 m/s)이 한 틱에 1.5m 를
 *      내려와 몸을 건너뛸 수 있었다.
 *   ② 사람의 **발 높이 py** 를 본다. 예전에는 y 를 아예 안 봐서 점프가 판정에 아무 영향이 없었다(= 장식). 이제
 *      뛰면 몸이 위로 올라가 공을 **더 일찍** 만난다 — 중력이 바뀐 걸 모르고 뛰면 오래 떠 있다가 맞는다.
 */
export function overlapsBody(o: FallObject, px: number, pz: number, py = 0): boolean {
  if (horizontalDist(o.x, o.z, px, pz) >= o.r + FALL_BODY_R) return false;
  const lo = Math.min(o.prevY, o.y) - o.r;
  const hi = Math.max(o.prevY, o.y) + o.r;
  return lo <= py + BODY_H && hi >= py;
}

export function clampToArena(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(Math.max(x, FALL_ARENA.minX + FALL_BODY_R), FALL_ARENA.maxX - FALL_BODY_R),
    z: Math.min(Math.max(z, FALL_ARENA.minZ + FALL_BODY_R), FALL_ARENA.maxZ - FALL_BODY_R),
  };
}
