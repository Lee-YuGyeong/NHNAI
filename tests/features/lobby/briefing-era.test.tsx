// @vitest-environment jsdom
/**
 * 브리핑의 아랫줄 — **연표가 서 있는가.**
 *
 * 이 자리는 두 번 비워졌다 (Intro.tsx 의 주석: 계기판 넉 줄, 그리고 설명 한 줄). 남은 규칙은
 * 「말이 아니라 수치라 위의 글과 다투지 않는다」이고, 연표는 그 규칙 안에서 들어온 것이다 —
 * 서술은 「어느 날 생겼다」에서 끝나고, 그 어느 날이 언제부터였는지는 숫자가 말한다.
 *
 * 그래서 여기서 보는 것은 문구가 아니라 **두 해가 같이 서 있는가**다. 하나만 남으면 72년이
 * 사라지고, 72년이 사라지면 「규정은 쌓이기만 한다」가 판의 규칙이 아니라 그냥 규칙 설명이 된다.
 */
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LobbyIntro } from '@/features/lobby/Intro';
import { ORIGIN_YEAR, YEARS_SINCE, ZONE_YEAR } from '@/shared/era';
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

describe('브리핑의 연표', () => {
  it('두 해와 그 사이가 한 줄에 같이 선다', async () => {
    await show();
    const era = screen.getByText(/첫 규칙/);
    expect(era).toHaveTextContent(String(ORIGIN_YEAR));
    expect(era).toHaveTextContent(String(ZONE_YEAR));
    expect(era).toHaveTextContent(`${YEARS_SINCE}년째 누적`);
  });
});
