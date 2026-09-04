/**
 * AI("SUBJECT") 좌석의 색 사냥 — PLANNING P9: 입력을 LLM 이 실시간으로 만들지 않는다. 프로파일에서
 * 걸음과 선택을 뽑는다. 사람과 같은 걷기 속도, 같은 마당, 같은 doPick 판정이다.
 *
 * ★ precision(0 사람 같음 ~ 1 기계 같음)은 **시간축에만** 물린다 — 전환 후 머뭇 · 견본판 확인 ·
 *   선택 간격. **정오에는 물리지 않는다**: 정답률은 인간 분포에서 뽑고 p 와 무관하다. 정확도에
 *   물리면 무리 평균 대비 편차가 폭발해 P2 가 무의미해진다 (docs/COLORHUNT.md §9). AI 는
 *   「사람만큼 틀리되, 멈칫하지 않는」 좌석이다 — 티는 오직 시간축에서만 난다.
 */
import { HUNT_ARENA, HUNT_BOARD, WALK_SPEED } from '../../../../src/world/mp/constants';

export interface HuntProfile {
  /** 선택과 선택 사이의 숨(ms) — 걷는 시간은 그 위에 얹힌다 */
  pickIntervalMs: number;
  /** 조명이 바뀐 뒤 첫 행동까지(ms) — 메인 판별 수치의 원천 */
  switchDelayMs: number;
  /** 전환 직후 견본판을 「확인하러」 다녀올 확률 */
  boardCheckP: number;
  /** 기준광 구간의 정답률 */
  accBase: number;
  /** 합류쌍 목표 구간의 정답률 */
  accMerged: number;
  /** 죽는 색 목표 구간의 정답률 (위치 기억 싸움) */
  accDead: number;
  /** 오답을 낼 때 합류색·미끼로 틀릴 확률 — 사람의 오답은 물리적으로 정직한 쪽에 몰린다 */
  honestP: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * precision 이 없으면 첫 좌석은 기계 쪽(1), 나머지는 사람 분포에서 — 판마다 조합이 달라진다
 * (fall/npc.ts makeDodgeProfile 과 같은 규칙).
 */
export function makeHuntProfile(index: number, precision?: number): HuntProfile {
  const p = precision === undefined ? (index === 0 ? 1 : Math.random() * 0.35) : clamp01(precision);
  const r = precision === undefined ? Math.random : () => 0.5;
  return {
    pickIntervalMs: 2400 - 1000 * p + (1 - p) * r() * 1200,
    switchDelayMs: 5500 - 5100 * p + (1 - p) * r() * 2400,
    boardCheckP: (1 - p) * 0.6,
    // 정오는 p 와 무관 — 좌석마다 조금씩 다른 「사람」일 뿐이다
    accBase: clamp01(0.92 + (r() - 0.5) * 0.08),
    accMerged: clamp01(0.65 + (r() - 0.5) * 0.24),
    accDead: clamp01(0.55 + (r() - 0.5) * 0.24),
    honestP: 0.85,
  };
}

export interface Hunter {
  id: string;
  x: number;
  z: number;
  profile: HuntProfile;
  /** 다음 행동을 시작해도 되는 시각 — 전환 머뭇과 선택 간격이 여기 쌓인다 */
  nextActAt: number;
  /** 걷는 목적지. orbId 가 null 이면 견본판 나들이다 */
  target: { x: number; z: number; orbId: number | null } | null;
}

export function makeHunter(id: string, x: number, z: number, profile: HuntProfile): Hunter {
  return { id, x, z, profile, nextActAt: 0, target: null };
}

/** 조명이 바뀌었다 — 하던 걸음을 멈추고 머뭇거린다. 확률로 견본판부터 다녀온다 */
export function hunterOnSwitch(h: Hunter, now: number, rand: () => number = Math.random): void {
  h.target = null;
  h.nextActAt = now + h.profile.switchDelayMs;
  if (rand() < h.profile.boardCheckP) {
    h.target = { x: HUNT_BOARD.x + (rand() - 0.5) * 1.2, z: HUNT_BOARD.z - 0.8, orbId: null };
  }
}

/** 목적지까지 걸어서 닿았다고 보는 거리 */
const REACH = 0.7;

/**
 * 한 틱 — 걷고, 다다르면 줍는다. 어느 구슬을 노릴지는 엔진이 정오 주사위까지 굴려서 준다
 * (chooseOrb), 실제 판정·기록·방송은 pick 콜백(엔진의 doPick)이 한다.
 */
export function stepHunter(
  h: Hunter,
  now: number,
  dtSec: number,
  chooseOrb: (h: Hunter) => { id: number; x: number; z: number } | null,
  pick: (id: string, orbId: number) => void,
  rand: () => number = Math.random,
): void {
  if (h.target) {
    const dx = h.target.x - h.x;
    const dz = h.target.z - h.z;
    const len = Math.hypot(dx, dz);
    const step = WALK_SPEED * dtSec;
    if (len <= Math.max(step, REACH)) {
      const t = h.target;
      h.x = Math.min(Math.max(t.x, HUNT_ARENA.minX + 0.4), HUNT_ARENA.maxX - 0.4);
      h.z = Math.min(Math.max(t.z, HUNT_ARENA.minZ + 0.4), HUNT_ARENA.maxZ - 0.4);
      h.target = null;
      if (t.orbId !== null) {
        pick(h.id, t.orbId);
        h.nextActAt = now + h.profile.pickIntervalMs * (0.7 + rand() * 0.6);
      }
      // 견본판 나들이였다면 — 확인을 마쳤으니 다음 틱부터 바로 고른다
    } else {
      h.x += (dx / len) * step;
      h.z += (dz / len) * step;
    }
    return;
  }

  if (now < h.nextActAt) return;
  const orb = chooseOrb(h);
  if (orb) h.target = { x: orb.x, z: orb.z, orbId: orb.id };
  else h.nextActAt = now + 400; // 노릴 게 없다(리스폰 대기) — 잠깐 서 있는다
}
