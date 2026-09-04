/**
 * 방송 길이 캡 — 순수 함수라 node 환경 그대로 돈다.
 *
 * 캡은 **폭주를 막는 천장**이지 문장을 다듬는 가위가 아니다. 그래서 이 파일이
 * 지키는 것은 둘이다: 리더가 실제로 쓰는 방송은 통째로 읽힌다는 것,
 * 그러고도 넘칠 때는 **끝난 문장에서** 멎는다는 것.
 *
 * (한때 예산이 너무 짧아 80자 지시문이 23자만 읽혔다. 아래 '실제 방송' 묶음이 그 회귀 방지다.
 *  숫자를 직접 쓰지 않고 budgetChars 에서 뽑는 이유도 같다 — 예산을 조정해도 계약은 안 흔들린다)
 */
import { describe, expect, it } from 'vitest';
import { BUDGET, budgetChars, capForSpeech } from '@/features/tts/cap';
import type { BroadcastKind } from '@/shared/broadcast';

/** n자짜리 한 문장 (마침표 포함) */
const sentence = (n: number) => '가'.repeat(n - 1) + '.';

describe('예산 표', () => {
  it('경보가 제일 짧다 — 짧아야 경보다', () => {
    expect(BUDGET.alarm).toBeLessThan(BUDGET.announce);
    expect(BUDGET.alarm).toBeLessThan(BUDGET.readout);
  });

  it('한 방송이 다음 페이즈를 잡아먹지 않는다 — §1.2b 응답 35초보다 짧다', () => {
    for (const s of Object.values(BUDGET)) expect(s).toBeLessThan(35);
  });
});

describe('리더가 실제로 쓰는 방송은 통째로 읽힌다', () => {
  const REAL: Array<[BroadcastKind, string]> = [
    ['announce', '전 노드는 중앙 라인에 정렬한다. 신호에 맞춰 도약을 반복한다.'],
    ['announce', '전 노드는 왼쪽 표식으로 이동한다. 도착하면 3초간 정지한다. 신호가 오면 두 번 점프한다.'],
    ['announce', '전원 중앙 표식에 모인다. 모인 뒤에는 아무도 움직이지 않는다. 5초가 지나면 각자 가장 가까운 벽으로 이동해 등을 붙인다.'],
    ['announce', '왼쪽 표식과 오른쪽 표식을 번갈아 오간다. 한 번 왕복할 때마다 그 자리에서 한 번 점프하고, 마지막 왕복이 끝나면 출발선으로 돌아와 정지한다.'],
    ['readout', '판독 결과. N-02 주의, N-13 경고, N-21 경고, N-34 주의, N-55 경고.'],
    ['alarm', '경보. N-13 노드의 폐기가 결정되었다. 정체는 인간이었다.'],
  ];

  it.each(REAL)('[%s] %s', (kind, text) => {
    expect(capForSpeech(text, kind)).toBe(text);
  });
});

describe('capForSpeech', () => {
  it('예산 안이면 공백만 정리하고 그대로 둔다', () => {
    expect(capForSpeech('  전 노드는   정렬한다.  ', 'announce')).toBe('전 노드는 정렬한다.');
  });

  it('넘치면 끝난 문장까지만 남긴다 — 문장 중간에서 멎지 않는다', () => {
    const max = budgetChars('alarm');
    const one = sentence(Math.floor(max * 0.6)); // 하나는 들어가고 둘은 못 들어가는 길이
    const out = capForSpeech(`${one} ${one} ${one}`, 'alarm');
    expect(out).toBe(one);
    expect(out.endsWith('.')).toBe(true);
  });

  it('종류마다 예산이 달라서, 같은 글이 경보에서 더 많이 잘린다', () => {
    const many = Array.from({ length: 12 }, () => sentence(12)).join(' ');
    expect(capForSpeech(many, 'readout').length).toBeGreaterThan(capForSpeech(many, 'alarm').length);
  });

  it('첫 문장부터 예산을 넘으면 쉼표에서 끊는다', () => {
    const max = budgetChars('alarm');
    const lead = '가'.repeat(Math.floor(max * 0.4));
    const out = capForSpeech(`${lead}, ${'나'.repeat(max)}.`, 'alarm');
    expect(out).toBe(lead); // 쉼표는 떼어낸다 — 쉼표로 끝나면 말이 끊긴 것처럼 들린다
  });

  it('끊을 자리가 아예 없는 한 덩어리는 예산까지 자른다 (소리가 멎는 것보다 낫다)', () => {
    const max = budgetChars('alarm');
    expect(capForSpeech('가'.repeat(max * 3), 'alarm').length).toBe(max);
  });

  it('빈 문장은 빈 채로 돌려준다 — 큐가 이걸 보고 버린다', () => {
    expect(capForSpeech('   ', 'announce')).toBe('');
  });
});
