// @vitest-environment jsdom
/**
 * 눌린 채로 남은 손 — **턴 뒤에 오는 자동 반복은 받지 않는다** (input 의 heldMuted).
 *
 * 키 목록을 비워도 손이 자판에 얹혀 있으면 운영체제가 30~50ms 만에 같은 키를 도로 켠다.
 * 그러면 턴 것이 없던 일이 되고, 부동자세 검사(처형판)는 **지시를 읽기도 전에 끝난다.**
 */
import { afterEach, describe, expect, it } from 'vitest';

import { attachKeyboard, input, resetInput } from '@/arena3d/input/input';

const press = (code: string, repeat = false) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true }));
const release = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

let detach: (() => void) | null = null;
afterEach(() => {
  detach?.();
  detach = null;
  resetInput();
});

describe('눌린 채로 남은 손', () => {
  it('턴 뒤의 자동 반복은 안 받는다 — 손을 떼고 새로 눌러야 걷는다', () => {
    detach = attachKeyboard();
    press('KeyW');
    expect(input.moveZ).toBe(1);

    resetInput();
    expect(input.moveZ).toBe(0);

    // 손은 그대로 얹혀 있다 — 운영체제가 같은 키를 반복해 보낸다
    press('KeyW', true);
    press('KeyW', true);
    expect(input.moveZ).toBe(0);

    // 뗐다가 새로 눌렀다 — 이건 손이 실제로 움직인 것이다
    release('KeyW');
    press('KeyW');
    expect(input.moveZ).toBe(1);
  });

  it('턴 뒤라도 다른 키를 새로 누르면 그때부터 다시 받는다', () => {
    detach = attachKeyboard();
    press('KeyW');
    resetInput();
    press('KeyD'); // 새로 누른 키 하나가 잠금을 푼다
    expect(input.moveX).toBe(1);
  });
});
