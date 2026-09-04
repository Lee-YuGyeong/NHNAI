/**
 * 「인간인 척」 한 판 — 방(RoomDO) 하나에 하나. PLANNING.md 의 게임 루프 전부가 여기 있다:
 *
 *   lobby → (방장 시작) → briefing → discussion ⇄ test → result → discussion … → ended
 *
 *   · 좌석: 실제 사람 + 대역(모자란 만큼, §9 폴백) + AI 1 — 판이 열릴 때 섞여 SUBJECT nn 이 된다 (§1.1)
 *   · 배역: roles.ts. 설계자에게만 AI 의 좌석이 통보된다
 *   · 테스트: 관리 AI 가 종류·강도를 고르고(agents.designNext) worker/src/trial 의 엔진이 돈다 (engines.ts)
 *   · 의심도: suspicion.ts — 지목 · 동조 · 몰이 · 철회 · 주장 판정. 테스트 수치는 절대 자동 반영되지 않는다 (P1)
 *   · 격리: 100 에 닿는 순간, 정체 공개. 격리 수가 총원 절반이면 끝 (§1.3)
 *   · 관리 AI: 소집 · 테스트 개시 · 결과 해설 · 주장 판정 방송 (§4)
 *   · AI 참가자 · 대역: 토론 단계에만 LLM 으로 말한다 (P6 · P10) — 물리는 엔진 프로파일이 대신 움직인다 (P9)
 *   · 설계자 조작: 판당 1회, 다음 결과의 공개본을 바꾼다 (P7). 원본은 storage 에만 남는다
 *
 * ★ 소켓을 직접 쥐지 않는다 — RoomDO 가 roster/broadcast/sendTo 를 콜백으로 준다 (trial/runtime.ts 와 같은 규칙).
 *   시험도 같은 방식이다 (tests/worker/game-runtime.test.ts).
 * ★ 시계는 setTimeout 이다. DO 가 잠들어 타이머를 잃어도 30초 청소 알람(onSweep)이 마감이 지난 국면을 밀어
 *   판이 멎지 않게 한다 — 늦어도 30초 안에 다음 국면으로 간다.
 */

import type { Persona } from '../../../src/lab/personas';
import {
  CLAIM_MAX_LEN,
  GAME_BRIEFING_MS,
  GAME_DISCUSSION_MS,
  GAME_FIRST_DISCUSSION_MS,
  GAME_HARD_CAP_MS,
  GAME_MAX_HUMANS,
  GAME_MIN_HUMANS,
  GAME_RESULT_MODAL_MS,
  GAME_TEST_MAX_MS,
  type GameC2SMessage,
  type GameOutcome,
  type GamePhase,
  type GameRole,
  type GameS2CMessage,
  type GameSeat,
  type GameStateWire,
  type GameTestInfo,
  type LeaderKind,
} from '../../../src/world/mp/game-protocol';
import { pickBody, type BodyId } from '../../../src/world/mp/bodies';
import { WALK_SPEED } from '../../../src/world/mp/constants';
import type { PlayerSnapshot, S2CMessage, TrialGame, TrialPlayerResult, TrialResultWire } from '../../../src/world/mp/protocol';
import { spawnFor } from '../../../src/world/mp/spawn';
import type { TrialC2SMessage } from '../../../src/world/mp/validate';
import type { GameEngine, SeatTuning } from '../trial/engine';
import { appendHistory, readHistory } from '../trial/history';
import { groupStats } from '../trial/scoring';
import type { TrialResult } from '../trial/types';
import { LINES, aiStrategy, designNext, judgeClaim, leaderComment, personaPool, sayAs, type RoomFacts } from './agents';
import type { Brain } from './brain';
import { ENGINES, INSTRUCTION, availableGames } from './engines';
import { assignRoles, outcomeFor, quotaFor, shuffled } from './roles';
import { SuspicionBook, type SuspicionDelta } from './suspicion';

export type OutMessage = S2CMessage | GameS2CMessage;

export interface GameDeps {
  storage: DurableObjectStorage;
  /** 지금 방에 붙어 있는 실제 사람들 (RoomDO.roster) */
  roster: () => PlayerSnapshot[];
  broadcast: (msg: OutMessage) => void;
  /** 한 사람(플레이어 id)에게만. 못 찾으면 false */
  sendTo: (playerId: string, msg: OutMessage) => boolean;
  brain: Brain;
  /** 시험용 — 엔진을 바꿔 끼운다. 기본은 engines.ts */
  makeEngine?: (game: TrialGame) => GameEngine | null;
  now?: () => number;
  rand?: () => number;
}

interface Seat {
  id: string;
  name: string;
  seat: number;
  kind: 'real' | 'npc' | 'ai';
  role: GameRole;
  persona: Persona | null;
  isolated: boolean;
  tamperLeft: number;
  /** 마지막으로 말한 시각 — 봇 차례 뽑기용 */
  lastSpokeAt: number;
  /** 몸 (mp/bodies.ts) — 사람은 입장 때 받은 것, 대역·AI 는 판이 열릴 때 남은 몸에서 */
  body?: BodyId;
}

interface ChatLine {
  id: string;
  text: string;
}

interface Tamper {
  target: string;
  direction: 'suspicious' | 'normal';
}

const LOG_KEEP = 40;
const STATE_KEY = 'game:state';
/** 봇 발화 간격(ms) — 사람 채팅과 같은 지터 (P10) */
const BOT_TALK_MIN_MS = 5_000;
const BOT_TALK_JITTER_MS = 9_000;
/** 지목당한 봇이 해명하러 나오는 지연(ms) */
const BOT_DEFEND_MIN_MS = 1_500;
const BOT_DEFEND_JITTER_MS = 3_000;
/** 주장 판정 사이의 최소 간격(ms) — 한 사람이 판정기를 연타하지 못하게 */
const CLAIM_GAP_MS = 12_000;
/** 같은 사람의 지목 발언 사이의 최소 간격(ms) — 단추 연타로 눈금을 미는 것은 발언이 아니다 */
const ACCUSE_GAP_MS = 5_000;
/** 토론 중 봇 배회 — 스냅샷 간격(ms) · 제 자리에서 벗어나는 반경(m) · 걷는 속도(사람 걷기의 비율) */
/**
 * 대역이 움직이는 박자. 1초였을 때는 클라가 1초에 한 번 자리를 받아 **순간이동한 뒤 제자리에서 걷는** 것으로 보였다
 * (2026-09-04 사용자: "제자리에 멈춰서 걷는거"). 사람의 송신(MOVE_THROTTLE_MS 100)과 같은 10Hz 로 — 보간이 같은 길을 탄다.
 * 속도는 step 이 tick 에 비례하므로 그대로다.
 */
const IDLE_TICK_MS = 100;
const IDLE_RADIUS = 2.2;
const IDLE_SPEED = WALK_SPEED * 0.45;

export class GameRuntime {
  private phase: GamePhase = 'lobby';
  private seats: Seat[] = [];
  /** 플레이어 id → 좌석 id. 실제 사람이 새로고침으로 id 가 바뀌어도 같은 닉네임이면 같은 좌석에 다시 앉는다 */
  private bindings = new Map<string, string>();
  private book = new SuspicionBook([]);
  private quota = 0;
  private startedAt = 0;
  private phaseEndsAt: number | null = null;
  private testsDone = 0;
  private history: TrialResultWire[] = [];
  private currentTest: GameTestInfo | null = null;
  /** 지금 테스트의 조건 강도(1~3) — 엔진의 round 인자. 와이어에는 안 실린다 (P8) */
  private currentIntensity = 1;
  private engine: GameEngine | null = null;
  private testRuns = new Map<TrialGame, number>();
  private latestResult: TrialResultWire | null = null;
  private outcome: GameOutcome | null = null;
  private log: ChatLine[] = [];
  private tampers: Tamper[] = [];
  private lastClaimAt = new Map<string, number>();
  private claimInFlight = new Set<string>();
  private lastAccuseAt = new Map<string, number>();
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private talkTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  /** 봇의 자리와 지금 향하는 곳 — 토론 중 배회용. 가만히 선 몸은 그 자체로 표식이라 사람처럼 조금씩 움직인다 */
  private botPos = new Map<string, { x: number; z: number; tx: number; tz: number; hx: number; hz: number; restUntil: number }>();
  private botBusy = false;
  /** 토론이 아닌 국면에 도착한 봇의 한 마디 — 토론이 다시 열리면 내보낸다 */
  private heldLines: { id: string; text: string }[] = [];
  private freshResultTurns = 0;
  private finishing = false;

  private readonly now: () => number;
  private readonly rand: () => number;
  private readonly makeEngine: (game: TrialGame) => GameEngine | null;

  constructor(private readonly deps: GameDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.rand = deps.rand ?? Math.random;
    this.makeEngine = deps.makeEngine ?? ((game) => ENGINES[game]?.() ?? null);
  }

  /* ─────────────────────────────── RoomDO 가 부르는 것 ─────────────────────────────── */

  /** 판이 도는 중인가 — 이때는 trial_* 메시지가 /trial 의 TrialRuntime 이 아니라 여기로 온다 */
  active(): boolean {
    return this.phase !== 'lobby' && this.phase !== 'ended';
  }

  /** 결과 모달 동안은 전원 입력이 잠긴다 (§3) — RoomDO 가 채팅을 흘리기 전에 묻는다 */
  chatAllowed(): boolean {
    return this.phase !== 'result';
  }

  /** 입장 직후 — 지금 상태와 (앉아 있던 자리가 있으면) 배역을 그 사람에게만 보낸다 */
  async onJoin(playerId: string): Promise<void> {
    await this.restoreIfNeeded();
    const snap = this.deps.roster().find((p) => p.id === playerId);
    if (snap && this.active()) this.rebind(snap);
    if (this.phase === 'lobby') this.broadcastState();
    else this.deps.sendTo(playerId, { t: 'game_state', state: this.stateWire() });
    this.sendRole(playerId);
  }

  onLeave(playerId: string): void {
    if (!this.active()) {
      if (this.phase === 'lobby') this.broadcastState();
      return;
    }
    this.broadcastState();
    void this.maybeFinishTest();
  }

  /** room-do.ts 의 move — 시간제 테스트(낙하 생존)가 사람의 자리를 아는 길 */
  onMove(playerId: string, x: number, z: number, now: number): void {
    if (this.phase !== 'test' || !this.engine) return;
    const seat = this.seatOfPlayer(playerId);
    if (seat && !seat.isolated) this.engine.onMove(seat.id, x, z, now);
  }

  /**
   * 사람의 채팅 — 판이 도는 동안은 RoomDO 대신 **여기서** 내보낸다: id 와 이름을 좌석의 것으로 바꿔서.
   * 플레이어 id 가 와이어에 실리면 「어느 좌석 뒤에 실제 사람이 있나」가 읽히고, 그러면 남는 좌석이 곧 AI 다
   * (game-protocol.ts 머리말). 돌려주는 값은 「내가 처리했다」— false 면 RoomDO 가 예전처럼 흘린다.
   */
  onChat(playerId: string, text: string): boolean {
    if (!this.active()) return false;
    const seat = this.seatOfPlayer(playerId);
    if (!seat) return true; // 좌석이 없는 구경꾼 — 판에는 안 실린다
    if (this.phase === 'result') return true; // 모달 동안은 전원 입력이 잠긴다 (§3)
    this.say(seat.id, text);
    const target = this.accusationIn(text, seat.id);
    if (target) this.statement(seat.id, target);
    this.scheduleTalk();
    return true;
  }

  /** 플레이어 id → 좌석 id. RoomDO 가 판 중의 move 를 좌석 id 로 바꿔 내보내는 데 쓴다 (onChat 과 같은 이유) */
  seatIdOf(playerId: string): string | null {
    return this.bindings.get(playerId) ?? null;
  }

  /** 30초 청소 알람 — 타이머를 잃었어도 마감이 지난 국면을 민다 */
  async onSweep(now: number): Promise<void> {
    await this.restoreIfNeeded();
    if (!this.active()) return;
    if (this.phaseEndsAt !== null && now >= this.phaseEndsAt + 1_000) {
      this.clearPhaseTimer();
      await this.advance();
    }
    if (this.phase === 'test' && this.engine?.done((id) => this.waiting(id))) await this.finishTest();
  }

  async handle(playerId: string, msg: GameC2SMessage): Promise<void> {
    await this.restoreIfNeeded();
    switch (msg.t) {
      case 'game_start':
        await this.start(playerId, msg.fillTo);
        return;
      case 'game_sync':
        this.deps.sendTo(playerId, { t: 'game_state', state: this.stateWire() });
        this.sendRole(playerId);
        return;
      case 'game_accuse':
        this.accuse(playerId, msg.target);
        return;
      case 'game_withdraw':
        this.withdraw(playerId);
        return;
      case 'game_claim':
        await this.claim(playerId, msg.text);
        return;
      case 'game_tamper':
        this.tamper(playerId, msg.target, msg.direction);
        return;
      case 'game_pick':
        /* 색 사냥 — 엔진이 붙으면 여기서 넘긴다 (worker/src/trial/colorhunt). 지금은 흘린다 */
        return;
      default:
        return;
    }
  }

  /** 판이 도는 동안의 trial_* — 엔진으로 넘긴다 */
  async handleTrial(playerId: string, msg: TrialC2SMessage): Promise<void> {
    if (this.phase !== 'test' || !this.engine) return;
    const seat = this.seatOfPlayer(playerId);
    if (!seat || seat.isolated) return;
    switch (msg.t) {
      case 'trial_accel':
        this.engine.onAccel(seat.id);
        return;
      case 'trial_brake':
        this.engine.onBrake(seat.id);
        await this.maybeFinishTest();
        return;
      case 'trial_join':
        this.engine.join(seat.id);
        return;
      default:
        return;
    }
  }

  /* ─────────────────────────────── 시작 ─────────────────────────────── */

  private async start(playerId: string, fillTo?: number): Promise<void> {
    if (this.phase !== 'lobby') return this.reject(playerId, '이미 판이 열려 있다');
    const roster = this.deps.roster();
    const host = this.hostOf(roster);
    if (!host || host.id !== playerId) return this.reject(playerId, '방장만 시작할 수 있다');
    if (roster.length > GAME_MAX_HUMANS) return this.reject(playerId, `실제 플레이어는 ${GAME_MAX_HUMANS}명까지다`);

    // 실제 사람이 모자라면 대역이 채운다 (§9 "일부 참가자를 NPC 로 대체하는 폴백")
    const target = Math.max(roster.length, Math.min(GAME_MAX_HUMANS, Math.max(GAME_MIN_HUMANS, Math.round(fillTo ?? GAME_MIN_HUMANS))));
    const npcCount = target - roster.length;

    const personas = personaPool(this.rand);
    // 몸 — 사람은 입장 때 받은 몸 그대로, 대역·AI 는 남은 몸에서 뽑는다 (mp/bodies.ts). 겹치지 않게 쓴 몸을 적어 간다
    const usedBodies: (BodyId | undefined)[] = roster.map((p) => p.body);
    const humans: Seat[] = roster.map((p) => ({
      id: `seat-${p.id}`,
      name: '',
      seat: 0,
      kind: 'real' as const,
      role: 'human' as const,
      persona: null,
      isolated: false,
      tamperLeft: 0,
      lastSpokeAt: 0,
      body: p.body,
    }));
    for (let i = 0; i < npcCount; i += 1) {
      const body = pickBody(usedBodies, this.rand);
      usedBodies.push(body);
      humans.push({
        id: `npc-${i + 1}-${Math.floor(this.rand() * 1e6)}`,
        name: '',
        seat: 0,
        kind: 'npc',
        role: 'human',
        persona: personas[i % personas.length],
        isolated: false,
        tamperLeft: 0,
        lastSpokeAt: 0,
        body,
      });
    }
    const ai: Seat = {
      id: `ai-${Math.floor(this.rand() * 1e6)}`,
      name: '',
      seat: 0,
      kind: 'ai',
      role: 'ai',
      persona: personas[npcCount % personas.length],
      isolated: false,
      tamperLeft: 0,
      lastSpokeAt: 0,
      body: pickBody(usedBodies, this.rand),
    };

    const assignment = assignRoles(
      humans.map((s) => s.id),
      ai.id,
      this.rand,
    );
    for (const s of humans) {
      s.role = assignment.roles[s.id];
      if (s.role === 'designer') s.tamperLeft = 1;
    }

    // 좌석을 섞는다 — AI 와 설계자도 순열에 든다 (§1.1)
    this.seats = shuffled([...humans, ai], this.rand).map((s, i) => ({ ...s, seat: i + 1, name: `SUBJECT ${String(i + 1).padStart(2, '0')}` }));
    this.bindings = new Map();
    for (const p of roster) {
      this.bindings.set(p.id, `seat-${p.id}`);
      this.nicks.set(p.id, p.nickname);
    }

    this.botPos = new Map();
    for (const s of this.seats) {
      if (s.kind === 'real') continue;
      const spot = spawnFor(s.seat, this.seats.length);
      this.botPos.set(s.id, { x: spot.x, z: spot.z, tx: spot.x, tz: spot.z, hx: spot.x, hz: spot.z, restUntil: 0 });
    }
    this.book = new SuspicionBook(this.seats.map((s) => s.id));
    this.quota = quotaFor(this.seats.length);
    this.startedAt = this.now();
    this.testsDone = 0;
    this.history = [];
    this.testRuns = new Map();
    this.latestResult = null;
    this.outcome = null;
    this.log = [];
    this.tampers = [];
    this.heldLines = [];
    this.lastClaimAt = new Map();

    this.setPhase('briefing', this.now() + GAME_BRIEFING_MS);
    for (const p of roster) this.sendRole(p.id);
    this.capTimer = setTimeout(() => void this.hardCap(), GAME_HARD_CAP_MS);
    await this.persist();
  }

  private hostOf(roster: PlayerSnapshot[]): PlayerSnapshot | null {
    let best: PlayerSnapshot | null = null;
    for (const p of roster) if (!best || p.seat < best.seat) best = p;
    return best;
  }

  /* ─────────────────────────────── 국면 ─────────────────────────────── */

  private setPhase(phase: GamePhase, endsAt: number | null): void {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    this.clearPhaseTimer();
    if (endsAt !== null) {
      const delay = Math.max(0, endsAt - this.now());
      this.phaseTimer = setTimeout(() => void this.advance(), delay);
    }
    this.broadcastState();
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer !== null) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  /** 국면의 마감 — 다음 국면으로 */
  private async advance(): Promise<void> {
    switch (this.phase) {
      case 'briefing':
        this.leader(LINES.opening, 'announce');
        this.openDiscussion(GAME_FIRST_DISCUSSION_MS, true);
        return;
      case 'discussion':
        await this.openTest();
        return;
      case 'test':
        await this.finishTest();
        return;
      case 'result':
        this.openDiscussion(GAME_DISCUSSION_MS, false);
        return;
      default:
        return;
    }
  }

  private openDiscussion(ms: number, opening: boolean): void {
    this.setPhase('discussion', this.now() + ms);
    this.startIdle();
    // 다른 국면에 도착해 있던 봇의 말을 먼저 내보낸다 — 사람과 같은 스트림으로 (P10)
    for (const line of this.heldLines) this.say(line.id, line.text);
    this.heldLines = [];
    this.freshResultTurns = opening ? 0 : 2;
    this.scheduleTalk(opening ? 2_500 : 2_000);
    void this.persist();
  }

  /* ─────────────────────────────── 테스트 ─────────────────────────────── */

  private async openTest(): Promise<void> {
    if (this.phase !== 'discussion') return;
    const available = availableGames();
    if (!available.length) return this.openDiscussion(GAME_DISCUSSION_MS, false);

    // 토론을 막지 않게 먼저 국면을 옮긴다 — LLM 설계·전략 호출은 물리 루프 밖이다 (P6)
    this.clearPhaseTimer();
    this.phase = 'test';
    this.phaseEndsAt = null;
    this.stopTalk();
    this.stopIdle();

    const design = await designNext(this.deps.brain, {
      available,
      history: this.history.map((h) => ({ game: h.game, round: h.round })),
      facts: this.facts(),
      remainingMs: Math.max(0, this.startedAt + GAME_HARD_CAP_MS - this.now()),
    });
    if (this.phase !== 'test') return; // 그 사이 판이 끝났다
    const engine = this.makeEngine(design.game);
    if (!engine) return this.openDiscussion(GAME_DISCUSSION_MS, false);

    const alive = this.seats.filter((s) => !s.isolated);
    const realIds = alive.filter((s) => s.kind === 'real').map((s) => s.id);
    const botIds = alive.filter((s) => s.kind !== 'real').map((s) => s.id);
    const aiSeat = alive.find((s) => s.kind === 'ai');

    // AI 참가자의 전략 한 번 (§4.3) — 대역은 사람 분포에서 뽑는다
    const tuning: Record<string, SeatTuning> = {};
    for (const s of alive) if (s.kind === 'npc') tuning[s.id] = { precision: this.rand() * 0.35 };
    if (aiSeat?.persona) {
      const precision = await aiStrategy(this.deps.brain, {
        name: aiSeat.name,
        persona: aiSeat.persona,
        facts: this.facts(),
        game: design.game,
        mySuspicion: this.book.get(aiSeat.id),
      });
      tuning[aiSeat.id] = { precision };
    }
    if (this.phase !== 'test') return;

    const run = (this.testRuns.get(design.game) ?? 0) + 1;
    this.testRuns.set(design.game, run);
    const startAt = this.now();
    this.engine = engine;
    this.currentIntensity = design.intensity;
    this.currentTest = { game: design.game, round: run, startAt, durationMs: engine.durationMs, instruction: INSTRUCTION[design.game] };
    this.finishing = false;

    this.leader(LINES.testOpen(design.game, run, INSTRUCTION[design.game]), 'announce');
    this.deps.broadcast({ t: 'trial_round_start', game: design.game, round: run, startAt, durationMs: engine.durationMs });
    // 마감: 시간제는 엔진이 스스로 finish 를 부르고, 이벤트제는 상한에서 강제로 닫는다
    this.setPhase('test', startAt + (engine.durationMs ?? GAME_TEST_MAX_MS) + 1_500);
    engine.start(design.intensity, realIds, botIds, { broadcast: (m) => this.deps.broadcast(m), finish: () => void this.finishTest() }, tuning);
    void this.persist();
  }

  /** 아직 기다려야 하는 사람인가 — 살아 있는 좌석이고, 실제 사람이면 방에 붙어 있어야 한다 */
  private waiting(seatId: string): boolean {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat || seat.isolated) return false;
    if (seat.kind !== 'real') return true;
    return this.playerOfSeat(seat.id) !== null;
  }

  private async maybeFinishTest(): Promise<void> {
    if (this.phase !== 'test' || !this.engine) return;
    if (this.engine.done((id) => this.waiting(id))) await this.finishTest();
  }

  private async finishTest(): Promise<void> {
    if (this.phase !== 'test' || !this.engine || this.finishing) return;
    this.finishing = true;
    const engine = this.engine;
    const test = this.currentTest;
    engine.stop();
    this.engine = null;

    const raw = engine.results();
    const published = this.applyTampers(raw);
    const stats = groupStats(published);
    const wire: TrialResultWire = {
      game: engine.game,
      round: test?.round ?? 1,
      players: published,
      groupMean: stats.mean,
      groupStdDev: stats.stdDev,
      endedAt: this.now(),
    };
    // 원본(조작 전)과 조건값은 storage 에만 남는다 (P7 · P8)
    const original: TrialResult = { ...wire, players: raw, condition: engine.condition(this.currentIntensity) };
    await appendHistory(this.deps.storage, original);

    this.history.push(wire);
    this.latestResult = wire;
    this.testsDone += 1;
    this.currentTest = null;
    this.deps.broadcast({ t: 'trial_result', result: wire });
    this.setPhase('result', this.now() + GAME_RESULT_MODAL_MS);
    void this.persist();

    // 해설은 모달이 떠 있는 동안 도착한다 — 방송은 그대로 나간다 (토론에 불을 붙이는 첫 마디)
    void leaderComment(this.deps.brain, wire, (id) => this.nameOf(id)).then((text) => {
      if (this.phase !== 'ended') this.leader(text, 'readout');
    });
  }

  /**
   * 설계자의 조작을 공개본에 적용한다 (P7). 원본은 건드리지 않는다.
   *   suspicious  기계처럼 보이게 — 전환 직후 오차가 거의 없고, 적응 곡선이 평평하고, 오차 방향이 한쪽이다
   *   normal      사람처럼 보이게 — 무리 평균 근처로 당기고, 곡선이 내려가고, 방향이 섞인다
   */
  private applyTampers(raw: TrialPlayerResult[]): TrialPlayerResult[] {
    if (!this.tampers.length) return raw;
    const stats = groupStats(raw);
    const out = raw.map((p) => ({ ...p, metrics: { ...p.metrics }, errorDirection: [...p.errorDirection], adaptationCurve: [...p.adaptationCurve] }));
    const used: Tamper[] = [];
    for (const t of this.tampers) {
      const p = out.find((r) => r.id === t.target);
      if (!p) continue;
      used.push(t);
      const meanT = finite(stats.mean.transitionError, 1);
      if (t.direction === 'suspicious') {
        p.transitionError = Math.max(0.02, meanT * 0.12);
        p.adaptationCurve = p.adaptationCurve.map(() => Math.max(0.02, meanT * 0.1));
        p.errorDirection = p.errorDirection.map(() => 1);
        for (const k of Object.keys(p.metrics)) {
          const m = finite(stats.mean[k], 0);
          const sd = finite(stats.stdDev[k], Math.abs(m) * 0.3 + 0.1);
          const v = finite(p.metrics[k], m);
          const sign = v >= m ? 1 : -1;
          p.metrics[k] = k === 'transitionError' ? p.transitionError : m + sign * Math.max(Math.abs(v - m), 2 * sd + Math.abs(m) * 0.15);
        }
      } else {
        p.transitionError = meanT * (0.9 + this.rand() * 0.2);
        const n = Math.max(2, p.adaptationCurve.length);
        p.adaptationCurve = Array.from({ length: n }, (_, i) => meanT * (1.3 - (0.8 * i) / (n - 1)) * (0.9 + this.rand() * 0.2));
        p.errorDirection = p.errorDirection.map((_, i) => (i % 2 === 0 ? 1 : -1));
        for (const k of Object.keys(p.metrics)) {
          const m = finite(stats.mean[k], 0);
          const v = finite(p.metrics[k], m);
          p.metrics[k] = k === 'transitionError' ? p.transitionError : m + (v - m) * 0.2;
        }
      }
    }
    this.tampers = this.tampers.filter((t) => !used.includes(t));
    return out;
  }

  /* ─────────────────────────────── 의심도 · 격리 · 끝 ─────────────────────────────── */

  private accuse(playerId: string, targetId: string): void {
    if (this.phase === 'result' || !this.active()) return;
    const me = this.seatOfPlayer(playerId);
    if (!me || me.isolated) return;
    this.statement(me.id, targetId);
  }

  /**
   * 지목 **발언** 하나 — 단추든, 채팅에서 읽어 낸 것이든, 봇의 말이든 같은 문이다.
   * 같은 사람은 ACCUSE_GAP_MS 에 한 번만 — 연타는 발언이 아니다. 지목당한 봇은 곧 해명하러 나온다.
   */
  private statement(bySeatId: string, targetId: string): void {
    const now = this.now();
    if (now - (this.lastAccuseAt.get(bySeatId) ?? 0) < ACCUSE_GAP_MS) return;
    const deltas = this.book.accuse(bySeatId, targetId);
    if (!deltas.length) return;
    this.lastAccuseAt.set(bySeatId, now);
    this.applyDeltas(deltas);
    const target = this.seats.find((s) => s.id === targetId);
    if (target && target.kind !== 'real' && !target.isolated) this.scheduleTalk(BOT_DEFEND_MIN_MS + this.rand() * BOT_DEFEND_JITTER_MS);
  }

  /**
   * 채팅에서 지목을 읽어 낸다 (§1.2 "발언에서 특정 인물을 지목") — 좌석 번호("03" · "SUBJECT 03" · "3번")와
   * 의심의 말("AI" · "의심" · "수상" · "지목" · "너지")이 한 줄에 같이 있으면 그 좌석을 겨눈 발언으로 친다.
   * 단추를 안 눌러도 말로 몰면 눈금이 움직인다 — 단추는 그 말을 분명히 하는 손잡이일 뿐이다.
   */
  private accusationIn(text: string, bySeatId: string): string | null {
    if (!/AI|에이아이|의심|수상|지목|너지|너잖|아니야\?|맞지|같아|같은데|찍|몰/i.test(text)) return null;
    let best: { id: string; score: number } | null = null;
    for (const s of this.seats) {
      if (s.id === bySeatId || s.isolated) continue;
      const n = String(s.seat);
      const nn = n.padStart(2, '0');
      // 「SUBJECT 03」 > 「03」 > 「3」 — 맨 숫자는 회차·횟수와 헷갈리므로 가장 약하게 본다
      const score = new RegExp(`SUBJECT\\s*${nn}`, 'i').test(text)
        ? 3
        : new RegExp(`(?<![0-9])${nn}(?![0-9])`).test(text) && nn !== n
          ? 2
          : new RegExp(`(?<![0-9])${n}(?![0-9])`).test(text)
            ? 1
            : 0;
      if (score > (best?.score ?? 0)) best = { id: s.id, score };
    }
    return best?.id ?? null;
  }

  private withdraw(playerId: string): void {
    if (this.phase === 'result' || !this.active()) return;
    const me = this.seatOfPlayer(playerId);
    if (!me) return;
    this.applyDeltas(this.book.withdraw(me.id));
  }

  private applyDeltas(deltas: SuspicionDelta[]): void {
    if (!deltas.length) return;
    for (const d of deltas) {
      this.deps.broadcast({
        t: 'game_suspicion',
        suspicion: this.book.snapshot(),
        accusations: this.book.accusationsSnapshot(),
        delta: { target: d.target, amount: d.amount, by: d.by, why: d.why },
      });
    }
    this.checkIsolation();
    void this.persist();
  }

  private checkIsolation(): void {
    if (!this.active()) return;
    for (const id of this.book.overCut()) {
      const seat = this.seats.find((s) => s.id === id);
      if (!seat) continue;
      seat.isolated = true;
      const withdrawn = this.book.freeze(id);
      const text = LINES.isolated(seat.name, seat.role);
      this.deps.broadcast({ t: 'game_isolated', id, role: seat.role, text });
      this.leader(text, 'alarm');
      if (withdrawn.length)
        this.deps.broadcast({ t: 'game_suspicion', suspicion: this.book.snapshot(), accusations: this.book.accusationsSnapshot() });
    }
    const isolated = new Set(this.seats.filter((s) => s.isolated).map((s) => s.id));
    const outcome = outcomeFor(this.rolesMap(), isolated, this.quota, false);
    if (outcome) this.end(outcome);
    else this.broadcastState();
  }

  private async hardCap(): Promise<void> {
    if (!this.active()) return;
    const isolated = new Set(this.seats.filter((s) => s.isolated).map((s) => s.id));
    const outcome = outcomeFor(this.rolesMap(), isolated, this.quota, true);
    if (outcome) this.end(outcome);
  }

  private end(outcome: GameOutcome): void {
    this.outcome = outcome;
    this.engine?.stop();
    this.engine = null;
    this.currentTest = null;
    this.stopTalk();
    this.stopIdle();
    if (this.capTimer !== null) {
      clearTimeout(this.capTimer);
      this.capTimer = null;
    }
    this.setPhase('ended', null);
    this.leader(LINES.ended(outcome.winner, outcome.reason), outcome.winner === 'humans' ? 'readout' : 'alarm');
    this.deps.broadcast({ t: 'game_ended', outcome, roles: this.rolesMap() });
    void this.persist();
  }

  /* ─────────────────────────────── 주장 판정 · 조작 ─────────────────────────────── */

  private async claim(playerId: string, raw: string): Promise<void> {
    if (this.phase !== 'discussion') return this.reject(playerId, '주장은 토론 중에만 판정한다');
    const me = this.seatOfPlayer(playerId);
    if (!me || me.isolated) return;
    const text = String(raw ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CLAIM_MAX_LEN);
    if (!text) return;
    const now = this.now();
    if (this.claimInFlight.has(me.id) || now - (this.lastClaimAt.get(me.id) ?? 0) < CLAIM_GAP_MS)
      return this.reject(playerId, '앞의 주장을 아직 판정 중이다');
    this.lastClaimAt.set(me.id, now);
    this.claimInFlight.add(me.id);

    // 주장은 전원이 본다 — 사람 채팅과 같은 줄에 「주장」으로 표시된다
    this.deps.broadcast({ t: 'chat', id: me.id, nickname: me.name, text: `[주장] ${text}`, ts: now });
    this.pushLog(me.id, `(주장) ${text}`);

    try {
      const v = await judgeClaim(this.deps.brain, { by: me.id, claim: text, facts: this.facts(), results: this.history });
      if (!this.active() || me.isolated) return;
      const delta = this.book.judge(me.id, v.verdict);
      const line = LINES.verdict(me.name, v.verdict, v.reason);
      this.deps.broadcast({ t: 'game_verdict', by: me.id, verdict: v.verdict, text: line, delta: delta?.amount ?? 0 });
      this.leader(line, v.verdict === 'mismatch' ? 'alarm' : 'readout');
      if (delta) this.applyDeltas([delta]);
    } finally {
      this.claimInFlight.delete(me.id);
    }
  }

  private tamper(playerId: string, targetId: string, direction: 'suspicious' | 'normal'): void {
    if (!this.active() || this.phase === 'result') return;
    const me = this.seatOfPlayer(playerId);
    if (!me || me.role !== 'designer' || me.tamperLeft <= 0) return this.reject(playerId, '조작 권한이 없다');
    const target = this.seats.find((s) => s.id === targetId);
    if (!target || target.isolated) return this.reject(playerId, '살아 있는 좌석만 조작할 수 있다');
    if (direction !== 'suspicious' && direction !== 'normal') return;
    me.tamperLeft -= 1;
    this.tampers.push({ target: targetId, direction });
    this.deps.sendTo(playerId, { t: 'game_tamper_ok', left: me.tamperLeft });
    void this.persist();
  }

  /* ─────────────────────────────── 봇 발화 (AI 참가자 · 대역) ─────────────────────────────── */

  private scheduleTalk(delayMs?: number): void {
    if (this.phase !== 'discussion') return;
    const delay = delayMs ?? BOT_TALK_MIN_MS + this.rand() * BOT_TALK_JITTER_MS;
    // 이미 더 이른 차례가 잡혀 있으면 그대로 둔다 — 없거나 이번이 더 이르면 바꾼다
    if (this.talkTimer !== null) {
      if (delayMs === undefined) return;
      clearTimeout(this.talkTimer);
    }
    this.talkTimer = setTimeout(() => {
      this.talkTimer = null;
      void this.botTurn();
    }, delay);
  }

  private stopTalk(): void {
    if (this.talkTimer !== null) {
      clearTimeout(this.talkTimer);
      this.talkTimer = null;
    }
  }

  private async botTurn(): Promise<void> {
    if (this.phase !== 'discussion' || this.botBusy) {
      if (this.phase === 'discussion') this.scheduleTalk();
      return;
    }
    const bots = this.seats.filter((s) => s.kind !== 'real' && !s.isolated && s.persona);
    if (!bots.length) return;
    const now = this.now();
    // 지목당한 봇이 먼저, 오래 조용했던 봇이 다음 — 그 안에서 무작위
    const weight = (s: Seat) => (this.book.accusersOf(s.id).length ? 3 : 1) * (now - s.lastSpokeAt > 30_000 ? 1.6 : 1) * (0.5 + this.rand());
    const pick = [...bots].sort((a, b) => weight(b) - weight(a))[0];
    if (!pick?.persona) return;

    this.botBusy = true;
    try {
      const fresh = this.freshResultTurns > 0;
      if (fresh) this.freshResultTurns -= 1;
      const out = await sayAs(this.deps.brain, {
        self: { id: pick.id, name: pick.name, persona: pick.persona, role: pick.kind === 'ai' ? 'ai' : 'human' },
        facts: this.facts(),
        accusedBy: this.book.accusersOf(pick.id),
        freshResult: fresh,
        opening: this.testsDone === 0 && this.log.length < 3,
      });
      if (!out || !this.active() || pick.isolated) return;
      if (this.phase === 'discussion') {
        this.say(pick.id, out.text);
        if (out.withdraw) this.applyDeltas(this.book.withdraw(pick.id));
        const targetId = out.accuse ? this.seatByName(out.accuse)?.id : this.accusationIn(out.text, pick.id);
        if (targetId && targetId !== pick.id) this.statement(pick.id, targetId);
      } else {
        this.heldLines.push({ id: pick.id, text: out.text });
      }
    } finally {
      this.botBusy = false;
      this.scheduleTalk();
    }
  }

  /** 봇의 한 마디 — 사람 채팅과 **같은 메시지**로 나간다 (P10) */
  private say(seatId: string, text: string): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat) return;
    seat.lastSpokeAt = this.now();
    this.deps.broadcast({ t: 'chat', id: seat.id, nickname: seat.name, text, ts: this.now() });
    this.pushLog(seat.id, text);
  }

  /* ─────────────────────────────── 봇 배회 (토론 중) ─────────────────────────────── */

  /**
   * 토론 동안 봇은 제 자리 근처를 어슬렁거린다 — 낙하 생존 엔진과 같은 스냅샷(trial_snapshot, 물체 없음)으로 나가고
   * 화면은 그걸 사람의 이동과 같은 길(remotePlayers)로 그린다. 가만히 선 몸이 곧 「저건 사람이 아니다」가 되지 않게.
   */
  private startIdle(): void {
    this.stopIdle();
    this.idleTimer = setInterval(() => this.idleTick(), IDLE_TICK_MS);
  }

  private stopIdle(): void {
    if (this.idleTimer !== null) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private idleTick(): void {
    if (this.phase !== 'discussion' && this.phase !== 'briefing') return;
    const now = this.now();
    const step = (IDLE_SPEED * IDLE_TICK_MS) / 1000;
    const ai: { id: string; x: number; z: number }[] = [];
    for (const s of this.seats) {
      const p = this.botPos.get(s.id);
      if (!p || s.isolated) continue;
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d <= step) {
        p.x = p.tx;
        p.z = p.tz;
        if (now >= p.restUntil) {
          // 잠깐 서 있다가 집 근처의 새 점으로 — 사람마다 리듬이 다르게
          p.restUntil = now + 1_500 + this.rand() * 6_000;
          const a = this.rand() * Math.PI * 2;
          const r = this.rand() * IDLE_RADIUS;
          p.tx = p.hx + Math.cos(a) * r;
          p.tz = p.hz + Math.sin(a) * r;
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
      }
      ai.push({ id: s.id, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
    }
    if (ai.length) this.deps.broadcast({ t: 'trial_snapshot', at: now, objects: [], ai });
  }

  /* ─────────────────────────────── 공개 사실 · 유틸 ─────────────────────────────── */

  private facts(): RoomFacts {
    return {
      seats: this.seats.map((s) => this.publicSeat(s)),
      isolated: this.seats.filter((s) => s.isolated).map((s) => ({ name: s.name, role: s.role })),
      log: this.log.map((l) => `[${this.nameOf(l.id)}] ${l.text}`),
      suspicion: this.book.snapshot(),
      accusations: this.book.accusationsSnapshot(),
      latest: this.latestResult,
      nameOf: (id) => this.nameOf(id),
      testsDone: this.testsDone,
    };
  }

  private leader(text: string, kind: LeaderKind): void {
    this.deps.broadcast({ t: 'game_leader', text, kind, ts: this.now() });
  }

  private reject(playerId: string, why: string): void {
    this.deps.sendTo(playerId, { t: 'game_reject', why });
  }

  private pushLog(id: string, text: string): void {
    this.log.push({ id, text });
    if (this.log.length > LOG_KEEP) this.log = this.log.slice(-LOG_KEEP);
  }

  private nameOf(id: string): string {
    if (id === 'LEADER') return '관리 AI';
    return this.seats.find((s) => s.id === id)?.name ?? id;
  }

  private seatByName(name: string): Seat | null {
    const key = name.replace(/\s+/g, '').toUpperCase();
    return (
      this.seats.find((s) => s.name.replace(/\s+/g, '').toUpperCase() === key) ??
      this.seats.find((s) => key.endsWith(String(s.seat).padStart(2, '0')) || key === String(s.seat)) ??
      null
    );
  }

  private seatOfPlayer(playerId: string): Seat | null {
    const seatId = this.bindings.get(playerId);
    return seatId ? (this.seats.find((s) => s.id === seatId) ?? null) : null;
  }

  private playerOfSeat(seatId: string): string | null {
    const online = new Set(this.deps.roster().map((p) => p.id));
    for (const [pid, sid] of this.bindings) if (sid === seatId && online.has(pid)) return pid;
    return null;
  }

  /** 새로고침으로 id 가 바뀐 사람을 같은 닉네임의 빈 좌석에 다시 앉힌다 */
  private rebind(snap: PlayerSnapshot): void {
    if (this.bindings.has(snap.id)) return;
    const online = new Set(this.deps.roster().map((p) => p.id));
    for (const [pid, sid] of this.bindings) {
      if (online.has(pid)) continue;
      const seat = this.seats.find((s) => s.id === sid);
      if (seat?.kind === 'real' && sid === `seat-${pid}` && this.nickOf(pid) === snap.nickname) {
        this.bindings.set(snap.id, sid);
        return;
      }
    }
    // 이름이 같은 빈 좌석이 없으면 — 판 도중 처음 온 사람이다. 앉을 자리가 없다 (구경만 한다)
  }

  private nicks = new Map<string, string>();
  private nickOf(playerId: string): string | undefined {
    return this.nicks.get(playerId);
  }

  private publicSeat(s: Seat): GameSeat {
    return { id: s.id, name: s.name, seat: s.seat, isolated: s.isolated, ...(s.isolated ? { revealed: s.role } : {}), ...(s.body ? { body: s.body } : {}) };
  }

  private rolesMap(): Record<string, GameRole> {
    const out: Record<string, GameRole> = {};
    for (const s of this.seats) out[s.id] = s.role;
    return out;
  }

  private sendRole(playerId: string): void {
    const seat = this.seatOfPlayer(playerId);
    if (!seat || !this.active()) return;
    const aiId = seat.role === 'designer' ? this.seats.find((s) => s.role === 'ai')?.id : undefined;
    this.deps.sendTo(playerId, { t: 'game_role', seatId: seat.id, role: seat.role, ...(aiId ? { aiId } : {}), tamperLeft: seat.tamperLeft });
  }

  stateWire(): GameStateWire {
    const roster = this.deps.roster();
    for (const p of roster) this.nicks.set(p.id, p.nickname);
    return {
      phase: this.phase,
      seats: this.seats.map((s) => this.publicSeat(s)),
      suspicion: this.book.snapshot(),
      accusations: this.book.accusationsSnapshot(),
      phaseEndsAt: this.phaseEndsAt,
      testsDone: this.testsDone,
      currentTest: this.currentTest,
      latestResult: this.latestResult,
      quota: this.quota,
      hostId: this.hostOf(roster)?.id ?? null,
      minHumans: GAME_MIN_HUMANS,
      humansOnline: roster.length,
      outcome: this.outcome,
      startedAt: this.startedAt || null,
    };
  }

  private broadcastState(): void {
    this.deps.broadcast({ t: 'game_state', state: this.stateWire() });
  }

  /* ─────────────────────────────── 저장소 ─────────────────────────────── */

  private restored = false;

  private async persist(): Promise<void> {
    if (this.phase === 'lobby') return;
    try {
      await this.deps.storage.put(STATE_KEY, {
        phase: this.phase,
        seats: this.seats,
        bindings: [...this.bindings],
        nicks: [...this.nicks],
        suspicion: this.book.snapshot(),
        quota: this.quota,
        startedAt: this.startedAt,
        phaseEndsAt: this.phaseEndsAt,
        testsDone: this.testsDone,
        testRuns: [...this.testRuns],
        latestResult: this.latestResult,
        outcome: this.outcome,
        log: this.log,
        tampers: this.tampers,
      });
    } catch {
      /* 저장 실패는 판을 멈출 이유가 못 된다 */
    }
  }

  /**
   * DO 가 잠들었다 깨어났다 — 메모리는 lobby 인데 storage 에 판이 남아 있으면 되살린다.
   * 지목의 가중치는 잃는다 (표는 비워진다) — 의심도 값 · 좌석 · 배역은 그대로다.
   */
  private async restoreIfNeeded(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    if (this.phase !== 'lobby') return;
    let saved: Record<string, unknown> | undefined;
    try {
      saved = await this.deps.storage.get<Record<string, unknown>>(STATE_KEY);
    } catch {
      return;
    }
    if (!saved || saved.phase === 'lobby' || saved.phase === 'ended') return;
    const seats = saved.seats as Seat[];
    if (!Array.isArray(seats) || !seats.length) return;
    this.seats = seats;
    this.bindings = new Map(saved.bindings as [string, string][]);
    this.nicks = new Map((saved.nicks as [string, string][]) ?? []);
    this.book = new SuspicionBook(seats.map((s) => s.id));
    const sus = (saved.suspicion as Record<string, number>) ?? {};
    for (const s of seats) {
      // 값만 되살린다 — SuspicionBook 은 순수 클래스라 시작값 주입 대신 판정으로 채운다
      let v = sus[s.id] ?? 0;
      while (v >= 10) {
        this.book.judge(s.id, 'mismatch');
        v -= 10;
      }
      if (s.isolated) this.book.freeze(s.id);
    }
    this.quota = Number(saved.quota) || quotaFor(seats.length);
    this.startedAt = Number(saved.startedAt) || this.now();
    this.testsDone = Number(saved.testsDone) || 0;
    this.testRuns = new Map((saved.testRuns as [TrialGame, number][]) ?? []);
    this.latestResult = (saved.latestResult as TrialResultWire | null) ?? null;
    this.log = (saved.log as ChatLine[]) ?? [];
    this.tampers = (saved.tampers as Tamper[]) ?? [];
    this.history = (await readHistory(this.deps.storage)).map(({ condition: _c, ...w }) => w);
    // 테스트 도중이었으면 엔진도 잃었다 — 토론으로 되돌린다. 결과 모달 중이었으면 토론으로 간다
    const remaining = Math.max(0, this.startedAt + GAME_HARD_CAP_MS - this.now());
    this.capTimer = setTimeout(() => void this.hardCap(), remaining);
    this.openDiscussion(GAME_DISCUSSION_MS, false);
  }
}

function finite(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
