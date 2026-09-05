/**
 * 검문소 좌석 이름 (mp/koreanNames) — 한 판 안에서 성도 이름도 겹치지 않고, 같은 씨앗이면 같은 이름이다.
 * 이름은 몸의 성별을 따른다 — 남자 몸은 남자 풀, 여자 몸은 여자 풀 (2026-09-05 사용자).
 */
import { describe, expect, it } from 'vitest';

import { GIVEN_NAMES_F, GIVEN_NAMES_M, SURNAMES, givenOf, pickKoreanNames } from '@/world/mp/koreanNames';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mixed = ['m', 'f', 'm', 'f', 'm', 'f', 'm', 'f', 'm'] as const;

describe('pickKoreanNames', () => {
  it('전부 세 글자 한글이고 성·이름이 서로 다르다', () => {
    for (const seed of [1, 7, 42, 9999]) {
      const names = pickKoreanNames(mixed, lcg(seed));
      expect(names).toHaveLength(9);
      for (const n of names) {
        expect(n).toMatch(/^[가-힣]{3}$/);
        expect(SURNAMES).toContain(n[0]);
      }
      expect(new Set(names.map((n) => n[0])).size).toBe(9);
      expect(new Set(names.map((n) => givenOf(n))).size).toBe(9);
    }
  });

  it('남자 몸은 남자 풀, 여자 몸은 여자 풀에서 나온다', () => {
    for (const seed of [1, 7, 42, 9999]) {
      const names = pickKoreanNames(mixed, lcg(seed));
      for (let i = 0; i < names.length; i++) {
        const pool = mixed[i] === 'm' ? GIVEN_NAMES_M : GIVEN_NAMES_F;
        expect(pool).toContain(givenOf(names[i]));
      }
    }
  });

  it('남녀 풀은 통째로 겹치지 않는다 — 섞인 판에서도 이름만으로 가려진다', () => {
    for (const g of GIVEN_NAMES_M) expect(GIVEN_NAMES_F).not.toContain(g);
  });

  it('몸을 모르는 좌석(null)도 두 풀 중 하나에서 이름을 받는다', () => {
    const names = pickKoreanNames([null, undefined, null, null], lcg(11));
    expect(names).toHaveLength(4);
    for (const n of names) {
      expect([...GIVEN_NAMES_M, ...GIVEN_NAMES_F]).toContain(givenOf(n));
    }
  });

  it('같은 씨앗이면 같은 이름 — 판을 다시 열어도 부르던 이름이다', () => {
    const four = ['m', 'f', 'f', 'm'] as const;
    expect(pickKoreanNames(four, lcg(3))).toEqual(pickKoreanNames(four, lcg(3)));
    expect(pickKoreanNames(four, lcg(3))).not.toEqual(pickKoreanNames(four, lcg(4)));
  });

  it('풀보다 많이 달라도 던지지 않는다 — 그때부터는 겹친다', () => {
    const many = pickKoreanNames(Array(SURNAMES.length + 3).fill('m'), lcg(5));
    expect(many).toHaveLength(SURNAMES.length + 3);
  });

  it('givenOf 는 성을 뗀다', () => {
    expect(givenOf('김지훈')).toBe('지훈');
    expect(givenOf('지훈')).toBe('지훈');
  });
});
