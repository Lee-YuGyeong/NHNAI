/**
 * 낙하 생존의 물리 — 순수 함수. 범용 엔진(cannon-es 등) 없이 직접 적분한다:
 * 낙하물은 서로 부딪히지 않고 바닥·사람과만 만나므로 필요한 식이 셋뿐이다 —
 * 중력 + 공기저항 적분, 바닥 반발, 원기둥(사람) 대 구(물체) 겹침.
 *
 * 클라이언트는 이 결과(스냅샷)를 그릴 뿐 스스로 떨어뜨리지 않는다 — 판정 대상(맞았나 · 얼마나 벗어났나)을
 * 계산하는 쪽이 서버여야 한다(PLANNING §5.1). 그래서 결정론이 필요 없다: 같은 아이솔레이트 안에서 틱마다
 * 자기 자신과만 맞으면 된다.
 */
import { FALL_ARENA, FALL_BODY_R, FALL_OBJECT_R, FALL_SPAWN_Y } from '../../../../src/world/mp/constants';
import { FALL_DRAG, FALL_GRAVITY, FALL_RESTITUTION } from '../condition';

/** 사람 키(m) — 물체 아랫면이 이 아래로 내려오면 몸에 닿을 수 있다 */
export const BODY_H = 1.8;
/** 착지한 물체가 바닥에 남아 있는 시간(ms) — 지나면 치운다 */
export const LINGER_MS = 1000;
/** "나를 향해 떨어진다"고 보는 반경 — 맞는 거리(0.8)보다 넉넉히 */
export const THREAT_R = FALL_OBJECT_R + FALL_BODY_R + 0.6;
export const HIT_R = FALL_OBJECT_R + FALL_BODY_R;

export interface FallObject {
  id: number;
  /** 낙하 지점 = 스폰 지점 (수직 낙하) */
  x: number;
  z: number;
  y: number;
  vy: number;
  spawnedAt: number;
  /** 첫 바닥 접촉 시각. null 이면 아직 공중 */
  landedAt: number | null;
  bounced: boolean;
}

export function gravityForRound(round: number): number {
  return FALL_GRAVITY[round - 1] ?? FALL_GRAVITY[0];
}

/**
 * 새 낙하물. at 을 주면 그 근처(반지름 aimR 안)로 — 통제실이 참가자를 **겨냥해** 떨어뜨릴 때다.
 * 마당이 넓어 아무 데나 떨어뜨리면 한 라운드에 사람 머리 위로 오는 게 거의 없다(기대 0.35회) — 그러면
 * 회피 기록이 비어 판별이 안 선다. 겨냥한 것도 마당 밖으로는 안 나간다.
 */
export function spawnObject(id: number, now: number, rand: () => number = Math.random, at?: { x: number; z: number }, aimR = 0.9): FallObject {
  let x = FALL_ARENA.minX + rand() * (FALL_ARENA.maxX - FALL_ARENA.minX);
  let z = FALL_ARENA.minZ + rand() * (FALL_ARENA.maxZ - FALL_ARENA.minZ);
  if (at) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * aimR;
    x = Math.min(Math.max(at.x + Math.cos(a) * r, FALL_ARENA.minX), FALL_ARENA.maxX);
    z = Math.min(Math.max(at.z + Math.sin(a) * r, FALL_ARENA.minZ), FALL_ARENA.maxZ);
  }
  return {
    id,
    x,
    z,
    y: FALL_SPAWN_Y,
    vy: 0,
    spawnedAt: now,
    landedAt: null,
    bounced: false,
  };
}

/** 한 틱 적분. dtSec 는 초. 첫 바닥 접촉이면 landedAt 을 찍고 한 번 튄다 */
export function stepObject(o: FallObject, gravity: number, dtSec: number, now: number): void {
  if (o.landedAt !== null && o.bounced && Math.abs(o.vy) < 0.05 && o.y <= FALL_OBJECT_R + 0.001) return; // 바닥에 누웠다

  // 공기저항은 속도 제곱에 비례하고 운동 반대 방향 — 떨어질수록 조금 덜 가속한다
  o.vy += (-gravity - FALL_DRAG * o.vy * Math.abs(o.vy)) * dtSec;
  o.y += o.vy * dtSec;

  if (o.y <= FALL_OBJECT_R && o.vy < 0) {
    o.y = FALL_OBJECT_R;
    if (o.landedAt === null) o.landedAt = now;
    if (!o.bounced) {
      o.bounced = true;
      o.vy = -o.vy * FALL_RESTITUTION;
    } else {
      o.vy = 0;
    }
  }
}

/** 지금 상태에서 바닥까지 남은 시간(초). 공중이 아니면 0. 수치 적분이라 공식이 없어도 된다 */
export function timeToGround(o: FallObject, gravity: number, maxSec = 6): number {
  if (o.landedAt !== null) return 0;
  let y = o.y;
  let vy = o.vy;
  const dt = 0.02;
  for (let t = 0; t < maxSec; t += dt) {
    vy += (-gravity - FALL_DRAG * vy * Math.abs(vy)) * dt;
    y += vy * dt;
    if (y <= FALL_OBJECT_R) return t + dt;
  }
  return maxSec;
}

export function horizontalDist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** 물체가 사람 몸에 닿는가 — 아랫면이 키 아래로 내려왔고 수평으로 겹친다 */
export function overlapsBody(o: FallObject, px: number, pz: number): boolean {
  return o.y - FALL_OBJECT_R <= BODY_H && horizontalDist(o.x, o.z, px, pz) < HIT_R;
}

export function clampToArena(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(Math.max(x, FALL_ARENA.minX + FALL_BODY_R), FALL_ARENA.maxX - FALL_BODY_R),
    z: Math.min(Math.max(z, FALL_ARENA.minZ + FALL_BODY_R), FALL_ARENA.maxZ - FALL_BODY_R),
  };
}
