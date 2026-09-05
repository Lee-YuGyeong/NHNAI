// @vitest-environment jsdom
/**
 * 전체화면 배선 — **손길 위에서 청하고, 풀리면 다음 손길에 도로 청하는가.**
 *
 * jsdom 에는 requestFullscreen 이 없다. 여기서 가짜를 하나 끼우고 **몇 번 청했는지**만 센다 —
 * 실제로 화면이 커지는지는 브라우저 것이라 시험할 것이 아니다.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FULLSCREEN_OFF_KEY, Fullscreen } from '@/shared/Fullscreen';

let asked = 0;
/** 지금 전체화면인 요소 — 가짜 requestFullscreen 이 이걸 채우고, 시험이 비운다 */
let fullEl: Element | null = null;

const setFull = (el: Element | null) => {
  fullEl = el;
  document.dispatchEvent(new Event('fullscreenchange'));
};

const click = () => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
const key = (k: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));

/** 청하기가 promise 라 한 박자 기다려야 pending 이 풀린다 */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('전체화면 (위임)', () => {
  beforeEach(() => {
    asked = 0;
    fullEl = null;
    localStorage.clear();
    Object.defineProperty(document, 'fullscreenElement', { get: () => fullEl, configurable: true });
    document.documentElement.requestFullscreen = vi.fn(() => {
      asked += 1;
      fullEl = document.documentElement;
      return Promise.resolve();
    });
  });

  afterEach(() => {
    // 다른 시험 파일이 jsdom 의 원래 자리(undefined)를 보게 되돌린다
    // @ts-expect-error 가짜를 뗀다
    delete document.documentElement.requestFullscreen;
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  it('열자마자는 청하지 않는다 — 사람이 누른 직후에만 통하는 문이다', () => {
    render(<Fullscreen />);
    expect(asked).toBe(0);
  });

  it('첫 누름에 문서 뿌리를 전체화면으로 청한다', () => {
    render(<Fullscreen />);
    click();
    expect(asked).toBe(1);
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('자판도 손길이다 — 단, Esc 와 누르고 있는 반복은 아니다', () => {
    render(<Fullscreen />);
    key('Escape');
    key('a', { repeat: true });
    expect(asked).toBe(0);
    key('a');
    expect(asked).toBe(1);
  });

  it('이미 전체화면이면 또 청하지 않는다 — 누를 때마다 깜빡이면 안 된다', async () => {
    render(<Fullscreen />);
    click();
    await tick();
    click();
    key('Enter');
    expect(asked).toBe(1);
  });

  it('풀리면 다음 손길에 도로 들어간다 — 배선은 한 번 쓰고 버리지 않는다', async () => {
    render(<Fullscreen />);
    click();
    await tick();
    setFull(null); // Esc · 창 나감 · 돌아옴 — 무엇으로든 풀렸다
    click();
    expect(asked).toBe(2);
  });

  it('오른쪽 버튼은 손길이 아니다', () => {
    render(<Fullscreen />);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }));
    expect(asked).toBe(0);
  });

  it("localStorage.fullscreen = 'off' 면 조용하다 (개발용 손잡이)", () => {
    localStorage.setItem(FULLSCREEN_OFF_KEY, 'off');
    render(<Fullscreen />);
    click();
    key('a');
    expect(asked).toBe(0);
  });

  it('거절당해도 죽지 않고, 다음 손길에 또 청한다', async () => {
    document.documentElement.requestFullscreen = vi.fn(() => {
      asked += 1;
      return Promise.reject(new TypeError('not allowed'));
    });
    render(<Fullscreen />);
    click();
    await tick();
    click();
    expect(asked).toBe(2);
  });
});
