// @vitest-environment jsdom
/**
 * 「인간인 척」의 판들 — 서버 상태를 그대로 그리는지, 그리고 그리면 안 되는 것을 안 그리는지.
 *   ① 좌석판: 전원이 SUBJECT 번호로 서고, 정체는 격리된 사람에게만 붙는다. 설계자에게만 AI 표시가 뜬다
 *   ② 결과 모달: 무리 평균이 참가자 줄과 같이 서고 「의심」·「정상」 같은 판정 낱말이 없다
 *   ③ 끝 화면: 정체표 전부와 승패 한 줄
 *   ④ 저장소(interrogationSlice): 새 판이 열리면 지난 판의 흔적이 지워진다
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Board, EndScreen, ResultModal } from '@/features/interrogation/hud/Panels';
import { gameActions, interrogationSlice } from '@/features/interrogation/interrogationSlice';
import type { GameStateWire } from '@/world/mp/game-protocol';
import type { TrialResultWire } from '@/world/mp/protocol';

const RESULT: TrialResultWire = {
  game: 'fall',
  round: 1,
  players: [
    { id: 's1', metrics: { hitCount: 2, survivalTime: 12.4, transitionError: 1.9 }, transitionError: 1.9, errorDirection: [1, -1], adaptationCurve: [1.9, 0.8] },
    { id: 's2', metrics: { hitCount: 0, survivalTime: 60, transitionError: 0.2 }, transitionError: 0.2, errorDirection: [-1, -1], adaptationCurve: [0.2, 0.2] },
  ],
  groupMean: { hitCount: 1, survivalTime: 36.2, transitionError: 1.05 },
  groupStdDev: { hitCount: 1, survivalTime: 23.8, transitionError: 0.85 },
  endedAt: 0,
};

const WIRE: GameStateWire = {
  phase: 'discussion',
  seats: [
    { id: 's1', name: 'SUBJECT 01', seat: 1, isolated: false },
    { id: 's2', name: 'SUBJECT 02', seat: 2, isolated: false },
    { id: 's3', name: 'SUBJECT 03', seat: 3, isolated: true, revealed: 'human' },
  ],
  suspicion: { s1: 13, s2: 0, s3: 100 },
  accusations: { s2: 's1' },
  phaseEndsAt: null,
  testsDone: 1,
  currentTest: null,
  latestResult: RESULT,
  quota: 2,
  hostId: null,
  minHumans: 3,
  humansOnline: 1,
  outcome: null,
  startedAt: 1,
};

describe('Board', () => {
  it('전원이 SUBJECT 번호로 서고 정체는 격리된 사람에게만 붙는다', () => {
    render(<Board wire={WIRE} mySeatId="s1" aiId={null} onAccuse={() => {}} onWithdraw={() => {}} />);
    const row = (name: string) => screen.getAllByText(new RegExp(name)).map((el) => el.closest('.ig-seat')!).find(Boolean)!;
    expect(row('SUBJECT 01')).toHaveTextContent('(나)');
    expect(row('SUBJECT 03')).toHaveTextContent('사람');
    expect(row('SUBJECT 02')).not.toHaveTextContent('AI');
    expect(screen.getByText('13%')).toBeInTheDocument();
    // 나를 겨누는 사람이 적힌다
    expect(screen.getByText(/지목: SUBJECT 02/)).toBeInTheDocument();
  });

  it('설계자에게만 AI 좌석이 표시된다', () => {
    render(<Board wire={WIRE} mySeatId="s1" aiId="s2" onAccuse={() => {}} onWithdraw={() => {}} />);
    const rows = screen.getAllByText(/SUBJECT 02/).map((el) => el.closest('.ig-seat')).filter(Boolean);
    expect(rows.some((r) => r!.textContent?.includes('AI'))).toBe(true);
  });
});

describe('ResultModal', () => {
  it('무리 평균이 참가자 줄과 같이 서고 판정 낱말이 없다', () => {
    render(<ResultModal result={RESULT} nameOf={(id) => (id === 's1' ? 'SUBJECT 01' : 'SUBJECT 02')} mySeatId="s1" endsAt={null} />);
    expect(screen.getByText('무리 평균')).toBeInTheDocument();
    expect(screen.getByText('SUBJECT 01')).toBeInTheDocument();
    expect(screen.getByText('SUBJECT 02')).toBeInTheDocument();
    expect(screen.queryByText(/정상|이상치/)).toBeNull();
    expect(screen.getByText(/낙하 생존/)).toBeInTheDocument();
  });
});

describe('EndScreen', () => {
  it('정체표 전부와 승패 한 줄', () => {
    render(
      <EndScreen
        outcome={{ winner: 'humans', reason: 'AI 가 격리됐다.', aiId: 's2', designersWon: [], designersLost: [] }}
        roles={{ s1: 'human', s2: 'ai', s3: 'human' }}
        seats={WIRE.seats}
        mySeatId="s1"
        myRole="human"
        onAgain={() => {}}
      />,
    );
    expect(screen.getByText('사람 진영 승리')).toBeInTheDocument();
    expect(screen.getByText(/SUBJECT 02/).closest('li')).toHaveTextContent('AI');
    expect(screen.getByText(/이겼다/)).toBeInTheDocument();
  });
});

describe('interrogationSlice', () => {
  it('새 판이 열리면 지난 판의 흔적이 지워진다', () => {
    const r = interrogationSlice.reducer;
    let s = r(undefined, gameActions.stateReceived({ ...WIRE, phase: 'ended' }));
    s = r(s, gameActions.chatReceived({ id: 's1', name: 'SUBJECT 01', text: '안녕', ts: 1 }));
    s = r(s, gameActions.resultReceived(RESULT));
    expect(s.feed).toHaveLength(1);
    expect(s.history).toHaveLength(1);
    s = r(s, gameActions.stateReceived({ ...WIRE, phase: 'briefing', latestResult: null }));
    expect(s.feed).toHaveLength(0);
    expect(s.history).toHaveLength(0);
    expect(s.latestResult).toBeNull();
  });

  it('의심도 걸음은 로그 한 줄이 된다', () => {
    const r = interrogationSlice.reducer;
    let s = r(undefined, gameActions.stateReceived(WIRE));
    s = r(s, gameActions.suspicionReceived({ suspicion: { s1: 21 }, accusations: { s2: 's1' }, delta: { target: 's1', amount: 8, by: 's2', why: '지목' } }));
    expect(s.wire?.suspicion.s1).toBe(21);
    expect(s.feed.at(-1)?.text).toContain('SUBJECT 02 → SUBJECT 01 +8');
  });
});
