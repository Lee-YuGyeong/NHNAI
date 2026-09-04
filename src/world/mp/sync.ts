/**
 * SYNC STABILITY — 인간의 정신과 AI 몸체의 **동기화율.** 0~100, 시작 98 (100 은 없다 — 남의 몸이다).
 *
 * 의심도(suspicion.ts)가 「정체가 들킬 위험」이라면 이것은 「몸을 유지하지 못할 위험」 — 두 압박이 같이 간다 (사용자 설계, 2026-08-30).
 *
 *   떨어진다 — 충격(굉음·통보·연출이 부른다) · 긴장(의심도가 한 번에 5 이상 오를 때, WorldFeature 가 잇는다) · 손상(무장 AI 판정 등)
 *   오른다   — **가만히 서 있으면** 초당 RECOVER_STILL, 걸으면 RECOVER_MOVE. "억제하세요"가 곧 조작이다.
 *   80 아래  — 글리치: 손이 떨리고(카메라), 사람 손이 0.1초 겹쳐 보이고, 심장박동이 들린다. 값이 낮을수록 잦다.
 *              곁에 AI(bystanders)가 있을 때 글리치가 나면 **그가 본다** → 의심도 + "방금 움직임은 무엇이지?" (WorldFeature)
 *
 * 순수 저장소 (three·DOM·React 없음). 프레임 갱신은 SyncTremor(캔버스 안)가, 표시는 SyncHud 가 한다.
 */

import { witnessed } from './sensor';

export type SyncReason = '충격' | '긴장' | '손상' | '회복';

export interface SyncState {
  /** 0~SYNC_MAX */
  value: number;
  /** 마지막으로 값을 떨어뜨린 사유 (HUD 가 잠깐 띄운다) */
  last: { reason: SyncReason; delta: number; at: number } | null;
  /** 글리치 횟수 — 바뀌면 화면·소리·카메라가 한 번 반응한다 */
  glitch: number;
  /** 마지막 글리치 시각 */
  glitchAt: number;
  /** 마지막 글리치를 곁의 AI 가 봤나 */
  seen: boolean;
}

export const SYNC_MAX = 98;
/** 이 아래부터 몸이 인간처럼 굴기 시작한다 */
export const SYNC_GLITCH = 80;
/** 회복 속도 (초당). 20 을 잃으면 가만히 서서 ≈25초 */
const RECOVER_STILL = 0.8;
const RECOVER_MOVE = 0.2;
/** 글리치 간격(초) — 값 40 에서 GLITCH_MIN, 80 에서 GLITCH_MAX. 앞뒤 ±30% 흔든다 */
const GLITCH_MIN = 3;
const GLITCH_MAX = 12;
/** 바닥 — 이 아래로는 안 내려간다 (게임 오버는 의심도 몫이다) */
const FLOOR = 5;

const state: SyncState = { value: SYNC_MAX, last: null, glitch: 0, glitchAt: -Infinity, seen: false };
const listeners = new Set<() => void>();
let nextGlitchAt = Infinity;
let onGlitch: ((seen: boolean) => void) | null = null;

function emit() {
  for (const fn of listeners) fn();
}

function scheduleGlitch(now: number) {
  const t = Math.min(1, Math.max(0, (state.value - 40) / (SYNC_GLITCH - 40)));
  const base = GLITCH_MIN + (GLITCH_MAX - GLITCH_MIN) * t;
  nextGlitchAt = now + base * (0.7 + Math.random() * 0.6) * 1000;
}

export const sync = {
  get(): SyncState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 글리치가 났을 때 알림 — seen 이면 곁의 AI 가 봤다 */
  bind(fn: typeof onGlitch): void {
    onGlitch = fn;
  },
  reset(): void {
    state.value = SYNC_MAX;
    state.last = null;
    state.glitch = 0;
    state.glitchAt = -Infinity;
    state.seen = false;
    nextGlitchAt = Infinity;
    emit();
  },
  /** 이만큼 떨어진다 (양수). 이야기·굉음·긴장이 부른다 */
  shock(amount: number, reason: SyncReason, now = performance.now()): void {
    if (amount <= 0) return;
    const before = state.value;
    state.value = Math.max(FLOOR, state.value - amount);
    state.last = { reason, delta: -(before - state.value), at: now };
    if (before >= SYNC_GLITCH && state.value < SYNC_GLITCH) scheduleGlitch(now);
    emit();
  },
  /**
   * 프레임마다 — 회복과 글리치. still 은 이 프레임에 몸이 멈춰 있었나. (x,z) 는 글리치를 누가 봤는지 재는 자리.
   * 글리치가 났으면 true
   */
  tick(dt: number, still: boolean, x: number, z: number, now = performance.now()): boolean {
    if (state.value < SYNC_MAX) {
      const before = state.value;
      state.value = Math.min(SYNC_MAX, state.value + (still ? RECOVER_STILL : RECOVER_MOVE) * dt);
      if (Math.floor(before * 2) !== Math.floor(state.value * 2)) emit();
    }
    if (state.value >= SYNC_GLITCH) {
      nextGlitchAt = Infinity;
      return false;
    }
    if (nextGlitchAt === Infinity) scheduleGlitch(now);
    if (now < nextGlitchAt) return false;
    // 나를 향해 서 있는 AI 가 있어야 본다 (sensor.witnessed — 돌발·감정과 같은 잣대)
    const seen = witnessed(x, z);
    state.glitch += 1;
    state.glitchAt = now;
    state.seen = seen;
    scheduleGlitch(now);
    emit();
    onGlitch?.(seen);
    return true;
  },
};
