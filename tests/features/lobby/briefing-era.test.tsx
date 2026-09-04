// @vitest-environment jsdom
/**
 * 브리핑의 아랫줄 — **계기가 서 있는가.**
 *
 * 이 자리는 두 번 비워졌다 (Intro.tsx 의 주석: 계기판 넉 줄, 그리고 설명 한 줄). 남은 규칙은
 * 「말이 아니라 수치라 위의 글과 다투지 않는다」이고, 이 줄은 그 규칙 안에서 들어온 것이다.
 *
 * 2026-09-04, PLANNING.md 개정으로 이 줄의 내용이 바뀌었다 — 옛 연표(2026 첫 규칙 ——
 * 2098 구역 폐쇄 · 72년째 누적)는 "규정은 쌓이기만 한다"는 옛 기획의 규칙 그 자체였다.
 * 새 기획엔 그 72년짜리 신화가 없다(사건은 2026년 하루다) — 대신 같은 자리에, 같은 모양의
 * 규칙 하나가 들어왔다: 의심도도 시간으로는 안 내려간다, 오직 대화로만 풀린다(PLANNING §1.2).
 * 그래서 여기서 보는 것은 두 해가 아니라 **이 판을 실제로 움직이는 두 수치**(시행 간격 ·
 * 의심도 격리선)가 같이 서 있는가다.
 */
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LobbyIntro } from '@/features/lobby/Intro';
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

describe('브리핑의 계기', () => {
  it('시행 간격과 의심도 격리선이 한 줄에 같이 선다', async () => {
    await show();
    // "마다 시행" 은 <p> 의 직접 텍스트 자식이라 getByText 가 그 <p> 자체를 돌려준다
    // ("60–90초"는 <b> 안에 있어 그 안쪽 엘리먼트가 먼저 잡힌다).
    const era = screen.getByText(/마다 시행/);
    expect(era).toHaveTextContent('60–90초');
    expect(era).toHaveTextContent('100%');
    expect(era).toHaveTextContent('닿으면 즉시 격리');
  });
});
