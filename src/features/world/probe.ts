/**
 * 시선 판독 — **지금 무엇을 들여다보고 있는가.**
 *
 * 복도의 정비 단말과 그림이 그려진 벽은 「가까이 가서 정면으로 잠깐 본다」로 열린다 (Chapter1Scene 의 Triggers).
 * 그 잠깐이 화면에 안 보이면 플레이어는 자기가 뭘 하고 있는지 모른다 — 지나가다 우연히 열리거나,
 * 코앞에 두고도 조준이 어긋난 줄 모른 채 돌아선다 (2026-08-31 사용자: "복도에서 뭘 해야 할지 모를 수 있다").
 * 그래서 조준이 물린 순간부터 화면 가운데에 판독 눈금이 찬다.
 *
 * 순수 저장소다 (three·DOM·React 없음). 매 프레임 불리므로 **값이 실제로 바뀔 때만** 알린다 —
 * 진행도는 16단으로 잘라 재는데, 그 눈금이 바로 화면에 그려지는 칸 수다.
 */

export interface ProbeState {
  /** 지금 조준에 물린 것 — 아무것도 안 보고 있으면 null */
  label: string | null;
  /** 라벨 아래 한 줄 — 무엇을 하는 중인지 */
  hint: string;
  /** 판독 진행 0~1 */
  progress: number;
  /** 다 읽었다 — 잠깐 그대로 남았다가 사라진다 */
  done: boolean;
}

/** 눈금 칸 수 — ProbeHud 가 이만큼 그린다 */
export const PROBE_STEPS = 16;
/** 다 읽은 뒤 화면에 남는 시간 */
const DONE_MS = 1400;

/**
 * 상태는 **갈아 끼운다** — 같은 객체를 고쳐 쓰면 useSyncExternalStore 가 Object.is 로 같다고 보고 화면을 다시 그리지 않는다.
 * 값이 바뀔 때만 새 객체를 만드니 프레임마다 쓰레기가 생기지도 않는다 (aim 이 눈금 단위로 걸러 준다).
 */
let state: ProbeState = { label: null, hint: '', progress: 0, done: false };
const listeners = new Set<() => void>();
let clearAt = 0;

function emit() {
  for (const fn of listeners) fn();
}

/** 눈금 하나 단위로 자른 진행도 — 프레임마다 리렌더하지 않으려고 */
function step(p: number): number {
  return Math.round(Math.max(0, Math.min(1, p)) * PROBE_STEPS) / PROBE_STEPS;
}

export const probe = {
  get(): ProbeState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 조준이 물려 있다 — 매 프레임 불러도 된다 */
  aim(label: string, hint: string, progress: number): void {
    if (state.done) return;
    const p = step(progress);
    if (state.label === label && state.hint === hint && state.progress === p) return;
    state = { label, hint, progress: p, done: false };
    emit();
  },
  /** 다 읽었다 — 잠깐 「완료」로 남는다 */
  finish(hint: string): void {
    if (state.done || !state.label) return;
    state = { label: state.label, hint, progress: 1, done: true };
    emit();
    if (typeof window !== 'undefined') {
      window.clearTimeout(clearAt);
      clearAt = window.setTimeout(() => probe.clear(true), DONE_MS);
    }
  },
  /** 조준이 풀렸다. force = 완료 표시까지 지운다 */
  clear(force = false): void {
    if (state.done && !force) return;
    if (state.label === null && !state.done) return;
    if (typeof window !== 'undefined') window.clearTimeout(clearAt);
    state = { label: null, hint: '', progress: 0, done: false };
    emit();
  },
};

// 확인용 손잡이 — 헤드리스로는 시선 트리거를 못 물리므로(카메라를 밖에서 돌려도 앱은 제 자리를 본다) 여기서 직접 눈금을 채워 본다.
// features/world 의 __backstep 과 같은 규칙 — DEV 에서만.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __probe?: typeof probe }).__probe = probe;
