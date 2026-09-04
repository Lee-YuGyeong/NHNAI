// @vitest-environment jsdom
/**
 * 인트로 — 랜딩의 계약: 「입장하기 → /main」(위·아래 둘 다), 「내비·규칙 보기 → 구간 스크롤」,
 * 구간 셋이 실제로 있다. 그림·안개·모션은 보지 않는다 (CSS 다).
 */
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntroFeature } from '@/features/intro/IntroFeature';
import { introActions, introSlice } from '@/features/intro/introSlice';
import { rootReducer } from '@/store';

function renderIntro() {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/intro']}>
        <Routes>
          <Route path="/intro" element={<IntroFeature />} />
          <Route path="/main" element={<p>로비 자리</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe('인트로 — 누가 인간인가?', () => {
  // jsdom 에는 scrollIntoView 가 없다 — 어디로 스크롤하려 했는지만 본다
  const scrolled: string[] = [];
  beforeEach(() => {
    scrolled.length = 0;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });
  });

  it('타이틀이 있고, 히어로의 입장하기는 로비(/main)로 간다', () => {
    renderIntro();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('누가인간인가?');
    fireEvent.click(screen.getAllByRole('button', { name: /입장하기/ })[0]);
    expect(screen.getByText('로비 자리')).toBeInTheDocument();
  });

  it('맨 아래 마지막 CTA 의 입장하기도 로비로 간다', () => {
    renderIntro();
    const buttons = screen.getAllByRole('button', { name: /입장하기/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(screen.getByText('로비 자리')).toBeInTheDocument();
  });

  it('구간 셋(소개·배역·규칙)이 있고, 내비와 규칙 보기가 그리로 스크롤한다', () => {
    renderIntro();
    expect(screen.getByRole('region', { name: /2098/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /여덟 자리/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /시행은 계속된다/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '규칙 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '배역' }));
    fireEvent.click(screen.getByRole('button', { name: '게임 소개' }));
    expect(scrolled).toEqual(['intro-rules', 'intro-roles', 'intro-about']);
  });

  it('브리핑의 연혁이 2026 을 첫 항목으로 세운다 — 72년 동안 규칙이 쌓이기만 했다', () => {
    renderIntro();
    const origin = screen.getByText('첫 규칙').closest('li')!;
    expect(origin).toHaveTextContent('2026');
    expect(screen.getByText('구역 폐쇄').closest('li')!).toHaveTextContent('2098');
    expect(screen.getByText(/72년째/)).toBeInTheDocument();
  });

  it('플레이어에게 생존 승리를 말한다 — 「인간을 찾아라」는 AI 노드의 목표일 뿐', () => {
    renderIntro();
    // 히어로 — 당신이 인간이고, 들키지 않으면 이긴다
    expect(screen.getByText(/들키지 않으면 이긴다/)).toBeInTheDocument();
    // 마지막 CTA — 찾는 쪽이 아니라 살아남는 쪽을 묻는다
    expect(screen.getByText(/살아남을 수 있습니까/)).toBeInTheDocument();
    // 「인간을 찾으면 이긴다」류의 문구는 플레이어를 향해 남아 있지 않다
    expect(screen.queryByText(/인간을 찾아내면/)).not.toBeInTheDocument();
    // 색출 승리는 AI 노드의 카드 안에만 있다
    const aiCard = screen.getByRole('heading', { name: 'AI 노드' }).closest('li')!;
    expect(aiCard).toHaveTextContent('인간을 색출하면 승리');
  });

  it('배역 카드는 셋이고 인간 요원만 HUMAN 태그를 단다', () => {
    renderIntro();
    expect(screen.getByRole('heading', { name: '리더 AI' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 노드' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '인간 요원' })).toBeInTheDocument();
    expect(screen.getAllByText('HUMAN')).toHaveLength(1);
    // 여덟 자리는 노드 5 + 인간 3 두 종류뿐 — 리더는 자리 밖 진행자다 (PLANNING.md 8석 = AI 5 + 인간 3)
    expect(screen.getByRole('heading', { name: /여덟 자리/ })).toHaveTextContent('두 종류. 그리고 리더');
    expect(screen.getByText(/리더는 여덟 자리 밖에서/)).toBeInTheDocument();
  });
});

describe('introSlice', () => {
  it('처음은 hero, setSection 으로 바뀐다', () => {
    const r = introSlice.reducer;
    expect(r(undefined, { type: 'noop' }).section).toBe('hero');
    expect(r(undefined, introActions.setSection('roles')).section).toBe('roles');
  });
});
