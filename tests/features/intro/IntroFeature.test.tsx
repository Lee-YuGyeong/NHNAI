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
    expect(screen.getByRole('region', { name: /2026/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /가변 인원/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /시행은 계속된다/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '규칙 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '배역' }));
    fireEvent.click(screen.getByRole('button', { name: '게임 소개' }));
    expect(scrolled).toEqual(['intro-rules', 'intro-roles', 'intro-about']);
  });

  // PLANNING.md 개정(2026-09-04)으로 8석 고정·라운드제 연혁이 가변 인원·라운드 없음으로
  // 바뀌었다 — 연혁 두 줄 대신 이 판을 실제로 움직이는 두 수치(시행 간격 · 격리선)를 본다.
  it('브리핑의 계기가 시행 간격과 의심도 격리선을 세운다', () => {
    renderIntro();
    const trigger = screen.getByText('테스트 트리거').closest('li')!;
    expect(trigger).toHaveTextContent('60–90s');
    const gate = screen.getByText('의심도 격리선').closest('li')!;
    expect(gate).toHaveTextContent('100%');
  });

  it('찾는 것은 숨은 AI다 — 인간을 찾으라는 문구는 남아 있지 않다', () => {
    renderIntro();
    // 히어로 — 몸은 못 속인다는 새 전제 (section 4 의 규칙 카드도 같은 낱말로 시작하니 전체 줄로 특정한다)
    expect(screen.getByText(/몸은 못 속인다\. 말은 속일 수 있다/)).toBeInTheDocument();
    // 마지막 CTA — 옆 사람이 진짜인지를 묻는다
    expect(screen.getByText(/정말 사람입니까/)).toBeInTheDocument();
    // 「인간을 찾으면 이긴다」류의 옛 문구는 남아 있지 않다
    expect(screen.queryByText(/인간을 찾아내면/)).not.toBeInTheDocument();
    expect(screen.queryByText(/인간을 색출하면/)).not.toBeInTheDocument();
    // 색출 승리는 이제 사람 쪽 카드다 — AI 가 격리되면 사람이 이긴다
    const humanCard = screen.getByRole('heading', { name: '사람' }).closest('li')!;
    expect(humanCard).toHaveTextContent('AI가 격리되면 승리');
  });

  it('배역 카드는 셋(AI · AI 설계자 · 사람)이고 사람 카드만 앰버로 강조된다', () => {
    renderIntro();
    expect(screen.getByRole('heading', { name: 'AI', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 설계자' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '사람' })).toBeInTheDocument();
    // 앰버 강조(intro-role--human)는 사람 카드 하나뿐이다
    const humanCard = screen.getByRole('heading', { name: '사람' }).closest('li')!;
    expect(humanCard).toHaveClass('intro-role--human');
    const aiCard = screen.getByRole('heading', { name: 'AI', level: 3 }).closest('li')!;
    const designerCard = screen.getByRole('heading', { name: 'AI 설계자' }).closest('li')!;
    expect(aiCard).not.toHaveClass('intro-role--human');
    expect(designerCard).not.toHaveClass('intro-role--human');
    // 관리 AI는 배역 밖이다 — 판정하지 않는 쪽이라 세 카드 중에 없다
    expect(screen.getByRole('heading', { name: /가변 인원/ })).toHaveTextContent('관리 AI는 그중이 아니다');
  });
});

describe('introSlice', () => {
  it('처음은 hero, setSection 으로 바뀐다', () => {
    const r = introSlice.reducer;
    expect(r(undefined, { type: 'noop' }).section).toBe('hero');
    expect(r(undefined, introActions.setSection('roles')).section).toBe('roles');
  });
});
