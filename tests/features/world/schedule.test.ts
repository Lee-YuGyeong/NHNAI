// @vitest-environment jsdom
/**
 * 대본의 시계 — **앞당기기**가 무엇을 지키는가 (features/world/schedule.ts).
 *
 * 대사를 T 로 넘길 때 다음 줄을 지금 부르는 곳이다. 여기서 틀리면 두 방향으로 깨진다:
 * 덜 당기면 넘긴 만큼 정적이 남고, 잘못 당기면 대사에 맞춰 둔 연출(조명·정지·무대 이동)이
 * 저 혼자 앞질러 간다. 사이 간격이 그대로인지를 매번 같이 본다.
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
    s.later(200, () => log.push('그 자리'), bucket, true);

    s.drop(bucket);
    tick(500);
    expect(log).toEqual(['밖']);
  });
});

describe('앞당기기 (pull)', () => {
  it('다음 대사를 지금 부른다 — 넘긴 만큼 기다리지 않는다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(3000, () => log.push('다음 줄'), undefined, true);

    expect(s.pull()).toBe(3000);
    expect(log).toEqual(['다음 줄']);
  });

  it('뒤의 예약도 그만큼 당긴다 — 줄 사이의 간격은 그대로다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(1000, () => log.push('둘째'), undefined, true);
    s.later(2500, () => log.push('셋째'), undefined, true);

    s.pull(); // 둘째를 지금 부르고 1초를 감았다
    expect(log).toEqual(['둘째']);
    tick(1400);
    expect(log).toEqual(['둘째']); // 아직 100ms 남았다 — 간격(1.5초)은 살아 있다
    tick(200);
    expect(log).toEqual(['둘째', '셋째']);
  });

  it('대사에 맞춰 둔 연출도 같이 당겨진다 — 조명만 뒤에 남으면 어긋난다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(1000, () => log.push('대사'), undefined, true);
    s.later(1000, () => log.push('조명')); // 같은 순간에 걸어 둔 연출

    s.pull();
    tick(0);
    expect(log).toEqual(['대사', '조명']);
  });

  it('대사가 부른 새 예약은 두 번 감기지 않는다', () => {
    // 대사의 fn 안에서 다음 연출을 거는 자리가 있다 (chapter1 의 SIGNAL_AFTER_MS)
    const s = createSchedule();
    const log: string[] = [];
    s.later(2000, () => {
      log.push('대사');
      s.later(1000, () => log.push('그 뒤'));
    }, undefined, true);

    s.pull();
    tick(900);
    expect(log).toEqual(['대사']);
    tick(200);
    expect(log).toEqual(['대사', '그 뒤']);
  });

  it('앞당길 대사가 없으면 아무것도 안 한다 — 무대 이동이 저 혼자 당겨지면 안 된다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(900, () => log.push('무대 이동')); // 대사가 아니다

    expect(s.pull()).toBe(0);
    expect(log).toEqual([]);
    tick(900);
    expect(log).toEqual(['무대 이동']);
  });

  it('여러 번 눌러도 한 번에 한 줄씩이다', () => {
    const s = createSchedule();
    const log: string[] = [];
    s.later(1000, () => log.push('둘째'), undefined, true);
    s.later(2000, () => log.push('셋째'), undefined, true);

    s.pull();
    expect(log).toEqual(['둘째']);
    s.pull();
    expect(log).toEqual(['둘째', '셋째']);
    expect(s.pull()).toBe(0);
  });
});
