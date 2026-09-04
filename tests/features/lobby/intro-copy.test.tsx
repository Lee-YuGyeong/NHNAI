// @vitest-environment jsdom
/**
 * 인트로 카피 절충(2026-09-04) — 새 기획 전환에서 마지막까지 남아 있던 옛 문구 자리들.
 *
 * bd85fd2 가 인트로를 새 기획으로 재작성한 뒤에도 세 자리가 옛 판의 말을 하고 있었다:
 * 배역 리드(「아무도 통보받지 않는다」 — 설계자는 통보받는다), 규칙 h2(「쌓이기만 한다」 —
 * §1.2 는 대칭이다), 마지막 명령(「들키지 마라」 — 숨는 쪽은 이제 AI 다). 여기서 보는 것은
 * 그 자리들이 새 기획의 말로 서 있는가다 — 문구 자체가 계약이라 문구로 잠근다.
 * (Typed 로 찍히는 h2 는 정적 DOM 이 아니라서 여기서는 안 본다 — 정적인 줄만 잠근다.)
 */
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LobbyIntro } from '@/features/lobby/Intro';
import { rootReducer } from '@/store';

/** 계정 동기화가 한 번 돌고 나서 본다 (briefing-era.test 와 같은 이유) */
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

describe('인트로 카피 — 새 기획의 말로 서 있다', () => {
  it('배역 리드 — 통보는 자기 몫뿐이다 (설계자의 AI 정체 통보도 그 안이다)', async () => {
    await show();
    expect(screen.getByText(/자기 몫 외에는 아무것도 통보되지 않는다/)).toBeInTheDocument();
    expect(screen.queryByText(/아무도 통보받지 않는다/)).not.toBeInTheDocument();
  });

  it('규칙 줄 — 전환 구간 판별 원리가 서 있고, STEPS 와 겹치던 줄은 없다', async () => {
    await show();
    expect(screen.getByText('몸은 조건이 바뀐 직후에 들킨다')).toBeInTheDocument();
    expect(screen.queryByText('한 번 몰리면 잘 안 풀린다')).not.toBeInTheDocument();
  });

  it('마지막 명령 — 찾는 쪽의 명령이다', async () => {
    await show();
    expect(screen.getByText('가려내라.')).toBeInTheDocument();
    expect(screen.getByText(/전원이 인간이라고 말할 것이다/)).toBeInTheDocument();
    expect(screen.queryByText('들키지 마라.')).not.toBeInTheDocument();
  });
});
