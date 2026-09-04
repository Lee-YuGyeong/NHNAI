/**
 * 입력줄의 상태기계 — 닫힘 / 열림 둘뿐이고, 어느 자리에서 온 키든 같은 규칙으로 움직인다 (Hud2 의 talkOpenKey · talkPanelKey).
 *
 * 왜 따로 재나: 2026-09-02 「엔터를 눌렀는데 대화창이 안 사라져」의 원인이 셋이었다 — 보낸 Enter 의 오토리피트가
 * 창을 도로 열고, 빈 줄의 Enter 가 창을 안 닫고, 포커스가 입력줄 밖으로 빠지면 Enter 도 Escape 도 죽었다.
 * 셋 다 자판 규칙이라 DOM 없이 KeyboardEvent 흉내로 잰다 (node 환경, fake timer 없음).
 * 곁(near)은 저장소가 track 으로만 고치므로 talkOpenKey 의 둘째 인자로 흉내 낸다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { talkOpenKey, talkPanelKey } from '../../../src/features/world2/Hud2';
import { scenario2 } from '../../../src/features/world2/scenario2';
import { talk } from '../../../src/features/world2/talk';
import { units } from '../../../src/features/world2/units';

/** 포커스가 빠진 자리 — 입력칸이 아닌 것 */
const BODY = { tagName: 'BODY', isContentEditable: false } as unknown as EventTarget;
const INPUT = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;

const key = (code: string, target: EventTarget = BODY, k = code) => ({ code, key: k, target, ctrlKey: false, metaKey: false, altKey: false });

beforeEach(() => {
  units.reset();
  talk.reset();
  scenario2.closeTalk();
});
afterEach(() => scenario2.closeTalk());

describe('열림 → 닫힘', () => {
  it('열고 한 마디 보내면 자판을 놓는다 — 곁에 아무도 없어도 (허공에 한 말)', () => {
    scenario2.openTalk();
    expect(scenario2.get().talking).toBe(true);
    scenario2.say('번호가 뭐야');
    expect(scenario2.get().talking).toBe(false);
  });

  it('빈 줄의 Enter 는 닫기다 — say 는 빈 말을 안 보내지만 창은 접힌다', () => {
    scenario2.openTalk();
    scenario2.say('   ');
    // say 의 계약은 그대로: 빈 말은 아무것도 안 한다 (창도 그대로)
    expect(scenario2.get().talking).toBe(true);
    // 창구가 그 빈 Enter 를 닫기로 읽는다
    expect(talkPanelKey(key('Enter'), { text: '   ', focus: () => {} })).toBe('close');
    expect(scenario2.get().talking).toBe(false);
  });

  it('문장이 있는 Enter 는 보내기다 — NumpadEnter 도 같다', () => {
    scenario2.openTalk();
    expect(talkPanelKey(key('NumpadEnter', BODY, 'Enter'), { text: '거기 뭐 해', focus: () => {} })).toBe('say');
    expect(scenario2.get().talking).toBe(false);
  });
});

describe('닫힘 → 열림 (talkOpenKey)', () => {
  it('오토리피트 Enter 는 창을 안 연다 — 보낸 Enter 를 아직 누르고 있는 손', () => {
    expect(talkOpenKey({ code: 'Enter', repeat: true }, true)).toBe(false);
    expect(scenario2.get().talking).toBe(false);
    expect(talkOpenKey({ code: 'NumpadEnter', repeat: true }, true)).toBe(false);
    expect(scenario2.get().talking).toBe(false);
  });

  it('첫 Enter 는 곁에 누가 있을 때만 연다', () => {
    expect(talkOpenKey({ code: 'Enter', repeat: false }, false)).toBe(false);
    expect(scenario2.get().talking).toBe(false);
    expect(talkOpenKey({ code: 'Enter', repeat: false }, true)).toBe(true);
    expect(scenario2.get().talking).toBe(true);
  });

  it('Enter 가 아닌 키는 이 창구의 것이 아니다', () => {
    expect(talkOpenKey({ code: 'Space', repeat: false }, true)).toBe(false);
    expect(talkOpenKey({ code: 'KeyE', repeat: false }, true)).toBe(false);
    expect(scenario2.get().talking).toBe(false);
  });

  it('보낸 뒤 반복 Enter 가 body 로 떨어져도 도로 안 열린다 (G1→G2)', () => {
    talkOpenKey({ code: 'Enter', repeat: false }, true);
    expect(talkPanelKey(key('Enter'), { text: '안녕', focus: () => {} })).toBe('say');
    expect(scenario2.get().talking).toBe(false);
    expect(talkOpenKey({ code: 'Enter', repeat: true }, true)).toBe(false);
    expect(scenario2.get().talking).toBe(false);
  });
});

describe('포커스가 입력줄 밖으로 빠졌을 때 (talkPanelKey)', () => {
  it('Escape 는 닫는다', () => {
    scenario2.openTalk();
    expect(talkPanelKey(key('Escape'), { text: '치던 말', focus: () => {} })).toBe('close');
    expect(scenario2.get().talking).toBe(false);
  });

  it('글자키는 입력줄을 도로 잡는다 — 글자는 버리지 않는다 (창구는 preventDefault 를 안 한다)', () => {
    scenario2.openTalk();
    let focused = 0;
    expect(talkPanelKey(key('KeyA', BODY, 'a'), { text: '', focus: () => void focused++ })).toBe('focus');
    expect(talkPanelKey(key('KeyA', BODY, 'ㅁ'), { text: '', focus: () => void focused++ })).toBe('focus');
    expect(focused).toBe(2);
    expect(scenario2.get().talking).toBe(true);
  });

  it('조합키가 붙은 글자키·기능키는 아무것도 안 한다', () => {
    scenario2.openTalk();
    let focused = 0;
    expect(talkPanelKey({ ...key('KeyC', BODY, 'c'), metaKey: true }, { text: '', focus: () => void focused++ })).toBeNull();
    expect(talkPanelKey(key('Tab', BODY, 'Tab'), { text: '', focus: () => void focused++ })).toBeNull();
    expect(focused).toBe(0);
    expect(scenario2.get().talking).toBe(true);
  });

  it('글 치는 칸에서 온 키는 그 칸의 것이다 — 두 번 돌지 않는다', () => {
    scenario2.openTalk();
    expect(talkPanelKey(key('Escape', INPUT), { text: '', focus: () => {} })).toBeNull();
    expect(talkPanelKey(key('Enter', INPUT), { text: '안녕', focus: () => {} })).toBeNull();
    const TA = { tagName: 'TEXTAREA', isContentEditable: false } as unknown as EventTarget;
    expect(talkPanelKey(key('Escape', TA), { text: '', focus: () => {} })).toBeNull();
    expect(scenario2.get().talking).toBe(true);
  });
});
