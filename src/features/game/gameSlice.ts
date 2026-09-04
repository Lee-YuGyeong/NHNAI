import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** 기본 대본의 페이즈 (PLANNING §1.2b). 리더 무브가 붙기 전까지 화면은 이 축으로 움직인다. */
export type GamePhase = 'idle' | 'rule' | 'trial' | 'respond' | 'readout' | 'comms' | 'vote' | 'purge';

export interface GameState {
  phase: GamePhase;
  /** 1~3. idle 일 땐 0 */
  round: number;
}

const initialState: GameState = { phase: 'idle', round: 0 };

export const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    /** 지금은 화면 미리보기 버튼이 흘리지만, 서버 상태머신이 생기면 WS 수신이 흘린다 */
    phaseChanged(s, a: PayloadAction<{ phase: GamePhase; round: number }>) {
      s.phase = a.payload.phase;
      s.round = a.payload.round;
    },
    reset() {
      return initialState;
    },
  },
  selectors: {
    selectPhase: (s) => s.phase,
    selectRound: (s) => s.round,
  },
});

export const gameActions = gameSlice.actions;
export const gameSelectors = gameSlice.selectors;
