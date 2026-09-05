/**
 * 미니 게임 곡 뽑기 — **한 판 안에서 세 곡이 저마다 한 번씩, 순서는 난수** (features/interrogation/testBgm.ts).
 */
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_BGM, TEST_BGMS, pickTestBgm } from '@/features/interrogation/testBgm';

describe('pickTestBgm', () => {
  it('세 번 뽑으면 세 곡이 전부 한 번씩 나온다 — 같은 곡이 두 번 나지 않는다', () => {
    const played = new Set<string>();
    const got = [pickTestBgm(played), pickTestBgm(played), pickTestBgm(played)];
    expect(new Set(got).size).toBe(3);
    expect(got.sort()).toEqual([...TEST_BGMS].sort());
  });

  it('난수가 순서를 정한다 — 0 이면 남은 것 중 첫째, 끝값이면 마지막', () => {
    const played = new Set<string>();
    expect(pickTestBgm(played, () => 0)).toBe(TEST_BGMS[0]);
    expect(pickTestBgm(played, () => 0.999)).toBe(TEST_BGMS[2]);
    expect(pickTestBgm(played, () => 0.5)).toBe(TEST_BGMS[1]);
  });

  it('다 쓰면 판을 새로 섞는다 — 넷째 시험이 조용해지지 않는다', () => {
    const played = new Set<string>(TEST_BGMS);
    const fourth = pickTestBgm(played, () => 0);
    expect(TEST_BGMS).toContain(fourth);
    expect(played.size).toBe(1); // 비우고 하나만 다시 적혔다
  });

  it('검문소 본곡은 시험 곡 셋과 다른 파일이다', () => {
    expect(TEST_BGMS).not.toContain(CHECKPOINT_BGM);
  });
});
