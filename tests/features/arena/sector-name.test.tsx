// @vitest-environment jsdom
/**
 * 「SECTOR」는 한 방 안에서 한 가지만 가리켜야 한다 (2026-09-03).
 *
 * 이 방에는 그 낱말이 두 번 나온다. 하나는 **시설 이름**(SECTOR 2098 — 인트로·로그인·메인·인계
 * 서류·끝 화면이 전부 그렇게 부른다), 하나는 **이 몸의 마지막 정비 구역**(2 · 4 · 7 — 복도 명판에서
 * 읽고 검문에서 답하는 그 번호). 여태 왼쪽 위 판의 머리줄 칩이 뒤엣것을 적어서, 막이 걷히기 직전
 * 서류가 「SECTOR 2098」이라 한 자리에 곧바로 「SECTOR 4」가 섰다 — 읽는 사람에게는 구역 번호가
 * 바뀐 것으로 보인다. 앞 세 장의 같은 칩은 방 번호(`NODE 4242`)라 비교할 자리도 아니다.
 *
 * 그래서 머리줄 칩은 시설 이름으로 두고, 정비 구역은 **서류가 적던 자리** — UNIT 번호 옆이다.
 */
import { readFileSync } from 'node:fs';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FACILITY_SECTOR } from '@/features/arena/handover';
import { UnitPanel } from '@/features/arena/UnitPanel';

const show = () =>
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
      order="인간을 찾아내라"
      away={false}
    />,
  );

describe('머리줄 칩은 시설 이름이다', () => {
  it('서류·끝 화면과 같은 값을 적는다', () => {
    show();
    expect(screen.getByText(`SECTOR ${FACILITY_SECTOR}`)).toBeInTheDocument();
  });

  it('이 몸의 정비 구역을 거기 적지 않는다 — 그 자리는 시설의 자리다', () => {
    show();
    expect(document.querySelector('.hud-tag__room')?.textContent).not.toBe('SECTOR 4');
  });
});

describe('정비 구역은 UNIT 번호 옆이다', () => {
  it('서류가 적던 그 자리 — `UNIT A38-091 · SECTOR 4`', () => {
    show();
    const head = document.querySelector('.hud-panel__head')?.textContent ?? '';
    expect(head).toContain('A38-091');
    expect(head).toContain('· SECTOR 4');
  });
});

/**
 * 같은 값을 세 군데가 손으로 적어 두면 반드시 어긋난다 — 이 방이 이미 그렇게 어긋나 있었다.
 * (머리말·주석의 그림에는 2098 이 그대로 적혀 있다. 여기서 보는 것은 **화면이 그리는 값**이다.)
 */
describe('시설 이름은 한 곳에서 나온다', () => {
  for (const [file, what] of [
    ['src/features/arena/HandoverCard.tsx', '인계 서류'],
    ['src/features/arena/ArenaFeature.tsx', '끝 화면'],
    ['src/features/arena/UnitPanel.tsx', '왼쪽 위 판'],
  ] as const) {
    it(`${what} — 상수를 본다`, () => {
      expect(readFileSync(file, 'utf8')).toContain('SECTOR {FACILITY_SECTOR}');
    });
  }

  it('그 값은 인트로가 말하는 그 구역이다', () => {
    expect(FACILITY_SECTOR).toBe(2098);
    expect(readFileSync('src/features/intro/IntroFeature.tsx', 'utf8')).toContain('2098');
  });
});
