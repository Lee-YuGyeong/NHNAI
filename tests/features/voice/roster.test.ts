/**
 * 좌석 배역 — P11 을 코드로 못박는 자리 (docs/VOICE.md §2, §9 점검표).
 *
 * 여기서 재는 것은 「목소리가 잘 배정되나」가 아니라 **「배정이 아무 말도 하지 않나」**다.
 * 배정에 조금이라도 규칙성이 남으면 그게 정답표가 되고, 이 게임에서 틀린 정답표의 값은
 * 무고한 사람의 즉시 격리다 (PLANNING §1.2).
 *
 * ★ 「역할을 인자로 받지 않는다」는 컴파일 시각에 지켜진다 — `assignVoices` 의 서명에
 *   역할이 들어갈 자리가 없다. 런타임 테스트로는 잴 수 없어서 여기 적어 둔다.
 */
import { describe, expect, it } from 'vitest';
import { ROSTER_SIZE, assignVoices } from '@/features/voice/roster';

/** 씨앗을 심은 난수 (mulberry32) — 통계 검사가 판마다 흔들리면 검사가 아니다 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('assignVoices — 한 좌석에 한 목소리', () => {
  it('좌석마다 목소리가 하나씩 배정된다', () => {
    const map = assignVoices(ALL_SEATS, seeded(1));
    expect(map.size).toBe(ALL_SEATS.length);
    for (const seat of ALL_SEATS) expect(map.get(seat)).toBeTypeOf('number');
  });

  it('두 좌석이 같은 목소리를 쓰지 않는다 — 겹치면 누가 말했는지 귀로 못 따라간다', () => {
    for (let seed = 0; seed < 200; seed++) {
      const voices = [...assignVoices(ALL_SEATS, seeded(seed)).values()];
      expect(new Set(voices).size).toBe(ALL_SEATS.length);
    }
  });

  it('좌석이 명부보다 많으면 조용히 겹치지 않고 던진다', () => {
    expect(() => assignVoices([...ALL_SEATS, 10])).toThrow(/명부/);
  });

  it('좌석 번호가 겹치면 던진다', () => {
    expect(() => assignVoices([1, 2, 2])).toThrow(/겹친다/);
  });
});

/**
 * ★ 이 게임의 핵심 검사.
 *
 * 부르는 쪽은 AI 좌석을 **배열 끝에 붙이기 쉽다** — 사람 좌석을 먼저 모으고 AI 좌석을
 * 더하는 게 자연스러운 순서라서다. 그 자리가 조금이라도 편향되면, 배정이 균등해 보여도
 * 「끝자리 목소리」가 곧 AI 표가 된다.
 *
 * 그래서 자리마다(특히 끝자리) 목소리 분포가 균등한지를 직접 잰다.
 */
describe('assignVoices — 자리 순서가 목소리를 정하지 않는다 (P11)', () => {
  const TRIALS = 9_000;

  /** 배열의 i 번째 좌석이 각 목소리를 몇 번 받았나 */
  function countsAt(position: number): number[] {
    const counts = new Array<number>(ROSTER_SIZE).fill(0);
    for (let seed = 0; seed < TRIALS; seed++) {
      const map = assignVoices(ALL_SEATS, seeded(seed));
      counts[map.get(ALL_SEATS[position])!] += 1;
    }
    return counts;
  }

  // 기대 1000회, 표준편차 ≈ 30 — ±150 은 5σ 라 씨앗을 바꿔도 안 흔들린다
  const EXPECTED = TRIALS / ROSTER_SIZE;
  const TOLERANCE = 150;

  it('맨 끝자리(AI 를 붙이기 쉬운 자리)가 모든 목소리를 고르게 받는다', () => {
    for (const n of countsAt(ALL_SEATS.length - 1)) {
      expect(Math.abs(n - EXPECTED)).toBeLessThan(TOLERANCE);
    }
  });

  it('첫 자리도 마찬가지다 — 끝자리와 같은 분포다', () => {
    for (const n of countsAt(0)) {
      expect(Math.abs(n - EXPECTED)).toBeLessThan(TOLERANCE);
    }
  });
});

describe('assignVoices — 판마다 다시 섞인다', () => {
  it('씨앗이 다르면 배정이 다르다 — 같은 좌석이 늘 같은 목소리면 두세 판에 학습된다', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      seen.add([...assignVoices(ALL_SEATS, seeded(seed)).values()].join(','));
    }
    // 100 판이 전부 다른 순열일 필요는 없지만, 몇 가지로 뭉치면 그건 고정이다
    expect(seen.size).toBeGreaterThan(90);
  });

  it('같은 씨앗이면 같은 배정이다 — 판 안에서는 고정이어야 한다', () => {
    const a = assignVoices(ALL_SEATS, seeded(42));
    const b = assignVoices(ALL_SEATS, seeded(42));
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

/**
 * 인원이 명부보다 적을 때 — 5인 판이 늘 같은 5개 목소리를 쓰면 그것도 학습된다.
 * 「명부를 통째로 섞은 뒤 앞을 취한다」가 이걸 막는다. 앞에서부터 자르면 6~8번 목소리는
 * 작은 판에서 영영 안 나온다.
 */
describe('assignVoices — 작은 판도 명부 전체를 쓴다', () => {
  it('5인 판에서도 9개 목소리가 전부 나온다', () => {
    const seats = [1, 2, 3, 4, 5];
    const seen = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      for (const v of assignVoices(seats, seeded(seed)).values()) seen.add(v);
    }
    expect(seen.size).toBe(ROSTER_SIZE);
  });

  it('3인 판(설계자 0명, PLANNING §1.1)에서도 마찬가지다', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      for (const v of assignVoices([1, 2, 3], seeded(seed)).values()) seen.add(v);
    }
    expect(seen.size).toBe(ROSTER_SIZE);
  });
});
