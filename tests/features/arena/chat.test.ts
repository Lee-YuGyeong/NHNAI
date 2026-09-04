/**
 * 채팅창이 언제 닫히는가.
 *
 * 말하는 동안은 조작이 막힌다(WorldScene 의 active). 그래서 **닫는 길이 막히면 몸이
 * 영영 안 움직인다** — 화면에는 아무 표시가 없어서 게임이 멈춘 것처럼 보인다.
 * 실제로 그렇게 갇혔던 자리라, 여는 쪽보다 닫는 쪽을 붙잡아 둔다.
 */
import { describe, expect, it } from 'vitest';
import { unlockClosesChat } from '@/features/arena/chat';

describe('잠금이 풀리면 채팅도 무른다', () => {
  it('잠겨 있다가 풀렸으면 닫는다 — Esc 가 입력창과 잠금을 한꺼번에 건드린 자리다', () => {
    expect(unlockClosesChat(true, false, true)).toBe(true);
  });

  it('잠긴 적 없이 연 채팅은 열리자마자 닫히지 않는다 — 상태가 아니라 변화를 본다', () => {
    // 시행을 안 잡고도 말은 걸 수 있어야 한다. "지금 안 잠겨 있다"만으로 닫으면
    // 잠금 없이 Enter 를 친 사람은 입력창을 볼 수조차 없다
    expect(unlockClosesChat(false, false, true)).toBe(false);
  });

  it('잠금이 그대로면 닫지 않는다 — Enter 로 열고 치는 동안이 그렇다', () => {
    expect(unlockClosesChat(true, true, true)).toBe(false);
  });

  it('말하는 중이 아니면 잠금이 풀려도 할 일이 없다', () => {
    expect(unlockClosesChat(true, false, false)).toBe(false);
  });
});
