// @vitest-environment jsdom
/**
 * 표식(HeroKey, 복도 벌) — 여러 벌을 시험하던 시절의 규칙(58ddd2b) 을 하나로 정한 뒤에도
 * 그대로 지킨다:
 *
 *   1. 제목 — 이 화면이 무슨 화면인지 말하는 한 줄
 *   2. 문 셋 — 입장하기 · 규칙 보기 · **로그인 없이 들어가기**
 *   3. 아래로 내려가는 길 — 한 번에 한 칸이라 이게 없으면 여기서 끝인 줄 안다
 *
 * 특히 **로그인 없이 들어가기**가 이 시험의 핵심이다. 그 길은 이 게임의 약속이라
 * (shared/guest.ts) 빠지면 화면은 멀쩡해 보인다 — 그림이 아니라 시험이 잡아야 하는
 * 종류의 사고다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HeroKey } from '@/features/lobby/heroes';

describe('표식 (HeroKey · 복도)', () => {
  afterEach(cleanup);

  /** 눌린 것을 순서대로 적는다 — 어느 단추가 어디로 가는지 한 번에 본다 */
  function put() {
    const hit: string[] = [];
    render(
      <div className="bl">
        <HeroKey
          titled
          onTitled={() => hit.push('titled')}
          enter={() => hit.push('enter')}
          guest={() => hit.push('guest')}
          rules={() => hit.push('rules')}
          next={() => hit.push('next')}
        />
      </div>,
    );
    return hit;
  }

  it('제목과 방송 두 줄이 있다', () => {
    put();
    const title = screen.getByRole('heading', { level: 1 }).textContent ?? '';
    expect(title.replace(/\s+/g, '')).toContain('누가인간인가?');
    // 2026-09-04, PLANNING.md 개정 — 방송이 "AI가 없다"에서 "표식이 붙어 있다"로 뒤집혔다 (heroes.tsx 참고)
    expect(screen.getByText(/여기, 전부 표식이 붙어 있다/)).toBeInTheDocument();
    expect(screen.getByText(/붙어 있어야 한다/)).toBeInTheDocument();
  });

  it('문 셋이 다 있고 각자 제 곳으로 간다', () => {
    const hit = put();
    fireEvent.click(screen.getByRole('button', { name: /입장하기/ }));
    fireEvent.click(screen.getByRole('button', { name: '규칙 보기' }));
    // 로그인 없이 노는 길 — 표식을 갈아 끼우다 제일 먼저 빠지는 단추다
    fireEvent.click(screen.getByRole('button', { name: '로그인 없이 들어가기' }));
    expect(hit).toEqual(['enter', 'rules', 'guest']);
  });

  it('아래 칸으로 내려가는 길이 있다', () => {
    const hit = put();
    fireEvent.click(screen.getByRole('button', { name: /SCROLL/ }));
    expect(hit).toEqual(['next']);
  });
});
