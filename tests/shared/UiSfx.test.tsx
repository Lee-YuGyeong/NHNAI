// @vitest-environment jsdom
/**
 * 누르는 소리의 배선 — **정말로 눌렀을 때 소리가 나는가.**
 *
 * 화면에 붙는 것은 위임 하나뿐이라(shared/UiSfx), 이 배선이 끊기면 게임 전체가 한꺼번에
 * 조용해진다. 그래서 여기서는 가짜 AudioContext 를 하나 세워 두고 **소리를 만들었는지**만 센다 —
 * 어떤 파형인지는 시험할 것이 아니다 (tests/shared/sfx.test.ts 머리말과 같은 선).
 */
import { render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UiSfx } from '@/shared/UiSfx';
import { setSfxOn } from '@/shared/sfx';
import { counting, installFakeAudio } from './fake-audio';

/** 누른다 — jsdom 에는 PointerEvent 가 없어서 MouseEvent 로 보낸다 (button·pointerType 은 핸들러가 보는 값) */
const press = (el: Element) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
const hover = (el: Element) => el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));

/** 한 조작이 소리를 몇 개 냈나 */
const sounds = (fn: () => void) => counting(fn).started;

describe('누르는 소리 (위임)', () => {
  beforeAll(installFakeAudio);

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    render(<UiSfx />);
  });

  it('버튼을 누르면 소리가 난다', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="go">가기</button>');
    expect(sounds(() => press(document.getElementById('go')!))).toBeGreaterThan(0);
  });

  it('키보드로 누른 버튼도 같은 소리가 난다 — 누르는 방법이 소리를 가르지 않는다', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="go">가기</button>');
    const go = document.getElementById('go')!;
    expect(sounds(() => go.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))).toBeGreaterThan(0);
    // 누르고 있는 동안 반복해 들어오는 것은 한 번의 누름이다
    expect(sounds(() => go.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, repeat: true })))).toBe(0);
  });

  it('못 누르는 버튼과 data-sfx="none" 은 조용하다', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="off" disabled>시작</button><button id="mute" data-sfx="none">🔊</button>');
    expect(sounds(() => press(document.getElementById('off')!))).toBe(0);
    expect(sounds(() => press(document.getElementById('mute')!))).toBe(0);
  });

  it('꺼 두면 아무 것도 나지 않는다', () => {
    setSfxOn(false);
    document.body.insertAdjacentHTML('beforeend', '<button id="go" data-sfx="clank">1024번 방</button>');
    expect(sounds(() => press(document.getElementById('go')!))).toBe(0);
    setSfxOn(true);
    expect(sounds(() => press(document.getElementById('go')!))).toBeGreaterThan(0);
  });

  it('한 버튼 위를 훑는 동안은 한 번만 울린다 — 아이콘과 글자 사이를 오갈 때마다 울리면 시끄럽다', () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="go"><svg><path id="ico"/></svg><span id="txt">가기</span></button><p id="bg">바탕</p>');
    expect(sounds(() => hover(document.getElementById('ico')!))).toBeGreaterThan(0);
    expect(sounds(() => hover(document.getElementById('txt')!))).toBe(0);
    // 버튼 밖으로 나갔다 다시 들어오면 다시 울린다
    sounds(() => hover(document.getElementById('bg')!));
    expect(sounds(() => hover(document.getElementById('go')!))).toBeGreaterThan(0);
  });
});

