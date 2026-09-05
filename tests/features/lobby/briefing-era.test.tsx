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
 *   ③ 2026-09-05: 그 자리를 이어받은 두 수치가 **남의 화면 것**이었다. TRIAL_GAME_MS(1분) ·
 *     TRIAL_PHASE_MS 는 `/trial` — 혼자 미니게임 하나를 돌려 보는 판 — 의 값이고, 이 줄이
 *     여는 판은 검문소다. 검문소에 고정 차례표가 생기면서(bde946a) 그 판의 값이 상수로
 *     생겼으므로, 이제 그것을 적는다: **한 판 길이 · 대화 ⇄ 시험 · 몇 번**.
 *
 * 그래서 지금 여기서 보는 것은 **이 줄이 여는 판의 수치**가 같이 서 있는가, 그리고 그 값이
 * **상수에서 오는가**다. 화면에 손으로 박으면 차례표를 고쳤을 때 첫 화면만 옛말을 하게 된다 —
 * 「7~9분」·「60–90초마다」가 정확히 그렇게 남았던 말이다.
 */
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LobbyIntro } from '@/features/lobby/Intro';
import {
  GAME_BRIEFING_MS,
  GAME_DISCUSSION_MS,
  GAME_FIRST_DISCUSSION_MS,
  GAME_MAX_HUMANS,
  GAME_MIN_HUMANS,
  GAME_RESULT_MODAL_MS,
  GAME_TEST_MS,
  GAME_TEST_COUNT,
} from '@/world/mp/game-protocol';
import { rootReducer } from '@/store';

/** 화면이 더하는 것과 같은 셈 (Intro.tsx 의 ROUND_MS) — 여기서 따로 세어야 그 더하기를 검사한다 */
const ROUND_MS =
  GAME_BRIEFING_MS +
  GAME_FIRST_DISCUSSION_MS +
  GAME_TEST_COUNT * (GAME_TEST_MS + GAME_RESULT_MODAL_MS + GAME_DISCUSSION_MS);

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
  it('한 판 길이와 차례표가 한 줄에 같이 선다', async () => {
    await show();
    // "한 판" 은 <p> 의 직접 텍스트 자식이라 getByText 가 그 <p> 자체를 돌려준다
    // (분·초는 <b> 안에 있어 그 안쪽 엘리먼트가 먼저 잡힌다).
    const era = screen.getByText(/한 판/);
    expect(era).toHaveTextContent('4분 38초');
    expect(era).toHaveTextContent('대화 40초 ⇄ 시험 30초');
    expect(era).toHaveTextContent(`× ${GAME_TEST_COUNT}`);
  });

  it('적는 수치는 상수에서 온다 — 화면과 서버가 갈라지지 않게', async () => {
    await show();
    const era = screen.getByText(/한 판/);
    expect(era).toHaveTextContent(`${Math.floor(ROUND_MS / 60_000)}분 ${Math.round((ROUND_MS % 60_000) / 1000)}초`);
    expect(era).toHaveTextContent(`대화 ${GAME_DISCUSSION_MS / 1000}초`);
    expect(era).toHaveTextContent(`시험 ${GAME_TEST_MS / 1000}초`);
  });

  /**
   * 인원도 같은 줄에 산다. 여기 「2–3명」이 적혀 있던 것이 이 화면이 옛말을 하게 된 자리 중
   * 하나다 — 그 3은 /trial 총원 4에서 온 수였고, 이 줄이 여는 판은 사람이 모자란 자리를
   * 대역으로 채워 3~8명으로 연다 (game-protocol 의 GAME_MIN/MAX_HUMANS).
   */
  it('인원도 검문소의 상수에서 온다 — 사람 수와 AI 좌석이 같이 선다', async () => {
    await show();
    // 진행 칸의 첫 칸도 같은 사실을 말한다 — 거기는 물결표(3~8)고 계기 줄은 붙임표(3–8)다
    const facts = screen.getByText(new RegExp(`사람 ${GAME_MIN_HUMANS}–${GAME_MAX_HUMANS}명`));
    expect(facts).toHaveTextContent('AI 1좌석');
  });
});
