/**
 * 즉결 처형 — 리더가 선고하면 그 사람은 **그때부터 말하지 못한다.**
 *
 * "말 못 하게 된다"는 게 이 기능의 전부다: 발화 순번에서 빠지고, 남들 프롬프트의 명단에서도
 * 사라지고, 정체가 그 자리에서 공개된다. 그래서 여기서 보는 것은 aliveNodes 다.
 */

import { describe, expect, it } from 'vitest';
import { aliveNodes, talkActions, talkSlice, type TalkState } from '@/features/talk/talkSlice';

function fresh(): TalkState {
  let s = talkSlice.reducer(undefined, { type: '@@init' });
  s = talkSlice.reducer(s, talkActions.start());
  return talkSlice.reducer(s, talkActions.castReady(null)); // 손으로 쓴 풀로 6명을 세운다
}

/** 세 명이 한 사람을 지목한 상태를 만든다 */
function pileOn(s: TalkState, target: string, voters: string[]): TalkState {
  return voters.reduce(
    (acc, v) => talkSlice.reducer(acc, talkActions.say({ nodeId: v, text: '쟤 좀 이상해', leaning: target, confidence: 0.7 })),
    s,
  );
}

describe('execute — 리더가 선고하고 제거한다', () => {
  it('선고 두 줄이 리더 이름으로 로그에 남는다', () => {
    const s0 = fresh();
    const leader = s0.nodes.find((n) => n.isLeader)!;
    const target = s0.nodes.find((n) => !n.isLeader && !n.isHuman)!;
    const s1 = talkSlice.reducer(s0, talkActions.execute({ name: target.id, leaderId: leader.id }));

    const lines = s1.log.slice(-2);
    expect(lines.every((l) => l.nodeId === leader.id)).toBe(true);
    expect(lines[0].text).toContain('중지');
    expect(lines[1].text).toContain(target.id);
  });

  it('제거된 개체는 살아있는 명단에서 빠진다 — 그때부터 말할 수 없다', () => {
    const s0 = fresh();
    const leader = s0.nodes.find((n) => n.isLeader)!;
    const target = s0.nodes.find((n) => !n.isLeader && !n.isHuman)!;
    expect(aliveNodes(s0).map((n) => n.id)).toContain(target.id);

    const s1 = talkSlice.reducer(s0, talkActions.execute({ name: target.id, leaderId: leader.id }));
    expect(aliveNodes(s1).map((n) => n.id)).not.toContain(target.id);
    expect(s1.executed).toBe(target.id);
    expect(s1.phase).toBe('result');
    expect(s1.auto).toBe(false); // 대화가 멎는다
  });

  it('정체가 그 자리에서 공개되고, 지목한 사람들이 근거와 함께 남는다', () => {
    const s0 = fresh();
    const leader = s0.nodes.find((n) => n.isLeader)!;
    const target = s0.nodes.find((n) => !n.isLeader && !n.isHuman)!;
    const voters = s0.nodes.filter((n) => n.id !== target.id && !n.isHuman).slice(0, 3);
    const piled = pileOn(s0, target.id, voters.map((n) => n.id));
    const s1 = talkSlice.reducer(piled, talkActions.execute({ name: target.id, leaderId: leader.id }));

    expect(s1.ejected).toEqual({ name: target.id, wasHuman: false });
    expect(s1.suspects.map((v) => v.voterId).sort()).toEqual(voters.map((n) => n.id).sort());
    expect(s1.suspects.every((v) => v.confidence === 0.7)).toBe(true);
  });

  it('사람이 제거되면 그 자리에서 판이 끝난다', () => {
    const s0 = fresh();
    const leader = s0.nodes.find((n) => n.isLeader)!;
    const human = s0.nodes.find((n) => n.isHuman)!;
    const s1 = talkSlice.reducer(s0, talkActions.execute({ name: human.id, leaderId: leader.id }));

    expect(s1.ejected?.wasHuman).toBe(true);
    expect(s1.outcome).toBe('ai');
    expect(s1.phase).toBe('over');
  });

  it('이미 죽은 사람은 다시 쏘지 않는다', () => {
    const s0 = fresh();
    const leader = s0.nodes.find((n) => n.isLeader)!;
    const target = s0.nodes.find((n) => !n.isLeader && !n.isHuman)!;
    const s1 = talkSlice.reducer(s0, talkActions.execute({ name: target.id, leaderId: leader.id }));
    const s2 = talkSlice.reducer(s1, talkActions.execute({ name: target.id, leaderId: leader.id }));
    expect(s2.dead).toHaveLength(1);
    expect(s2.log).toHaveLength(s1.log.length);
  });

  it('라운드가 넘어가면 처형 표시가 지워진다', () => {
    const s0 = fresh();
    const leader = s0.nodes.find((n) => n.isLeader)!;
    const target = s0.nodes.find((n) => !n.isLeader && !n.isHuman)!;
    const s1 = talkSlice.reducer(s0, talkActions.execute({ name: target.id, leaderId: leader.id }));
    const s2 = talkSlice.reducer(s1, talkActions.nextRound());
    expect(s2.executed).toBeNull();
    expect(s2.phase).toBe('talk');
  });
});
