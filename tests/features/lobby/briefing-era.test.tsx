// @vitest-environment jsdom
/**
 * 브리핑의 아랫줄 — **사건과 정원이 서 있는가.**
 *
 * 이 자리는 두 번 비워졌다 (Intro.tsx 의 주석: 계기판 넉 줄, 그리고 설명 한 줄). 남은 규칙은
 * 「말이 아니라 수치라 위의 글과 다투지 않는다」이다. 옛 연표(2026——2098 · 72년째 누적)는
 * 기획 전환(2026-09-04, 인간인 척)과 함께 걷혔다 — 새 세계관의 해는 2026 하나뿐이라,
 * 연표 대신 **사건 한 줄**(의무화 → 같은 해 유출)과 **정원 한 줄**(사람 3–8 · AI 1)이 선다.
 *
 * 그래서 여기서 보는 것은 문구가 아니라 **그 두 줄이 같이 서 있는가**다. 사건이 빠지면
 * 「왜 소집됐는가」가 사라지고, 정원이 빠지면 「누가 몇이나 섞였는가」가 사라진다 —
 * 둘 다 이 게임이 첫 화면에서 공개하기로 한 값이다 (PLANNING §1.1 의 공개 여부 열).
 */
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LobbyIntro } from '@/features/lobby/Intro';
import { LEADER_NAME } from '@/lab/personas';
import { rootReducer } from '@/store';

/** 계정 동기화가 한 번 돌고 나서 본다 — 안 기다리면 그 갱신이 단언 뒤에 떨어진다 */
async function show() {
  await act(async () => {
    render(
      <Provider store={configureStore({ reducer: rootReducer })}>
        <MemoryRouter initialEntries={['/intro']}>
          <LobbyIntro />
        </MemoryRouter>
      </Provider>,
    );
  });
}

describe('브리핑의 아랫줄', () => {
  it('사건 한 줄 — 2026 의무화와 같은 해의 유출이 한 줄에 선다', async () => {
    await show();
    const era = screen.getByText(/식별 표지 의무화/);
    expect(era).toHaveTextContent('2026');
    expect(era).toHaveTextContent('표지 없는 개체 유출');
  });

  it('정원 한 줄 — 사람 3–8명과 AI 1개체, 그리고 관리 AI 의 번호가 선다', async () => {
    await show();
    const facts = screen.getByText(/사람 3–8명/);
    expect(facts).toHaveTextContent('AI 1개체');
    // 관리 AI 의 번호는 personas 에서 온다 — 첫 화면과 방 안의 번호가 달라지면 안 된다
    expect(facts).toHaveTextContent(LEADER_NAME);
  });
});
