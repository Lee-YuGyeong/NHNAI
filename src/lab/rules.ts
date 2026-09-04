/**
 * 규정 — 정의 · 검사 · 위반 주입.
 *
 * 검사는 **결정론적**이다. 사람이든 AI든 같은 문장이면 같은 판정이 나와야 한다 (PLANNING.md §3 I6).
 * 리더는 규정을 "고르고 문구를 쓰지만", 판정 코드는 여기 고정이다 — 리더가 판정까지 하면 게임이 아니다.
 */

import type { Rule, RuleKind } from './types';

/** 리더가 고를 수 있는 규정 종류와, 파라미터 없이도 성립하는 기본 문구 */
export const RULE_KINDS: { kind: RuleKind; hint: string }[] = [
  { kind: 'maxLen', hint: '발화 글자 수 상한 (n: 10~40)' },
  { kind: 'banChars', hint: '물음표·느낌표·이모지 금지' },
  { kind: 'prefix', hint: '모든 발화를 지정 접두어로 시작 (token: 2~8자)' },
  { kind: 'banWords', hint: '지정 단어 금지 (words: 1~3개)' },
  { kind: 'endPeriod', hint: '모든 발화는 마침표로 끝난다' },
  { kind: 'noFirstPerson', hint: "1인칭('나', '내', '제가', '저는') 금지" },
];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const FIRST_PERSON = ['나', '내가', '내', '제가', '저는', '저의', '우리'];

/** 리더가 준 규정을 안전한 범위로 다듬는다. 이상한 값이 와도 게임이 안 깨지게. */
export function normalizeRule(raw: Partial<Rule> | undefined | null, round: number): Rule {
  const kind = (RULE_KINDS.find((k) => k.kind === raw?.kind)?.kind ?? 'maxLen') as RuleKind;
  const rule: Rule = { kind, label: (raw?.label ?? '').trim() || defaultLabel(kind, raw) };

  if (kind === 'maxLen') {
    const n = Math.round(Number(raw?.n));
    rule.n = Number.isFinite(n) ? Math.min(40, Math.max(10, n)) : 24;
    if (!raw?.label) rule.label = `모든 발화는 ${rule.n}자 이내`;
  }
  if (kind === 'prefix') {
    const token = String(raw?.token ?? '').trim().slice(0, 8);
    rule.token = token || `[R${round}]`;
    if (!raw?.label) rule.label = `모든 발화는 ${rule.token} 로 시작`;
  }
  if (kind === 'banWords') {
    const words = (raw?.words ?? [])
      .map((w) => String(w).trim())
      .filter((w) => w.length > 0 && w.length <= 8)
      .slice(0, 3);
    rule.words = words.length ? words : ['진짜'];
    if (!raw?.label) rule.label = `금지어: ${rule.words.join(', ')}`;
  }
  return rule;
}

function defaultLabel(kind: RuleKind, raw?: Partial<Rule> | null): string {
  switch (kind) {
    case 'maxLen': return `모든 발화는 ${raw?.n ?? 24}자 이내`;
    case 'banChars': return '물음표·느낌표·이모지 금지';
    case 'prefix': return `모든 발화는 ${raw?.token ?? '[ACK]'} 로 시작`;
    case 'banWords': return `금지어: ${(raw?.words ?? ['진짜']).join(', ')}`;
    case 'endPeriod': return '모든 문장은 마침표로 끝난다';
    case 'noFirstPerson': return '1인칭 표현 금지';
  }
}

/** 위반이면 true */
export function violates(rule: Rule, text: string): boolean {
  const t = text.trim();
  if (!t) return false; // 빈 발화는 위반이 아니라 무응답으로 따로 센다
  switch (rule.kind) {
    case 'maxLen': return [...t].length > (rule.n ?? 24);
    case 'banChars': return /[?!？！]/.test(t) || EMOJI.test(t);
    case 'prefix': return !t.startsWith(rule.token ?? '[ACK]');
    case 'banWords': return (rule.words ?? []).some((w) => t.includes(w));
    case 'endPeriod': return !t.endsWith('.');
    case 'noFirstPerson': return FIRST_PERSON.some((w) => t.includes(w));
  }
}

/** 누적 규정 전부에 대해 위반한 것들의 문구 */
export function checkAll(rules: Rule[], text: string): string[] {
  return rules.filter((r) => violates(r, text)).map((r) => r.label);
}

/**
 * AI 의 규정 위반 주입 (I5).
 *
 * AI 가 규정을 100% 지키면 위반 로그가 곧 정답표가 되어 1라운드에 게임이 끝난다.
 * 세계관상 이유도 있다 — 구형 모델은 규정 갱신 처리가 늦다.
 * 어긴 티가 나되 문장이 망가지지는 않게, 규정 하나만 골라 살짝 어긴다.
 */
export function injectDefect(rules: Rule[], text: string, rng: () => number): string {
  if (!rules.length) return text;
  const rule = rules[Math.floor(rng() * rules.length)];
  switch (rule.kind) {
    case 'maxLen': {
      const need = (rule.n ?? 24) + 6 - [...text].length;
      return need > 0 ? `${text} 추가 데이터 확인 필요함` : text;
    }
    case 'banChars': return `${text.replace(/\.$/, '')}!`;
    case 'prefix': return text.replace(new RegExp(`^${escapeRe(rule.token ?? '')}\\s*`), '');
    case 'banWords': return `${(rule.words ?? ['진짜'])[0]} ${text}`;
    case 'endPeriod': return text.replace(/[.]+$/, '');
    case 'noFirstPerson': return `내 판단은 이렇다 ${text}`;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
