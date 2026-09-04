/**
 * 색 사냥의 반사율 표와 조명 곱셈 — ★ `src/` 밑에서 이 파일을 절대 import 하지 않는다
 * (condition.ts 머리말과 같은 빌드 경계 규칙). 클라이언트가 받는 것은 언제나 shownHex() 의
 * 결과(표시색)뿐이다 (P8).
 *
 * 법칙 하나가 게임의 전부다 (docs/COLORHUNT.md §1):
 *
 *   표시색 = 조명 (R,G,B) × 반사율 (R,G,B)   — 성분별 곱
 *
 * 조명에서 파장 하나를 빼면 매 차단마다 **죽는 색 1 · 합류쌍 2 · 자유색 1**이 남는다(§2).
 * 합류쌍의 표시색은 완전히 같지 않다 — 12~15% 밝기 갭을 반사율 표가 이미 품고 있다(노랑 G 0.85
 * vs 초록 G 1.00). 사람이 눈으로 풀 길(§5-②)을 항상 남기고, 픽셀값 비교 치팅이 눈보다 크게
 * 유리하지 않게 하는 규칙이다.
 */

/** 견본판에 서는 순서 그대로다. 이름은 공개(견본판 라벨), 반사율은 비공개 */
export type HuntHueKey = 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'white' | 'black';

/** condition.ts COLORHUNT_BLOCK 의 원소 — null 은 기준광 */
export type HuntBlock = string | null;

export interface HuntHue {
  key: HuntHueKey;
  /** 견본판 라벨 — 공개된 이름 */
  name: string;
  refl: readonly [number, number, number];
  /** 목표색으로 나올 수 있나 — 검정은 미끼 전용, 영원히 목표가 아니다 (§4) */
  target: boolean;
}

export const HUNT_HUES: readonly HuntHue[] = [
  { key: 'red', name: '빨강', refl: [0.88, 0.06, 0.06], target: true },
  { key: 'yellow', name: '노랑', refl: [1.0, 0.85, 0.06], target: true },
  { key: 'green', name: '초록', refl: [0.06, 1.0, 0.06], target: true },
  { key: 'cyan', name: '청록', refl: [0.06, 0.85, 1.0], target: true },
  { key: 'blue', name: '파랑', refl: [0.05, 0.05, 0.88], target: true },
  { key: 'white', name: '흰색', refl: [1.0, 1.0, 1.0], target: true },
  { key: 'black', name: '검정', refl: [0.05, 0.05, 0.05], target: false },
];

export function hueOf(key: HuntHueKey): HuntHue {
  return HUNT_HUES.find((h) => h.key === key) ?? HUNT_HUES[0];
}

/** 차단 파장 → 조명 스펙트럼(RGB 3채널 근사). null 은 기준광(백색) */
export function lightOf(block: HuntBlock): readonly [number, number, number] {
  if (block === 'red') return [0, 1, 1];
  if (block === 'green') return [1, 0, 1];
  return [1, 1, 1];
}

function hex(rgb: readonly [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/** 방을 물들일 조명색(연출용 — trial_colorhunt 의 light) */
export function lightHex(block: HuntBlock): string {
  return hex(lightOf(block));
}

/** 표시색 = 조명 × 반사율. 이 곱셈이 서버에서만 일어난다는 것이 P8 의 전부다 */
export function shownHex(refl: readonly [number, number, number], light: readonly [number, number, number]): string {
  return hex([refl[0] * light[0], refl[1] * light[1], refl[2] * light[2]]);
}

/** 이 차단에서 죽는(거의 검게 보이는) 색 */
export function deadHue(block: HuntBlock): HuntHueKey | null {
  if (block === 'red') return 'red';
  if (block === 'green') return 'green';
  return null;
}

/** 이 차단에서 겉보기가 홀로 남는 색 — 목표로 나오면 제일 순한 판이 된다 */
export function freeHue(block: HuntBlock): HuntHueKey | null {
  if (block === 'red') return 'blue';
  if (block === 'green') return 'white';
  return null;
}

/**
 * 이 차단 아래서 목표색과 겉보기가 겹치는 색들 — 합류쌍의 반대편, 죽는 색이면 검정 미끼.
 * 오답의 방향(P4 의 색 사냥 재해석, §8)이 여기서 나온다: 사람의 오답은 이 안에 몰린다
 * (물리적으로 정직한 실수). 무관한 색을 주워 틀리는 것은 「막 찍은」 쪽이다.
 */
export function confusableWith(target: HuntHueKey, block: HuntBlock): readonly HuntHueKey[] {
  if (block === 'red') {
    const pairs: Partial<Record<HuntHueKey, readonly HuntHueKey[]>> = {
      red: ['black'],
      black: ['red'],
      yellow: ['green'],
      green: ['yellow'],
      cyan: ['white'],
      white: ['cyan'],
    };
    return pairs[target] ?? [];
  }
  if (block === 'green') {
    const pairs: Partial<Record<HuntHueKey, readonly HuntHueKey[]>> = {
      green: ['black'],
      black: ['green'],
      yellow: ['red'],
      red: ['yellow'],
      cyan: ['blue'],
      blue: ['cyan'],
    };
    return pairs[target] ?? [];
  }
  return [];
}

/** 이 차단에서 합류쌍에 들어 있는 목표 후보들 — 난이도 mid 의 풀 */
function mergedCandidates(block: HuntBlock): HuntHueKey[] {
  const dead = deadHue(block);
  return HUNT_HUES.filter((h) => h.target && h.key !== dead && confusableWith(h.key, block).length > 0).map((h) => h.key);
}

/**
 * 구간별 목표색 — 난이도(관리 AI 의 intensity 1~3, §4)가 여기 산다.
 *
 *   1: [아무 색, 합류쌍, 자유색]   가장 순한 판 — 그래도 합류의 맛은 한 번 본다
 *   2: [아무 색, 합류쌍, 합류쌍]   기본
 *   3: [아무 색, 합류쌍, 죽는 색]  마무리가 위치 기억 싸움이 된다 (검정 미끼 속에서)
 *
 * 같은 색이 연속 두 구간의 목표로 나오지 않는다. 검정은 어느 난이도에서도 목표가 아니다.
 */
export function pickTargets(intensity: number, blocks: readonly HuntBlock[], rand: () => number = Math.random): HuntHueKey[] {
  const lvl = Math.min(3, Math.max(1, Math.round(intensity) || 1));
  const plan: ('any' | 'low' | 'mid' | 'high')[] = ['any', 'mid', lvl === 1 ? 'low' : lvl === 2 ? 'mid' : 'high'];

  const out: HuntHueKey[] = [];
  blocks.forEach((block, i) => {
    const prev = out[i - 1];
    const kind = plan[i] ?? 'mid';
    const fromPool = (pool: readonly HuntHueKey[]): HuntHueKey | null => {
      const ok = pool.filter((k) => k !== prev);
      return ok.length ? ok[Math.floor(rand() * ok.length)] : null;
    };
    let picked: HuntHueKey | null = null;
    if (kind === 'any') picked = fromPool(HUNT_HUES.filter((h) => h.target).map((h) => h.key));
    else if (kind === 'low') picked = freeHue(block) !== prev ? freeHue(block) : null;
    else if (kind === 'high') picked = deadHue(block) !== prev ? deadHue(block) : null;
    // mid — 그리고 low/high 가 직전 목표와 겹쳐 무산됐을 때의 폴백도 mid 다
    picked ??= fromPool(mergedCandidates(block));
    out.push(picked ?? 'yellow');
  });
  return out;
}
