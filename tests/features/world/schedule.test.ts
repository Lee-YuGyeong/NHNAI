// @vitest-environment jsdom
/**
 * 대본의 시계 — 예약이 제 시각에 도는가, 그리고 **바구니째 끊을 수 있는가**
 * (features/world/schedule.ts).
 *
 * 바구니가 요긴한 자리는 자리를 뜰 때다: 그 자리에서 하던 말만 걷어내고 나머지 예약은
 * 그대로 둬야 한다 (chapter1 의 playHere).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSchedule } from '@/features/world/schedule';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** performance.now 도 같이 움직여야 한다 — 시계는 그 값으로 「언제」를 잰다 */
const tick = (ms: number) => vi.advanceTimersByTime(ms);

describe('예약과 지우기', () => {
  it('제 시각에 한 번씩 일어난다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(100, () => log.push('a'));
    s.later(300, () => log.push('b'));

    tick(150);
    expect(log).toEqual(['a']);
    tick(200);
    expect(log).toEqual(['a', 'b']);
  });

  it('clear 는 남은 것을 전부 없앤다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(100, () => log.push('a'));
    s.clear();
    tick(500);
    expect(log).toEqual([]);
  });

  it('바구니 하나만 걷어낸다 — 자리를 뜨면 그 자리의 말만 끊긴다', () => {
    const s = createSchedule();
    const log: string[] = [];
    const bucket: ReturnType<typeof s.later>[] = [];
    s.later(100, () => log.push('밖'));
    s.later(200, () => log.push('그 자리'), bucket);

    s.drop(bucket);
    tick(500);
    expect(log).toEqual(['밖']);
  });
});
