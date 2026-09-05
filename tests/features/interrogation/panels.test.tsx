// @vitest-environment jsdom
/**
 * 「인간인 척」의 판들 — 서버 상태를 그대로 그리는지, 그리고 그리면 안 되는 것을 안 그리는지.
 *   ① 결과 모달: 무리 평균이 참가자 줄과 같이 서고 「의심」·「정상」 같은 판정 낱말이 없다
 *   ② 끝 화면: 정체표 전부와 승패 한 줄 · 「다시 — 새 판」이 그 자리에서 새 판을 청한다
 *   ③ 저장소(interrogationSlice): 새 판이 열리면 지난 판의 흔적이 지워진다
 *
 * 좌석판(Board)은 이제 없다 — 의심도는 몸 위의 막대로만 읽고, 눈금을 움직이는 것은 관리 AI 의 말 읽기다
 * (hud/Panels.tsx 머리말 · worker 쪽 시험은 tests/worker/game-runtime.test.ts).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EndScreen, ResultModal } from '@/features/interrogation/hud/Panels';
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
        endsAt={null}
        canStart
        onAgain={() => {}}
      />,
    );
    expect(screen.getByText('사람 진영 승리')).toBeInTheDocument();
    // 「SUBJECT 02」는 두 군데 선다 — 정체를 밝히는 줄과 정체표. 표 쪽 줄만 본다
    const row = screen.getAllByText(/SUBJECT 02/).map((el) => el.closest('li')).find(Boolean)!;
    expect(row).toHaveTextContent('AI');
    // 내 결과 칩 — 「나는 사람이었다 · 승리」
    expect(screen.getByText('승리')).toBeInTheDocument();
    expect(screen.getByText(/나는/)).toHaveTextContent('사람이었다');
  });

  /*
   * 「다시 — 새 판」은 그 자리에서 새 판을 청한다 (2026-09-05 사용자: "새 판 누르면 새판으로 바로 안넘어가").
   * 예전엔 새로고침이라 다시 붙어도 서버는 아직 끝난 판이었고, 같은 끝 화면이 한 번 더 섰다.
   */
  it('「다시 — 새 판」은 한 번만 청하고, 청한 뒤에는 눌리지 않는다', () => {
    const onAgain = vi.fn();
    render(
      <EndScreen
        outcome={{ winner: 'ai', reason: '사람이 다 격리됐다.', aiId: 's2', designersWon: [], designersLost: [] }}
        roles={{ s1: 'human', s2: 'ai', s3: 'human' }}
        seats={WIRE.seats}
        mySeatId="s1"
        myRole="human"
        endsAt={null}
        canStart
        onAgain={onAgain}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '다시 — 새 판' }));
    expect(onAgain).toHaveBeenCalledTimes(1);
    // 서버가 새 판을 여는 사이 — 한 번 더 눌러도 거절뿐이라 손을 막는다
    const busy = screen.getByRole('button', { name: '여는 중…' });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  it('방장이 아니면 단추가 없다 — 눌러도 서버가 거절할 뿐이다', () => {
    render(
      <EndScreen
        outcome={{ winner: 'humans', reason: 'AI 가 격리됐다.', aiId: 's2', designersWon: [], designersLost: [] }}
        roles={{ s1: 'human', s2: 'ai', s3: 'human' }}
        seats={WIRE.seats}
        mySeatId="s1"
        myRole="human"
        endsAt={null}
        canStart={false}
        onAgain={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /새 판/ })).toBeNull();
    expect(screen.getByText('방장이 새 판을 연다')).toBeInTheDocument();
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
