// @vitest-environment jsdom
/**
 * 브리핑의 아랫줄 — **계기가 서 있는가.**
 *
 * 이 자리는 두 번 비워졌다 (Intro.tsx 의 주석: 계기판 넉 줄, 그리고 설명 한 줄). 남은 규칙은
 * 「말이 아니라 수치라 위의 글과 다투지 않는다」이고, 이 줄은 그 규칙 안에서 들어온 것이다.
 *
 * 2026-09-04, PLANNING.md 개정으로 이 줄의 내용이 두 번 바뀌었다.
 *
 *   ① 옛 연표(2026 첫 규칙 —— 2098 구역 폐쇄 · 72년째 누적)는 "규정은 쌓이기만 한다"는 옛
 *     기획의 규칙 그 자체였다. 새 기획엔 그 72년짜리 신화가 없다(사건은 2026년 하루다).
 *   ② 그 자리를 「60–90초 마다 시행 —— 100% 닿으면 즉시 격리」가 이어받았는데, **둘 다 아직
 *     안 만든 것이었다** — 의심도·격리는 PLANNING §0 에서 미구현이고, 시행도 자동 반복이
 *     아니라 사람이 들어올 때 한 판씩 열린다(worker/src/trial/runtime.ts 의 onJoin).
 *
 * 그래서 지금 여기서 보는 것은 **실제로 도는 두 수치**(한 판 길이 · 조건 전환 간격)가 같이
 * 서 있는가, 그리고 그 값이 **상수에서 오는가**다. 화면에 손으로 박으면 서버가 TRIAL_GAME_MS
 * 를 고쳤을 때 첫 화면만 옛말을 하게 된다.
 */
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LobbyIntro } from '@/features/lobby/Intro';
import { TRIAL_GAME_MS, TRIAL_PHASE_MS } from '@/world/mp/constants';
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
  /**
   * ★ 2026-09-04 개정. 옛 단언은 「60–90초 마다 시행 · 100% 닿으면 즉시 격리」였는데,
   *   둘 다 **아직 안 만든 것**이었다 — 의심도·격리는 PLANNING §0 에서 미구현이고, 시행도
   *   자동 반복이 아니라 사람이 들어올 때 한 판씩 열린다(worker/src/trial/runtime.ts onJoin).
   *   첫 화면이 아직 오지 않은 설계를 약속하면 방에 들어간 사람이 그 뒤 화면을 전부
   *   의심한다(features/lobby/Intro 머리말). 그래서 **실제로 도는 두 수치**를 지킨다.
   */
  it('한 판 길이와 조건 전환 간격이 한 줄에 같이 선다', async () => {
    await show();
    // "한 판" 은 <p> 의 직접 텍스트 자식이라 getByText 가 그 <p> 자체를 돌려준다
    // ("1분"은 <b> 안에 있어 그 안쪽 엘리먼트가 먼저 잡힌다).
    const era = screen.getByText(/한 판/);
    expect(era).toHaveTextContent('1분');
    expect(era).toHaveTextContent('20초');
    expect(era).toHaveTextContent('조건이 바뀐다');
  });

  it('적는 수치는 상수에서 온다 — 화면과 서버가 갈라지지 않게', async () => {
    await show();
    const era = screen.getByText(/한 판/);
    expect(era).toHaveTextContent(`${TRIAL_GAME_MS / 60_000}분`);
    expect(era).toHaveTextContent(`${TRIAL_PHASE_MS / 1000}초`);
  });
});
