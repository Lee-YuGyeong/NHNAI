// @vitest-environment jsdom
/**
 * 전리품 배분 — 엎어진 세 장을 **숫자 키로도** 고른다 (2026-09-05 사용자: "카드 고를때 숫자 1 2 3 눌러도
 * 선택되어지게 · 카드에 숫자도 적어줘").
 *   · 카드에는 1 · 2 · 3 이 적혀 있고, 그 숫자가 곧 누를 키다
 *   · 채팅을 치는 중에는 안 먹는다 — 「1등」이라고 치는 손이 카드를 뽑아 버리면 안 된다
 *   · 고르는 것은 한 번뿐 — 키와 클릭이 겹쳐도 서버에 두 번 가지 않는다
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardOffer } from '@/features/interrogation/hud/Cards';

const press = (key: string) => fireEvent.keyDown(window, { key });

describe('전리품 배분 — 숫자 키로 고르기', () => {
  it('카드마다 제 번호가 적혀 있다', () => {
    render(<CardOffer count={3} onPick={() => {}} />);
    for (const n of ['1', '2', '3']) expect(screen.getByText(n)).toBeInTheDocument();
  });

  it('숫자 키가 그 자리의 카드를 고른다', () => {
    const onPick = vi.fn();
    render(<CardOffer count={3} onPick={onPick} />);
    press('2');
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('장수 밖의 숫자는 아무 일도 안 한다', () => {
    const onPick = vi.fn();
    render(<CardOffer count={3} onPick={onPick} />);
    press('4');
    press('0');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('채팅을 치는 중이면 안 먹는다', () => {
    const onPick = vi.fn();
    render(<CardOffer count={3} onPick={onPick} />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('1');
    expect(onPick).not.toHaveBeenCalled();
    input.remove();
  });

  it('한 번 고르면 키로도 클릭으로도 두 번 안 간다', () => {
    const onPick = vi.fn();
    render(<CardOffer count={3} onPick={onPick} />);
    press('1');
    press('3');
    fireEvent.click(screen.getByRole('button', { name: /3번 카드/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(0);
  });
});
