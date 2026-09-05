/**
 * 처형자 — 무대 위에서 총을 들고 서 있다가, **의심도 100% 로 격리되는 좌석**을 쏜다 (2026-09-04 사용자).
 *
 * 순수 저장소 (features/world/enforcerStore 와 같은 생각). 몸(자세 · 총구 섬광 · 피격 임팩트)은 Executioner.tsx 가
 * phase 를 읽어 그리고, 방아쇠는 InterrogationFeature 가 `game_isolated` 를 받는 순간 당긴다 — **서버에 없는 내 화면의 연출**이다.
 * 판은 한 줄도 안 바뀐다: 격리는 서버가 이미 했고, 여기서는 그 몸이 EXECUTION_MS 동안 홀에 남아 총을 맞은 뒤 사라질 뿐이다.
 *
 *   idle → aim(AIM_MS, 표적 쪽으로 돌아 조준) → fire(SHOTS 발, SHOT_EVERY_MS 간격) → 표적이 넘어간다(down) → recover(총을 내린다) → idle
 *
 * ★ **맞은 몸은 그 자리에서 넘어진다** (2026-09-05 사용자: "로봇 총쏨 → 나 맞고 쓰러짐 → 패배 보여줌 이 순서로").
 *   여태는 총을 맞은 몸이 선 채로 그냥 지워졌고, 내가 맞으면 그마저도 안 보였다 — 격리와 판의 끝이 같은
 *   순간에 오므로(worker 의 checkIsolation) 끝 화면이 총성 위에 그대로 덮였다. 이제 마지막 발 뒤
 *   DOWN_DELAY_MS 에 몸이 꺾이기 시작해 FALL_MS 동안 넘어가고, 넘어간 자세로 DOWN_HOLD_MS 를 더 있는다.
 *   끝 화면은 그 EXECUTION_MS 가 다 지나야 선다 (InterrogationFeature 의 dying).
 *   넘어가는 그림은 몸 쪽(scene/Downed)이 그린다 — 여기는 **언제** 넘어가기 시작했는지만 적어 둔다.
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
/** 마지막 발과 몸이 꺾이기 시작하는 순간 사이 — 총성과 쓰러짐이 한 박에 붙되 겹치지는 않을 만큼 */
export const DOWN_DELAY_MS = 120;
/** 넘어가는 데 걸리는 시간 — /arena 의 Collapse(1.3초)보다 조금 빠르다. 꺼지는 몸이 아니라 총에 꺾이는 몸이다 */
export const FALL_MS = 1100;
/** 다 넘어간 자세로 남아 있는 한 박자 — 쓰러지자마자 사라지면 넘어진 그림을 아무도 못 본다 */
export const DOWN_HOLD_MS = 700;
/** 몸이 꺾이기 시작하는 시각 (처형 시작 기준) */
export const DOWN_AT_MS = AIM_MS + SHOT_EVERY_MS * SHOTS + DOWN_DELAY_MS;
/** 격리된 몸이 홀에 남아 있는 시간 — 조준 + 사격 + 넘어감 + 넘어간 자세. 끝 화면도 이만큼 기다린다 */
export const EXECUTION_MS = DOWN_AT_MS + FALL_MS + DOWN_HOLD_MS;

const state: ExecutionerState = { phase: 'idle', seq: 0, targetId: null, fallback: null, shotAt: -Infinity, shots: 0 };
/**
 * 총을 맞고 넘어가기 시작한 시각 — 좌석 id → performance.now.
 *
 * 상태(state)와 따로 두는 것은 **넘어진 몸이 다음 처형보다 오래 남기 때문**이다: 한 판에서 둘이 잇달아
 * 격리되면 state 는 새 표적으로 갈아타지만, 먼저 맞은 몸은 아직 넘어가는 중이라 제 시각을 잃으면 안 된다.
 */
const downAt = new Map<string, number>();
const listeners = new Set<() => void>();
let timers: number[] = [];
/**
 * 넘어짐 시계만 따로 둔다 — 새 처형이 서면 **처형자의 시계는 갈아치우지만**(clearTimers) 이미 세 발을 맞은
 * 몸이 안 넘어가고 선 채로 지워지면 안 된다. 이쪽은 reset(판을 나갈 때)에서만 걷힌다.
 */
let downTimers: number[] = [];

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
const laterDown = (ms: number, fn: () => void) => {
  downTimers.push(window.setTimeout(fn, ms));
};

export const executioner: {
  get(): ExecutionerState;
  downAt(id: string): number;
  subscribe(fn: () => void): () => void;
  execute(targetId: string, fallback?: { x: number; z: number } | null): void;
  reset(): void;
} = {
  get(): ExecutionerState {
    return state;
  },
  /** 이 몸이 넘어가기 시작한 시각 (performance.now) — 아직 서 있으면 0. 몸이 프레임마다 묻는다 (scene/Downed) */
  downAt(id: string): number {
    return downAt.get(id) ?? 0;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 처형 — 조준 뒤 SHOTS 발. 이미 쏘는 중이면 새 표적으로 처음부터 */
  execute(targetId: string, fallback: { x: number; z: number } | null = null): void {
    clearTimers();
    const seq = state.seq + 1;
    downAt.delete(targetId);
    patch({ phase: 'aim', seq, targetId, fallback, shotAt: -Infinity, shots: 0 });
    for (let i = 0; i < SHOTS; i++) {
      later(AIM_MS + i * SHOT_EVERY_MS, () => {
        if (state.seq !== seq) return;
        patch({ phase: 'fire', shotAt: performance.now(), shots: i + 1 });
      });
    }
    /*
     * 맞은 몸이 꺾인다 — **여기서는 시각만 적는다.** 넘어가는 그림은 몸이 그리고(scene/Downed),
     * 이 표는 그 몸이 사라진 뒤에도 남았다가 다음 처형·reset 에서 지워진다.
     *
     * seq 를 안 본다: 잇달아 격리되어 표적이 갈아치워져도 **먼저 맞은 몸은 이미 세 발을 맞았다.**
     * 그 몸이 안 넘어가고 선 채로 지워지는 것이야말로 이 연출이 없애려던 그림이다.
     */
    laterDown(DOWN_AT_MS, () => {
      downAt.set(targetId, performance.now());
      notify();
    });
    later(AIM_MS + SHOTS * SHOT_EVERY_MS + 150, () => {
      if (state.seq !== seq) return;
      patch({ phase: 'recover' });
    });
    // 총을 내린 뒤에도 넘어가는 몸을 끝까지 지켜본다 — 다 넘어가야 홀 쪽으로 돌아선다
    later(Math.max(AIM_MS + SHOTS * SHOT_EVERY_MS + 150 + RECOVER_MS, DOWN_AT_MS + FALL_MS), () => {
      if (state.seq !== seq) return;
      patch({ phase: 'idle', targetId: null, fallback: null });
    });
  },
  /** 처음으로 — 판이 끝나거나 화면을 나갈 때 */
  reset(): void {
    clearTimers();
    for (const t of downTimers) window.clearTimeout(t);
    downTimers = [];
    downAt.clear();
    patch({ phase: 'idle', targetId: null, fallback: null, shotAt: -Infinity, shots: 0 });
  },
};

// 개발 화면에서 콘솔로 처형을 시험한다 — window.__executioner.execute(<좌석 id>) (표적 id 는 Executioner.tsx 의 __executionerTargets())
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __executioner?: unknown }).__executioner = executioner;
