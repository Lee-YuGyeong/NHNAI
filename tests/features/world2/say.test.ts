/**
 * 모델이 죽었을 때의 물러섬 — **포기는 잠깐이어야 한다** (features/world2/say.ts).
 *
 * 세 번 연속 놓치면 표의 줄로 물러서는 것은 맞다. 다만 그 물러섬이 판 끝까지 가면 안 된다:
 * 열둘 중 여덟의 flat 이 「…….」이라, 한 번 미끄러진 판은 그 뒤로 화면에 말줄임만 남는다
 * (2026-09-04 사용자: 「지금 다 ...이나 똑같은 말 반복하는데」). 시효가 지나면 다시 한 번 두드린다.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { resetSay, sayAvailable } from '../../../src/features/world2/say';

/** say.ts 의 내부 값과 같은 자 — 여기서 한 번 더 적어 두 곳이 어긋나면 시험이 먼저 운다 */
const RETRY_AFTER_MS = 45_000;

/** 실패를 세는 유일한 길은 world2Say 다 — fetch 를 죽여서 세 번 놓치게 한다 */
async function missTimes(n: number) {
  const { world2Say } = await import('../../../src/features/world2/say');
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('회선 없음'))) as typeof fetch;
  try {
    for (let i = 0; i < n; i++) {
      await world2Say({ unit: 'A-104', title: '', persona: 'yearn', tell: '', attitude: 0, reaction: 'flat', tag: 'none', topic: '', said: '', where: '복도', samples: [] });
    }
  } finally {
    globalThis.fetch = original;
  }
}

beforeEach(() => resetSay());

describe('모델을 부를 수 있나', () => {
  it('처음에는 부른다', () => {
    expect(sayAvailable()).toBe(true);
  });

  it('세 번 연속 놓치면 물러선다 — 그 자리에서 표의 줄로 간다', async () => {
    await missTimes(3);
    expect(sayAvailable()).toBe(false);
  });

  it('시효가 지나면 다시 한 번 두드린다 — 판이 영영 말줄임으로 끝나지 않는다', async () => {
    const t0 = Date.now();
    await missTimes(3);
    expect(sayAvailable(t0 + RETRY_AFTER_MS - 1)).toBe(false);
    expect(sayAvailable(t0 + RETRY_AFTER_MS)).toBe(true);
  });

  it('다시 열어 준 뒤 **한 번만 더 실패해도** 다시 잠긴다 — 죽은 판이 매 마디 헛걸음하지 않는다', async () => {
    const t0 = Date.now();
    await missTimes(3);
    expect(sayAvailable(t0 + RETRY_AFTER_MS)).toBe(true);
    /*
     * 한 대답이 이 문을 두 번 지난다 — 부르는 쪽(voiceReply)이 한 번, world2Say 안쪽이 한 번.
     * 그래서 열린 자리에서 다시 물으면 열려 있어야 하고(그 한 마디는 모델로 간다),
     * 그 시도가 실패하는 순간 다시 잠긴다. 「한 번의 헛걸음」은 시도 하나지 물음 하나가 아니다.
     */
    expect(sayAvailable(t0 + RETRY_AFTER_MS)).toBe(true);
    await missTimes(1);
    // 그 실패가 시효를 지금부터 다시 매기므로, 진짜 시계로 물으면 닫혀 있다
    expect(sayAvailable()).toBe(false);
  });

  it('판이 새로 서면 처음으로', async () => {
    await missTimes(3);
    expect(sayAvailable()).toBe(false);
    resetSay();
    expect(sayAvailable()).toBe(true);
  });
});
