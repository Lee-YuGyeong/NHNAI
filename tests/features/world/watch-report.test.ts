/**
 * 감시에 대한 대응 — 뒤에 붙은 개체에게 **내가 먼저 상태 보고를 한 마디** 하면 순찰로 돌아간다
 * (2026-08-30 사용자: "따라올 때도 대응 방안이 있었으면 좋겠다"). 조력자는 그걸 딱 한 번 알려 줄 뿐이고,
 * 규칙은 여기 있다 — 받아 주는 말은 AI 다운 말(judgeLine 이 내려가는 쪽으로 읽은 한 마디)뿐이다.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { interrogation } from '../../../src/features/world/interrogation';
import { suspicion } from '../../../src/world/mp/suspicion';

const lines: { nickname: string; text: string }[] = [];

function watched(): void {
  interrogation.unbind();
  lines.length = 0;
  suspicion.reset();
  interrogation.setPaused(true); // 추궁이 저절로 걸리지 않게 — 여기서 보는 건 감시뿐이다
  interrogation.bind((l) => lines.push(l), ['UNIT-07', 'UNIT-12']);
  suspicion.bump(42, '응시');
  interrogation.watchFrom(0);
}

describe('감시 대응', () => {
  beforeEach(watched);

  it('건조한 상태 보고 한 마디면 순찰로 돌아간다', () => {
    const before = suspicion.get().value;
    expect(interrogation.get().watch).toBe(0);

    expect(interrogation.report('구역 이상 없음. 정상 작동 중.')).toBe(true);

    expect(interrogation.get().watch).toBeNull();
    expect(suspicion.get().value).toBeLessThan(before - 10);
    expect(lines.at(-1)).toEqual({ nickname: 'UNIT-07', text: '확인. 순찰 복귀.' });
  });

  it('사람 티가 나는 말은 대응이 아니다 — 감시가 그대로 붙어 있다', () => {
    expect(interrogation.report('무서워요 제발 그만 따라와요')).toBe(false);
    expect(interrogation.get().watch).toBe(0);
  });

  it('감시가 안 붙었으면 아무 일도 없다 — 보고는 그냥 말투 판정으로 간다', () => {
    interrogation.unbind();
    interrogation.bind((l) => lines.push(l), ['UNIT-07', 'UNIT-12']);
    expect(interrogation.report('구역 이상 없음. 정상 작동 중.')).toBe(false);
  });
});
