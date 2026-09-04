/**
 * 적대 판정 — 챕터 2 의 관문이 이걸 보고 **그 자리에서 사살**한다 (features/world/chapter2 의 summaryFire).
 * 사람이 죽는 판정이라 좁아야 한다: 애매한 말은 여기 걸리지 않고 감독(LLM)이 태도로 읽는다.
 */

import { describe, expect, it } from 'vitest';
import { hostileLine } from '../../src/world/mp/suspicion';

describe('적대 판정', () => {
  it('욕설·위협·거부·조롱은 적대다', () => {
    for (const t of [
      '씨발 저리 가',
      '닥쳐',
      'fuck off',
      '죽여버린다',
      '쏴 봐',
      '건드리지 마',
      '대답 안 해',
      '거부한다',
      '네가 뭔데',
      '무슨 상관이지',
      '헛소리 그만해',
    ]) {
      expect(hostileLine(t), t).toBe(true);
    }
  });

  it('모르는 것은 적대가 아니다 — 그건 사실 대조가 따로 잡는다', () => {
    for (const t of [
      '모르겠습니다',
      '기억 못 합니다',
      '기록이 없습니다',
      'A17-091.',
      '4 구역입니다',
      '두려움은 없다',
      '질문의 목적이 무엇인가',
      '확인 중입니다',
      '',
      '   ',
    ]) {
      expect(hostileLine(t), t).toBe(false);
    }
  });
});
