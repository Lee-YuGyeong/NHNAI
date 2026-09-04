/**
 * 발언권 — 무엇이 소리로 나가고 무엇이 글자로만 남나 (docs/VOICE.md §4).
 *
 * 마지막 describe 가 이 파일의 핵심이다: **버리는 규칙이 좌석을 보지 않는다**(P11).
 * 나머지는 그 규칙이 실제로 손잡이대로 도는지를 잰다.
 */
import { describe, expect, it } from 'vitest';
import { FLOOR_LIMITS, type Drop, type Line, createFloor } from '@/features/voice/floor';

function line(id: string, seat: number, ts: number, text = '짧은 말'): Line {
  return { id, seat, text, ts };
}

/** 부르는 쪽의 실제 흐름 — 한 줄 넣고, 자리가 있는 만큼 꺼내 건다 */
function offerAndDrain(
  floor: ReturnType<typeof createFloor>,
  l: Line,
  now: number,
): { drop: Drop | null; started: Line[] } {
  const drop = floor.offer(l, now);
  const started: Line[] = [];
  for (;;) {
    const next = floor.next(now);
    if (!next) break;
    started.push(next);
  }
  return { drop, started };
}

describe('발언권 — 두 줄까지 겹친다', () => {
  it('두 줄은 같이 울고, 세 번째는 기다린다', () => {
    const floor = createFloor();
    expect(offerAndDrain(floor, line('a', 1, 0), 0).started).toHaveLength(1);
    expect(offerAndDrain(floor, line('b', 2, 0), 0).started).toHaveLength(1);

    const third = offerAndDrain(floor, line('c', 3, 0), 0);
    expect(third.drop).toBeNull();
    expect(third.started).toHaveLength(0);
    expect(floor.stats()).toEqual({ playing: 2, waiting: 1 });
  });

  it('한 줄이 끝나면 기다리던 줄이 그 자리에 들어간다', () => {
    const floor = createFloor();
    offerAndDrain(floor, line('a', 1, 0), 0);
    offerAndDrain(floor, line('b', 2, 0), 0);
    offerAndDrain(floor, line('c', 3, 0), 0);

    floor.done('a');
    expect(floor.next(100)?.id).toBe('c');
    expect(floor.stats()).toEqual({ playing: 2, waiting: 0 });
  });

  it('대기줄이 차면 그 줄은 글자만 남는다', () => {
    const floor = createFloor();
    for (const id of ['a', 'b', 'c', 'd']) offerAndDrain(floor, line(id, 1, 0), 0);
    // 두 줄이 울고 두 줄이 기다린다 — 다섯 번째가 넘친다
    expect(floor.stats()).toEqual({ playing: 2, waiting: 2 });
    expect(offerAndDrain(floor, line('e', 1, 0), 0).drop).toBe('queue-full');
  });
});

describe('발언권 — 길이', () => {
  it('상한을 넘는 줄은 자리가 비어 있어도 소리를 안 낸다', () => {
    const floor = createFloor();
    const long = 'ㄱ'.repeat(FLOOR_LIMITS.maxChars + 1);
    expect(floor.offer(line('a', 1, 0, long), 0)).toBe('too-long');
    expect(floor.next(0)).toBeNull();
  });

  it('딱 상한까지는 통째로 나간다 — 잘라서 내보내지 않는다', () => {
    const floor = createFloor();
    const exact = 'ㄱ'.repeat(FLOOR_LIMITS.maxChars);
    expect(floor.offer(line('a', 1, 0, exact), 0)).toBeNull();
    expect(floor.next(0)?.text).toBe(exact);
  });
});

describe('발언권 — 늦은 줄은 버린다', () => {
  it('도착부터 이미 늦었으면 큐에 세우지도 않는다', () => {
    const floor = createFloor();
    expect(floor.offer(line('a', 1, 0), FLOOR_LIMITS.lateMs + 1)).toBe('too-late');
    expect(floor.stats().waiting).toBe(0);
  });

  it('기다리는 사이 늦어 버린 줄은 자리가 나도 안 운다', () => {
    const floor = createFloor();
    offerAndDrain(floor, line('a', 1, 0), 0);
    offerAndDrain(floor, line('b', 2, 0), 0);
    floor.offer(line('c', 3, 0), 0); // 대기줄에 선다

    floor.done('a');
    // 자리는 났지만 c 는 발화 시각으로부터 이미 한참 지났다
    expect(floor.next(FLOOR_LIMITS.lateMs + 1)).toBeNull();
  });

  it('지각은 도착 시각이 아니라 발화 시각으로 잰다', () => {
    const floor = createFloor();
    // 발화는 5초 전, 지금 막 도착했다 — 아직 상한 안이라 운다
    expect(floor.offer(line('a', 1, 0), 5_000)).toBeNull();
    expect(floor.next(5_000)?.id).toBe('a');
  });
});

describe('발언권 — 같은 줄은 한 번만', () => {
  it('같은 id 가 두 번 오면 두 번째는 버린다', () => {
    const floor = createFloor();
    expect(floor.offer(line('a', 1, 0), 0)).toBeNull();
    expect(floor.offer(line('a', 1, 0), 0)).toBe('duplicate');
  });
});

/**
 * 오디오가 오류로 죽어 `done` 이 영영 안 오면 자리가 샌다. 두 번 새면 방이 **영구히**
 * 조용해지는데, 그건 이 게임에서 고장이 아니라 전원이 같은 오해를 하는 상태가 된다.
 */
describe('발언권 — 자리가 새지 않는다', () => {
  it('done 이 안 와도 stuckMs 뒤에는 자리를 되찾는다', () => {
    const floor = createFloor();
    offerAndDrain(floor, line('a', 1, 0), 0);
    offerAndDrain(floor, line('b', 2, 0), 0);
    expect(floor.stats().playing).toBe(2);

    const late = FLOOR_LIMITS.stuckMs + 1;
    floor.offer(line('c', 3, late), late);
    expect(floor.next(late)?.id).toBe('c');
  });
});

/**
 * ★ 이 파일의 핵심.
 *
 * 규칙이 좌석을 한 번이라도 보면, 「저 자리는 유난히 자주 조용하다」가 생기고 그게 곧
 * 정답표가 된다. 좌석 번호만 바꾼 같은 시나리오는 **완전히 같은 결과**여야 한다.
 */
describe('발언권 — 좌석을 보지 않는다 (P11)', () => {
  /** 좌석 배치만 다른 같은 대화를 돌리고, 무엇이 울고 무엇이 버려졌는지를 돌려준다 */
  function transcript(seats: readonly number[]): string {
    const floor = createFloor();
    const out: string[] = [];
    seats.forEach((seat, i) => {
      const now = i * 400;
      const { drop, started } = offerAndDrain(floor, line(`l${i}`, seat, now), now);
      out.push(`${i}:${drop ?? 'play'}:${started.map((s) => s.id).join('|')}`);
    });
    return out.join(' ');
  }

  it('좌석 번호를 뒤집어도 결과가 같다', () => {
    expect(transcript([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(transcript([9, 8, 7, 6, 5, 4, 3, 2, 1]));
  });

  it('한 사람이 다 말해도, 아홉이 나눠 말해도 결과가 같다', () => {
    expect(transcript([1, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(transcript([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('AI 좌석이 어디에 있든 같다 — 끝자리든 첫자리든', () => {
    expect(transcript([9, 1, 2, 3, 4])).toBe(transcript([1, 2, 3, 4, 9]));
  });

  it('버리는 이유는 길이와 시각만으로 정해진다', () => {
    const floor = createFloor();
    const long = 'ㄱ'.repeat(FLOOR_LIMITS.maxChars + 1);
    // 좌석이 달라도 긴 줄은 똑같이 떨어진다
    expect(floor.offer({ id: 'x', seat: 1, text: long, ts: 0 }, 0)).toBe('too-long');
    expect(floor.offer({ id: 'y', seat: 9, text: long, ts: 0 }, 0)).toBe('too-long');
  });
});
