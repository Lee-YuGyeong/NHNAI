/**
 * 처형자 — 무대 위에서 총을 들고 서 있다가, **의심도 100% 로 격리되는 좌석**을 쏜다 (2026-09-04 사용자).
 *
 * 순수 저장소 (features/world/enforcerStore 와 같은 생각). 몸(자세 · 총구 섬광 · 피격 임팩트)은 Executioner.tsx 가
 * phase 를 읽어 그리고, 방아쇠는 InterrogationFeature 가 `game_isolated` 를 받는 순간 당긴다 — **서버에 없는 내 화면의 연출**이다.
 * 판은 한 줄도 안 바뀐다: 격리는 서버가 이미 했고, 여기서는 그 몸이 EXECUTION_MS 동안 홀에 남아 총을 맞은 뒤 사라질 뿐이다.
 *
 *   idle → aim(AIM_MS, 표적 쪽으로 돌아 조준) → fire(SHOTS 발, SHOT_EVERY_MS 간격) → recover(RECOVER_MS, 총을 내린다) → idle
 */

export type ExecutionerPhase = 'idle' | 'aim' | 'fire' | 'recover';

export interface ExecutionerState {
  phase: ExecutionerPhase;
  /** 몇 번째 처형인가 — 몸이 리마운트 없이 새 처형을 알아보는 열쇠 */
  seq: number;
  /** 쏘는 좌석 id (remotePlayers 의 키). 내 좌석이면 몸이 없으니 fallback 자리를 쏜다 */
  targetId: string | null;
  /** 표적 몸을 못 찾을 때 겨눌 자리 (내가 격리됐을 때 — 내 마지막 좌표) */
  fallback: { x: number; z: number } | null;
  /** 마지막 발사 시각(ms, performance.now). 몸이 이 값이 바뀌는 것을 보고 섬광·임팩트를 튼다 */
  shotAt: number;
  /** 이번 처형에서 쏜 발 수 */
  shots: number;
}

export const AIM_MS = 750;
export const SHOT_EVERY_MS = 300;
export const SHOTS = 3;
export const RECOVER_MS = 1000;
/** 격리된 몸이 홀에 남아 있는 시간 — 조준 + 사격 + 마지막 발이 보일 만큼 */
export const EXECUTION_MS = AIM_MS + SHOT_EVERY_MS * SHOTS + 250;

const state: ExecutionerState = { phase: 'idle', seq: 0, targetId: null, fallback: null, shotAt: -Infinity, shots: 0 };
const listeners = new Set<() => void>();
let timers: number[] = [];

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<ExecutionerState>) {
  Object.assign(state, p);
  notify();
}
function clearTimers() {
  for (const t of timers) window.clearTimeout(t);
  timers = [];
}
const later = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

export const executioner: {
  get(): ExecutionerState;
  subscribe(fn: () => void): () => void;
  execute(targetId: string, fallback?: { x: number; z: number } | null): void;
  reset(): void;
} = {
  get(): ExecutionerState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 처형 — 조준 뒤 SHOTS 발. 이미 쏘는 중이면 새 표적으로 처음부터 */
  execute(targetId: string, fallback: { x: number; z: number } | null = null): void {
    clearTimers();
    const seq = state.seq + 1;
    patch({ phase: 'aim', seq, targetId, fallback, shotAt: -Infinity, shots: 0 });
    for (let i = 0; i < SHOTS; i++) {
      later(AIM_MS + i * SHOT_EVERY_MS, () => {
        if (state.seq !== seq) return;
        patch({ phase: 'fire', shotAt: performance.now(), shots: i + 1 });
      });
    }
    later(AIM_MS + SHOTS * SHOT_EVERY_MS + 150, () => {
      if (state.seq !== seq) return;
      patch({ phase: 'recover' });
    });
    later(AIM_MS + SHOTS * SHOT_EVERY_MS + 150 + RECOVER_MS, () => {
      if (state.seq !== seq) return;
      patch({ phase: 'idle', targetId: null, fallback: null });
    });
  },
  /** 처음으로 — 판이 끝나거나 화면을 나갈 때 */
  reset(): void {
    clearTimers();
    patch({ phase: 'idle', targetId: null, fallback: null, shotAt: -Infinity, shots: 0 });
  },
};

// 개발 화면에서 콘솔로 처형을 시험한다 — window.__executioner.execute(<좌석 id>) (표적 id 는 Executioner.tsx 의 __executionerTargets())
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __executioner?: unknown }).__executioner = executioner;
