// @vitest-environment jsdom
/**
 * 로그인 화면 — **벽이 아니라는 것**이 이 화면의 전부다.
 *
 * humanish 는 RequireLogin 이 게임을 감싸서 여기를 지나야 들어갔다. 이 저장소는 그
 * 결정을 따르지 않는다 (src/shared/guest.ts). 그래서 여기서 지키는 것은 셋이다:
 *
 *   1. 로그인 없이 나가는 문이 **늘** 있다
 *   2. 설정이 없으면 **이유를 적는다** — 사라지지 않는다.
 *      머리말 단추가 조용히 없어지는 바람에 "로그인이 어디 있냐"가 됐던 자리다 (2026-08-31)
 *   3. next 로 남의 사이트에 못 보낸다 (열린 리다이렉트)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AccountState } from '@/shared/useAccount';

const signInWithGoogle = vi.fn(() => Promise.resolve({ error: null as string | null }));
let account: AccountState = { status: 'out' };

vi.mock('@/shared/useAccount', () => ({
  useAccount: () => account,
  useAccountSync: () => {},
  signInWithGoogle: (...a: unknown[]) => signInWithGoogle(...(a as [])),
  signOut: () => Promise.resolve(),
}));

const { LoginFeature, safeNext } = await import('@/features/lobby/Login');

const at = (path = '/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LoginFeature />
    </MemoryRouter>,
  );

beforeEach(() => {
  signInWithGoogle.mockClear();
  account = { status: 'out' };
});

describe('돌아갈 곳 고르기', () => {
  it('우리 쪽 경로는 그대로 쓴다', () => {
    expect(safeNext('/lobby?code=1234')).toBe('/lobby?code=1234');
  });

  it('남의 사이트로 보내는 값은 버린다 — `//evil.com` 은 브라우저가 다른 호스트로 읽는다', () => {
    for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', 'lobby', '', null]) {
      expect(safeNext(bad)).toBe('/lobby');
    }
  });

  it('로그인 화면으로 되돌리지 않는다 — 고리가 된다', () => {
    expect(safeNext('/login')).toBe('/lobby');
    expect(safeNext('/login?next=%2Flogin')).toBe('/lobby');
  });
});

describe('로그인 전', () => {
  it('구글 단추가 선다', () => {
    at();
    expect(screen.getByRole('button', { name: /구글로 계속하기/ })).toBeInTheDocument();
  });

  it('누르면 **돌아갈 곳을 들고** 로그인을 시작한다', () => {
    at('/login?next=%2Flobby%3Fcode%3D1234');
    fireEvent.click(screen.getByRole('button', { name: /구글로 계속하기/ }));
    expect(signInWithGoogle).toHaveBeenCalledWith('/lobby?code=1234');
  });

  it('로그인 없이 나가는 문이 있다 — 이 게임은 로그인이 관문이 아니다', () => {
    at();
    expect(screen.getByRole('button', { name: /이름만 정하고 들어가기/ })).toBeInTheDocument();
  });

  it('무엇이 달라지는지 말한다 — 누르라고만 하지 않는다', () => {
    at();
    expect(screen.getByText(/사칭되지 않는다/)).toBeInTheDocument();
  });

  it('구글에서 취소하고 돌아오면 **붉은 글씨로 말하지 않는다** — 취소는 실패가 아니다', () => {
    at('/login?error=access_denied');
    expect(screen.getByText(/다시 눌러도 된다/)).toBeInTheDocument();
    expect(document.querySelector('.bl-alert')).toBeNull();
  });
});

describe('설정이 없을 때', () => {
  beforeEach(() => {
    account = { status: 'off' };
  });

  it('사라지지 않고 이유를 적는다 — 여기까지 찾아온 사람에게 빈 화면을 주지 않는다', () => {
    at();
    expect(screen.getByText(/로그인이 꺼져 있다/)).toBeInTheDocument();
    expect(screen.getByText('npm run worker:dev')).toBeInTheDocument();
  });

  it('게임은 그대로 돈다고 말하고, 나가는 문도 그대로 둔다', () => {
    at();
    expect(screen.getByText(/게임은 그대로 전부 돌아간다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이름만 정하고 들어가기/ })).toBeInTheDocument();
  });

  it('누를 수 없는 구글 단추를 세우지 않는다', () => {
    at();
    expect(screen.queryByRole('button', { name: /구글로 계속하기/ })).not.toBeInTheDocument();
  });
});

describe('로그인이 끝난 뒤', () => {
  it('다시 묻지 않는다 — 뒤로 가기로 돌아왔을 때 단추를 또 보여줄 이유가 없다', () => {
    account = { status: 'in', email: 'a@b.com', displayName: '철수', suggested: null };
    at();
    expect(screen.queryByRole('button', { name: /구글로 계속하기/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('닉네임')).not.toBeInTheDocument();
  });
});
