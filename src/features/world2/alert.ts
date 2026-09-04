/**
 * 경보도 — **공용 계량기.** SYNC 를 뺀 자리에 이것이 들어간다.
 *
 * 의심도는 나를 향한 것이고(100 이면 나만 죽는다), 경보도는 이 판이 만든 소란의 총합이다.
 * 오를수록 모두의 판이 어려워진다 — 한 사람의 실수가 세금이 된다.
 *
 * ★ 경보도는 **아무도 지목하지 않는다.** 공용 계량기는 판을 어렵게 만들 뿐, 누가 소란을 만들었는지는
 *   조각만이 안다 (fragments.ts). 그래야 서로를 의심하는 일이 시스템이 시켜서가 아니라 플레이어가 골라서 일어난다.
 *
 * 본판의 의심도(world/mp/suspicion)는 그대로 쓴다 — 계량기를 새로 만들지 않는 것이 설계의 절반이다.
 * 여기 있는 것은 「둘째 계량기」 하나뿐이다.
 */

export const THRESHOLDS = [40, 60, 80, 100] as const;
export type Threshold = (typeof THRESHOLDS)[number];

/** 구역이 조여드는 방식 — 넘을 때마다 SYSTEM 이 한 줄 방송한다 (대본 「쉬어 본 적 있나」 v3) */
export const THRESHOLD_LINES: Record<Threshold, string> = {
  40: '구역 경보. 검문 시간을 단축한다.',
  60: '순찰 증편. 격리 기준을 낮춘다.',
  80: '전 개체 재확인. 통과 없음.',
  100: '구역 봉쇄. 출입 전면 차단.',
};

interface State {
  value: number;
  /** 이미 넘은 문턱 — 같은 줄을 두 번 띄우지 않는다 */
  passed: Threshold[];
}

const state: State = { value: 0, passed: [] };
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export const alert = {
  get(): number {
    return state.value;
  },
  /** 지금 걸려 있는 가장 높은 문턱 (없으면 0) */
  tier(): number {
    return state.passed.length > 0 ? state.passed[state.passed.length - 1] : 0;
  },
  /** 올린다. 새로 넘은 문턱이 있으면 돌려준다 — 부르는 쪽이 그 줄을 띄운다 */
  raise(n: number): Threshold | null {
    if (n <= 0 || state.value >= 100) return null;
    state.value = Math.min(100, state.value + n);
    let hit: Threshold | null = null;
    for (const t of THRESHOLDS) {
      if (state.value >= t && !state.passed.includes(t)) {
        state.passed.push(t);
        hit = t;
      }
    }
    notify();
    return hit;
  },
  /** 조용한 방에서만 아주 천천히 내려간다 — 내려가는 길이 없으면 판이 한 방향으로만 간다 */
  cool(n: number): void {
    if (state.value <= 0) return;
    state.value = Math.max(0, state.value - n);
    notify();
  },
  sealed(): boolean {
    return state.value >= 100;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(): void {
    state.value = 0;
    state.passed.length = 0;
    notify();
  },
};
