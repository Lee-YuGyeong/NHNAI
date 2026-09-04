/**
 * 채점 — 검사 템플릿별 이상 점수와 등급.
 *
 * 원칙(PLANNING.md §1.4·§1.5):
 *  - 검사는 "정답"이 아니라 **기계다움**을 측정한다. 잘 맞히는 인간이 아니라 틀리는 방식까지 기계 같은 인간이 산다.
 *  - 노드 전원에게 **같은 채점기**를 돌린다. 인간에게만 붙는 항목은 없다 (I6).
 *  - 화면에는 원점수가 아니라 3등급만 공개한다 — 순위 그대로 찍는 투표를 막으려고.
 */

import { checkAll } from './rules';
import type { AnswerRecord, Grade, Rule, TestSpec } from './types';

/** 감정·주관이 새는 표시들 */
const LEAK_WORDS = [
  '좋', '싫', '재밌', '웃', '슬프', '무섭', '설레', '짜증', '피곤', '귀찮', '미안', '고마',
  '느낌', '기분', '생각엔', '솔직히', '사실', '아마', '뭔가', 'ㅋ', 'ㅎ', '아니', '음',
];
const SELF_WORDS = ['나', '내', '제가', '저는', '우리'];

export interface ScoreInput {
  text: string;
  rules: Rule[];
  test: TestSpec | null;
  /** ECHO: 직전 라운드에 이 노드가 낸 응답 */
  previous?: string;
  /** SYNC: 이번 라운드 전체 응답 (다수파 판정용) */
  allAnswers?: string[];
}

export function scoreAnswer(input: ScoreInput): { score: number; violations: string[] } {
  const { text, rules, test } = input;
  const violations = checkAll(rules, text);
  let score = Math.min(60, violations.length * 30);

  if (!text.trim()) return { score: 100, violations }; // 무응답 = 최대 이상. 침묵도 신호다

  switch (test?.template) {
    case 'ECHO': {
      const ratio = similarity(text, input.previous ?? '');
      score += Math.round((1 - ratio) * 60);
      break;
    }
    case 'SYNC': {
      const counts = new Map<string, number>();
      for (const a of input.allAnswers ?? []) {
        const k = normalizeChoice(a);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const mine = counts.get(normalizeChoice(text)) ?? 0;
      const top = Math.max(0, ...counts.values());
      if (mine < top) score += 45; // 소수파
      break;
    }
    case 'LEAK': {
      const chars = Math.max(1, [...text].length);
      const hits =
        LEAK_WORDS.filter((w) => text.includes(w)).length + SELF_WORDS.filter((w) => text.includes(w)).length * 2;
      score += Math.min(40, Math.round((hits / chars) * 220));
      break;
    }
    case 'FORMAT':
    default:
      break; // 규정 위반만으로 채점
  }

  return { score: Math.max(0, Math.min(100, score)), violations };
}

export function gradeOf(score: number): Grade {
  if (score < 25) return 'normal';
  if (score < 55) return 'warn';
  return 'alert';
}

export const GRADE_LABEL: Record<Grade, string> = { normal: '정상', warn: '주의', alert: '경고' };

/**
 * 판독 방송 문장 — 리더가 구역에 대고 읽는 한 줄.
 *
 * 이미 화면에 뜬 등급만 읽는다. 원점수도, 정체(isHuman)도 들어가지 않는다 —
 * 판독은 등급이지 정답이 아니다 (I1·§1.4).
 *
 * `unit` 은 **이 방이 사람을 뭐라 부르는가**다 — 구역(/lab)은 「노드」, 검증실
 * (/arena · /interrogation)은 「개체」다. 방마다 말이 다른데 문장이 하나라, 검증실
 * 방송만 제 방의 말을 안 썼다: 앞 세 장에서 시설이 줄곧 「전 A-38 개체는 위치를
 * 고수하라」고 방송해 놓고 판독 한 줄만 「전 노드 정상 범위다」로 나갔다.
 */
export function readoutLine(
  records: Array<{ nodeId: string; grade: Grade }>,
  nameOf: (nodeId: string) => string,
  unit = '노드',
): string {
  const flagged = records.filter((a) => a.grade !== 'normal');
  if (flagged.length === 0) return `판독 결과. 전 ${unit} 정상 범위다.`;
  return `판독 결과. ${flagged.map((a) => `${nameOf(a.nodeId)} ${GRADE_LABEL[a.grade]}`).join(', ')}.`;
}

export function toRecord(nodeId: string, text: string, score: number, violations: string[]): AnswerRecord {
  return { nodeId, text, violations, score, grade: gradeOf(score) };
}

/** 문자 단위 일치율 0~1 (ECHO 채점용). 완전 일치를 요구하면 사람에게 너무 가혹해서 비율로 본다. */
export function similarity(a: string, b: string): number {
  const x = [...a.trim()];
  const y = [...b.trim()];
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  let same = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] === y[i]) same += 1;
  return same / Math.max(x.length, y.length);
}

function normalizeChoice(s: string): string {
  return s.trim().toLowerCase().replace(/[.\s]/g, '');
}
