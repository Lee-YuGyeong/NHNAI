/**
 * suspicion.bindCross 의 주인 이름표 — 슬롯이 하나라 본판과 /scenario2 가 번갈아 걸면 뒤에 건 쪽이 조용히 이긴다.
 * 덮어쓰기는 막지 않는다(동작 불변). 다른 주인이 덮을 때만 콘솔에 남는지를 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suspicion } from '../../../src/world/mp/suspicion';

describe('suspicion.bindCross 주인 가드', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    suspicion.bindCross(null);
    suspicion.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    suspicion.bindCross(null);
    warn.mockRestore();
  });

  it('같은 주인이 두 번 걸면 조용하다', () => {
    suspicion.bindCross(() => {}, 'world');
    suspicion.bindCross(() => {}, 'world');
    expect(warn).not.toHaveBeenCalled();
  });

  it('다른 주인이 덮으면 딱 한 번 경고하고, 그래도 덮는다', () => {
    const a = vi.fn();
    const b = vi.fn();
    suspicion.bindCross(a, 'world');
    suspicion.bindCross(b, 'scenario2');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('world');
    expect(warn.mock.calls[0][0]).toContain('scenario2');
    suspicion.bump(45, '감정', 1000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(40);
  });

  it('null 로 비우면 주인도 비워져 다음 주인은 경고 없이 건다', () => {
    suspicion.bindCross(() => {}, 'world');
    suspicion.bindCross(null);
    suspicion.bindCross(() => {}, 'scenario2');
    expect(warn).not.toHaveBeenCalled();
  });

  it('주인 없이 걸어도(기존 호출부) 컴파일·동작이 같다', () => {
    const fn = vi.fn();
    suspicion.bindCross(fn);
    suspicion.bump(60, '감정', 1000);
    expect(fn).toHaveBeenCalledWith(60);
  });
});
