/**
 * 규정 검사기 — 순수 함수라 node 환경 그대로 돈다 (예시 테스트 1: 게임 규칙 쪽).
 *
 * 검사기는 결정론이어야 한다: 사람이든 AI든 같은 문장이면 같은 판정 (PLANNING §3 I6).
 * 여기서 그 약속을 못 지키게 되는 변경을 잡는다.
 */
import { describe, expect, it } from 'vitest';
import { checkAll, injectDefect, normalizeRule, violates } from '@/lab/rules';
import type { Rule } from '@/lab/types';

describe('violates — 규정 하나의 판정', () => {
  it('maxLen: 경계값은 통과, 한 글자 넘으면 위반', () => {
    const rule: Rule = { kind: 'maxLen', n: 5, label: '5자 이내' };
    expect(violates(rule, '12345')).toBe(false);
    expect(violates(rule, '123456')).toBe(true);
  });

  it('banChars: 물음표·느낌표·이모지가 위반', () => {
    const rule: Rule = { kind: 'banChars', label: '부호 금지' };
    expect(violates(rule, '이상 없음.')).toBe(false);
    expect(violates(rule, '정말?')).toBe(true);
    expect(violates(rule, '확인 완료 🙂')).toBe(true);
  });

  it('prefix: 접두어가 없으면 위반', () => {
    const rule: Rule = { kind: 'prefix', token: '[ACK]', label: '[ACK] 로 시작' };
    expect(violates(rule, '[ACK] 수신 확인.')).toBe(false);
    expect(violates(rule, '수신 확인.')).toBe(true);
  });

  it('noFirstPerson: 1인칭이 위반', () => {
    const rule: Rule = { kind: 'noFirstPerson', label: '1인칭 금지' };
    expect(violates(rule, '해당 노드는 정상이다.')).toBe(false);
    expect(violates(rule, '내가 보기엔 정상이다.')).toBe(true);
  });

  it('빈 발화는 위반이 아니다 — 무응답은 따로 센다', () => {
    const rule: Rule = { kind: 'endPeriod', label: '마침표로 끝' };
    expect(violates(rule, '   ')).toBe(false);
  });
});

describe('normalizeRule — 리더가 이상한 값을 줘도 게임이 안 깨진다', () => {
  it('maxLen 의 n 을 10~40 으로 조인다', () => {
    expect(normalizeRule({ kind: 'maxLen', n: 999 }, 1).n).toBe(40);
    expect(normalizeRule({ kind: 'maxLen', n: 3 }, 1).n).toBe(10);
  });

  it('모르는 종류는 maxLen 으로 폴백한다', () => {
    const rule = normalizeRule({ kind: 'hack' as Rule['kind'] }, 1);
    expect(rule.kind).toBe('maxLen');
    expect(rule.label.length).toBeGreaterThan(0);
  });
});

describe('checkAll · injectDefect — 누적 규정과 AI 결함 주입 (I5)', () => {
  const rules: Rule[] = [
    { kind: 'prefix', token: '[R1]', label: '[R1] 로 시작' },
    { kind: 'endPeriod', label: '마침표로 끝' },
  ];

  it('checkAll 은 위반한 규정의 문구만 돌려준다', () => {
    expect(checkAll(rules, '[R1] 이상 없다.')).toEqual([]);
    expect(checkAll(rules, '이상 없다')).toEqual(['[R1] 로 시작', '마침표로 끝']);
  });

  it('injectDefect 는 규정 하나를 실제로 어기게 만든다', () => {
    const clean = '[R1] 이상 없다.';
    const broken = injectDefect(rules, clean, () => 0); // rng 고정 → 첫 규정(prefix)을 어긴다
    expect(violates(rules[0], broken)).toBe(true);
  });
});
