// @vitest-environment jsdom
/**
 * 재검실의 **차례** — 이 방은 세 번 묻고 한 번 정한다.
 *
 * 2026-09-01 사용자: "심문 중에 챕터 4로 넘어가 버리고 좀 이상해."
 * 원인은 헌법이었다. 재검실의 무브 목록에는 첫 차례부터 pass 가 들어 있어서, 기계처럼 짧게 답하면
 * (이 게임이 내내 가르치는 그 답) 감독이 **첫 답 한 마디에** 통과를 골랐다 — 심문이 시작된 줄 알았는데
 * 문이 열리고 다음 무대로 넘어간다. 폴백(judgeDirect)도 recheck 가지에서 'pass' 를 그냥 박아 놨었다.
 *
 * 그래서 잠그는 것은 둘이다:
 *   ① MIN_ROUNDS 전에는 헌법이 pass·escort 를 목록에서 뺀다 (director.MoveBudget.canRelease)
 *   ② 폴백도 그 목록을 지킨다 — 감독이 죽어 있어도 첫 답에 문이 열리지 않는다
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_ROUNDS, MIN_ROUNDS, chapter3 } from '@/features/world/chapter3';

/** 기계처럼 짧고 마른 답 — 폴백이 「보고형 답변」으로 읽는 것 */
const DRY = '이상 없음.';

function open(): void {
  chapter3.bind(() => {}, '나', null);
  chapter3.start();
  vi.advanceTimersByTime(20_000);
  chapter3.beginQuestioning();
  vi.advanceTimersByTime(20_000);
}

/** 한 차례 답하고 판정이 끝날 때까지 */
async function answer(text = DRY): Promise<void> {
  chapter3.answerText(text);
  await vi.advanceTimersByTimeAsync(20_000);
}

describe('재검실 — 첫 답 한 마디로 끝나지 않는다', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 감독을 죽여 둔다 — 폴백만으로도 이 규칙이 지켜져야 한다
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('감독 없음'))));
    chapter3.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    chapter3.reset();
  });

  it('표식에 서면 첫 질문이 걸린다', () => {
    open();
    expect(chapter3.get().phase).toBe('wait');
    expect(chapter3.get().round).toBe(1);
    expect(chapter3.get().pending).not.toBeNull();
  });

  it('첫 답에는 방면이 없다 — 다음 질문이 이어진다', async () => {
    open();
    await answer();
    expect(chapter3.get().phase).toBe('wait');
    expect(chapter3.get().round).toBe(2);
  });

  it('MIN_ROUNDS 를 채우기 전에는 계속 묻는다', async () => {
    open();
    for (let i = 1; i < MIN_ROUNDS; i += 1) {
      await answer();
      expect(chapter3.get().phase, `${i}번째 답 뒤에 판이 끝났다`).toBe('wait');
      expect(chapter3.get().round).toBe(i + 1);
    }
  });

  it('마지막 차례에는 결정이 난다 — 문답이 끝나지 않는 판은 없다', async () => {
    open();
    for (let i = 0; i < MAX_ROUNDS; i += 1) await answer();
    expect(chapter3.get().phase).not.toBe('wait');
    expect(['closing', 'done']).toContain(chapter3.get().phase);
  });

  it('무응답도 차례를 태운다 — 시간이 지나면 다음 질문이 온다', async () => {
    open();
    // 답 시간을 통째로 넘긴다 (ANSWER_SECONDS)
    await vi.advanceTimersByTimeAsync(40_000);
    expect(chapter3.get().round).toBe(2);
    expect(chapter3.get().phase).toBe('wait');
  });
});
