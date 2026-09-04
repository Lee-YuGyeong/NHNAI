/**
 * 끼어들기 — 사람 발화는 언제든 들어간다.
 *
 * 사람 발화는 LLM 호출이 없어 busy 잠금을 타지 않는다. 그래서 AI 가 말을 만드는 중에도
 * 내 줄이 먼저 로그에 앉는다. 그때 진행 중 표시(…)까지 걷어 버리면 방금까지 말하던
 * 개체가 증발한 것처럼 보인다 — 표시는 **그 개체의 발화가 도착할 때만** 걷는다.
 */
import { describe, expect, it } from 'vitest';
import { talkActions, talkSlice, type TalkState } from '@/features/talk/talkSlice';
import { LEADER_NAME, NAMES } from '@/lab/personas';

const reduce = talkSlice.reducer;

function speakingState(id: string): TalkState {
  let s = reduce(undefined, talkActions.start());
  s = reduce(s, talkActions.setSpeaking(id));
  return s;
}

/**
 * 자리를 짤 때 이름을 무작위로 붙이므로, 이게 깨져도 **세 판에 한 번쯤만 드러난다.**
 * 그래서 눈으로 보지 않고 여러 판을 돌려서 잡는다.
 */
describe('이름 배분', () => {
  const dealt = () => {
    const s = reduce(reduce(undefined, talkActions.start()), talkActions.castReady(null));
    return s.nodes;
  };

  it('리더는 사람 이름을 받지 않는다 — 언제나 역할로 불린다', () => {
    for (let round = 0; round < 200; round++) {
      const leader = dealt().find((n) => n.isLeader)!;
      expect(leader.id).toBe(LEADER_NAME);
    }
  });

  it('나머지는 여전히 매판 다른 이름이다 — 이름을 섞는 뜻이 살아 있어야 한다', () => {
    const seen = new Set<string>();
    for (let round = 0; round < 50; round++) {
      for (const n of dealt()) if (!n.isLeader) seen.add(n.id);
    }
    expect(seen.size).toBeGreaterThan(6); // 자리는 다섯뿐인데 풀 전체가 돌아야 한다
  });

  it('이름이 겹치지 않는다 — 호명 감지가 부분 문자열이라 동명이인이 생기면 판이 꼬인다', () => {
    for (let round = 0; round < 200; round++) {
      const ids = dealt().map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const n of dealt()) if (!n.isLeader) expect(NAMES).toContain(n.id);
    }
  });

  it("'리더' 는 사람 이름 풀과 겹치지 않는다 — 겹치면 호명이 두 사람을 가리킨다", () => {
    expect(NAMES).not.toContain(LEADER_NAME);
  });
});

describe('say 와 진행 중 표시', () => {
  it('말하던 개체의 발화가 도착하면 표시가 걷힌다', () => {
    const s = reduce(speakingState('민재'), talkActions.say({ nodeId: '민재', text: '확인했다' }));
    expect(s.speaking).toBeNull();
    expect(s.log.map((l) => l.nodeId)).toEqual(['민재']);
  });

  it('남의 발화(끼어들기)가 먼저 앉아도 표시는 남는다 — 그 개체는 아직 말하는 중이다', () => {
    let s = reduce(speakingState('민재'), talkActions.say({ nodeId: '하늘', text: '잠깐만' }));
    expect(s.speaking).toBe('민재');
    expect(s.log.map((l) => l.nodeId)).toEqual(['하늘']);

    // 만들던 발화가 뒤이어 도착하면 그때 걷힌다 — 줄 순서는 끼어든 쪽이 먼저다
    s = reduce(s, talkActions.say({ nodeId: '민재', text: '어 왜' }));
    expect(s.speaking).toBeNull();
    expect(s.log.map((l) => l.nodeId)).toEqual(['하늘', '민재']);
  });
});

describe('넘김과 호명 무시 — 말 안 하는 것도 기록된다', () => {
  it('넘김은 로그에 남지 않는다 — 남으면 그게 발화가 되어 침묵이 사라진다', () => {
    const s = reduce(speakingState('민재'), talkActions.passTurn({ nodeId: '민재', wasCalled: false }));
    expect(s.log).toHaveLength(0);
    expect(s.passes).toEqual(['민재']);
    expect(s.speaking).toBeNull();
  });

  it('불렸는데 넘긴 것만 횟수로 쌓인다 — 그냥 넘긴 건 안 센다', () => {
    let s = reduce(undefined, talkActions.start());
    s = reduce(s, talkActions.passTurn({ nodeId: '민재', wasCalled: false }));
    expect(s.ignored['민재']).toBeUndefined();

    s = reduce(s, talkActions.passTurn({ nodeId: '민재', wasCalled: true }));
    s = reduce(s, talkActions.passTurn({ nodeId: '민재', wasCalled: true }));
    expect(s.ignored['민재']).toBe(2);
  });

  it('내가 「대답 안 하고 넘기기」를 눌러도 똑같이 쌓인다 — 사람만 공짜로 피할 수는 없다', () => {
    const s = reduce(reduce(undefined, talkActions.start()), talkActions.skipTurn({ id: '하늘' }));
    expect(s.ignored['하늘']).toBe(1);
  });

  it('넘김 기록은 라운드마다 비우지만 호명 무시는 판 내내 쌓인다', () => {
    let s = reduce(undefined, talkActions.start());
    s = reduce(s, talkActions.passTurn({ nodeId: '민재', wasCalled: true }));
    s = reduce(s, talkActions.nextRound());
    expect(s.passes).toEqual([]);
    expect(s.ignored['민재']).toBe(1);
  });
});
