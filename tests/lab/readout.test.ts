/**
 * 판독 방송 문장 — 리더가 소리로 읽는 한 줄.
 *
 * 계약: 화면에 이미 뜬 등급만 읽는다. 원점수도 정체도 새어 나가지 않는다 (I1).
 * 이 파일이 지키는 건 "판독 방송이 정답표가 되지 않는다"는 약속이다.
 */
import { describe, expect, it } from 'vitest';
import { readoutLine } from '@/lab/scoring';
import type { AnswerRecord } from '@/lab/types';

const rec = (nodeId: string, grade: AnswerRecord['grade'], score = 0): AnswerRecord => ({
  nodeId,
  text: '아무 말',
  violations: [],
  score,
  grade,
});
const nameOf = (id: string) => ({ n1: '가람', n2: '나루', n3: '다온' })[id] ?? id;

describe('readoutLine', () => {
  it('전원 정상이면 이름을 하나도 부르지 않는다', () => {
    const line = readoutLine([rec('n1', 'normal'), rec('n2', 'normal')], nameOf);
    expect(line).toBe('판독 결과. 전 노드 정상 범위다.');
  });

  it('정상이 아닌 노드만 등급과 함께 부른다', () => {
    const line = readoutLine([rec('n1', 'normal'), rec('n2', 'warn'), rec('n3', 'alert')], nameOf);
    expect(line).toBe('판독 결과. 나루 주의, 다온 경고.');
    expect(line).not.toContain('가람'); // 정상 노드는 방송에 안 나온다
  });

  it('원점수는 절대 문장에 들어가지 않는다 — 순위 그대로 찍는 투표를 막는다', () => {
    const line = readoutLine([rec('n2', 'alert', 87)], nameOf);
    expect(line).not.toContain('87');
  });

  it('이름을 모르는 노드는 id 로 읽는다 (문장이 비지 않게)', () => {
    expect(readoutLine([rec('n9', 'warn')], nameOf)).toBe('판독 결과. n9 주의.');
  });

  it('방이 사람을 부르는 말을 따른다 — 검증실은 「개체」다', () => {
    expect(readoutLine([rec('n1', 'normal')], nameOf, '개체')).toBe('판독 결과. 전 개체 정상 범위다.');
    // 안 주면 여태 쓰던 말 그대로 (구역 /lab)
    expect(readoutLine([rec('n1', 'normal')], nameOf)).toBe('판독 결과. 전 노드 정상 범위다.');
  });
});
