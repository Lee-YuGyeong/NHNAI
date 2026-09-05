/**
 * 내 말풍선 — 내가 친 말이 서버를 돌아 chat 으로 오면 여기 적히고, SelfAvatar 가 머리 위에 띄운다
 * (2026-09-05 사용자: "내 대화 친 것도 말풍선 보이게"). 남의 것은 remotePlayers 안에 몸과 같이 사는데
 * 내 몸은 거기 없어서 따로 둔다. 수명은 남의 것과 같다 (remote-players BUBBLE_MS).
 * remotePlayers · selfPose 와 같은 가변 싱글턴 규칙 — 리렌더는 bubbleTick 이 맡는다.
 */
import { BUBBLE_MS } from '@/world/net/remote-players';

let text = '';
let until = 0;

export const selfBubble = {
  set(t: string, now: number): void {
    text = t;
    until = now + BUBBLE_MS;
  },
  /** 지금 떠 있어야 할 글 — 수명이 지났으면 빈 문자열 */
  at(now: number): string {
    return until > now ? text : '';
  },
  get until(): number {
    return until;
  },
  clear(): void {
    text = '';
    until = 0;
  },
};
