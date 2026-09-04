// @vitest-environment jsdom
/**
 * 검문소의 큰 시계 — 미니 게임 30초의 남은 초가 30 29 28 … 로 내려가는 계약 (Panels.tsx 의 BigClock 머리말).
 *   · 첫 숫자는 늘 30 — 내 시계가 서버보다 늦어 31 이 나와도 시험 길이로 눌러 둔다
 *   · 매초 하나씩 내려간다 (250ms 눈금이지만 숫자는 초 단위)
 *   · 마지막 10초는 .urgent — 색이 붉어지는 자리다 (CSS 는 안 본다)
 *   · 기준 시각이 없으면(phaseEndsAt null) 아무것도 안 그린다
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BigClock } from '@/features/interrogation/hud/Panels';

const T0 = 1_700_000_000_000;

describe('검문소 — 미니 게임의 남은 초', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('30 에서 시작해 매초 하나씩 내려간다', () => {
    render(<BigClock endsAt={T0 + 30_000} maxSeconds={30} />);
    expect(screen.getByText('30')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(screen.getByText('29')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(screen.getByText('28')).toBeInTheDocument();
  });

  it('내 시계가 서버보다 늦어도 31 은 안 나온다 — 시험 길이가 위를 막는다', () => {
    // 서버가 준 끝 시각이 내 지금보다 30.6초 뒤: ceil 로는 31 이지만 30 으로 눌린다
    render(<BigClock endsAt={T0 + 30_600} maxSeconds={30} />);
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('마지막 10초는 urgent — 11초 남았을 땐 아니다', () => {
    const { container } = render(<BigClock endsAt={T0 + 11_000} maxSeconds={30} />);
    const el = container.querySelector('.ig-clock')!;
    expect(el).not.toHaveClass('urgent');
    expect(el.textContent).toBe('11초');
    act(() => void vi.advanceTimersByTime(1_000));
    expect(el).toHaveClass('urgent');
    expect(el.textContent).toBe('10초');
  });

  it('끝 시각이 없으면 안 그린다', () => {
    const { container } = render(<BigClock endsAt={null} maxSeconds={30} />);
    expect(container.querySelector('.ig-clock')).toBeNull();
  });
});
