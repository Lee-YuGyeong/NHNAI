/**
 * 기억 조각 — **세계가 기억하는 단위.**
 *
 * 의심도라는 스칼라 하나로는 소문이 못 돈다. 퍼질 수 있는 알갱이가 있어야 한다.
 * 내가 한 마디, 한 행동은 조각 하나가 되어 **그 자리에 있던 개체에게만** 남고, 개체들 사이를 옮겨 다니며 닳고 뒤틀린다.
 *
 * 전파 규칙은 셋이면 충분하다:
 *   ① 그 자리에 있던 개체만 원본을 받는다 — 목격자를 만들지 않는 것이 곧 은폐다.
 *   ② 옮길 때마다 신뢰도가 깎이고 한 번 뒤틀린다 — 뒤틀림은 요약이다. 문장이 짧아지고 주어가 사라진다.
 *   ③ 신뢰도 0.3 아래에서 출처가 지워진다 — 「누가 그랬다더라」가 되는 지점이고, 혐의를 남에게 넘길 수 있는 유일한 틈이다.
 *
 * ★ 조각은 전부 **사람이 읽을 수 있는 한 줄 한국어**다. 벡터나 점수로 저장하는 순간 왜 그 판이 그렇게 됐는지
 *   아무도 설명 못 한다 — 디버그 화면에서 전파 경로를 눈으로 따라갈 수 있어야 고칠 수 있다 (FragmentLog.tsx).
 * ★ 모델을 부르지 않는다. 여기까지가 규칙만으로 서는 뼈대이고, 모델은 나중에 문장을 **짓기만** 한다.
 */

import { ROSTER } from './units';

export type Tag = '모순' | '평범' | '인간적';

export interface Fragment {
  id: string;
  text: string;
  /** 출처 — '나' 이거나 개체 id. 신뢰도 0.3 아래로 떨어지면 **null 이 된다** */
  from: string | null;
  /** 어디서 생긴 말인가 — 「복도에서 한 말」이 검문에서 모순을 잡는 근거가 된다 */
  where: string;
  /** 판이 시작하고 몇 ms — 화면에는 07:14 꼴로 나간다 */
  at: number;
  tags: readonly Tag[];
  /** 옮길 때마다 깎인다 */
  trust: number;
  /** 지금 이 조각을 들고 있는 개체들 */
  holders: string[];
  /** 몇 번 옮겨졌나 — 뒤틀림의 단계다 */
  hops: number;
  /**
   * 이미 옮겨졌다. 한 조각은 **한 번만 옮겨 간다** — 안 그러면 원본이 계속 새 사본을 낳아
   * 같은 말이 신뢰도 1.00 짜리로 판에 열 장씩 깔린다(그러면 닳지도 뒤틀리지도 않는다).
   * 옮겨 간 뒤에도 원본은 그 개체의 기억에 그대로 남는다 — 사라지는 게 아니라 더 안 퍼지는 것이다.
   */
  passed: boolean;
  /** 뒤틀 때 남길 핵심 낱말 (「4 구역이었다」의 '구역'). 형태소를 추측하지 않으려고 만들 때 같이 받는다 */
  topic: string;
}

/** 한 번 옮길 때 깎이는 신뢰도 */
export const DECAY = 0.25;
/** 이 아래로 내려가면 출처가 지워진다 */
export const ANON_AT = 0.3;
/** 전파 틱 — 소문이 도는 데 걸리는 시간이다. 지연을 숨기지 않고 거리로 판다 */
export const SPREAD_MS = 2600;

const list: Fragment[] = [];
const listeners = new Set<() => void>();
let seq = 0;
let t0 = performance.now();

function notify() {
  for (const fn of listeners) fn();
}

/**
 * 뒤틀림 — 요약이다. 단계마다 문장이 짧아지고 주어가 사라진다.
 * 규칙이 단순해야 플레이어가 학습할 수 있다: 두세 판이면 「짧아지고 주어가 사라진다」를 배운다.
 * 그런데 자기 말이 정확히 어떤 문장으로 돌아올지는 못 맞힌다 — 배울 수 있는 규칙 위의 못 맞히는 결과.
 */
function twist(f: Fragment, hop: number): string {
  if (hop === 1) return `${f.text}라고 했다`;
  if (hop === 2) return `${f.topic}을 헷갈렸다`;
  const rumor: Record<Tag, string> = {
    모순: `${f.topic}을 못 외우는 개체가 있다더라`,
    인간적: `${f.topic} 얘기를 하는 개체가 있다더라`,
    평범: `${f.topic} 얘기가 돌더라`,
  };
  return rumor[f.tags[0] ?? '평범'];
}

export const fragments = {
  /** 판이 시작한 시각을 다시 잡는다 (방을 옮겨도 시계는 안 바뀐다 — 한 판이 한 시계다) */
  start(): void {
    t0 = performance.now();
  },

  /**
   * 조각 하나를 만든다. `witnesses` 가 비어 있으면 **아무 데도 안 남는다** — 목격자를 만들지 않는 것이 은폐다.
   * 남긴 개체에게는 표식(units.mark)이 붙는다: 재검실이 증인을 고를 때 그 수를 센다.
   */
  make(input: { text: string; topic: string; from: string; where: string; tags?: readonly Tag[]; witnesses: readonly string[] }): Fragment | null {
    if (input.witnesses.length === 0) return null;
    seq += 1;
    const f: Fragment = {
      id: `s-${String(seq).padStart(3, '0')}`,
      text: input.text,
      topic: input.topic,
      from: input.from,
      where: input.where,
      at: performance.now() - t0,
      tags: input.tags ?? ['평범'],
      trust: 1,
      holders: [...input.witnesses],
      hops: 0,
      passed: false,
    };
    list.push(f);
    notify();
    return f;
  },

  /**
   * 한 틱. 조각 하나가 이웃에게 옮겨 간다 — 옮겨 간 것은 **새 조각**이고, 원본은 그 자리에 남는다.
   * (원본을 고쳐 버리면 「누가 처음 그랬나」가 판에서 영영 사라진다.)
   */
  spread(): Fragment | null {
    const movable = list.filter((f) => !f.passed && f.holders.length > 0 && f.hops < 3);
    if (movable.length === 0) return null;
    const src = movable[Math.floor(Math.random() * movable.length)];
    const rest = ROSTER.filter((u) => !src.holders.includes(u.id));
    if (rest.length === 0) return null;
    const to = rest[Math.floor(Math.random() * rest.length)];

    src.passed = true;
    seq += 1;
    const hops = src.hops + 1;
    const trust = Math.max(0, Math.round((src.trust - DECAY) * 100) / 100);
    const moved: Fragment = {
      id: `s-${String(seq).padStart(3, '0')}`,
      text: twist(src, hops),
      topic: src.topic,
      // ③ 출처가 지워지는 지점 — 여기서부터 이 말은 누구에게나 붙을 수 있다
      from: trust < ANON_AT ? null : src.from,
      where: src.where,
      at: performance.now() - t0,
      tags: src.tags,
      trust,
      holders: [to.id],
      hops,
      passed: false,
    };
    list.push(moved);
    notify();
    return moved;
  },

  /** 이 개체가 들고 있는 조각들 */
  heldBy(unitId: string): Fragment[] {
    return list.filter((f) => f.holders.includes(unitId));
  },
  /** 출처가 지워진 조각들 — 혐의를 얹을 수 있는 자리 */
  anonymous(): Fragment[] {
    return list.filter((f) => f.from === null);
  },
  all(): readonly Fragment[] {
    return list;
  },
  count(): number {
    return list.length;
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(): void {
    list.length = 0;
    seq = 0;
    t0 = performance.now();
    notify();
  },
};

/** 조각에 찍히는 시각 — 07:14 꼴 */
export function stamp(at: number): string {
  const s = Math.floor(at / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
