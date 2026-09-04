// @vitest-environment jsdom
/**
 * 그 자리에서만 이어지는 말 — 2026-08-31 사용자: "스캔에서 멀어지면 대화는 중간에 끊게 해 줘".
 *
 * 정비 단말을 읽는 네 줄, 그림 앞의 감정 두 줄은 **그 앞에 서 있는 동안의 말**이다. 등을 돌리고 걸어가는데
 * 뒤에서 계속 읽히면 그건 낭독이지 내 생각이 아니다. 여기서 잠그는 것 셋:
 *   ① 들여다보면 그 자리에 말이 매인다 (focusId)
 *   ② 멀어졌다고 알리면 **남은 줄이 안 나온다**
 *   ③ 끊긴 그림은 다시 볼 수 있다 (돌아와 들여다보면 처음부터)
 *
 * 거리는 여기서 재지 않는다 — 그건 화면(Chapter1Scene 의 focusSpot)의 몫이고, 헤드리스는 걸어갈 수 없다.
 * 이 테스트는 「멀어졌다」는 신호를 받았을 때 대본이 어떻게 구는지만 본다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chapter1 } from '@/features/world/chapter1';

/** 대화창 대신 받아 적는 사람 */
const said: string[] = [];

function explore(): void {
  chapter1.reset();
  said.length = 0;
  chapter1.bind((line) => said.push(line.text), '나', null, null);
  (chapter1.get() as { phase: string }).phase = 'explore';
}

describe('그림 앞을 떠나면 남은 말이 끊긴다', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    explore();
  });
  afterEach(() => {
    chapter1.reset();
    vi.useRealTimers();
  });

  it('들여다보면 그 자리에 말이 매이고, 끝나면 풀린다', () => {
    chapter1.onScrawl('window', 'scrawl:2');
    expect(chapter1.focusId()).toBe('scrawl:2');
    vi.advanceTimersByTime(60_000);
    expect(said.length).toBeGreaterThan(1);
    expect(chapter1.focusId()).toBeNull();
  });

  it('멀어지면 남은 줄이 안 나온다', () => {
    chapter1.onScrawl('window', 'scrawl:2');
    vi.advanceTimersByTime(200); // 첫 줄만 나온 참
    const heard = said.length;
    expect(chapter1.leave('scrawl:2')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(said.length).toBe(heard);
    expect(chapter1.focusId()).toBeNull();
  });

  it('다른 자리를 떠났다는 신호는 지금 말을 건드리지 않는다', () => {
    chapter1.onScrawl('window', 'scrawl:2');
    expect(chapter1.leave('tag')).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(said.length).toBeGreaterThan(1);
  });

  it('끊긴 그림은 돌아와서 다시 볼 수 있다 — 끝까지 본 그림은 다시 말하지 않는다', () => {
    chapter1.onScrawl('window', 'scrawl:2');
    vi.advanceTimersByTime(200);
    chapter1.leave('scrawl:2');
    said.length = 0;
    chapter1.onScrawl('window', 'scrawl:2');
    vi.advanceTimersByTime(60_000);
    expect(said.length).toBeGreaterThan(1);

    said.length = 0;
    chapter1.onScrawl('window', 'scrawl:2');
    vi.advanceTimersByTime(60_000);
    expect(said).toEqual([]);
  });
});
