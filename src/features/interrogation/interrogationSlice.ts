/**
 * 「인간인 척」 판의 화면 상태 — 전부 **서버가 준 것**이다 (game-protocol.ts 의 GameStateWire 와 그 사이의 이벤트).
 * 여기서 의심도를 계산하거나 정체를 추측하지 않는다. 화면은 이걸 그대로 그린다.
 *
 * 프레임마다 바뀌는 좌표는 여기 없다 — scene/seatState.ts (가변 Map) 가 든다 (world/core/WorldState 와 같은 규칙).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { PAD_FINISH } from '@/world/mp/platform';
import type { CardItem, ClaimVerdict, CompelledVerdict, GameOutcome, GameRole, GameStateWire, LeaderKind } from '@/world/mp/game-protocol';
import type { TrialGame, TrialResultWire } from '@/world/mp/protocol';

export interface ChatEntry {
  /** 좌석 id (판이 도는 동안) 또는 플레이어 id (로비) */
  id: string;
  name: string;
  text: string;
  ts: number;
  /** 관리 AI 의 말 · 의심도 걸음 · 격리 같은 시스템 줄 */
  kind?: 'chat' | 'leader' | 'system' | 'delta';
}

export interface GameState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  errorText: string | null;
  selfId: string | null;
  /** 로비에서 보는 실제 사람들 — id → 닉네임 */
  players: Record<string, string>;
  /** 서버가 준 판 상태. 연결 직후엔 null */
  wire: GameStateWire | null;
  /** 내 배역 (game_role) */
  me: { seatId: string; role: GameRole; aiId: string | null } | null;
  feed: ChatEntry[];
  /** 테스트 진행 중 화면용 — 서버의 trial_round_start */
  test: { game: TrialGame; round: number; startAt: number; durationMs?: number } | null;
  /** 정지선 — 이번 테스트에 내가 마친 시행 수 */
  myAttempts: number;
  /** 낙하 생존 — 이번 테스트에 내가 맞은 횟수 */
  myHits: number;
  /** 색 사냥 — 이번 테스트에 내가 주운 횟수. 정오는 여기 없다 — 전원이 결과 모달에서 처음 본다 */
  myPicks: number;
  /** 움직이는 플랫폼 — 이번 테스트에서 내가 발판에 내린 횟수 · 그중 정중앙 · 실패 (trial_landed) */
  myLandings: number;
  myCenters: number;
  myMisses: number;
  /** 도착 발판에 내렸다 — 남은 시간은 거기서 기다린다 */
  myFinished: boolean;
  /** 회전 원판 — 이번 테스트에 내가 원판 밖으로 떨어진 횟수 (trial_fell) */
  myFalls: number;
  /** 색 사냥 — 지금 조명과 목표색 (trial_colorhunt). HUD 스와치(원색)와 조명 오버레이가 그린다 */
  hunt: { light: string; target: string; targetHex: string } | null;
  /** 결과 모달이 그릴 것 — 서버 trial_result. 모달이 닫힌 뒤에도 HUD 요약으로 남는다 */
  latestResult: TrialResultWire | null;
  history: TrialResultWire[];
  /** 마지막 관리 AI 방송 — 배너 */
  leader: { text: string; kind: LeaderKind; ts: number } | null;
  /** 방금 판정 — 한 줄 */
  verdict: { by: string; verdict: ClaimVerdict; text: string; delta: number } | null;
  /** 판이 끝났을 때 공개된 정체표 */
  roles: Record<string, GameRole> | null;
  outcome: GameOutcome | null;
  /** game_ended 를 받은 내 시각 — 끝 화면의 시계가 여기에 GAME_ENDED_MS 를 더해 로비 복귀를 센다. 재접속이면 없다 */
  endedAt: number | null;
  /** 서버가 거절한 마지막 사유 */
  reject: string | null;
  /** 마지막 시험이 준 발언권 — 결과 모달의 열 하나 (game_talk 의 gained) */
  talkGained: { game: TrialGame; gained: Record<string, number> } | null;
  /**
   * 내 카드 — 시험 1등이 고르는 세 장(offer)과 골라 쥔 것(items). 서버가 본인에게만 보낸다(game_cards).
   * 봇은 카드를 안 받고, 판이 다시 열리면 비운다 (worker/src/game/runtime.ts 의 offerCard).
   */
  cards: { offer: number | null; items: CardItem[] };
  /** 방금 뒤집은 카드 — 엎어진 채 골라서 그때야 뭔지 안다. 몇 초 보이고 도크로 들어간다 */
  cardReveal: { item: CardItem; ts: number } | null;
  /** 카드가 쓰였다 · 강제된 답이 판정됐다 — 화면 위에 잠깐 서는 한 줄 */
  cardNote: { text: string; tone: 'card' | 'good' | 'bad'; ts: number } | null;
}

const initialState: GameState = {
  status: 'idle',
  errorText: null,
  selfId: null,
  players: {},
  wire: null,
  me: null,
  feed: [],
  test: null,
  myAttempts: 0,
  myHits: 0,
  myPicks: 0,
  myLandings: 0,
  myCenters: 0,
  myMisses: 0,
  myFinished: false,
  myFalls: 0,
  hunt: null,
  latestResult: null,
  history: [],
  leader: null,
  verdict: null,
  roles: null,
  outcome: null,
  endedAt: null,
  reject: null,
  talkGained: null,
  cards: { offer: null, items: [] },
  cardReveal: null,
  cardNote: null,
};

const FEED_KEEP = 120;

function push(s: GameState, e: ChatEntry): void {
  s.feed.push(e);
  if (s.feed.length > FEED_KEEP) s.feed = s.feed.slice(-FEED_KEEP);
}

export const interrogationSlice = createSlice({
  name: 'interrogation',
  initialState,
  reducers: {
    reset: () => initialState,
    connecting(s) {
      s.status = 'connecting';
      s.errorText = null;
    },
    welcomed(s, a: PayloadAction<{ selfId: string; players: { id: string; nickname: string }[] }>) {
      s.status = 'connected';
      s.selfId = a.payload.selfId;
      s.players = {};
      for (const p of a.payload.players) s.players[p.id] = p.nickname;
    },
    playerJoined(s, a: PayloadAction<{ id: string; nickname: string }>) {
      s.players[a.payload.id] = a.payload.nickname;
    },
    playerLeft(s, a: PayloadAction<string>) {
      delete s.players[a.payload];
    },
    stateReceived(s, a: PayloadAction<GameStateWire>) {
      const prev = s.wire;
      s.wire = a.payload;
      if (a.payload.latestResult) s.latestResult = a.payload.latestResult;
      if (a.payload.outcome) s.outcome = a.payload.outcome;
      // 새 판이 열렸다 — 지난 판의 흔적을 지운다
      if (prev && prev.phase !== 'briefing' && a.payload.phase === 'briefing') {
        s.cards = { offer: null, items: [] };
        s.cardReveal = null;
        s.cardNote = null;
        s.feed = [];
        s.history = [];
        s.latestResult = null;
        s.roles = null;
        s.outcome = null;
        s.endedAt = null;
        s.verdict = null;
        s.test = null;
        s.talkGained = null;
      }
      if (a.payload.phase !== 'test') {
        s.test = null;
        s.hunt = null;
      }
    },
    roleReceived(s, a: PayloadAction<{ seatId: string; role: GameRole; aiId?: string }>) {
      s.me = { seatId: a.payload.seatId, role: a.payload.role, aiId: a.payload.aiId ?? null };
    },
    chatReceived(s, a: PayloadAction<ChatEntry>) {
      push(s, { ...a.payload, kind: a.payload.kind ?? 'chat' });
    },
    suspicionReceived(
      s,
      a: PayloadAction<{ suspicion: Record<string, number>; accusations: Record<string, string>; delta?: { target: string; amount: number; by: string; why: string } }>,
    ) {
      if (s.wire) {
        s.wire.suspicion = a.payload.suspicion;
        s.wire.accusations = a.payload.accusations;
      }
      const d = a.payload.delta;
      if (d) {
        const nameOf = (id: string) => (id === 'LEADER' ? '관리 AI' : (s.wire?.seats.find((x) => x.id === id)?.name ?? id));
        push(s, {
          id: 'system',
          name: '',
          text: `${nameOf(d.by)} → ${nameOf(d.target)} ${d.amount > 0 ? '+' : ''}${d.amount} (${d.why})`,
          ts: Date.now(),
          kind: 'delta',
        });
      }
    },
    isolatedReceived(s, a: PayloadAction<{ id: string; role: GameRole; text: string }>) {
      const seat = s.wire?.seats.find((x) => x.id === a.payload.id);
      if (seat) {
        seat.isolated = true;
        seat.revealed = a.payload.role;
      }
      push(s, { id: 'system', name: '', text: a.payload.text, ts: Date.now(), kind: 'system' });
    },
    leaderReceived(s, a: PayloadAction<{ text: string; kind: LeaderKind; ts: number }>) {
      s.leader = a.payload;
      push(s, { id: 'LEADER', name: '관리 AI', text: a.payload.text, ts: a.payload.ts, kind: 'leader' });
    },
    verdictReceived(s, a: PayloadAction<{ by: string; verdict: ClaimVerdict; text: string; delta: number }>) {
      s.verdict = a.payload;
    },
    endedReceived(s, a: PayloadAction<{ outcome: GameOutcome; roles: Record<string, GameRole> }>) {
      s.outcome = a.payload.outcome;
      s.roles = a.payload.roles;
      s.endedAt = Date.now();
      if (s.wire) s.wire.phase = 'ended';
    },
    rejected(s, a: PayloadAction<string>) {
      s.reject = a.payload;
    },
    /**
     * 발언권이 움직였다 (game_talk). 지급이면 로그에 한 줄 — 누가 얼마나 받았는지는 기록의 일부라 전원이 본다.
     * 차감은 조용하다: 말 한 줄마다 「−1」이 찍히면 대화가 장부가 된다.
     */
    talkReceived(s, a: PayloadAction<{ talk: Record<string, number>; gained?: Record<string, number>; game?: TrialGame }>) {
      if (s.wire) s.wire.talk = a.payload.talk;
      if (!a.payload.gained || !a.payload.game) return;
      s.talkGained = { game: a.payload.game, gained: a.payload.gained };
      const nameOf = (id: string) => s.wire?.seats.find((x) => x.id === id)?.name ?? id;
      const parts = Object.entries(a.payload.gained)
        .sort((x, y) => y[1] - x[1])
        .map(([id, n]) => `${nameOf(id)} +${n}`);
      if (parts.length) push(s, { id: 'system', name: '', text: `발언권 지급 — ${parts.join(' · ')}`, ts: Date.now(), kind: 'system' });
    },
    clearReject(s) {
      s.reject = null;
    },
    /** 내 카드 상태 (game_cards) — 엎어진 장수 · 쥔 것. 쥔 것이 늘었으면 그게 방금 뒤집은 카드다 */
    cardsReceived(s, a: PayloadAction<{ offer: number | null; items: CardItem[] }>) {
      const gained = a.payload.items.length > s.cards.items.length ? a.payload.items[a.payload.items.length - 1] : null;
      s.cards = { offer: a.payload.offer, items: a.payload.items };
      if (gained) s.cardReveal = { item: gained, ts: Date.now() };
    },
    clearCardReveal(s) {
      s.cardReveal = null;
    },
    /** 누가 무슨 카드를 썼다 (game_card_used) — 전원이 본다: 로그 한 줄 + 위의 알림 */
    cardUsed(s, a: PayloadAction<{ by: string; item: CardItem; target?: string; text: string; ts?: number }>) {
      const ts = a.payload.ts ?? Date.now();
      push(s, { id: 'system', name: '', text: a.payload.text, ts, kind: 'system' });
      s.cardNote = { text: a.payload.text, tone: 'card', ts };
    },
    /** 강제된 답의 판정 (game_compelled) — 거짓·회피는 나쁜 색, 진실은 좋은 색 */
    compelledReceived(s, a: PayloadAction<{ by: string; target: string; verdict: CompelledVerdict; text: string; delta: number; ts?: number }>) {
      const ts = a.payload.ts ?? Date.now();
      push(s, { id: 'system', name: '', text: a.payload.text, ts, kind: 'system' });
      s.cardNote = { text: a.payload.text, tone: a.payload.verdict === 'truthful' ? 'good' : 'bad', ts };
      if (s.wire) s.wire.compelled = null;
    },
    clearCardNote(s) {
      s.cardNote = null;
    },
    testStarted(s, a: PayloadAction<{ game: TrialGame; round: number; startAt: number; durationMs?: number }>) {
      s.test = a.payload;
      s.myAttempts = 0;
      s.myHits = 0;
      s.myPicks = 0;
      s.myLandings = 0;
      s.myCenters = 0;
      s.myMisses = 0;
      s.myFinished = false;
      s.myFalls = 0;
      s.hunt = null;
    },
    /** 회전 원판 — 누가 원판 밖으로 떨어졌다(trial_fell). 내 좌석일 때만 센다 */
    fellRecorded(s, a: PayloadAction<string>) {
      if (s.me && a.payload === s.me.seatId) s.myFalls += 1;
    },
    /** 색 사냥 — 테스트가 열렸거나 조명이 바뀌었다(trial_colorhunt). 구슬은 huntState(가변)가 든다 */
    colorhuntSynced(s, a: PayloadAction<{ light: string; target: string; targetHex: string }>) {
      s.hunt = a.payload;
    },
    /** 색 사냥 — 누가 주웠다(trial_picked). 내 좌석일 때만 센다 */
    pickRecorded(s, a: PayloadAction<string>) {
      if (s.me && a.payload === s.me.seatId) s.myPicks += 1;
    },
    attemptRecorded(s, a: PayloadAction<string>) {
      if (s.me && a.payload === s.me.seatId) s.myAttempts += 1;
    },
    /** 움직이는 플랫폼 — 누가 착지했다(trial_landed). 내 좌석이면 센다: 착지 · 정중앙 · 실패 */
    landingRecorded(s, a: PayloadAction<{ id: string; pad?: number; center: boolean; missed: boolean }>) {
      if (!s.me || a.payload.id !== s.me.seatId) return;
      if (a.payload.missed) s.myMisses += 1;
      else {
        s.myLandings += 1;
        if (a.payload.center) s.myCenters += 1;
        if (a.payload.pad === PAD_FINISH) s.myFinished = true;
      }
    },
    hitRecorded(s, a: PayloadAction<string>) {
      if (s.me && a.payload === s.me.seatId) s.myHits += 1;
    },
    resultReceived(s, a: PayloadAction<TrialResultWire>) {
      s.latestResult = a.payload;
      s.history.push(a.payload);
      s.test = null;
      s.hunt = null;
    },
    errorOccurred(s, a: PayloadAction<string>) {
      s.status = 'error';
      s.errorText = a.payload;
    },
    closed(s) {
      if (s.status !== 'error') s.status = 'idle';
    },
  },
});

export const gameActions = interrogationSlice.actions;

type Root = { interrogation: GameState };
export const gameSelectors = {
  selectStatus: (r: Root) => r.interrogation.status,
  selectErrorText: (r: Root) => r.interrogation.errorText,
  selectSelfId: (r: Root) => r.interrogation.selfId,
  selectPlayers: (r: Root) => r.interrogation.players,
  selectWire: (r: Root) => r.interrogation.wire,
  selectMe: (r: Root) => r.interrogation.me,
  selectFeed: (r: Root) => r.interrogation.feed,
  selectTest: (r: Root) => r.interrogation.test,
  selectMyAttempts: (r: Root) => r.interrogation.myAttempts,
  selectMyHits: (r: Root) => r.interrogation.myHits,
  selectMyPicks: (r: Root) => r.interrogation.myPicks,
  selectMyLandings: (r: Root) => ({ landings: r.interrogation.myLandings, centers: r.interrogation.myCenters, misses: r.interrogation.myMisses, finished: r.interrogation.myFinished }),
  selectMyFalls: (r: Root) => r.interrogation.myFalls,
  selectHunt: (r: Root) => r.interrogation.hunt,
  selectLatestResult: (r: Root) => r.interrogation.latestResult,
  selectHistory: (r: Root) => r.interrogation.history,
  selectLeader: (r: Root) => r.interrogation.leader,
  selectVerdict: (r: Root) => r.interrogation.verdict,
  selectRoles: (r: Root) => r.interrogation.roles,
  selectOutcome: (r: Root) => r.interrogation.outcome,
  selectEndedAt: (r: Root) => r.interrogation.endedAt,
  selectReject: (r: Root) => r.interrogation.reject,
  selectTalkGained: (r: Root) => r.interrogation.talkGained,
  selectCards: (r: Root) => r.interrogation.cards,
  selectCardReveal: (r: Root) => r.interrogation.cardReveal,
  selectCardNote: (r: Root) => r.interrogation.cardNote,
  /** 내 남은 발언권 — 좌석이 없으면 null */
  selectMyTalk: (r: Root) => {
    const me = r.interrogation.me;
    const talk = r.interrogation.wire?.talk;
    if (!me || !talk) return null;
    const n = talk[me.seatId];
    return typeof n === 'number' ? n : null;
  },
};
