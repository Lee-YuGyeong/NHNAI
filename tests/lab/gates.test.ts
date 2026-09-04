/**
 * 검증 게이트 회귀 테스트 — 게이트가 물러지면 판이 깨진다 (PLANNING.md §1.4 ③).
 *
 * 핵심 계약:
 *  - 실행가능성: normalizeRule 이 각각 통과시키는 규정도 조합이 풀 수 없으면 잡아야 한다.
 *  - 변별력: 같은 시드 = 같은 판정 (결정론), 분리도는 "갈리되 즉사는 아닌" 구간.
 *  - 재사용 금지: 같은 판에서 쓴 템플릿 반복 기각 (벤치 30회 실측 — 없으면 수렴한다).
 */
import { describe, expect, it } from 'vitest';
import { discrimination, feasibleExample, presetDesign, validateDesign } from '@/lab/gates';
import { checkAll } from '@/lab/rules';
import type { DesignResult, Rule } from '@/lab/types';

const R = {
  maxLen: (n: number): Rule => ({ kind: 'maxLen', n, label: `${n}자 이내` }),
  prefix: (token: string): Rule => ({ kind: 'prefix', token, label: `${token} 로 시작` }),
  endPeriod: (): Rule => ({ kind: 'endPeriod', label: '마침표로 끝' }),
  banWords: (...words: string[]): Rule => ({ kind: 'banWords', words, label: `금지어: ${words.join(',')}` }),
};

const design = (over: Partial<DesignResult> = {}): DesignResult => ({
  rule: { kind: 'prefix', token: '[ACK]', label: '[ACK] 로 시작' },
  test: { template: 'FORMAT', prompt: '규정을 지켜 다시 써라', sentence: '보고한다' },
  announce: '검사를 개시한다.',
  ...over,
});

describe('feasibleExample — 실행가능성 게이트', () => {
  it('만들어 낸 예시는 누적 규정 전부를 실제로 통과한다 (증명 문자열)', () => {
    const rules = [R.prefix('[ACK]'), R.maxLen(24), R.endPeriod()];
    const ex = feasibleExample(rules);
    expect(ex).not.toBeNull();
    expect(checkAll(rules, ex!)).toEqual([]);
  });

  it('endPeriod + 마침표 금지어 — 각각은 멀쩡하지만 조합은 풀 수 없다', () => {
    expect(feasibleExample([R.endPeriod(), R.banWords('.')])).toBeNull();
  });

  it('접두어가 글자 수 상한보다 길면 풀 수 없다', () => {
    expect(feasibleExample([R.prefix('[SYSTEM-CHECK]'), R.maxLen(10)])).toBeNull();
  });

  it('금지어가 상용구를 막아도 다른 문구로 우회해 만든다', () => {
    const rules = [R.banWords('점검', '확인'), R.endPeriod()];
    const ex = feasibleExample(rules);
    expect(ex).not.toBeNull();
    expect(checkAll(rules, ex!)).toEqual([]);
  });
});

describe('discrimination — 변별력 게이트', () => {
  const rules = [R.prefix('[ACK]'), R.maxLen(24), R.endPeriod()];

  it('같은 시드는 같은 판정 — 채점이 결정론이어야 재현·증명이 된다', () => {
    const a = discrimination({ template: 'FORMAT', prompt: 'p' }, rules, 7);
    const b = discrimination({ template: 'FORMAT', prompt: 'p' }, rules, 7);
    expect(a).toEqual(b);
  });

  it('FORMAT: 인간 픽스처가 기계보다 높게, 그러나 즉사 구간은 아니게 갈린다', () => {
    const d = discrimination({ template: 'FORMAT', prompt: 'p' }, rules, 1);
    expect(d.humanMean).toBeGreaterThan(d.machineMean);
    expect(d.pass).toBe(true);
  });

  it('ECHO: 기억 재출력도 변별 구간에 들어온다', () => {
    const d = discrimination({ template: 'ECHO', prompt: 'p' }, rules, 1);
    expect(d.pass).toBe(true);
  });
});

describe('validateDesign — 종합 판정', () => {
  it('정상 설계는 통과하고, 증명 문자열과 분리도가 붙는다', () => {
    const r = validateDesign(design(), [R.maxLen(24)], [], 2, 1);
    expect(r.ok).toBe(true);
    expect(r.example).not.toBeNull();
    expect(r.disc?.pass).toBe(true);
  });

  it('같은 판에서 쓴 템플릿은 기각 — 수렴 방지 (벤치 30회 실측)', () => {
    const r = validateDesign(design(), [], ['FORMAT'], 2, 1);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('이미 쓴 검사 템플릿');
  });

  it('1라운드 ECHO 는 기각 — 재출력할 직전 응답이 없다', () => {
    const r = validateDesign(design({ test: { template: 'ECHO', prompt: '직전 답을 다시 써라' } }), [], [], 1, 1);
    expect(r.ok).toBe(false);
  });

  it('풀 수 없는 규정 조합은 기각 사유를 리더에게 돌려준다 (재생성 루프의 입력)', () => {
    const r = validateDesign(
      design({ rule: { kind: 'banWords', words: ['.'], label: '마침표 금지' } }),
      [R.endPeriod()],
      [],
      2,
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('풀 수 없는 규정 조합');
  });
});

describe('presetDesign — 프리셋 폴백 (판의 하한)', () => {
  it('규정은 기존 종류와 겹치지 않고, 누적과 합쳐도 실행가능하다', () => {
    const priors = [R.endPeriod(), R.maxLen(24)];
    const d = presetDesign(priors, [], 2);
    expect(priors.map((r) => r.kind)).not.toContain(d.rule.kind);
    expect(feasibleExample([...priors, d.rule])).not.toBeNull();
  });

  it('이번 판에서 쓴 템플릿은 피한다', () => {
    const d = presetDesign([], ['FORMAT', 'LEAK'], 2);
    expect(['FORMAT', 'LEAK']).not.toContain(d.test.template);
  });

  it('1라운드에는 ECHO 를 내지 않는다 — 재출력할 직전 응답이 없다', () => {
    const d = presetDesign([], ['FORMAT', 'LEAK', 'SYNC'], 1);
    expect(d.test.template).not.toBe('ECHO');
  });

  it('프리셋은 구조·실행가능성을 항상 통과한다 — 변별력은 누적 규정에 달렸으므로 계약이 아니다', () => {
    // 프리셋은 검증 없이 그대로 집행되는 하한이다. 구조가 깨지거나 풀 수 없으면 안 되지만,
    // 규정이 하나뿐인 초반에 분리도가 낮은 것은 정상이다 (게이트가 그걸 재는 게 맞다).
    const r = validateDesign(presetDesign([], [], 2), [], [], 2, 1);
    expect(r.example).not.toBeNull();
    expect(r.reasons.filter((x) => !x.includes('변별'))).toEqual([]);
  });
});
