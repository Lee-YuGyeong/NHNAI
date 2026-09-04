// @vitest-environment jsdom
/**
 * 계정 칩 — **없는 기능을 있는 것처럼 보이지 않는가**, **돌아올 자리를 들고 가는가**,
 * 그리고 **나가는 문이 이름 뒤에 있는가**.
 *
 * 키가 안 꽂혀 있을 때 「로그인」이 떠 있으면, 눌러 본 사람에게 이 게임은 고장난 게임이
 * 된다. 로그인 없이 도는 것이 정상인 저장소라 (src/shared/guest.ts) 여기서 제일 중요한
 * 검사는 「로그인이 되나」가 아니라 **「설정이 없을 때 자리가 비어 있나」**다.
 *
 * 둘째로 중요한 것은 next 다. 방 링크를 받고 들어온 사람이 로그인 뒤에 로비가 아니라
 * **그 방으로** 돌아가야 한다 — 쿼리가 날아가면 초대받은 방에 못 들어간다
 * (humanish RequireLogin 이 2026-08-08 에 겪은 그 버그다).
 *
 * 셋째 — **이름이 곧 단추다** (2026-08-31 사용자: "이름 누르면 로그아웃있고 그래야하는데").
 * 「나가기」가 머리말에 맨몸으로 서 있으면 자주 누를 것도 아닌데 늘 보이고, 정작 이름은
 * 눌러도 아무 일이 없는 글자였다. 원작과 같이 이름 뒤의 메뉴로 넣는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AccountState } from '@/shared/useAccount';

const signOut = vi.fn(() => Promise.resolve());
const signInWithGoogle = vi.fn(() => Promise.resolve({ error: null as string | null }));
let account: AccountState = { status: 'loading' };

vi.mock('@/shared/useAccount', () => ({
  useAccount: () => account,
  signOut: (...a: unknown[]) => signOut(...(a as [])),
  signInWithGoogle: (...a: unknown[]) => signInWithGoogle(...(a as [])),
}));

const { AccountButton } = await import('@/shared/AccountButton');

/** 라우터 안에서만 산다 — 돌아올 자리를 주소에서 읽는다 */
const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AccountButton />
    </MemoryRouter>,
  );

/** 이름을 눌러 메뉴를 연다. 이 화면에서 로그아웃으로 가는 길은 이것 하나뿐이다 */
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /계정 메뉴/ }));

beforeEach(() => {
  signOut.mockClear();
  signInWithGoogle.mockClear();
});

describe('설정이 없을 때', () => {
  it('키가 없으면 아무것도 그리지 않는다 — 눌러도 안 되는 단추가 곧 고장으로 보인다', () => {
    account = { status: 'off' };
    expect(at('/lobby').container).toBeEmptyDOMElement();
  });

  it('물어보는 중에도 자리를 잡지 않는다 — 빈 칸이 떴다 채워지는 게 더 산만하다', () => {
    account = { status: 'loading' };
    expect(at('/lobby').container).toBeEmptyDOMElement();
  });
});

describe('로그인 전', () => {
  beforeEach(() => {
    account = { status: 'out' };
  });

  it('누르면 곧장 구글로 간다 — 읽을 화면을 한 장 더 세우지 않는다', () => {
    at('/lobby');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('돌아올 자리에 **쿼리까지** 싣는다 — 없으면 초대받은 방에 못 돌아온다', () => {
    at('/lobby?code=1234');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(signInWithGoogle).toHaveBeenCalledWith('/lobby?code=1234');
  });
});

describe('로그인 뒤 — 이름이 곧 단추다', () => {
  const named = { status: 'in', email: 'a@b.com', displayName: '철수', suggested: null } as const;

  beforeEach(() => {
    account = named;
  });

  it('이름이 뜨고, 그 이름이 메뉴를 여는 단추다', () => {
    at('/lobby');
    expect(screen.getByText('철수')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /계정 메뉴/ })).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('**열기 전에는 로그아웃이 없다** — 자주 누를 것이 아닌데 늘 보이면 「이게 뭐지」가 된다', () => {
    at('/lobby');
    expect(screen.queryByRole('menuitem', { name: '로그아웃' })).not.toBeInTheDocument();
    openMenu();
    expect(screen.getByRole('menuitem', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('눌러서 로그아웃한다', () => {
    at('/lobby');
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('Esc 로 닫힌다 — 열어 놓고 나갈 길이 있어야 한다', () => {
    at('/lobby');
    openMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('바깥을 누르면 닫힌다 — click 이 아니라 mousedown 으로 듣는다', () => {
    at('/lobby');
    openMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menuitem', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('메일 주소는 어디에도 안 나온다 — 사용자가 정한 적 없는 글자다', () => {
    account = { status: 'in', email: 'lyg6452620@gmail.com', displayName: null, suggested: null };
    const { container } = at('/lobby');
    expect(container.textContent).not.toContain('lyg6452620');
    expect(container.textContent).not.toContain('@');
  });

  it('이름을 아직 안 지었으면 **이름 정하기**로 보낸다 — 그 사람에게 필요한 건 로그아웃이 아니다', () => {
    account = { status: 'in', email: 'a@b.com', displayName: null, suggested: null };
    at('/lobby?code=1234');
    const link = screen.getByRole('link', { name: '이름 정하기' });
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toBe('/account/nickname?next=/lobby?code=1234');
    // 이 상태에서는 나가는 길을 열지 않는다 (원작과 같다) — 지금 급한 일이 이름이다
    expect(screen.queryByRole('button', { name: /계정 메뉴/ })).not.toBeInTheDocument();
  });
});
