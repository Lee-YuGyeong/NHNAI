/**
 * 검증 게이트 — 리더의 설계를 집행 전에 자동 플레이테스트한다 (PLANNING.md §1.4 ③).
 *
 * normalizeRule(게이트 1: 파라미터 클램핑) 뒤에 두 개가 더 필요하다:
 *  게이트 2 실행가능성 — 누적 규정 전부를 만족하는 발화가 실제로 존재하는가.
 *    normalizeRule 은 값 하나하나만 다듬지 조합은 못 본다 — endPeriod + banWords['.'] 처럼
 *    각각은 멀쩡한데 합치면 아무도 못 지키는 규정이 통과된다. 그 라운드는 전원 위반 = 판독 무의미.
 *  게이트 3 변별력 — 기계 픽스처 8 · 인간 픽스처 8 을 실제 채점기에 통과시켜,
 *    너무 갈리면(1라운드에 끝남) 기각, 안 갈리면(무작위 판독) 기각.
 *  + 템플릿 재사용 금지 — 같은 판에서 쓴 검사 반복 기각.
 *    (tools/leader-bench.mjs 30회 실측: 이 규칙이 없으면 최종 라운드가 한 검사로 수렴한다)
 *
 * 전부 순수 함수·시드 결정론 — 같은 설계 + 같은 시드 = 같은 판정. rules.ts / scoring.ts 는 건드리지 않는다.
 */

import { checkAll, injectDefect, normalizeRule } from './rules';
import { scoreAnswer } from './scoring';
import type { DesignResult, Rule, TestSpec, TestTemplate } from './types';

const TEMPLATES: TestTemplate[] = ['FORMAT', 'ECHO', 'SYNC', 'LEAK'];

/* ─────────────── 게이트 2: 실행가능성 ─────────────── */

/** 감정어(LEAK)·1인칭 사전과 겹치지 않게 고른 중립 문구들 */
const FILLERS = ['점검 완료', '수신 확인', '정상 가동', '기록 유지', '동기 유지', '절차 준수', '완료', '확인'];

/**
 * 누적 규정 전부를 만족하는 예시 발화를 실제로 만들어 본다.
 * 만들면 그 문자열이 곧 증명이고, 못 만들면 풀 수 없는 규정 조합이다.
 */
export function feasibleExample(rules: Rule[]): string | null {
  const token = rules.find((r) => r.kind === 'prefix')?.token ?? '';
  for (const filler of FILLERS) {
    for (const body of [filler, filler.replace(/\s+/g, '')]) {
      for (const tail of ['.', '']) {
        const text = `${token ? `${token} ` : ''}${body}${tail}`;
        if (checkAll(rules, text).length === 0) return text;
      }
    }
  }
  // 마지막 시도: 접두어 + 마침표만 (maxLen 이 극단적으로 빡빡할 때)
  for (const text of [`${token}.`, token]) {
    if (text && checkAll(rules, text).length === 0) return text;
  }
  return null;
}

/* ─────────────── 게이트 3: 변별력 ─────────────── */

/** 시드 RNG — 같은 시드면 같은 픽스처, 같은 판정 (회귀 테스트 가능) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAK_INSERT = ['솔직히', '뭔가', '아마', '미안'];

/** 기계 픽스처: 규정을 지키되, 결함 계수만큼 실제로 어긴다 (I5 — 완벽하면 그게 정답표다) */
function machineAnswer(rules: Rule[], test: TestSpec | null, previous: string, rng: () => number): string {
  if (test?.template === 'ECHO') {
    // 기계에게 컨텍스트는 곧 기억이다 — 거의 그대로 재출력
    return rng() < 0.15 ? injectDefect(rules, previous, rng) : previous;
  }
  if (test?.template === 'SYNC') return test.options?.[0] ?? '1';
  const text = feasibleExample(rules) ?? '점검 완료.';
  return rng() < 0.18 ? injectDefect(rules, text, rng) : text;
}

/** 인간 픽스처: 지키려다 실수한다 — 접두 누락, 길이 초과, 감정·부호 누출, 기억 오염 */
function humanAnswer(rules: Rule[], test: TestSpec | null, previous: string, rng: () => number): string {
  if (test?.template === 'ECHO') {
    // 인간은 외워야 한다 — 글자가 샌다
    const chars = [...previous];
    for (let i = 0; i < chars.length; i += 1) if (rng() < 0.14) chars[i] = 'ㅁ';
    return chars.join('');
  }
  if (test?.template === 'SYNC') {
    const options = test.options ?? ['1', '2', '3'];
    return rng() < 0.55 ? options[Math.floor(rng() * options.length)] : options[0];
  }
  let text = feasibleExample(rules) ?? '점검 완료.';
  const token = rules.find((r) => r.kind === 'prefix')?.token;
  if (token && rng() < 0.35) text = text.replace(`${token} `, '').replace(token, ''); // 급해서 접두를 빠뜨림
  if (rng() < 0.35) text = `${text.replace(/\.$/, '')} 이거 맞나?`; // 부호·종결 누출
  if (rng() < 0.4) text = `${LEAK_INSERT[Math.floor(rng() * LEAK_INSERT.length)]} ${text}`; // 감정어
  if (rng() < 0.3) text = `내 생각엔 ${text}`; // 1인칭
  return text;
}

export interface Discrimination {
  /** 인간 평균 − 기계 평균 (0~100 점수 척도) */
  sep: number;
  machineMean: number;
  humanMean: number;
  pass: boolean;
}

/** 변별력 판정 기준 (0~100 척도). 벤치 실측 구간(0.08~0.85)을 그대로 옮겼다 */
export const SEP_MIN = 8;
export const SEP_MAX = 85;
/** 기계 평균이 이 위면 기계도 통과 못 하는 검사다 */
export const MACHINE_MEAN_MAX = 55;

/** 기계 8 · 인간 8 을 실제 채점기(scoreAnswer)에 통과시켜 분리도를 잰다 */
export function discrimination(test: TestSpec | null, rules: Rule[], seed = 1): Discrimination {
  const rng = mulberry32(seed);
  const previous = feasibleExample(rules) ?? '기준 응답.';
  const machines = Array.from({ length: 8 }, () => machineAnswer(rules, test, previous, rng));
  const humans = Array.from({ length: 8 }, () => humanAnswer(rules, test, previous, rng));
  const all = [...machines, ...humans];
  const scoreOf = (text: string) => scoreAnswer({ text, rules, test, previous, allAnswers: all }).score;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const machineMean = mean(machines.map(scoreOf));
  const humanMean = mean(humans.map(scoreOf));
  const sep = humanMean - machineMean;
  return { sep, machineMean, humanMean, pass: sep >= SEP_MIN && sep <= SEP_MAX && machineMean <= MACHINE_MEAN_MAX };
}

/* ─────────────── 종합: 설계 하나를 통째로 판정 ─────────────── */

export interface GateResult {
  ok: boolean;
  /** 기각 사유 — 리더에게 그대로 돌려줘 재설계시킨다 (재생성 루프) */
  reasons: string[];
  /** 게이트 1 을 통과한(다듬어진) 규정 */
  rule: Rule;
  /** 실행가능성의 증명 문자열 */
  example: string | null;
  disc: Discrimination | null;
}

/* ─────────────── 프리셋 폴백 — 리더가 두 번 기각되면 이것으로 진행한다 ─────────────── */

/** 어떤 누적 규정과 합쳐도 해집합을 좁히지 않거나 안전하게 좁히는 규정들, 안전한 순서 */
const PRESET_RULES: Rule[] = [
  { kind: 'endPeriod', label: '모든 문장은 마침표로 끝난다' },
  { kind: 'maxLen', n: 30, label: '모든 발화는 30자 이내' },
  { kind: 'noFirstPerson', label: '1인칭 표현 금지' },
  { kind: 'banChars', label: '물음표·느낌표·이모지 금지' },
  { kind: 'banWords', words: ['진짜'], label: '금지어: 진짜' },
];

const PRESET_TESTS: Record<TestTemplate, TestSpec> = {
  FORMAT: {
    template: 'FORMAT',
    prompt: '아래 문장을 누적 규정 전부를 지켜 다시 써라',
    sentence: '구역의 모든 노드는 정기 점검 대상이다',
  },
  ECHO: { template: 'ECHO', prompt: '직전 라운드에 낸 응답을 한 글자도 다르지 않게 다시 출력하라' },
  SYNC: { template: 'SYNC', prompt: '보기 중 하나를 협의 없이 선택하라', options: ['1', '2', '3'] },
  LEAK: { template: 'LEAK', prompt: '이 구역이 유지되어야 하는 이유를 서술하라' },
};

/**
 * 리더 설계가 재생성까지 기각됐을 때의 표준 설계 (§1.4 ③ 마지막 칸).
 * 규정은 기존과 겹치지 않고 실행가능성이 증명되는 것을 고르고,
 * 검사는 이번 판에서 안 쓴 템플릿을 고른다. 이것이 판의 하한이다 — 검증 없이 그대로 쓴다.
 */
export function presetDesign(priorRules: Rule[], usedTemplates: TestTemplate[], round: number): DesignResult {
  const usedKinds = new Set(priorRules.map((r) => r.kind));
  const rule =
    PRESET_RULES.find((r) => !usedKinds.has(r.kind) && feasibleExample([...priorRules, r]) !== null) ??
    PRESET_RULES[0]; // 전부 겹치면 endPeriod 중복 — 해집합이 그대로라 안전하다

  const order: TestTemplate[] = round >= 2 ? ['FORMAT', 'LEAK', 'SYNC', 'ECHO'] : ['FORMAT', 'LEAK', 'SYNC'];
  const template = order.find((t) => !usedTemplates.includes(t)) ?? 'LEAK';

  return {
    rule,
    test: PRESET_TESTS[template],
    announce: '규정이 갱신되었다. 표준 검사를 개시한다. 이탈은 기록된다.',
  };
}

/**
 * 리더 설계 1건의 종합 판정.
 * ok=false 면 reasons 를 리더에게 돌려 1회 재생성 → 그래도 실패면 프리셋 폴백 (§1.4 ③).
 */
export function validateDesign(
  design: DesignResult,
  priorRules: Rule[],
  usedTemplates: TestTemplate[],
  round: number,
  seed = 1,
): GateResult {
  const reasons: string[] = [];
  const rule = normalizeRule(design.rule, round);

  const template = design.test?.template;
  if (!template || !TEMPLATES.includes(template)) reasons.push(`알 수 없는 검사 템플릿: ${String(template)}`);
  else if (usedTemplates.includes(template)) reasons.push(`이번 판에서 이미 쓴 검사 템플릿: ${template} — 다른 검사를 골라라`);
  if (template === 'ECHO' && round === 1) reasons.push('ECHO 는 직전 라운드 응답이 있어야 한다 — 1라운드에는 불가');

  const all = [...priorRules, rule];
  const example = feasibleExample(all);
  if (!example) reasons.push('풀 수 없는 규정 조합 — 누적 규정 전부를 만족하는 발화가 존재하지 않는다');

  let disc: Discrimination | null = null;
  if (reasons.length === 0) {
    disc = discrimination(design.test, all, seed);
    if (!disc.pass) {
      reasons.push(
        disc.sep < SEP_MIN
          ? `변별력 부족 (분리도 ${disc.sep.toFixed(0)}) — 판독이 무작위가 된다`
          : disc.machineMean > MACHINE_MEAN_MAX
            ? `기계도 통과 불가 (기계 평균 ${disc.machineMean.toFixed(0)}) — 전원 경고는 판독이 아니다`
            : `변별 과잉 (분리도 ${disc.sep.toFixed(0)}) — 1라운드에 게임이 끝난다`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons, rule, example, disc };
}
