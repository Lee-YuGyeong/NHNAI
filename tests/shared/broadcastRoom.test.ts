/**
 * 호스트 판정 — 누가 방송을 낼 수 있나.
 *
 * 서버(worker/src/room-do.ts 의 hostSeat)가 쓰는 규칙과 **같은 규칙**을 화면도 알아야 한다.
 * 모르면 방송이 조용히 버려지고 화면에는 "내 경보가 안 나온다"로만 보인다.
 * 두 규칙이 어긋나는 순간을 여기서 잡는다.
 */
import { describe, expect, it } from 'vitest';
import { isHostSeat } from '@/shared/useBroadcastRoom';

describe('isHostSeat', () => {
  it('가장 낮은 좌석이 호스트다', () => {
    expect(isHostSeat([1, 2, 3], 1)).toBe(true);
    expect(isHostSeat([1, 2, 3], 2)).toBe(false);
  });

  it('1번이 나가면 다음으로 낮은 좌석이 잇는다 — 빈자리가 생기지 않는다', () => {
    expect(isHostSeat([2, 3], 2)).toBe(true);
  });

  it('혼자면 자기가 호스트다', () => {
    expect(isHostSeat([4], 4)).toBe(true);
  });

  it('명부에 내가 없거나 명부가 비었으면 호스트가 아니다 (welcome 전)', () => {
    expect(isHostSeat([1, 2], undefined)).toBe(false);
    expect(isHostSeat([], 1)).toBe(false);
  });

  it('좌석이 순서대로 오지 않아도 가장 낮은 쪽을 고른다', () => {
    expect(isHostSeat([7, 3, 5], 3)).toBe(true);
    expect(isHostSeat([7, 3, 5], 7)).toBe(false);
  });
});
