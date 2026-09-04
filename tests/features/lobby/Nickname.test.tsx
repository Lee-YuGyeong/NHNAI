// @vitest-environment jsdom
/**
 * 이름 짓기 (/account/nickname) — **한 번 짓고 끝인 문** 앞에서 지켜야 할 것들.
 *
 * humanish 와 같은 규칙이다 (2026-08-31 사용자 지시). 그래서 검사도 그 규칙을 본다:
 *   1. 되돌릴 수 없다는 말을 **누르기 전에** 한다
 *   2. 이미 이름이 있으면 화면을 그리지 않고 돌려보낸다 — 못 바꾸는데 입력칸을
 *      보여주면 고쳐 놓고 나서야 안 된다는 걸 안다
 *   3. 구글 이름은 미리 채우되 **지우고 새로 쓸 수 있다**
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AccountState } from '@/shared/useAccount';

const setDisplayName = vi.fn(async (_name: string) => null as string | null);
let account: AccountState = { status: 'out' };

vi.mock('@/shared/useAccount', () => ({
  useAccount: () => account,
  useAccountSync: () => {},
  signInWithGoogle: () => Promise.resolve({ error: null }),
  setDisplayName: (...a: unknown[]) => setDisplayName(...(a as [string])),
  signOut: () => Promise.resolve(),
}));

const { NicknameFeature } = await import('@/features/lobby/Nickname');

/** 나가는 자리마다 표지판을 세운다 — 어디로 보냈는지 보려고 */
const at = (path = '/account/nickname') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/nickname" element={<NicknameFeature />} />
        <Route path="/lobby" element={<p>로비 자리</p>} />
        <Route path="/login" element={<p>로그인 자리</p>} />
      </Routes>
    </MemoryRouter>,
  );

/** 로그인은 됐는데 이름이 아직 없는 사람 */
const unnamed = (suggested: string | null = '이유경'): AccountState => ({
  status: 'in',
  email: 'a@b.com',
  displayName: null,
  suggested,
});

beforeEach(() => {
  setDisplayName.mockClear();
  setDisplayName.mockResolvedValue(null);
  account = unnamed();
});

describe('이름을 아직 안 지었으면', () => {
  it('**이름을 묻는다.** humanish 이름을 가져다 쓰지 않는다', () => {
    at();
    expect(screen.getByRole('heading', { name: '닉네임' })).toBeInTheDocument();
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument();
  });

  it('되돌릴 수 없다는 말을 **누르기 전에** 한다', () => {
    at();
    expect(screen.getByText('한 번 정하면 바꿀 수 없다.')).toBeInTheDocument();
  });

  it('구글 이름을 미리 채운다 — 다만 **지우고 새로 쓸 수 있다** (원작과 같다)', () => {
    at();
    expect(screen.getByLabelText('닉네임')).toHaveValue('이유경');

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '요원-3721' } });
    expect(screen.getByLabelText('닉네임')).toHaveValue('요원-3721');
  });

  it('한 글자라도 건드린 뒤에는 제안이 덮어쓰지 않는다', () => {
    account = unnamed(null);
    const { rerender } = at();
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '내가친것' } });
    account = unnamed('이유경');
    rerender(
      <MemoryRouter initialEntries={['/account/nickname']}>
        <Routes>
          <Route path="/account/nickname" element={<NicknameFeature />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('닉네임')).toHaveValue('내가친것');
  });

  it('구글이 이름을 안 줬으면 빈 칸으로 시작한다', () => {
    account = unnamed(null);
    at();
    expect(screen.getByLabelText('닉네임')).toHaveValue('');
  });

  it('정하면 저장하고 원래 가려던 곳으로 보낸다', async () => {
    at('/account/nickname?next=%2Flobby');
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '요원-3721' } });
    fireEvent.click(screen.getByRole('button', { name: /이 이름으로 정하기/ }));
    await waitFor(() => expect(setDisplayName).toHaveBeenCalledWith('요원-3721'));
    await waitFor(() => expect(screen.getByText('로비 자리')).toBeInTheDocument());
  });

  it('빈 칸으로는 못 누른다', () => {
    account = unnamed(null);
    at();
    expect(screen.getByRole('button', { name: /이 이름으로 정하기/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /이 이름으로 정하기/ })).toBeDisabled();
  });

  it('이미 쓰는 이름이면 **이유를 적는다**', async () => {
    setDisplayName.mockResolvedValue('name_taken');
    at();
    fireEvent.click(screen.getByRole('button', { name: /이 이름으로 정하기/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/이미 쓰는 닉네임/));
  });

  it('이미 지은 사람이 다시 지으려 하면 **못 바꾼다고 말한다**', async () => {
    setDisplayName.mockResolvedValue('name_frozen');
    at();
    fireEvent.click(screen.getByRole('button', { name: /이 이름으로 정하기/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/한 번 짓고 바꾸지 못한다/));
  });

  it('DB 설정이 덜 된 것은 **사용자 잘못이 아니다** — 무엇을 켜야 하는지 그대로 적는다', async () => {
    setDisplayName.mockResolvedValue('schema_not_exposed');
    at();
    fireEvent.click(screen.getByRole('button', { name: /이 이름으로 정하기/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Exposed schemas/));
  });
});

describe('여기 볼일이 없는 사람은 조용히 돌려보낸다', () => {
  it('이미 이름이 있으면 화면을 안 그린다 — 못 바꾸는데 입력칸을 보여주면 안 된다', async () => {
    account = { status: 'in', email: 'a@b.com', displayName: '철수', suggested: null };
    at('/account/nickname?next=%2Flobby');
    await waitFor(() => expect(screen.getByText('로비 자리')).toBeInTheDocument());
  });

  it('로그인 안 했으면 로그인부터', async () => {
    account = { status: 'out' };
    at();
    await waitFor(() => expect(screen.getByText('로그인 자리')).toBeInTheDocument());
  });

  it('로그인이 꺼진 판에서는 물을 것이 없다', async () => {
    account = { status: 'off' };
    at('/account/nickname?next=%2Flobby');
    await waitFor(() => expect(screen.getByText('로비 자리')).toBeInTheDocument());
  });
});
