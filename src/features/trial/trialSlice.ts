import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TrialGame, TrialResultWire } from '@/world/mp/protocol';

export interface TrialState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  errorText: string | null;
  selfId: string | null;
  /** id → 닉네임. AI("SUBJECT_xx") 좌석은 여기 없다 — 화면은 id 그대로를 이름으로 보여준다 */
  roster: Record<string, string>;
  game: TrialGame | null;
  /** 0 이면 아직 라운드가 안 열렸다 */
  round: number;
  /** 라운드 시작 서버 시각과 길이(시간제 게임만) — 남은 시간 표시용 */
  roundStartAt: number;
  roundDurationMs: number | null;
  /** 낙하 생존 — 이번 라운드에 내가 맞은 횟수 (연출·HUD 용, 기록은 서버가 한다) */
  myHitsThisRound: number;
  /** 이번 라운드에 내가 마친 시행 수(0~3) — StopLineScene 이 다음 W 를 언제 받을지 여기로 안다 */
  myAttemptsThisRound: number;
  /** 지금까지 끝난 라운드 전부(오래된 순) — 로그 탭이 이걸 그대로 보여준다 */
  history: TrialResultWire[];
}

const initialState: TrialState = {
  status: 'idle',
  errorText: null,
  selfId: null,
  roster: {},
  game: null,
  round: 0,
  roundStartAt: 0,
  roundDurationMs: null,
  myHitsThisRound: 0,
  myAttemptsThisRound: 0,
  history: [],
};

export const trialSlice = createSlice({
  name: 'trial',
  initialState,
  reducers: {
    connecting(s) {
      s.status = 'connecting';
      s.errorText = null;
    },
    welcomed(s, a: PayloadAction<{ selfId: string; players: { id: string; nickname: string }[] }>) {
      s.status = 'connected';
      s.selfId = a.payload.selfId;
      for (const p of a.payload.players) s.roster[p.id] = p.nickname;
    },
    playerJoined(s, a: PayloadAction<{ id: string; nickname: string }>) {
      s.roster[a.payload.id] = a.payload.nickname;
    },
    playerLeft(s, a: PayloadAction<string>) {
      delete s.roster[a.payload];
    },
    historyReceived(s, a: PayloadAction<TrialResultWire[]>) {
      s.history = a.payload;
    },
    roundStarted(s, a: PayloadAction<{ game: TrialGame; round: number; startAt: number; durationMs: number | null }>) {
      s.game = a.payload.game;
      s.round = a.payload.round;
      s.roundStartAt = a.payload.startAt;
      s.roundDurationMs = a.payload.durationMs;
      s.myAttemptsThisRound = 0;
      s.myHitsThisRound = 0;
    },
    /** 낙하물에 맞았다(trial_hit) — 그게 내 id일 때만 센다 */
    hitRecorded(s, a: PayloadAction<string>) {
      if (a.payload === s.selfId) s.myHitsThisRound += 1;
    },
    /** 시행 하나가 서버 판정을 받았다(trial_stopline_waypoints) — 그게 내 id일 때만 센다 */
    attemptRecorded(s, a: PayloadAction<string>) {
      if (a.payload === s.selfId) s.myAttemptsThisRound += 1;
    },
    resultReceived(s, a: PayloadAction<TrialResultWire>) {
      s.history.push(a.payload);
    },
    errorOccurred(s, a: PayloadAction<string>) {
      s.status = 'error';
      s.errorText = a.payload;
    },
    closed(s) {
      if (s.status !== 'error') s.status = 'idle';
    },
    reset() {
      return initialState;
    },
  },
  selectors: {
    selectStatus: (s) => s.status,
    selectErrorText: (s) => s.errorText,
    selectSelfId: (s) => s.selfId,
    selectRoster: (s) => s.roster,
    selectGame: (s) => s.game,
    selectRound: (s) => s.round,
    selectMyAttempts: (s) => s.myAttemptsThisRound,
    selectMyHits: (s) => s.myHitsThisRound,
    selectRoundStartAt: (s) => s.roundStartAt,
    selectRoundDurationMs: (s) => s.roundDurationMs,
    selectHistory: (s) => s.history,
    selectLatestResult: (s) => s.history.at(-1) ?? null,
  },
});

export const trialActions = trialSlice.actions;
export const trialSelectors = trialSlice.selectors;
