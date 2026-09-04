// @vitest-environment jsdom
/**
 * 전광판 — 숫자만 보여준다 (PLANNING P2, features/trial/scoreboard/Scoreboard.tsx 머리말).
 *   ① 무리 평균이 참가자 줄과 **같이** 선다 — 상대 비교가 이 게임의 원리다
 *   ② 참가자 전원이 한 화면에 있고, 실제 사람은 닉네임으로 · AI 좌석은 id 그대로 불린다
 *   ③ "의심"·"이상치"·"정상" 같은 판정 라벨이 어디에도 없다
 *   ④ 로그 탭은 끝난 라운드를 전부 늘어놓고, 비었을 때는 그렇다고 말한다
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Scoreboard } from '@/features/trial/scoreboard/Scoreboard';
import { ScoreboardLog } from '@/features/trial/scoreboard/ScoreboardLog';
import type { TrialResultWire } from '@/world/mp/protocol';

const RESULT: TrialResultWire = {
  game: 'stopline',
  round: 2,
  players: [
    { id: 'me-1', metrics: { stopError: 0.4, brakeTiming: 3.1, transitionError: 1.94 }, transitionError: 1.94, errorDirection: [1, 1, -1], adaptationCurve: [1.94, 0.8, 0.4] },
    { id: 'SUBJECT_01', metrics: { stopError: -0.2, brakeTiming: 2.9, transitionError: 0.21 }, transitionError: 0.21, errorDirection: [-1, -1, -1], adaptationCurve: [0.21, 0.2, 0.2] },
  ],
  groupMean: { stopError: 0.1, brakeTiming: 3.0, transitionError: 1.1 },
  groupStdDev: { stopError: 0.3, brakeTiming: 0.1, transitionError: 0.865 },
  endedAt: 0,
};

describe('Scoreboard', () => {
  it('무리 평균이 참가자 줄과 같이 선다', () => {
    render(<Scoreboard result={RESULT} roster={{ 'me-1': '요원-3721' }} />);
    // 지표마다 무리 평균 줄이 하나씩 — 맨 위(핵심 지표)가 전환 직후 오차다
    const means = screen.getAllByText(/무리 평균/);
    expect(means.length).toBeGreaterThanOrEqual(1);
    expect(means[0]).toHaveTextContent('1.10m');
    expect(screen.getByText('ROUND 2')).toBeInTheDocument();
  });

  it('실제 사람은 닉네임으로, AI 좌석은 id 로 — 전원이 한 화면에', () => {
    render(<Scoreboard result={RESULT} roster={{ 'me-1': '요원-3721' }} />);
    expect(screen.getAllByText('요원-3721').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SUBJECT_01').length).toBeGreaterThan(0);
    expect(screen.getByText('1.94 → 0.80 → 0.40')).toBeInTheDocument();
    expect(screen.getByText('− − −')).toBeInTheDocument();
  });

  it('판정 라벨이 없다 — 의심 · 이상치 · 정상', () => {
    const { container } = render(<Scoreboard result={RESULT} roster={{}} />);
    expect(container.textContent).not.toMatch(/의심|이상치|정상|AI/);
  });
});

describe('ScoreboardLog', () => {
  it('끝난 라운드가 없으면 그렇다고 말한다', () => {
    render(<ScoreboardLog history={[]} roster={{}} />);
    expect(screen.getByText(/아직 끝난 라운드가 없다/)).toBeInTheDocument();
  });

  it('끝난 라운드를 전부 늘어놓는다', () => {
    render(<ScoreboardLog history={[{ ...RESULT, round: 1 }, RESULT]} roster={{}} />);
    expect(screen.getByText('ROUND 1')).toBeInTheDocument();
    expect(screen.getByText('ROUND 2')).toBeInTheDocument();
  });
});
