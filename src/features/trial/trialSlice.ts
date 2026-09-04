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
  /** 색 사냥 — 이번 라운드에 내가 주운 횟수. 정오는 여기 없다 — 서버만 알고, 전원이 결과에서 처음 본다 */
  myPicksThisRound: number;
  /** 색 사냥 — 지금 조명(#rrggbb)과 목표색. HUD 스와치(원색)와 화면 오버레이가 그린다 */
  hunt: { light: string; target: string; targetHex: string } | null;
  /** 지금까지 끝난 판 전부(오래된 순) — 로그 탭이 이걸 그대로 보여준다 */
  history: TrialResultWire[];
  /** 이 화면에 있는 동안 **실제로 끝난** 판의 결과 — 백필된 기록과 구분한다. 요약(10초)은 이것만 띄운다 */
  liveResult: TrialResultWire | null;
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
  myPicksThisRound: 0,
  hunt: null,
  history: [],
  liveResult: null,
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
      s.myPicksThisRound = 0;
      s.hunt = null;
      s.liveResult = null;
    },
    /** 색 사냥 — 판이 열렸거나 조명이 바뀌었다(trial_colorhunt). 구슬 자체는 huntState(가변)가 든다 */
    colorhuntSynced(s, a: PayloadAction<{ light: string; target: string; targetHex: string }>) {
      s.hunt = a.payload;
    },
    /** 색 사냥 — 누가 주웠다(trial_picked). 내 것일 때만 센다 */
    pickRecorded(s, a: PayloadAction<string>) {
      if (a.payload === s.selfId) s.myPicksThisRound += 1;
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
      s.liveResult = a.payload;
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
    selectMyPicks: (s) => s.myPicksThisRound,
    selectHunt: (s) => s.hunt,
    selectRoundStartAt: (s) => s.roundStartAt,
    selectRoundDurationMs: (s) => s.roundDurationMs,
    selectHistory: (s) => s.history,
    selectLatestResult: (s) => s.history.at(-1) ?? null,
    selectLiveResult: (s) => s.liveResult,
  },
});

export const trialActions = trialSlice.actions;
export const trialSelectors = trialSlice.selectors;
