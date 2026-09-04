// @vitest-environment jsdom
/**
 * 판이 걸려 있는 동안 왼쪽 위 계기판은 **비켜선다** (2026-09-03 사용자: "왼쪽 위 계기판이랑
 * 화면에 게임 관련 뜨는 거 겹칠 때가 있다. 미니 게임 말 다 끝나면 계기판 떠서 절대 안 겹치게").
 *
 * 겹치는 까닭은 폭과 z 다 — 판이 시키는 글은 화면 위쪽 가운데에 서고(지시문 720px · 검사판
 * 상자 680px · 판정 한 줄 560px), 계기판은 왼쪽 12px 에 선 252px 이면서 z 가 더 높다.
 * 창이 1200px 만 못 되면 저 상자들의 왼쪽 끝이 계기판 밑으로 들어간다. 그래서 여기서 잠그는 것은 셋이다:
 *   ① 비켜설 때 판이 실제로 안 보이고 읽는 장치에서도 빠지는가 (UnitPanel 의 away)
 *   ② 갈 때는 곧장 가고 올 때만 천천히 오는가 — 흐려지는 동안 겹쳐 있으면 그게 겹침이다
 *   ③ 비켜서는 자리가 **판 한 바퀴 전부**인가 — 말이 다 끝난 idle 에서만 선다
 */
import { readFileSync } from 'node:fs';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UnitPanel } from '@/features/arena/UnitPanel';

const ORDER = '이 방에 인간이 하나 있다. 전 개체에 지시한다. 인간을 찾아내라.';

const show = (away: boolean) =>
  render(
    <UnitPanel
      unit="A38-091"
      sector={4}
      suspicion={37}
      syncLow={false}
      live={4}
      party={6}
      trials={2}
      trialsToWin={5}
      order={ORDER}
      away={away}
    />,
  );

/** 판 전체를 감싸는 그 덩이 — 흐려지는 것도 읽기에서 빠지는 것도 여기 걸린다 */
const cluster = () => document.querySelector('.hud-cluster') as HTMLElement;

describe('계기판이 비켜서는 자리', () => {
  it('판 사이에는 그대로 서 있다 — 앞 세 장이 내내 달고 온 그 계기다', () => {
    show(false);
    expect(cluster().style.opacity).toBe('1');
    expect(cluster()).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(ORDER)).toBeInTheDocument();
  });

  it('판이 도는 동안에는 안 보인다 — 판이 시키는 글이 이 판 아래로 들어가면 그 글은 못 읽는다', () => {
    show(true);
    expect(cluster().style.opacity).toBe('0');
  });

  it('읽는 장치에서도 빠진다 — 화면에서 지운 글을 스크린리더가 계속 읽으면 같은 겹침이다', () => {
    show(true);
    expect(cluster()).toHaveAttribute('aria-hidden', 'true');
  });

  it('지웠다 끼우지는 않는다 — 판마다 사라졌다 나타나면 마지막 방에서만 깜빡이는 물건이 된다', () => {
    show(true);
    expect(cluster()).toBeInTheDocument();
  });

  it('갈 때는 곧장 간다 — 흐려지는 동안 판 위에 남아 있으면 그게 사용자가 본 겹침이다', () => {
    show(true);
    expect(cluster().style.transition).toBe('none');
  });

  it('올 때만 천천히, 그것도 한 박자 뒤에 — 말이 걷히고 나서 뜬다', () => {
    show(false);
    expect(cluster().style.transition).toContain('opacity');
    // 지연이 붙어 있어야 「말이 끝나면 그다음에 계기판」이 된다
    expect(cluster().style.transition).toMatch(/0\.12s|120ms/);
  });
});

/** 화면이 실제로 쥔 국면 목록 — 아레나는 상수를 안 내보내므로 소스에서 떠 온다 (hudlook.test 와 같은 방식) */
const SRC = readFileSync('src/features/arena/ArenaFeature.tsx', 'utf8');
const AWAY_PHASES = SRC.split('const PANEL_AWAY_PHASES = new Set<Phase>([')[1].split(']')[0];

describe('비켜서는 국면', () => {
  // 판 한 바퀴 전부 — 일곱 국면이 모두 화면 위쪽 가운데에 제 상자를 세운다
  for (const phase of ['designing', 'briefing', 'countdown', 'running', 'judging', 'oral', 'result']) {
    it(`${phase} — 판이 화면 위쪽 가운데를 쓴다`, () => {
      expect(AWAY_PHASES).toContain(`'${phase}'`);
    });
  }

  it('idle — 말이 다 끝나고 방으로 돌아온 자리라 계기판이 선다', () => {
    expect(AWAY_PHASES).not.toContain("'idle'");
  });

  it('계기판이 그 목록을 실제로 본다 — 상수만 있고 안 물리면 아무 일도 안 난다', () => {
    expect(SRC).toContain('away={panelAway}');
    expect(SRC).toContain('PANEL_AWAY_PHASES.has(phase)');
  });

  /*
   * 판 사이(idle)에도 위쪽 가운데에 서는 상자가 둘 있다 — 준비 상자와 검사판이다.
   * 국면으로는 안 잡히므로 panelAway 가 따로 얹어 본다. 여기가 빠지면 첫 화면의
   * 「게임 시작」판이 그대로 계기판과 겹친다.
   */
  const AWAY_EXPR = SRC.split('const panelAway =')[1].split(';')[0];
  for (const [what, token] of [
    ['준비 상자', "cast === 'making'"],
    ['첫 화면의 게임 시작판', "cast === 'none'"],
    ['열어 둔 검사판', 'panelOpen'],
  ] as const) {
    it(`${what} 이 떠 있는 동안에도 비켜선다`, () => {
      expect(AWAY_EXPR).toContain(token);
    });
  }
});

describe('층 — 겹쳐도 읽히는 쪽이 이긴다', () => {
  it('계기판은 이 화면의 맨 아래다 — 조건이 틀려도 판의 글이 밑에 깔리지 않게', () => {
    expect(SRC).toContain('.arena .hud-cluster { z-index: 9; }');
  });

  it('검사판 상자에 z 가 적혀 있다 — 안 적으면 auto(0) 라 계기판보다도 아래다', () => {
    const rule = SRC.split('.arena .panel.overlay {')[1].split('}')[0];
    expect(rule).toContain('z-index: 14');
  });
});
