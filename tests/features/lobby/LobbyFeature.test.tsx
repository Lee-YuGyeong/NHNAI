// @vitest-environment jsdom
/**
 * 게임 로비 — 화면 조각 테스트.
 *
 * 이 화면의 계약: **닉네임이 있어야 방에 들어간다**, 목록은 찾고 정렬할 수 있다,
 * 「방 만들기」는 번호를 뽑아 그 방으로 보낸다.
 *
 * ★ 목록은 등록소에서 온다 (worker/src/lobby-do.ts). 여기서는 **그 응답 하나만** 가짜로 세운다 —
 *   방 목록 화면의 계약은 "받아 온 줄을 찾고 정렬해 보여 준다" 이지 "누가 그 줄을 적었나" 가 아니다.
 *   등록소 자체의 규칙은 tests/worker/lobby.test.ts 가 진짜 코드로 본다.
 *
 * ★ 대기방으로 넘어가는 자리에는 **표식판**을 세운다 (MainFeature 테스트의 「월드 자리」와 같은 수법).
 *   진짜 대기방은 마운트되자마자 방 소켓을 여는데, 그건 jsdom 이 대신 흉내 낼 것이 아니다 —
 *   서버 동작을 목으로 만들면 로컬만 초록불이 된다 (vitest.config.ts 머리말).
 *   대기방 자체는 소켓을 열지 않는 갈래(닉네임 없음)만 여기서 직접 본다.
 */
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LobbyFeature } from '@/features/lobby/LobbyFeature';
import { LobbyIntro } from '@/features/lobby/Intro';
import { Waitroom } from '@/features/lobby/Waitroom';
import { recentRooms } from '@/features/lobby/rooms';
import { markOpeningSeen } from '@/shared/opening';
import { sfxOn } from '@/shared/sfx';
import { rootReducer } from '@/store';
import type { AccountState } from '@/shared/useAccount';

/*
 * 계정 상태를 **고정한다.** 안 하면 이 화면이 마운트될 때마다 진짜 /api/config 를 부르고,
 * 그 요청이 언제 끝나느냐에 따라 「입장하기」가 /login 으로도 /lobby 로도 간다 —
 * 시험이 네트워크 타이밍에 걸린다. 로그인 자체는 tests/features/lobby/Login.test.tsx 가 본다.
 */
let account: AccountState = { status: 'out' };
const signInWithGoogle = vi.fn(() => Promise.resolve({ error: null as string | null }));
/** 나가는 문이 진짜로 열리는지 보려고 지켜본다 — 왼쪽 「요원」 칸의 이름 뒤에 있다 */
const signOut = vi.fn(() => Promise.resolve());
vi.mock('@/shared/useAccount', () => ({
  useAccount: () => account,
  useAccountSync: () => {},
  signInWithGoogle: (...a: unknown[]) => signInWithGoogle(...(a as [])),
  signOut: () => signOut(),
}));

/**
 * 지금 열려 있다고 **등록소가 말해 주는** 방들. 옛 목업과 같은 여덟 줄이다 —
 * 이 화면의 찾기·정렬을 보려면 제목이 겹치지 않는 목록 하나면 된다.
 */
const OPEN_ROOMS = [
  { code: '1024', name: '초보 환영', players: 2, capacity: 3, phase: 'lobby' },
  { code: '2098', name: '야간 근무조', players: 2, capacity: 3, phase: 'lobby' },
  { code: '3141', name: '말 많은 방', players: 3, capacity: 3, phase: 'lobby' },
  { code: '4700', name: null, players: 2, capacity: 3, phase: 'lobby' },
  { code: '5150', name: '조용히 합시다', players: 3, capacity: 3, phase: 'playing' },
  { code: '6023', name: '한 판만 더', players: 2, capacity: 3, phase: 'lobby' },
  { code: '7777', name: '연습장', players: 1, capacity: 3, phase: 'lobby' },
  { code: '8086', name: '고인물', players: 2, capacity: 3, phase: 'playing' },
];

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * 등록소 창구를 대신한다. 만들기는 **보낸 번호를 그대로 돌려준다** — 겹치는 번호(TAKEN_CODE)만
 * 거절해서, 화면이 그 이유를 팝업 안에 적는지 볼 수 있게 한다.
 */
const TAKEN_CODE = '1024';
/** 등록소로 나간 요청. 무엇을 적으러 갔는지 보려고 모아 둔다 */
let sent: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    if (!String(url).startsWith('/api/rooms')) return Promise.reject(new Error(`뜻밖의 호출: ${url}`));
    if (init?.method !== 'POST') return Promise.resolve(jsonRes({ rooms: OPEN_ROOMS }));
    const body = JSON.parse(String(init.body)) as { code?: string; name?: string };
    if (body.code === TAKEN_CODE) return Promise.resolve(jsonRes({ error: 'code_taken' }, 409));
    return Promise.resolve(
      jsonRes({ room: { code: body.code ?? '5500', name: body.name ?? null, players: 0, capacity: 3, phase: 'lobby' } }, 201),
    );
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  // 계정은 모듈 하나를 나눠 쓴다 — 되돌리지 않으면 앞 시험의 로그인이 뒤 시험까지 따라간다
  account = { status: 'out' };
  signOut.mockClear();
});

/** ?code= 가 붙는 순간 대기방 대신 표식판을 세운다 (브리핑·목록은 진짜를 그린다) */
function LobbyOrSign() {
  const { search } = useLocation();
  return search.includes('code=') ? <p>{`이동: ${search}`}</p> : <LobbyFeature />;
}

/**
 * @param at 주소가 곧 진행이다 — /lobby 가 **방 목록**이고 브리핑은 /intro 로 갔다
 *           (2026-08-30 사용자 지시. features/index.ts 의 intro 한 줄이 저쪽을 가리킨다).
 *           방 번호가 없는 주소는 전부 목록이라 옛 ?step=rooms 링크도 여기로 떨어진다.
 */
function renderLobby(at = '/lobby') {
  /*
   * ★ 오프닝 영상을 **이미 본 브라우저**로 세운다 (shared/opening.ts).
   *   로비의 첫 칸은 2026-09-03 부터 오프닝 영상이고, 그건 처음 오는 사람에게만 뜬다.
   *   이 파일이 보는 것은 「목록에서 방으로」라 그 관문은 여기 계약이 아니다 —
   *   관문 자체는 아래 「오프닝 영상」 판이 본다.
   */
  markOpeningSeen();
  render(
    <Provider store={configureStore({ reducer: rootReducer })}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/intro" element={<LobbyIntro />} />
          <Route path="/lobby" element={<LobbyOrSign />} />
          <Route path="/login" element={<p>로그인 자리</p>} />
          <Route path="/" element={<p>처음 자리</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

/** 첫 줄의 방 제목 */
const firstRoomTitle = () => screen.getAllByRole('button', { name: /대기 중|게임 중/ })[0].textContent ?? '';

/** 목록은 등록소에서 오므로 **한 번 기다린다.** 그 전에는 「등록소를 읽는 중」이 서 있다 */
const roomRow = (name: RegExp) => screen.findByRole('button', { name });

/**
 * 게스트 이름을 정한다 — 요원 카드의 「이름 정하기」가 그 자리다.
 * **카드에서 직접 고치는 칸은 없다** (이름은 한 번 짓고 끝이다 — LobbyFeature 의 AgentPanel).
 */
const typeNick = (nick: string) => {
  fireEvent.click(screen.getByRole('button', { name: /이름 정하기/ }));
  const ask = screen.getByRole('dialog', { name: '닉네임' });
  fireEvent.change(within(ask).getByLabelText('닉네임'), { target: { value: nick } });
  fireEvent.click(within(ask).getByRole('button', { name: '확인' }));
};

describe('게임 로비 — 목록에서 방으로', () => {
  beforeEach(() => localStorage.clear());

  it('닉네임이 없으면 막지 않고 묻는다 — 치고 나면 누르려던 그 방으로 이어진다', async () => {
    renderLobby();
    fireEvent.click(await roomRow(/초보 환영/));
    // 길을 막는 대신 팝업이 뜬다 (좁은 화면에서는 왼쪽 「요원」 칸이 아예 안 보인다)
    expect(screen.queryByText(/^이동:/)).not.toBeInTheDocument();
    const ask = screen.getByRole('dialog', { name: '닉네임' });
    fireEvent.change(within(ask).getByLabelText('닉네임'), { target: { value: '요원-09' } });
    fireEvent.click(within(ask).getByRole('button', { name: /확인하고 들어가기/ }));
    expect(screen.getByText(/^이동:/)).toHaveTextContent('code=1024');
  });

  it('「아무 이름이나」 로도 이어진다 — 이름 짓느라 멈추지 않게', async () => {
    renderLobby();
    fireEvent.click(await roomRow(/초보 환영/));
    const ask = screen.getByRole('dialog', { name: '닉네임' });
    fireEvent.click(within(ask).getByRole('button', { name: '아무 이름이나' }));
    expect((within(ask).getByLabelText('닉네임') as HTMLInputElement).value).toMatch(/^요원-\d{4}$/);
    fireEvent.click(within(ask).getByRole('button', { name: /확인하고 들어가기/ }));
    expect(screen.getByText(/^이동:/)).toHaveTextContent('code=1024');
  });

  it('닉네임을 넣으면 그 번호의 대기방으로 가고, 발자국이 남는다', async () => {
    renderLobby();
    typeNick('요원-01');
    fireEvent.click(await roomRow(/초보 환영/));
    expect(screen.getByText(/^이동:/)).toHaveTextContent('code=1024');
    expect(recentRooms().map((v) => v.code)).toEqual(['1024']);
  });

  it('**주소에 이름을 싣지 않는다** — 그 주소가 그대로 초대장이 된다 (Waitroom 의 초대 주소)', async () => {
    renderLobby();
    typeNick('요원-01');
    fireEvent.click(await roomRow(/초보 환영/));
    // 초대장에 내 호출부호가 실려 나가면, 받은 사람이 그 주소로 **내 이름을 달고** 앉는다
    expect(screen.getByText(/^이동:/).textContent).toBe('이동: ?code=1024');
  });

  /*
   * 초대 주소를 **처음 받은 사람**의 자리. 여기만 표식판(LobbyOrSign)을 거치지 않고 진짜
   * 화면을 세운다 — 이름이 없으면 대기방이 아니라 목록이 서므로 방 소켓이 열리지 않는다.
   */
  it('이름 없이 초대 주소로 들어오면 **막지 않고 묻는다**. 주소의 이름은 읽지 않는다', () => {
    markOpeningSeen(); // 초대장을 처음 받은 사람도 오프닝을 지나지만, 여기서 보는 것은 그 다음 칸이다
    render(
      <Provider store={configureStore({ reducer: rootReducer })}>
        <MemoryRouter initialEntries={['/lobby?code=4724&nick=%EB%82%A8%EC%9D%98%EC%9D%B4%EB%A6%84']}>
          <LobbyFeature />
        </MemoryRouter>
      </Provider>,
    );
    // 주소에 이름이 실려 있어도 **그 이름으로 앉히지 않는다** — 그건 보낸 사람의 이름이다
    expect(screen.getByRole('dialog', { name: '닉네임' })).toBeInTheDocument();
    expect(screen.queryByText('남의이름')).not.toBeInTheDocument();
  });

  it('제목으로 찾으면 그 방만 남는다 (띄어쓰기는 안 따진다)', async () => {
    renderLobby();
    await roomRow(/초보 환영/); // 목록이 도착한 뒤에 친다
    fireEvent.change(screen.getByLabelText('방 제목 검색'), { target: { value: '말많은' } });
    expect(screen.getByRole('button', { name: /말 많은 방/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /야간 근무조/ })).not.toBeInTheDocument();
  });

  it('찾은 것이 없으면 그 자리에서, **찾던 이름 그대로** 방을 열게 한다 (원작)', async () => {
    renderLobby();
    await roomRow(/초보 환영/);
    fireEvent.change(screen.getByLabelText('방 제목 검색'), { target: { value: '없는방' } });
    expect(screen.getByText('그 제목으로 열린 방이 없다')).toBeInTheDocument();

    // 찾다 못 찾은 사람에게 자연스러운 다음 수는 그 이름으로 방을 여는 것이다
    fireEvent.click(screen.getByRole('button', { name: '이 이름으로 방 만들기' }));
    expect((within(screen.getByRole('dialog')).getByLabelText('방 제목') as HTMLInputElement).value).toBe('없는방');
  });

  it('열린 방이 하나도 없으면 「첫 방 만들기」다', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonRes({ rooms: [] })));
    renderLobby();
    expect(await screen.findByText('지금 열린 방이 없다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '첫 방 만들기' })).toBeInTheDocument();
  });

  it('**등록소에 못 닿은 것과 빈 로비를 갈라 적는다** — 앞은 워커를 띄울 차례다', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
    renderLobby();
    expect(await screen.findByRole('alert')).toHaveTextContent('등록소에 닿지 못했다');
    // 목록이 없다고 길이 막히지는 않는다 — 번호를 아는 방에는 그대로 들어간다
    expect(screen.getByText('번호를 아는 방에는 그대로 들어간다.')).toBeInTheDocument();
    expect(screen.queryByText('지금 열린 방이 없다')).not.toBeInTheDocument();
  });

  it('인원 열을 누르면 방향이 뒤집힌다 — 처음엔 많은 쪽부터', async () => {
    renderLobby();
    await roomRow(/초보 환영/);
    expect(firstRoomTitle()).toContain('말 많은 방'); // 3/3
    fireEvent.click(screen.getByRole('button', { name: /인원.*정렬/ }));
    expect(firstRoomTitle()).toContain('연습장'); // 1/3
  });

  it('방 만들기 팝업은 번호를 미리 뽑아 두고, 다시 뽑을 수 있다', () => {
    renderLobby();
    fireEvent.click(screen.getAllByRole('button', { name: '방 만들기' })[0]);
    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByLabelText('방 번호') as HTMLInputElement;
    expect(field.value).toMatch(/^\d{4}$/);

    // 같은 번호가 두 번 나오면 뽑기가 아니다 — 몇 번 눌러 보고 바뀌는지만 본다
    const first = field.value;
    let changed = false;
    for (let i = 0; i < 8 && !changed; i += 1) {
      fireEvent.click(within(dialog).getByRole('button', { name: '다른 번호 뽑기' }));
      changed = field.value !== first;
    }
    expect(changed).toBe(true);
  });

  it('팝업에서 만들면 **등록소에 제목을 적고** 그 번호로 간다', async () => {
    renderLobby();
    typeNick('요원-02');
    fireEvent.click(screen.getAllByRole('button', { name: '방 만들기' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('방 제목'), { target: { value: '야간 근무조' } });
    fireEvent.change(within(dialog).getByLabelText('방 번호'), { target: { value: '9090' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '방 만들기' }));

    expect(await screen.findByText(/^이동:/)).toHaveTextContent('code=9090');
    const posted = sent.find((c) => c.init?.method === 'POST');
    expect(JSON.parse(String(posted?.init?.body))).toEqual({ name: '야간 근무조', code: '9090' });
  });

  it('겹치는 번호는 **팝업 안에서** 거절당한다 — 방금 친 제목이 사라지면 안 된다', async () => {
    renderLobby();
    typeNick('요원-03');
    fireEvent.click(screen.getAllByRole('button', { name: '방 만들기' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('방 제목'), { target: { value: '내 방' } });
    fireEvent.change(within(dialog).getByLabelText('방 번호'), { target: { value: TAKEN_CODE } });
    fireEvent.click(within(dialog).getByRole('button', { name: '방 만들기' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('이미 열려 있다');
    expect((within(dialog).getByLabelText('방 제목') as HTMLInputElement).value).toBe('내 방');
    expect(screen.queryByText(/^이동:/)).not.toBeInTheDocument();
  });

  it('로그인한 사람의 왼쪽 칸에는 **이름만 선다** (사용자: "여기는 내이름만 나오게")', async () => {
    account = { status: 'in', email: 'a@b.com', displayName: '이유경' };
    renderLobby();
    await roomRow(/초보 환영/);

    // 걷은 셋: 라벨 · 못 바꾼다는 말 · 입력칸 (이니셜 아바타는 왼쪽 얼굴과 겹쳐서 같이 걷었다)
    expect(screen.queryByText('닉네임')).not.toBeInTheDocument();
    expect(screen.queryByText('한 번 정한 이름은 바꿀 수 없다.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('게스트 닉네임')).not.toBeInTheDocument();
  });

  /**
   * 왼쪽 칸의 이름이 **글자가 아니라 단추다** (2026-08-31 사용자: "이거 휴머니시같이
   * 만들어줘 · 누르면 로그아웃있고"). 앞서 머리말 칩만 그렇게 고쳤더니, 정작 사용자가 누른
   * 큰 쪽은 그대로였다 — 그래서 여기서 **왼쪽 칸을 콕 집어** 센다.
   */
  it('왼쪽 칸의 이름을 누르면 로그아웃이 열린다 — 열기 전에는 없다', async () => {
    account = { status: 'in', email: 'a@b.com', displayName: '이유경' };
    renderLobby();
    await roomRow(/초보 환영/);

    const card = screen.getByText('요원').closest('section') as HTMLElement;
    expect(within(card).queryByRole('menuitem', { name: '로그아웃' })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /이유경 — 계정 메뉴/ }));
    fireEvent.click(within(card).getByRole('menuitem', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('머리말과 왼쪽 칸이 **같은 메뉴**를 연다 — 두 벌로 갈리면 한쪽만 고쳐진다', async () => {
    account = { status: 'in', email: 'a@b.com', displayName: '이유경' };
    renderLobby();
    await roomRow(/초보 환영/);
    expect(screen.getAllByRole('button', { name: /이유경 — 계정 메뉴/ })).toHaveLength(2);
  });

  it('머리말에서 「← 처음」을 걷었다 (사용자: "처음 없애줘")', async () => {
    renderLobby();
    await roomRow(/초보 환영/);
    // 개발용 문 목록(/)으로 가는 길이었다. 브리핑으로 돌아가는 길은 왼쪽 로고가 들고 있다
    expect(screen.queryByRole('link', { name: /처음/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '특수인공지능대응센터' })).toHaveAttribute('href', '/intro');
  });

  it('**카드에서는 이름을 고칠 수 없다** — 정하는 길만 있고, 정하고 나면 손잡이가 사라진다', async () => {
    renderLobby();
    await roomRow(/초보 환영/);
    // 이름이 없을 때: 고치는 칸이 아니라 정하러 가는 단추 하나
    expect(screen.queryByLabelText('게스트 닉네임')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이름 정하기/ })).toBeInTheDocument();

    typeNick('요원-07');
    // 정하고 나면 이름만 남는다. 다시 부를 손잡이는 없다 — 한 번 짓고 끝이다
    expect(screen.queryByRole('button', { name: /이름 정하기/ })).not.toBeInTheDocument();
  });

  it('기록 탭은 발자국을 보여준다 — 없는 승패를 지어내지 않는다', () => {
    localStorage.setItem('wih:recent-rooms', JSON.stringify([{ code: '4242', at: Date.now() - 120_000 }]));
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: '기록' }));
    expect(screen.getAllByText('#4242').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2분 전').length).toBeGreaterThan(0);
  });
});

describe('브리핑 — 이 줄의 첫 칸 (/intro)', () => {
  it('배역 글은 찍지 않는 환경에서도 온전히 보인다 — 안 보이는 채로 남는 글이 없게', () => {
    // jsdom 에는 IntersectionObserver 가 없다 = 「이 칸을 보고 있다」가 성립하지 않는다.
    // 그때도 글은 처음부터 다 나와 있어야 한다 (한 글자씩 찍는 것은 보고 있을 때만의 연출이다)
    renderLobby('/intro');
    // 첫 슬라이드는 이제 AI 카드다 (2026-09-04, PLANNING.md 개정 — Intro.tsx의 ROLES 참고)
    expect(screen.getByText('표식 없이 출고된 유일한 개체.')).toBeInTheDocument();
  });

  it('입장하기를 누르면 **곧장 구글로** 간다 — 읽을 화면을 한 장 더 세우지 않는다', () => {
    account = { status: 'out' };
    signInWithGoogle.mockClear();
    renderLobby('/intro');
    expect(screen.getByRole('heading', { name: /특수\s*인공지능\s*대응센터/ })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /입장하기/ })[0]);
    // 돌아올 자리를 들고 간다. 화면은 그대로 있다 — 이 페이지는 구글로 떠나는 중이다
    expect(signInWithGoogle).toHaveBeenCalledWith('/lobby');
  });

  it('이미 로그인했으면 묻지 않고 방 목록으로', () => {
    account = { status: 'in', email: 'a@b.com', displayName: '철수' };
    signInWithGoogle.mockClear();
    renderLobby('/intro');
    fireEvent.click(screen.getAllByRole('button', { name: /입장하기/ })[0]);
    expect(signInWithGoogle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('방 제목 검색')).toBeInTheDocument();
    account = { status: 'out' };
  });

  it('로그인이 꺼져 있으면 묻지 않는다 — 꺼진 판에서는 물을 것이 없다', () => {
    account = { status: 'off' };
    signInWithGoogle.mockClear();
    renderLobby('/intro');
    fireEvent.click(screen.getAllByRole('button', { name: /입장하기/ })[0]);
    expect(signInWithGoogle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('방 제목 검색')).toBeInTheDocument();
    account = { status: 'out' };
  });

  /*
   * 표식의 「로그인 없이 들어가기」 문은 2026-09-05 사용자 지시로 뺐다. 로그인 없이 노는 길
   * (shared/guest.ts) 자체는 약속 그대로다 — /lobby 로 곧장 가면 방 목록이 선다 (바로 아래 시험).
   * 여기서는 그 문이 표식에 **없고**, 옛 「NO SIGN-UP」 거짓말도 돌아오지 않았음을 본다.
   */
  it('표식에 「로그인 없이 들어가기」 문은 없다 — 로그인 없이 가는 길은 /lobby 가 맡는다', () => {
    renderLobby('/intro');
    expect(screen.queryByText(/NO SIGN-UP/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그인 없이 들어가기' })).not.toBeInTheDocument();
  });

  it('/lobby 는 이제 방 목록이다 — 브리핑이 아니다', () => {
    renderLobby('/lobby');
    expect(screen.getByLabelText('방 제목 검색')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /특수\s*인공지능\s*대응센터/ })).not.toBeInTheDocument();
  });

  it('옛 ?step=rooms 링크도 그대로 목록으로 열린다', () => {
    renderLobby('/lobby?step=rooms');
    expect(screen.getByLabelText('방 제목 검색')).toBeInTheDocument();
  });
});

describe('대기방 — 붙기 전', () => {
  it('닉네임이 없으면 방에 붙지 않고 이유를 적는다', () => {
    render(
      <MemoryRouter>
        <Waitroom code="1234" nickname="" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('닉네임이 없다');
    expect(screen.getByText('ROOM #1234')).toBeInTheDocument();
  });
});

describe('효과음 — 로비의 소리', () => {
  beforeEach(() => localStorage.clear());

  it('방 줄에는 「철컹」이 적혀 있다 — 소리는 위임(shared/UiSfx)이 이 표시를 보고 낸다', async () => {
    renderLobby();
    const rows = await screen.findAllByRole('button', { name: /대기 중|게임 중/ });
    expect(rows[0]).toHaveAttribute('data-sfx', 'clank');
  });

  it('머리말의 스위치로 끄고 켠다 — 그 결정은 이 브라우저에 남는다', () => {
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: '소리 끄기' }));
    expect(sfxOn()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '소리 켜기' }));
    expect(sfxOn()).toBe(true);
  });

  it('스위치 자신은 소리를 내지 않는다 — 끄려고 누른 버튼이 울리면 안 껐나 싶다', () => {
    renderLobby();
    expect(screen.getByRole('button', { name: '소리 끄기' })).toHaveAttribute('data-sfx', 'none');
  });
});

/**
 * 오프닝 영상 — 로비의 **첫 칸** (2026-09-03 사용자: "로비에 들어가기전에 처음 …
 * 사람들한에서 영상보여주려고해. 스킵버튼도 만들어줘").
 *
 * 여기서 보는 것은 관문의 계약 셋이다:
 *   · 처음 오는 브라우저는 방 목록 대신 영상을 만난다
 *   · **건너뛰기가 늘 그 자리에 있다** — 영상이 안 떠도 게임에 들어갈 수 있어야 한다
 *   · 한 번 지나면 다시 뜨지 않는다 (끝까지 봤든 건너뛰었든)
 * 영상 자체(자동재생·전체화면)는 유튜브 것이라 jsdom 이 흉내 낼 것이 아니다 —
 * 임베드 주소의 규칙은 tests/shared/opening.test.ts 가 본다.
 */
describe('오프닝 영상 — 처음 오는 사람에게 한 번', () => {
  beforeEach(() => localStorage.clear());

  /** 관문을 **지우지 않고** 로비를 세운다 (renderLobby 는 이미 본 것으로 세운다) */
  function renderFresh() {
    return render(
      <Provider store={configureStore({ reducer: rootReducer })}>
        <MemoryRouter initialEntries={['/lobby']}>
          <Routes>
            <Route path="/lobby" element={<LobbyFeature />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
  }

  it('처음 오면 방 목록 앞에 영상이 선다', () => {
    renderFresh();
    expect(screen.getByTitle('오프닝 영상')).toBeInTheDocument();
    // 목록은 아직 없다 — 이 화면이 먼저다
    expect(screen.queryByLabelText('방 제목 검색')).not.toBeInTheDocument();
  });

  it('건너뛰기를 누르면 방 목록으로 들어간다', () => {
    renderFresh();
    fireEvent.click(screen.getByRole('button', { name: /건너뛰기/ }));
    expect(screen.queryByTitle('오프닝 영상')).not.toBeInTheDocument();
    expect(screen.getByLabelText('방 제목 검색')).toBeInTheDocument();
  });

  it('한 번 지나면 다시 안 뜬다 — 다시 열어도 곧장 목록이다', () => {
    const first = renderFresh();
    fireEvent.click(screen.getByRole('button', { name: /건너뛰기/ }));
    first.unmount(); // 브라우저를 닫았다 다시 온 셈 — 남는 것은 localStorage 의 표시뿐이다
    renderFresh();
    expect(screen.queryAllByTitle('오프닝 영상')).toHaveLength(0);
  });
});
