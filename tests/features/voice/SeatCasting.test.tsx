// @vitest-environment jsdom
/**
 * 좌석 명부 캐스팅 칸 (src/features/voice/SeatCasting.tsx).
 *
 * 여기서 지키는 것은 **아홉을 넘지 않는다**와 **모자란 명부를 조용히 내보내지 않는다**다.
 * 여덟만 넣고 붙여 넣으면 그 방은 통째로 조용해지는데(설계대로다), 화면이 말해 주지 않으면
 * 그걸 고장으로 보고 「되는 좌석만이라도」 고치려 들게 된다 — P11 이 무너지는 흔한 경로다.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeatCasting, type AccountVoice } from '@/features/voice/SeatCasting';
import { ROSTER_SIZE } from '@/features/voice/roster';

/**
 * 화면이 뜨자마자 GET /api/tts/seats 를 물어본다. 기본은 「못 읽었다」로 둔다 —
 * 명부를 짜는 시험들은 워커가 없는 상태를 재현하는 게 맞다.
 */
function stubSeats(body?: { seats: unknown[] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      body
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
        : Promise.reject(new Error('no worker')),
    ),
  );
}

const VOICES: AccountVoice[] = Array.from({ length: 12 }, (_, i) => ({
  id: `v${i}`,
  name: `목소리 ${i}`,
  category: 'cloned',
}));

/** 명부는 localStorage 에 남는다 — 시험끼리 새어 나가지 않게 치운다 */
beforeEach(() => {
  stubSeats();
  try {
    localStorage.removeItem('voice.seatRoster');
  } catch {
    /* 환경에 따라 없다 */
  }
});
afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(screen.getByText(`짜는 중 1/${ROSTER_SIZE}`, { exact: false })).toBeInTheDocument();
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
    expect(screen.getByText(`짜는 중 ${ROSTER_SIZE}/${ROSTER_SIZE}`, { exact: false })).toBeInTheDocument();
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

  it('워커를 못 읽으면 개발 스위치를 확인하라고 적는다', async () => {
    render(<SeatCasting voices={VOICES} />);
    expect(await screen.findByText(/SEAT_VOICE_DEV/)).toBeInTheDocument();
  });

  it('빼면 줄에서도 빠진다', () => {
    render(<SeatCasting voices={VOICES} />);
    put('v2');
    put('v0');
    fireEvent.click(screen.getAllByRole('button', { name: '빼기' })[0]);
    expect(screen.getByText('ELEVENLABS_SEAT_VOICE_IDS=v0')).toBeInTheDocument();
  });
});

/**
 * 워커에 이미 들어간 명부를 비추는 칸. 여기서 재는 것은 **모자라거나 틀어졌을 때 화면이
 * 말해 주는가**다 — 둘 다 「방 전체 무음」으로 끝나는데, 화면이 조용하면 원인을 못 찾는다.
 */
describe('지금 워커에 들어간 명부', () => {
  const seat = (index: number, known = true) => ({
    index,
    id: `sv${index}`,
    name: `내 목소리 ${index}`,
    known,
  });

  it('아홉이 다 차면 「다 찼다」로 적는다', async () => {
    stubSeats({ seats: Array.from({ length: ROSTER_SIZE }, (_, i) => seat(i)) });
    render(<SeatCasting voices={VOICES} />);
    expect(await screen.findByText(/다 찼다/)).toBeInTheDocument();
  });

  it('앞 다섯은 남1~남5, 뒤 넷은 여1~여4 로 부른다', async () => {
    stubSeats({ seats: Array.from({ length: ROSTER_SIZE }, (_, i) => seat(i)) });
    render(<SeatCasting voices={VOICES} />);
    await screen.findByText('남1');
    for (const label of ['남1', '남2', '남3', '남4', '남5', '여1', '여2', '여3', '여4']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('자리마다 듣기가 있고, 아홉을 순서대로 듣는 단추도 있다', async () => {
    stubSeats({ seats: Array.from({ length: ROSTER_SIZE }, (_, i) => seat(i)) });
    render(<SeatCasting voices={VOICES} />);
    await screen.findByText('남1');
    expect(screen.getAllByRole('button', { name: '듣기' })).toHaveLength(ROSTER_SIZE);
    expect(screen.getByRole('button', { name: /아홉 전부 순서대로/ })).toBeInTheDocument();
  });

  it('모자라면 방 전체가 무음이라고 적는다', async () => {
    stubSeats({ seats: [seat(0), seat(1)] });
    render(<SeatCasting voices={VOICES} />);
    expect(await screen.findByText(/모자라면 방 전체가 무음/)).toBeInTheDocument();
  });

  it('계정에 없는 id 는 눈에 띄게 적는다 — 그 좌석 하나가 방을 조용하게 만든다', async () => {
    stubSeats({ seats: [seat(0), seat(1, false)] });
    render(<SeatCasting voices={VOICES} />);
    // 그 좌석 줄에 id 를 적고 (이름 대신), 아래에 왜 위험한지도 적는다 — 둘 다 있어야 고칠 수 있다
    expect(await screen.findByText(/^sv1.* 계정에 없는 id$/)).toBeInTheDocument();
    expect(screen.getByText(/그 좌석은 합성에서 503/)).toBeInTheDocument();
  });
});
