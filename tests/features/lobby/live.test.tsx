// @vitest-environment jsdom
/**
 * 살아 있는 콘솔 — 시계 · 지문 · 로그 · 접속 시퀀스 · 카운트다운 (src/features/lobby/live.tsx).
 *
 * 여기서 지키려는 계약은 하나로 요약된다: **화면이 움직이되 거짓말은 하지 않는다.**
 *   시계는 연도만 바뀐 진짜 시각인가
 *   지문은 같은 이름에서 늘 같은 값이 나오는가 (그리고 이름이 없으면 없다고 하는가)
 *   접속 시퀀스의 불은 **진짜 사건**에만 켜지는가
 *   카운트다운은 다 세고 나서만 넘기는가
 *
 * 소리(shared/sfx)는 여기서 보지 않는다 — jsdom 에 AudioContext 가 없어서 playSfx 는 조용히
 * 지나간다. 그걸 목으로 만들어 세면 로컬만 초록불이 된다 (vitest.config.ts 머리말).
 */
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyFeature } from '@/features/lobby/LobbyFeature';
import { Launch, LinkBoot, Typed, ZoneClock, sessionSig, zoneStamp } from '@/features/lobby/live';
import { markOpeningSeen } from '@/shared/opening';
import { rootReducer } from '@/store';

afterEach(() => {
  vi.useRealTimers();
});

describe('구역 시계 — 연도만 옮긴다', () => {
  it('월·일·시·분·초는 내 시계 그대로고 연도만 2098 이다', () => {
    expect(zoneStamp(new Date(2026, 7, 30, 22, 8, 3))).toBe('2098-08-30 22:08:03');
  });

  it('화면에도 그 값이 뜬다', () => {
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
    render(<ZoneClock />);
    expect(screen.getByText('2098-01-02 03:04:05')).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('한 자씩 찍기 — 다 적힌 글이 아니라 지금 오는 전문', () => {
  /**
   * 지금까지 찍힌 글. 유령(자리를 잡는 다 적힌 한 벌)이 아니라 **잉크**를 본다 —
   * 둘 다 aria-hidden 이라 클래스로 갈라야 한다 (live.tsx 의 두 겹).
   */
  const ink = (c: HTMLElement) => c.querySelector('.bl-typed__ink')?.textContent ?? '';

  /**
   * 한 글자에 한 번씩 시계를 민다.
   *
   * ★ 84ms 를 **한 번에** 밀면 두 글자가 아니라 한 글자만 찍힌다: 다음 글자의 시계는
   *   앞 글자가 그려진 **뒤에** 걸리는데(effect), 그 그리기는 act 가 끝날 때 흘러나온다.
   *   진짜 브라우저에서는 시계가 저 혼자 흐르니 이 대목은 시험 환경의 일이다.
   */
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it('한 글자씩 는다 — 줄바꿈에서는 한 박자 쉰다', () => {
    vi.useFakeTimers();
    const { container } = render(<Typed parts={['ab', 'br', { dim: 'cd' }]} />);
    expect(ink(container)).toBe('');

    tick(42);
    expect(ink(container)).toBe('a');
    tick(42);
    expect(ink(container)).toBe('ab');

    // 줄바꿈은 42ms 로는 안 넘어간다 — 두 줄이 두 문장으로 읽히도록 뜸을 들인다
    tick(42);
    expect(ink(container)).toBe('ab');
    tick(338);

    tick(42);
    expect(ink(container)).toBe('abc');
    tick(42);
    expect(ink(container)).toBe('abcd');
  });

  it('강조는 <em> 으로 나온다 — 이 화면에 하나뿐인 따뜻한 색이 붙는 자리다', () => {
    vi.useFakeTimers();
    const { container } = render(<Typed parts={['누가 ', { em: '인간' }, '인가?']} ms={85} />);
    for (let i = 0; i < 5; i += 1) tick(85);
    expect(container.querySelector('.bl-typed__ink em')?.textContent).toBe('인간');
  });

  it('다 찍히면 한 번만 알린다 — 표지는 이걸 받아 그 다음 것들을 올린다', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    render(<Typed parts={['가나']} onDone={done} />);
    expect(done).not.toHaveBeenCalled();
    tick(42);
    tick(42);
    expect(done).toHaveBeenCalledTimes(1);
    // 다 찍힌 뒤에 시계가 더 돌아도 두 번 부르지 않는다 (표지가 두 번 올라온다)
    tick(1000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('자리는 첫 프레임부터 마지막 크기다 — 찍히면서 아래 글이 밀리지 않게', () => {
    vi.useFakeTimers();
    const { container } = render(<Typed parts={['ab', 'br', { dim: 'cd' }]} />);
    // 잉크는 아직 비어 있는데 유령은 이미 통글을 들고 있다 (그 키가 곧 제목의 키다)
    expect(ink(container)).toBe('');
    expect(container.querySelector('.bl-typed__ghost')?.textContent).toBe('abcd');
  });

  it('낭독기는 통글을 한 번에 읽는다 — 첫 프레임부터 다 있다', () => {
    vi.useFakeTimers();
    const { container } = render(<Typed parts={['2098.', 'br', { dim: 'AI만' }]} />);
    expect(container.querySelector('.bl-sr')?.textContent).toBe('2098.\nAI만');
  });

  it('화면에 들어오기 전에는 안 찍힌다 — 굴려서 왔을 때 이미 끝나 있으면 효과가 없다', () => {
    vi.useFakeTimers();
    const { container } = render(<Typed parts={['가나다']} start={false} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(ink(container)).toBe('');
  });

  it('찍는 동안만 커서가 선다', () => {
    vi.useFakeTimers();
    const { container } = render(<Typed parts={['가나']} />);
    expect(container.querySelector('.bl-caret')).not.toBeNull();
    tick(42);
    expect(container.querySelector('.bl-caret')).not.toBeNull();
    tick(42);
    expect(container.querySelector('.bl-caret')).toBeNull();
  });
});

describe('세션 지문 — 이름에서 뽑는다', () => {
  it('같은 이름이면 늘 같은 값이다', () => {
    expect(sessionSig('요원-01')).toBe(sessionSig('요원-01'));
    expect(sessionSig('요원-01')).toMatch(/^SIG-[0-9A-F]{4}$/);
  });

  it('다른 이름이면 다른 값이고, 이름이 없으면 없다고 한다', () => {
    expect(sessionSig('요원-01')).not.toBe(sessionSig('요원-02'));
    expect(sessionSig('   ')).toBeNull();
  });
});

describe('접속 시퀀스 — 진짜 사건에만 불이 켜진다', () => {
  it('붙는 중에는 방 번호만 확정이고 좌석은 비어 있다', () => {
    render(<LinkBoot code="1234" status="connecting" seat={null} onCancel={() => {}} />);
    expect(screen.getByText('ROOM #1234')).toBeInTheDocument();
    expect(screen.getByText('대기중…')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('붙고 나면 서버가 준 좌석 번호가 그대로 뜬다', () => {
    render(<LinkBoot code="1234" status="in" seat={7} onCancel={() => {}} />);
    expect(screen.getByText('확인')).toBeInTheDocument();
    expect(screen.getByText('07번')).toBeInTheDocument();
  });

  it('붙고 잠시 뒤에 걷힌다 — 마지막 줄이 켜지는 것을 보고 나서다', () => {
    vi.useFakeTimers();
    const { container } = render(<LinkBoot code="1234" status="in" seat={2} onCancel={() => {}} />);
    expect(container.querySelector('.bl-boot')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(800));
    expect(container.querySelector('.bl-boot')).toBeNull();
  });

  it('오래 걸리면 막 안에서 나가는 길이 열린다 — 가둬 두지 않는다', () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    render(<LinkBoot code="1234" status="connecting" seat={null} onCancel={cancel} />);
    expect(screen.queryByRole('button', { name: '로비로 돌아가기' })).not.toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole('button', { name: '로비로 돌아가기' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('실패는 여기서 그리지 않는다 — 붉은 줄이 이미 그 자리다', () => {
    const { container } = render(<LinkBoot code="1234" status="error" seat={null} onCancel={() => {}} />);
    expect(container.querySelector('.bl-boot')).toBeNull();
  });
});

describe('진입 카운트다운 — 다 세고 나서 넘긴다', () => {
  it('셋을 세는 동안은 넘기지 않는다', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    render(<Launch onDone={done} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(800));
    expect(screen.getByText('2')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(800));
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(800));
    expect(done).toHaveBeenCalledTimes(1);
    // 마지막 칸은 숫자가 아니라 말이다 — 셈이 끝났다는 것을 숫자로 또 세지 않는다
    expect(screen.getByText('진입')).toBeInTheDocument();
  });
});

/**
 * 로비 화면에 붙은 뒤의 계약.
 *
 * ★ 이 판을 **LobbyFeature.test.tsx 가 아니라 여기** 적는다: 2026-08-30 그 파일은 다른 세션이
 *   같은 시각에 고치고 있었다 (docs/DEVELOPMENT.md 「병렬 작업 규칙」 — 같은 파일을 둘이 쓰면
 *   한쪽이 통째로 사라진다). 보는 것이 다르니 파일도 나뉘는 게 맞다: 저쪽은 「방으로 가는 길」,
 *   여기는 「화면이 살아 있나」다.
 */
describe('로비 — 화면에 남은 것만 서 있다', () => {
  const renderRooms = () => {
    /*
     * ★ 오프닝 영상을 **이미 본 브라우저**로 세운다 (shared/opening.ts). 로비의 첫 칸은
     *   2026-09-03 부터 오프닝이고 처음 오는 사람에게만 뜬다 — 여기서 보는 것은
     *   「화면이 살아 있나」라 그 관문 뒤의 화면이 필요하다.
     */
    markOpeningSeen();
    return render(
      <Provider store={configureStore({ reducer: rootReducer })}>
        <MemoryRouter initialEntries={['/lobby']}>
          <Routes>
            <Route path="/lobby" element={<LobbyFeature />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
  };

  /*
   * ★ 여기 있던 검사 넷은 **걷어낸 판을 지키고 있었다** (2026-08-31 사용자: "필요없는
   *   내용 다 빼"). 구역 로그 · 리더 줄 · 시계는 로비에서 내려왔다 — 셋 다 방으로
   *   가는 길과 상관없는 자리를 차지했고, 리더 줄은 「자리는 아홉이다」처럼 이제
   *   틀린 말까지 하고 있었다 (방 정원은 셋이다 — world/mp/constants).
   *
   *   부품 자체는 live.tsx 에 그대로 있고 위쪽 검사들이 지킨다. 여기서 보는 것은
   *   **로비가 그것들을 다시 세우지 않는가**다 — 「지어낸 것을 움직이지 않는다」는
   *   이 파일의 규칙이 화면 쪽에서도 지켜지는지.
   */
  it('지어낸 값을 세우던 판이 없다 — 「전적」도, 그 자리를 대신하던 「구역 로그」도', () => {
    renderRooms();
    expect(screen.queryByText('전적')).not.toBeInTheDocument();
    expect(screen.queryByRole('log', { name: '구역 로그' })).not.toBeInTheDocument();
  });

  it('리더는 로비에서 말하지 않는다 — 방으로 가는 길에 끼어들 말이 없었다', () => {
    renderRooms();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('요원 칸에 남는 것은 이름 하나다 — 지문·상태·구역은 받쳐 줄 값이 없었다', () => {
    renderRooms();
    // 이름을 **고치는 칸**도 없다. 정하는 길만 있고, 그것도 이름이 없을 때뿐이다 (AgentPanel)
    expect(screen.queryByLabelText('게스트 닉네임')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이름 정하기/ })).toBeInTheDocument();
    expect(screen.queryByText('지문')).not.toBeInTheDocument();
    expect(screen.queryByText('LOBBY / 2098')).not.toBeInTheDocument();
  });
});
