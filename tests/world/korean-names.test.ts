/**
 * 검문소 좌석 이름 (mp/koreanNames) — 한 판 안에서 성도 이름도 겹치지 않고, 같은 씨앗이면 같은 이름이다.
 */
import { describe, expect, it } from 'vitest';

import { GIVEN_NAMES, SURNAMES, givenOf, pickKoreanNames } from '@/world/mp/koreanNames';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('pickKoreanNames', () => {
  it('n 명이 전부 세 글자 한글이고 성·이름이 서로 다르다', () => {
    for (const seed of [1, 7, 42, 9999]) {
      const names = pickKoreanNames(9, lcg(seed));
      expect(names).toHaveLength(9);
      for (const n of names) {
        expect(n).toMatch(/^[가-힣]{3}$/);
        expect(SURNAMES).toContain(n[0]);
        expect(GIVEN_NAMES).toContain(n.slice(1));
      }
      expect(new Set(names.map((n) => n[0])).size).toBe(9);
      expect(new Set(names.map((n) => givenOf(n))).size).toBe(9);
    }
  });

  it('같은 씨앗이면 같은 이름 — 판을 다시 열어도 부르던 이름이다', () => {
    expect(pickKoreanNames(4, lcg(3))).toEqual(pickKoreanNames(4, lcg(3)));
    expect(pickKoreanNames(4, lcg(3))).not.toEqual(pickKoreanNames(4, lcg(4)));
  });

  it('풀보다 많이 달라도 던지지 않는다 — 그때부터는 겹친다', () => {
    const many = pickKoreanNames(SURNAMES.length + 3, lcg(5));
    expect(many).toHaveLength(SURNAMES.length + 3);
  });

  it('givenOf 는 성을 뗀다', () => {
    expect(givenOf('김지훈')).toBe('지훈');
    expect(givenOf('지훈')).toBe('지훈');
  });
});
