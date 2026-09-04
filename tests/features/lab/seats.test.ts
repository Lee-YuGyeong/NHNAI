/**
 * 좌석표 — 리더는 여기 없다.
 *
 * 예전에는 리더가 노드 하나를 겸했다. 그래서 자기가 낸 검사를 자기가 치고,
 * 자기에게 표가 던져지고, 판독 방송이 리더 자신을 "경고"로 부르는 일까지 생겼다.
 * 좌석은 전부 색출 대상이라는 것 — 이 파일이 지키는 건 그 한 줄이다.
 * (정원은 줄이지 않는다. 리더가 겸하던 자리는 일반 개체가 채운다)
 */
import { describe, expect, it } from 'vitest';
import { LEADER_AGENT, createSeats } from '@/lab/setup';
import { aliveSeats, labActions, labSlice, toPublicState, type LabState } from '@/features/lab/labSlice';

const started = (): LabState => labSlice.reducer(undefined, labActions.start());

describe('createSeats', () => {
  it('정원은 6이고, 사람 하나에 나머지는 AI 다', () => {
    const seats = createSeats();
    expect(seats).toHaveLength(6);
    expect(seats.filter((n) => n.isHuman)).toHaveLength(1);
    expect(seats.filter((n) => n.agent)).toHaveLength(5);
  });

  it('리더는 좌석을 갖지 않는다 — 어떤 좌석도 리더 개체가 아니다', () => {
    const seats = createSeats();
    expect(seats.some((n) => n.agent?.isLeader)).toBe(false);
    expect(seats.some((n) => n.id === LEADER_AGENT.id)).toBe(false);
  });

  it('AI 다섯이 서로 다른 성격을 받는다 — 같은 개체가 겹치면 판이 헐거워진다', () => {
    const personas = createSeats()
      .map((n) => n.agent?.persona)
      .filter(Boolean);
    expect(new Set(personas).size).toBe(personas.length);
  });
});

describe('리더는 색출 대상이 아니다', () => {
  it('검사를 치는 자리 = 살아 있는 좌석 전부', () => {
    const s = started();
    expect(aliveSeats(s)).toHaveLength(6);
  });

  it('에이전트에게 나가는 노드 목록에 리더가 없다 — 표를 던질 대상이 되지 않는다', () => {
    const nodes = toPublicState(started()).nodes;
    expect(nodes).toHaveLength(6);
    expect(nodes.some((n) => n.id === LEADER_AGENT.id)).toBe(false);
  });
});
