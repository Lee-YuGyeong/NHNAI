// @vitest-environment jsdom
/**
 * 좌석 명부 캐스팅 칸 (src/features/voice/SeatCasting.tsx).
 *
 * 여기서 지키는 것은 **아홉을 넘지 않는다**와 **모자란 명부를 조용히 내보내지 않는다**다.
 * 여덟만 넣고 붙여 넣으면 그 방은 통째로 조용해지는데(설계대로다), 화면이 말해 주지 않으면
 * 그걸 고장으로 보고 「되는 좌석만이라도」 고치려 들게 된다 — P11 이 무너지는 흔한 경로다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeatCasting, type AccountVoice } from '@/features/voice/SeatCasting';
import { ROSTER_SIZE } from '@/features/voice/roster';

const VOICES: AccountVoice[] = Array.from({ length: 12 }, (_, i) => ({
  id: `v${i}`,
  name: `목소리 ${i}`,
  category: 'cloned',
}));

/** 명부는 localStorage 에 남는다 — 시험끼리 새어 나가지 않게 치운다 */
beforeEach(() => {
  try {
    localStorage.removeItem('voice.seatRoster');
  } catch {
    /* 환경에 따라 없다 */
  }
});
afterEach(() => {
  try {
    localStorage.removeItem('voice.seatRoster');
  } catch {
    /* 환경에 따라 없다 */
  }
});

/** 드롭다운에서 하나 골라 명부에 넣는다 */
function put(id: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: '명부에 넣기' }));
}

describe('좌석 명부 캐스팅', () => {
  it('빈 명부에서는 「방 전체가 무음」이라고 적는다 — 고장이 아니라 설계라고', () => {
    render(<SeatCasting voices={VOICES} />);
    expect(screen.getByText(/방 전체가 무음/)).toBeInTheDocument();
  });

  it('넣으면 명부 수가 올라간다', () => {
    render(<SeatCasting voices={VOICES} />);
    put('v0');
    expect(screen.getByText(`명부 1/${ROSTER_SIZE}`)).toBeInTheDocument();
    expect(screen.getByText('목소리 0')).toBeInTheDocument();
  });

  it('같은 목소리를 두 번 넣을 수 없다 — 두 좌석이 같은 소리면 못 따라간다', () => {
    render(<SeatCasting voices={VOICES} />);
    put('v0');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v0' } });
    expect(screen.getByRole('button', { name: '명부에 넣기' })).toBeDisabled();
  });

  it(`아홉을 넘게 넣을 수 없다`, () => {
    render(<SeatCasting voices={VOICES} />);
    for (let i = 0; i < ROSTER_SIZE; i++) put(`v${i}`);
    expect(screen.getByText(`명부 ${ROSTER_SIZE}/${ROSTER_SIZE}`)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: `v${ROSTER_SIZE}` } });
    expect(screen.getByRole('button', { name: '명부에 넣기' })).toBeDisabled();
  });

  it('모자란 채로 두면 몇 개 모자란지 적는다', () => {
    render(<SeatCasting voices={VOICES} />);
    put('v0');
    put('v1');
    expect(screen.getByText(new RegExp(`아직 ${ROSTER_SIZE - 2}개 모자란다`))).toBeInTheDocument();
  });

  it('.dev.vars 줄을 명부 순서대로 만든다', () => {
    render(<SeatCasting voices={VOICES} />);
    put('v2');
    put('v0');
    expect(screen.getByText('ELEVENLABS_SEAT_VOICE_IDS=v2,v0')).toBeInTheDocument();
  });

  it('빼면 줄에서도 빠진다', () => {
    render(<SeatCasting voices={VOICES} />);
    put('v2');
    put('v0');
    fireEvent.click(screen.getAllByRole('button', { name: '빼기' })[0]);
    expect(screen.getByText('ELEVENLABS_SEAT_VOICE_IDS=v0')).toBeInTheDocument();
  });
});
