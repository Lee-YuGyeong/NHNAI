/**
 * 체력 — 무장 심문 AI 의 사격에 깎인다. 0 이 되거나 제압(판정)이 끝나면 쓰러진다(dead) → 패배.
 *
 * 순수 저장소 (three·DOM·React 없음). 피격 연출(DamageHud·Downed)은 `last` 를 읽어 반응하고, 표시는 HealthHud 가 한다.
 * 회복은 없다 — 다시 시작(처음으로)만 있다 (WorldFeature 의 restart). 서버에 없는 내 화면의 값이다.
 */

export type HitReason = '피격' | '제압';

export interface HealthState {
  /** 0~HEALTH_MAX */
  value: number;
  /** 마지막 피격 — 연출이 읽는다 */
  last: { reason: HitReason; delta: number; at: number } | null;
  /** 쓰러졌나. 다시 시작 전까지 그대로다 */
  dead: boolean;
  /** 쓰러진 시각(ms) */
  diedAt: number;
}

export const HEALTH_MAX = 100;
/** 한 발의 피해 — 사격 한 차례(SHOOT_MS 2400 / 320ms ≈ 7발)면 체력이 다 닳는다 */
export const SHOT_DAMAGE = 15;

const state: HealthState = { value: HEALTH_MAX, last: null, dead: false, diedAt: 0 };
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export const health = {
  get(): HealthState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 맞았다. 0 이 되면 쓰러진다. 돌려주는 값은 이 한 방으로 쓰러졌는가 */
  hit(delta: number, reason: HitReason = '피격', at = performance.now()): boolean {
    if (state.dead) return false;
    state.value = Math.max(0, state.value - delta);
    state.last = { reason, delta, at };
    if (state.value <= 0) {
      state.dead = true;
      state.diedAt = at;
    }
    notify();
    return state.dead;
  },
  /** 제압 완료 — 체력이 남았어도 쓰러진다 */
  down(reason: HitReason = '제압', at = performance.now()): void {
    if (state.dead) return;
    state.last = { reason, delta: state.value, at };
    state.value = 0;
    state.dead = true;
    state.diedAt = at;
    notify();
  },
  /** 처음으로 — 새 방·다시 시작 */
  reset(): void {
    Object.assign(state, { value: HEALTH_MAX, last: null, dead: false, diedAt: 0 });
    notify();
  },
};
