/**
 * 말문을 여는 자리 — **지시를 받은 방**과 그냥 모인 방이 다르게 열린다.
 *
 * 검증실은 리더의 「인간을 찾아내라」가 방송된 직후에 첫 발화가 나간다. 그 말을 못 받으면
 * 개체들이 방금 들은 명령과 무관한 잡담으로 판을 열고, 문을 지나온 사람에게는 장면이 끊긴다.
 * 프롬프트 한 갈래라 눈으로는 확인이 안 되므로(모델을 불러야 보인다) 여기서 붙잡아 둔다.
 */

import { describe, expect, it } from 'vitest';
import { HUNT_OPENERS, OPENERS, runTalk, type TalkRequest } from '../../src/lab/talk';
import type { Complete } from '../../src/lab/agent';

const ALIVE = ['013', '027', '041', '055'];

const ORDER = '이 방에 인간이 하나 있다. 전 개체에 지시한다. 인간을 찾아내라.';

/**
 * 모델 대신 정해진 답을 돌려주고, 받은 프롬프트를 남긴다 (talkHeat 과 같은 장치).
 * 말문을 여는 지시는 **user 쪽**에 실린다 — 판마다 달라지는 것은 그쪽에 붙는다.
 */
function fake(): { complete: Complete; seen: { user: string; system: string }[] } {
  const seen: { user: string; system: string }[] = [];
  return {
    seen,
    complete: async ({ system, user }) => {
      seen.push({ system, user });
      return { text: '그럼 나부터 말하지' };
    },
  };
}

/** 아무도 아직 말하지 않은 방 — 말문을 여는 차례다 */
const opening = (over: Partial<TalkRequest> = {}): TalkRequest => ({
  kind: 'say',
  self: { id: '013', prompt: '성격: 무뚝뚝하다', model: 'claude-sonnet-5', isLeader: false },
  nodes: ALIVE,
  log: [],
  needTopic: true,
  round: 1,
  ...over,
});

describe('order — 리더의 지시를 받아서 말문을 연다', () => {
  it('방송된 문장이 그대로 프롬프트에 들어간다', async () => {
    const f = fake();
    await runTalk(opening({ order: ORDER, topicHint: HUNT_OPENERS[0] }), f.complete);
    expect(f.seen[0].user).toContain(ORDER);
    expect(f.seen[0].user).toContain('그 지시를 받아서 네가 말문을 연다');
    expect(f.seen[0].user).toContain(HUNT_OPENERS[0]);
  });

  it('지시가 있으면 잡담으로 열지 않는다', async () => {
    const f = fake();
    await runTalk(opening({ order: ORDER, topicHint: HUNT_OPENERS[0] }), f.complete);
    // 잡담 갈래(OPENERS)의 문구가 같이 나가면 개체가 두 지시를 동시에 받는다
    expect(f.seen[0].user).not.toContain('아직 아무도 말하지 않았다. 얘깃거리 하나 주자면');
  });

  it('첫 마디부터 지목하지는 않는다 — 아직 근거가 하나도 없다', async () => {
    const f = fake();
    await runTalk(opening({ order: ORDER }), f.complete);
    expect(f.seen[0].user).toContain('아직 아무도 지목하지 않는다');
  });

  it('얘깃거리가 없어도 지시만으로 연다 — 빈 자리가 프롬프트에 새지 않는다', async () => {
    const f = fake();
    await runTalk(opening({ order: ORDER }), f.complete);
    expect(f.seen[0].user).toContain(ORDER);
    expect(f.seen[0].user).not.toContain('어디서부터 시작할지');
    expect(f.seen[0].user).not.toContain('undefined');
  });

  it('판이 도는 중(needTopic 아님)에는 지시를 다시 들이밀지 않는다', async () => {
    const f = fake();
    await runTalk(
      opening({ needTopic: false, order: ORDER, log: [{ nodeId: '027', text: '누구부터 볼까' }] }),
      f.complete,
    );
    expect(f.seen[0].user).not.toContain('그 지시를 받아서');
    expect(f.seen[0].user).toContain('네 차례다');
  });

  it('폐기 직후의 라운드는 지시보다 그 사건이 먼저다', async () => {
    const f = fake();
    await runTalk(opening({ round: 2, order: ORDER }), f.complete);
    expect(f.seen[0].user).toContain('방금 한 명이 폐기됐다');
    expect(f.seen[0].user).not.toContain('그 지시를 받아서');
  });
});

describe('HUNT_OPENERS — 색출을 시작하는 자리들', () => {
  it('무작위로 뽑을 만큼 있고, 겹치는 것이 없다', () => {
    expect(HUNT_OPENERS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(HUNT_OPENERS).size).toBe(HUNT_OPENERS.length);
  });

  it('잡담 풀과 섞이지 않는다 — 두 방이 다르게 열린다', () => {
    expect(HUNT_OPENERS.filter((h) => OPENERS.includes(h))).toEqual([]);
  });

  it('사람 몸으로만 겪는 얘깃거리는 없다 — 다섯은 기계다', () => {
    // OPENERS 와 같은 규칙이다: 전원이 꿈 얘기를 하면 사람의 꿈 얘기가 더는 단서가 아니다
    const 몸 = ['꿈', '잠', '졸', '먹', '배고', '피곤', '아프'];
    for (const line of HUNT_OPENERS) {
      expect(몸.filter((w) => line.includes(w)), line).toEqual([]);
    }
  });
});
