// @vitest-environment jsdom
/**
 * 메인 로비 — 화면 조각 테스트 (예시 테스트 2: 컴포넌트 쪽).
 *
 * humanish 의 tests/components/* 방식 이식: 스토어·라우터로 감싸 화면 조각만 떼어 렌더한다.
 * 로그인이 없으므로 「닉네임 → 방 만들기 → /world 이동」이 이 화면의 계약 전부다 — 그걸 본다.
 */
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MainFeature } from '@/features/main/MainFeature';
import { rootReducer } from '@/store';

/** 매 테스트 새 스토어 — 테스트끼리 상태가 새지 않게 (모듈 전역 store 를 쓰지 않는다) */
function renderLobby() {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/main']}>
        <Routes>
          <Route path="/main" element={<MainFeature />} />
          {/* 이동 확인용 표지판 — 진짜 월드는 three.js 라 여기서 띄우지 않는다 */}
          <Route path="/world" element={<p>월드 자리</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe('메인 로비 — 로그인 없이 입장', () => {
  it('닉네임 없이 방 만들기를 누르면 막는다', () => {
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: '방 만들기' }));
    expect(screen.getByText('닉네임을 입력하라')).toBeInTheDocument();
  });

  it('닉네임만 넣으면 방 만들기로 월드까지 간다 (로그인 단계가 없다)', () => {
    renderLobby();
    fireEvent.change(screen.getByPlaceholderText('예: 요원-3721'), { target: { value: '요원A' } });
    fireEvent.click(screen.getByRole('button', { name: '방 만들기' }));
    expect(screen.getByText('월드 자리')).toBeInTheDocument();
  });

  it('코드로 입장 — 숫자가 아니면 걸러지고, 4자리 코드는 통과한다', () => {
    renderLobby();
    fireEvent.change(screen.getByPlaceholderText('예: 요원-3721'), { target: { value: '요원B' } });

    // 입력 자체가 숫자만 남긴다 → 빈 코드로 제출되어 막힌다
    fireEvent.change(screen.getByPlaceholderText('방 코드 (숫자)'), { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: '코드로 입장' }));
    expect(screen.getByText('방 코드는 숫자 1~6자리')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('방 코드 (숫자)'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '코드로 입장' }));
    expect(screen.getByText('월드 자리')).toBeInTheDocument();
  });
});
