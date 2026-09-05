/**
 * 「인간인 척」 한 판 — 방(RoomDO) 하나에 하나. PLANNING.md 의 게임 루프 전부가 여기 있다:
 *
 *   lobby → (방장 시작) → briefing → discussion ⇄ test → result → discussion … → ended
 *
 *   차례표는 **고정**이다 (2026-09-05 사용자, game-protocol 의 GAME_TEST_ORDER · GAME_TEST_MS):
 *     입장 → 대화 40초 → ① 낙하 생존 30초 → 대화 40초 → ② 발판 30초 → 대화 40초 → ③ 원판 30초 → 대화 40초 → 끝
 *   그 사이 언제든 의심도가 100 에 닿은 좌석은 그 자리에서 격리되고(무대 위 처형자가 쏜다), 격리 수가
 *   목표(총원의 절반, roles.quotaFor)에 닿으면 차례표가 남아 있어도 판은 거기서 끝난다.
 *
 *   · 좌석: 실제 사람 + 대역(모자란 만큼, §9 폴백) + AI 1 — 판이 열릴 때 섞여 SUBJECT nn 이 된다 (§1.1)
 *   · 배역: roles.ts. 설계자에게만 AI 의 좌석이 통보된다
 *   · 테스트: 차례표가 종류를 정하고 worker/src/trial 의 엔진이 돈다 (engines.ts). 강도는 몇 번째 시험인가로 오른다
 *   · 의심도: suspicion.ts — **관리 AI 의 말 읽기**(readRoom) · 말 속의 지목 · 동조 · 몰이 · 철회 · 주장 판정.
 *     테스트 수치는 절대 자동 반영되지 않는다 (P1)
 *   · 격리: 100 에 닿는 순간, 정체 공개. 격리 수가 총원 절반이면 끝 (§1.3)
 *   · 관리 AI: 소집 · 테스트 개시 · 결과 해설 · 주장 판정 방송 · **오간 말 읽기** (§4)
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
  GAME_ENDED_MS,
  GAME_FIRST_DISCUSSION_MS,
  GAME_HARD_CAP_MS,
  GAME_MAX_HUMANS,
  GAME_MIN_HUMANS,
  GAME_PROLOGUE_MAX_MS,
  GAME_RESULT_MODAL_MS,
  GAME_TEST_MS,
  GAME_TEST_ORDER,
  READ_EVERY_MS,
  READ_MAX_LINES,
  READ_MIN_LINES,
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
import { LINES, aiStrategy, judgeClaim, leaderComment, personaPool, readTalk, sayAs, type RoomFacts } from './agents';
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
/** 판에 묶인 실제 사람이 전원 나가고 이만큼(ms) 지나면 버려진 판으로 보고 접는다 — 새로고침 유예 */
const ABANDONED_AFTER_MS = 90_000;
/** 봇 발화 간격(ms) — 사람 채팅과 같은 지터 (P10) */
const BOT_TALK_MIN_MS = 3_500;
const BOT_TALK_JITTER_MS = 6_500;
/**
 * 동시에 말을 짓고 있을 수 있는 봇의 수.
 *
 * 예전엔 `botBusy` 가 **방 전체에 하나**여서, 한 봇이 LLM 을 기다리는 동안 방의 누구도 말할 수 없었다.
 * 다음 차례도 그 기다림이 끝나야 잡혔으니 한 줄에 「간격 + LLM 왕복」이 통째로 들었고, 40초짜리 토론
 * 하나에 방 전체가 **두세 줄**이었다. 의심도의 모든 문(말 읽기의 「새 발언 ≥2」 · 지목 · 몰이)이 발화 수에
 * 매여 있으니, 이 직렬화 하나가 눈금 세 채널을 동시에 굶기고 있었다 (2026-09-05 사용자: "의심도 올라가는거").
 *
 * 이제 잠금은 **좌석마다**다 (같은 봇이 겹쳐 말하지 않게) — 그리고 다음 차례는 LLM 을 기다리지 않고 먼저 잡는다.
 */
const BOT_TALK_CONCURRENCY = 2;
/**
 * 토론이 닫히기 이만큼 전에 남은 말을 **마지막으로 한 번** 읽는다.
 * openDiscussion 이 unread 를 비우므로(시험을 건너온 말은 지난 장면이다), 이 한 번이 없으면 토론 막판에
 * 친 말은 통째로 버려진다 — 사람이 "말했는데 아무 반응이 없다"고 느끼던 자리다.
 * 국면이 바뀌기 전에 끝나야 관리 AI 의 방송이 시험 개시 방송을 덮지 않는다.
 */
const READ_FLUSH_BEFORE_MS = 8_000;
/** 지목당한 봇이 해명하러 나오는 지연(ms) */
const BOT_DEFEND_MIN_MS = 1_500;
const BOT_DEFEND_JITTER_MS = 3_000;
/** 주장 판정 사이의 최소 간격(ms) — 한 사람이 판정기를 연타하지 못하게 */
const CLAIM_GAP_MS = 12_000;
/** 같은 사람의 지목 발언 사이의 최소 간격(ms) — 단추 연타로 눈금을 미는 것은 발언이 아니다 */
const ACCUSE_GAP_MS = 5_000;
/** 말에서 좌석을 읽어 낼 때 필요한 최소 점수 — 맨 숫자(1)는 회차·등수·초와 못 가른다 (accusationIn) */
const ACCUSE_MIN_SCORE = 2;
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
  /** 관리 AI 가 아직 안 읽은 발언들 — 몇 마디 쌓이면 한 장면으로 읽는다 (readRoom) */
  private unread: { name: string; text: string }[] = [];
  private lastReadAt = 0;
  private readBusy = false;
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private talkTimer: ReturnType<typeof setTimeout> | null = null;
  /** 토론이 닫히기 전 마지막 읽기 (READ_FLUSH_BEFORE_MS) */
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  /** 봇의 자리와 지금 향하는 곳 — 토론 중 배회용. 가만히 선 몸은 그 자체로 표식이라 사람처럼 조금씩 움직인다 */
  private botPos = new Map<string, { x: number; z: number; tx: number; tz: number; hx: number; hz: number; restUntil: number }>();
  /** 지금 말을 짓고 있는 좌석들 — 방 전체가 아니라 **좌석마다**의 잠금이다 (BOT_TALK_CONCURRENCY) */
  private botBusy = new Set<string>();
  /** 토론이 아닌 국면에 도착한 봇의 한 마디 — 토론이 다시 열리면 내보낸다 */
  private heldLines: { id: string; text: string }[] = [];
  /**
   * 화면의 프롤로그 방송이 끝나기를 기다리는 중인가 — 값은 **걷힌 뒤 셀 토론 길이(ms)**, null 이면 안 기다린다.
   *
   * 첫 토론이 열리는 순간 화면에서 검문소 대본이 흐른다 (features/interrogation/prologue.ts). 그 동안
   * 채팅 판은 내려가 있어서 사람은 말할 수 없는데, 대역과 AI 참가자는 그것을 모른 채 떠들었다
   * (2026-09-05 사용자: 「프롤로그가 끝나기 전까지는 AI 참가자가 대화 못 치게」). 자막 아래로 남의 말이
   * 쌓이다가 방송이 걷히는 순간 한꺼번에 쏟아졌고, 관리 AI 는 그 말들을 읽어 아무도 못 본 판정을 내렸다.
   *
   * 서버가 대본의 길이를 셀 수는 없다 — 줄마다 그 자리에서 합성한 목소리에 자막을 맞추므로(prologueVoice)
   * 판마다 다르다. 그래서 **화면이 끝났다고 알려 준다**(game_prologue_done). 붙어 있는 사람이 전부
   * 알려 오면 걷고, 아무도 안 알려 와도 상한(GAME_PROLOGUE_MAX_MS)에서 걷는다 — 마감은 그 상한이라
   * 타이머를 잃어도 청소 알람(onSweep)이 같은 자리로 민다.
   */
  private prologueHold: number | null = null;
  /** 방송을 다 봤다고 알려 온 좌석 — 나간 사람은 안 기다린다 (releasePrologue) */
  private prologueSeen = new Set<string>();
  private freshResultTurns = 0;
  private finishing = false;
  /** 판이 끝난 시각 — GAME_ENDED_MS 뒤 로비 복귀의 기준 (타이머를 잃어도 onSweep 이 민다) */
  private endedAtMs: number | null = null;
  /** 판에 묶인 사람이 전원 나간 것을 처음 본 시각 — ABANDONED_AFTER_MS 지나면 판을 접는다 */
  private abandonedSince: number | null = null;

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
    // 방송을 기다리던 마지막 한 사람이 나갔을 수도 있다 — 없는 사람을 기다려 판이 멎으면 안 된다
    this.releasePrologue();
    void this.maybeFinishTest();
  }

  /** room-do.ts 의 move — 시간제 테스트(낙하 생존)가 사람의 자리를 아는 길 */
  onMove(playerId: string, x: number, z: number, now: number, y = 0): void {
    if (this.phase !== 'test' || !this.engine) return;
    const seat = this.seatOfPlayer(playerId);
    if (seat && !seat.isolated) this.engine.onMove(seat.id, x, z, now, y);
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

  /** 30초 청소 알람 — 타이머를 잃었어도 마감이 지난 국면을 민다. 죽은 판(끝 화면 · 버려진 판)도 여기서 접는다 */
  async onSweep(now: number): Promise<void> {
    await this.restoreIfNeeded();
    // 승패 화면이 오래 남았다 — 로비로 (endGame 의 타이머를 잃었을 때의 안전망)
    if (this.phase === 'ended') {
      if (this.endedAtMs !== null && now - this.endedAtMs >= GAME_ENDED_MS) await this.resetToLobby();
      return;
    }
    if (!this.active()) return;
    // 판에 묶인 실제 사람이 전원 나가고 한참이다 — 버려진 판이 방을 영영 잡고 있으면 안 된다
    if (this.hasBoundHuman()) this.abandonedSince = null;
    else if (this.abandonedSince === null) this.abandonedSince = now;
    else if (now - this.abandonedSince >= ABANDONED_AFTER_MS) return void (await this.resetToLobby());
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
      case 'game_prologue_done':
        this.prologueDone(playerId);
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
      case 'trial_pick':
        // 색 사냥 — 줍기. 거리·쿨다운·정오는 엔진이 본다 (worker/src/trial/colorhunt/engine.ts)
        this.engine.onPick(seat.id, msg.objectId);
        return;
      case 'trial_walk':
        // 회전 원판 — 걷기 명령 (worker/src/trial/disc/engine.ts)
        this.engine.onWalk?.(seat.id, msg.x, msg.z, this.now());
        return;
      case 'trial_jump':
        // 낙하 생존 — 몸의 높이는 서버가 그 구간의 숨은 중력으로 적분한다 (worker/src/trial/fall/engine.ts)
        this.engine.onJump?.(seat.id, this.now());
        return;
      default:
        return;
    }
  }

  /* ─────────────────────────────── 시작 ─────────────────────────────── */

  private async start(playerId: string, fillTo?: number): Promise<void> {
    const roster = this.deps.roster();
    const host = this.hostOf(roster);
    if (!host || host.id !== playerId) return this.reject(playerId, '방장만 시작할 수 있다');
    // 끝 화면이 아직 서 있어도 새 판은 열 수 있다 — 방장의 시작이 곧 「다시 하기」다
    if (this.phase === 'ended') await this.resetToLobby();
    if (this.active()) {
      // 판에 묶였던 사람이 전원 나간 「버려진 판」이면 접고 새로 연다 — 방이 죽은 판에 잡혀 있으면 안 된다
      if (this.hasBoundHuman()) return this.reject(playerId, '이미 판이 열려 있다');
      await this.resetToLobby();
    }
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
        /*
         * 판을 여는 말은 **프롤로그가 맡는다** — 여기서 방송을 내보내지 않는다
         * (2026-09-05 사용자: 「프롤로그 나올 때 방송이랑 겹친다」).
         *
         * 첫 토론이 열리는 순간 화면에서 검문소 프롤로그가 흐르고(features/interrogation/prologue.ts),
         * 그 대본의 정부 통제실이 이미 같은 말을 한다 — 「식별 표지가 없는 휴머노이드가 여러분 사이에 숨어 있습니다」.
         * 그런데 둘은 관로가 다르다: 프롤로그는 제 채널(prologueVoice), 방송은 큐(ttsSlice→TtsPlayer)라 서로를 모른다.
         * 여기서 쏘면 openDiscussion 의 상태 방송과 **같은 틱**에 나가고, 서버 방송은 ts 가 붙어 경보 대접으로
         * 큐 앞에 끼어들어(ttsSlice) 곧바로 재생된다 — 같은 관리 AI 목소리가 같은 시설 음색으로 같은 말을 겹쳐 냈다.
         */
        this.openDiscussion(GAME_FIRST_DISCUSSION_MS, true);
        return;
      case 'discussion':
        // 아직 프롤로그를 기다리는 중이었다 — 그 마감은 상한이었으니 여기서 걷는다. 토론 40초는 그때부터다
        if (this.prologueHold !== null) return this.endPrologue();
        // 차례표를 다 돌았다 — 마지막 대화까지 끝났으니 여기서 닫는다 (아직 AI 를 못 찾았으면 AI 의 승리)
        if (this.testsDone >= schedule().length) return void (await this.hardCap());
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
    /*
     * 첫 토론은 **화면의 프롤로그 방송을 기다린다** (prologueHold 머리말) — 그 동안 마감은 기다림의
     * 상한이고, 걷히고 나서야 토론 ms 를 센다. 나머지 토론은 예전 그대로 곧장 마감을 잡는다.
     */
    this.prologueHold = opening ? ms : null;
    this.prologueSeen.clear();
    this.setPhase('discussion', this.now() + (opening ? GAME_PROLOGUE_MAX_MS : ms));
    this.startIdle();
    // 지난 토론에서 남은 말은 안 읽는다 — 시험을 사이에 두고 온 말은 이미 지난 장면이다 (readRoom)
    this.unread = [];
    // 다른 국면에 도착해 있던 봇의 말을 먼저 내보낸다 — 사람과 같은 스트림으로 (P10)
    for (const line of this.heldLines) this.say(line.id, line.text);
    this.heldLines = [];
    this.freshResultTurns = opening ? 0 : 2;
    /*
     * 마지막 읽기의 시계는 **토론이 실제로 열리는 때**부터다. 첫 토론은 프롤로그 방송을 기다리므로
     * (prologueHold) 여기서 걸면 방송 보는 동안 시간이 흘러 버린다 — 그쪽은 endPrologue 가 건다.
     */
    // 기다릴 사람이 아무도 안 붙어 있으면 그 자리에서 걷는다 (봇만 남은 판)
    if (opening) this.releasePrologue();
    else {
      this.scheduleTalk(2_000);
      this.armReadFlush(ms);
    }
    void this.persist();
  }

  /**
   * 토론이 닫히기 READ_FLUSH_BEFORE_MS 전에 남은 말을 마지막으로 한 번 읽게 잡는다.
   * 국면이 바뀌기 전에 끝나야 관리 AI 의 방송이 시험 개시 방송을 안 덮는다.
   */
  private armReadFlush(ms: number): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(
      () => {
        this.flushTimer = null;
        void this.readRoom(true);
      },
      Math.max(0, ms - READ_FLUSH_BEFORE_MS),
    );
  }

  /* ─────────────────────────────── 프롤로그 방송 (화면) ─────────────────────────────── */

  /** 화면이 「방송이 끝났다」고 알려 왔다 (game_prologue_done) — 좌석 없는 구경꾼의 말은 안 센다 */
  private prologueDone(playerId: string): void {
    if (this.prologueHold === null) return;
    const seatId = this.bindings.get(playerId);
    if (seatId === undefined) return;
    this.prologueSeen.add(seatId);
    this.releasePrologue();
  }

  /** 지금 붙어 있는 사람이 전부 방송을 다 봤으면 걷는다 — 나간 사람은 안 기다린다 */
  private releasePrologue(): void {
    if (this.prologueHold === null) return;
    const waiting = this.deps.roster().some((p) => {
      const seatId = this.bindings.get(p.id);
      return seatId !== undefined && !this.prologueSeen.has(seatId);
    });
    if (!waiting) this.endPrologue();
  }

  /** 방송이 걷혔다 — 이제야 토론이 열린다: 마감을 다시 잡고 봇의 첫 차례를 연다 */
  private endPrologue(): void {
    const ms = this.prologueHold;
    if (ms === null || this.phase !== 'discussion') return;
    this.prologueHold = null;
    this.prologueSeen.clear();
    this.setPhase('discussion', this.now() + ms);
    this.scheduleTalk(2_500);
    // 마지막 읽기는 **여기서** 잡는다 — 첫 토론의 ms 는 방송이 걷힌 지금부터 흐른다 (openDiscussion 머리말)
    this.armReadFlush(ms);
    void this.persist();
  }

  /* ─────────────────────────────── 테스트 ─────────────────────────────── */

  private async openTest(): Promise<void> {
    if (this.phase !== 'discussion') return;
    const order = schedule();
    const step = this.testsDone + 1;
    const game = order[this.testsDone];
    if (!game) return void (await this.hardCap());

    // 토론을 막지 않게 먼저 국면을 옮긴다 — LLM 전략 호출은 물리 루프 밖이다 (P6)
    this.clearPhaseTimer();
    this.phase = 'test';
    this.phaseEndsAt = null;
    this.stopTalk();
    this.stopIdle();

    const engine = this.makeEngine(game);
    if (!engine) return this.openDiscussion(GAME_DISCUSSION_MS, false);
    /**
     * 강도는 몇 번째 시험인가로 오른다 (1 → 2 → 3). 종류마다 한 번씩만 열리니 「같은 종류의 첫 실행은
     * 기준 조건」(§3)이 지키려던 것 — 견줄 바탕 — 은 이 판에서 **무리 안의 편차**가 대신한다:
     * 전원이 같은 조건에서 같은 30초를 겪고, 결과 모달은 무리 평균과의 거리를 보여 준다.
     */
    const intensity = Math.min(3, step) as 1 | 2 | 3;

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
        game,
        mySuspicion: this.book.get(aiSeat.id),
      });
      tuning[aiSeat.id] = { precision };
    }
    if (this.phase !== 'test') return;

    const run = (this.testRuns.get(game) ?? 0) + 1;
    this.testRuns.set(game, run);
    const startAt = this.now();
    this.engine = engine;
    this.currentIntensity = intensity;
    this.currentTest = { game, round: run, startAt, durationMs: GAME_TEST_MS, instruction: INSTRUCTION[game] };
    this.finishing = false;

    this.leader(LINES.testOpen(game, run, INSTRUCTION[game], step, order.length), 'announce');
    // pace — 움직이는 플랫폼의 발판 배속(공개, mp/platform.ts). 다른 엔진은 안 싣는다
    const pace = engine.paceFor?.(intensity);
    this.deps.broadcast({ t: 'trial_round_start', game, round: run, startAt, durationMs: GAME_TEST_MS, ...(pace === undefined ? {} : { pace }) });
    /**
     * 마감은 **판이 쥔다** — 30초. 엔진이 제 길이(/trial 의 1분)에 스스로 finish 를 부르기 전에 여기서 닫고,
     * finishTest 가 engine.stop() 으로 타이머를 걷는다. 이벤트제(정지선)도 같은 30초에 닫힌다.
     */
    this.setPhase('test', startAt + GAME_TEST_MS);
    engine.start(
      intensity,
      realIds,
      botIds,
      { broadcast: (m) => this.deps.broadcast(m), finish: () => void this.finishTest(), bodyOf: (id) => this.seats.find((s) => s.id === id)?.body },
      tuning,
    );
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
   * 죄목의 말("AI" · "의심" · "수상" · "지목" · "너지")이 한 줄에 같이 있으면 그 좌석을 겨눈 발언으로 친다.
   * 단추는 없다 — 말로 몰면 눈금이 움직인다.
   *
   * 세 군데가 새고 있었다 (2026-09-05):
   *   · **죄목 낱말이 일상어를 잡았다.** 「몰」은 **"몰라"** 를, 「같아」·「찍」은 채팅의 절반을 잡는다.
   *     "3번 결과 몰라" 가 SUBJECT 03 지목 +8 이었다. 그 조각들을 뺐다.
   *   · **맨 숫자가 좌석이 됐다.** 「3회차」·「3등」·「3초」가 전부 SUBJECT 03 이었다. 주석은 "가장 약하게
   *     본다"고 했지만 **약해도 유일하면 이겼다** — 문턱이 없었다. 이제 맨 숫자는 혼자서는 지목이 아니고
   *     (점수 1 < MIN), 「3번」·「03」·「SUBJECT 03」만 좌석을 부른 것으로 친다.
   *   · **부정을 안 봤다.** "3번은 AI 아닌 것 같아" 가 +8 이었다 — 감싸 주면 눈금이 올랐다.
   *     번호 뒤를 짧게 훑어 부정이 걸리면 접는다. 다만 "너 AI 아니야?" 같은 되묻기는 지목이 맞다.
   *
   * 애먼 사람을 격리하면 AI 가 이긴다 (roles.outcomeFor) — 그래서 애매하면 **안 잡는 쪽**으로 기운다.
   */
  private accusationIn(text: string, bySeatId: string): string | null {
    if (!/AI|에이아이|의심|수상|지목|범인|너지|너잖|쟤야|걔야|아니야\s*\?|아냐\s*\?/i.test(text)) return null;
    let best: { id: string; num: string; score: number } | null = null;
    for (const s of this.seats) {
      if (s.id === bySeatId || s.isolated) continue;
      const n = String(s.seat);
      const nn = n.padStart(2, '0');
      const alone = (t: string) => new RegExp(`(?<![0-9])${t}(?![0-9])`).test(text);
      // 「SUBJECT 03」·「03」 > 「3번」 > 맨 숫자. 자릿수를 맞춰 부르는 것은 좌석 번호밖에 없다
      const score = new RegExp(`SUBJECT\\s*0*${n}(?![0-9])`, 'i').test(text) || alone(nn)
        ? 3
        : new RegExp(`(?<![0-9])${n}\\s*번`).test(text)
          ? 2
          : alone(n)
            ? 1
            : 0;
      if (score > (best?.score ?? 0)) best = { id: s.id, num: n, score };
    }
    if (!best || best.score < ACCUSE_MIN_SCORE) return null;
    // 번호를 부른 자리부터 짧게 — "3번은 AI 아닌 것 같아" 는 지목이 아니고, "3번 너 AI 아니야?" 는 지목이다
    const at = text.search(new RegExp(`(?<![0-9])0*${best.num}(?![0-9])`, 'i'));
    const tail = at >= 0 ? text.slice(at, at + 24) : text;
    if (/(아니|아닌|아냐|아님|말고|빼고)/.test(tail) && !/(아니야|아냐|아닌가|아닙니까)\s*[?？]/.test(tail)) return null;
    return best.id;
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
    // 끝 화면이 잠시 선 뒤 로비로 — 같은 방에서 새 판을 열 수 있어야 한다. DO 가 잠들어 타이머를 잃으면 onSweep 이 민다
    this.endedAtMs = this.now();
    this.phaseTimer = setTimeout(() => void this.resetToLobby(), GAME_ENDED_MS);
    void this.persist();
  }

  /** 판에 묶인 실제 사람이 지금 방에 하나라도 붙어 있나 — 아무도 없으면 그 판은 버려진 것이다 */
  private hasBoundHuman(): boolean {
    const online = new Set(this.deps.roster().map((p) => p.id));
    for (const [pid, sid] of this.bindings) {
      if (!online.has(pid)) continue;
      if (this.seats.some((s) => s.id === sid && s.kind === 'real')) return true;
    }
    return false;
  }

  /**
   * 판을 접고 로비로 — 승패 화면이 다 섰거나(GAME_ENDED_MS), 판에 묶인 사람이 전원 나가 버려졌을 때.
   * 저장된 판도 지운다 — 남겨 두면 persist() 가 lobby 를 안 쓰므로(아래) DO 가 잠들었다 깨며 죽은 판이 되살아난다.
   */
  private async resetToLobby(): Promise<void> {
    this.engine?.stop();
    this.engine = null;
    this.currentTest = null;
    this.stopTalk();
    this.stopIdle();
    this.clearPhaseTimer();
    if (this.capTimer !== null) {
      clearTimeout(this.capTimer);
      this.capTimer = null;
    }
    this.phase = 'lobby';
    this.phaseEndsAt = null;
    this.prologueHold = null;
    this.prologueSeen.clear();
    this.seats = [];
    this.bindings = new Map();
    this.outcome = null;
    this.latestResult = null;
    this.endedAtMs = null;
    this.abandonedSince = null;
    try {
      await this.deps.storage.delete(STATE_KEY);
    } catch {
      /* 지우기 실패해도 판은 이미 로비다 — 다음 persist 가 덮는다 */
    }
    this.broadcastState();
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
    // 프롤로그 방송이 흐르는 동안은 아무 차례도 안 잡는다 — 판을 여는 말은 대본의 것이다 (prologueHold)
    if (this.phase !== 'discussion' || this.prologueHold !== null) return;
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
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private async botTurn(): Promise<void> {
    if (this.phase !== 'discussion') return;
    // 다음 차례를 **먼저** 잡는다 — LLM 왕복이 끝나야 잡으면 방의 박자가 모델 지연에 매인다 (BOT_TALK_CONCURRENCY)
    this.scheduleTalk();
    if (this.botBusy.size >= BOT_TALK_CONCURRENCY) return;
    const bots = this.seats.filter((s) => s.kind !== 'real' && !s.isolated && s.persona && !this.botBusy.has(s.id));
    if (!bots.length) return;
    const now = this.now();
    // 지목당한 봇이 먼저, 오래 조용했던 봇이 다음 — 그 안에서 무작위
    const weight = (s: Seat) => (this.book.accusersOf(s.id).length ? 3 : 1) * (now - s.lastSpokeAt > 30_000 ? 1.6 : 1) * (0.5 + this.rand());
    const pick = [...bots].sort((a, b) => weight(b) - weight(a))[0];
    if (!pick?.persona) return;

    this.botBusy.add(pick.id);
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
      this.botBusy.delete(pick.id);
    }
  }

  /** 봇의 한 마디 — 사람 채팅과 **같은 메시지**로 나간다 (P10) */
  private say(seatId: string, text: string): void {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat) return;
    seat.lastSpokeAt = this.now();
    this.deps.broadcast({ t: 'chat', id: seat.id, nickname: seat.name, text, ts: this.now() });
    this.pushLog(seat.id, text);
    // 사람의 말이든 봇의 말이든 같은 문으로 들어간다 — 관리 AI 는 누가 사람인지 모른다 (P5)
    this.unread.push({ name: seat.name, text });
    if (this.unread.length > READ_MAX_LINES) this.unread = this.unread.slice(-READ_MAX_LINES);
    void this.readRoom();
  }

  /* ─────────────────────────────── 관리 AI 의 말 읽기 ─────────────────────────────── */

  /**
   * 관리 AI 가 방의 말을 읽고 눈금을 움직인다 (2026-09-05 사용자: "AI 가 사람들이 하는 말을 보고 의심도를 올려").
   * 좌석판의 지목 단추가 사라진 뒤로 **이것이 눈금의 주된 문**이다 — 말 속의 지목(accusationIn)은 그대로 남아 있다.
   *
   * 말이 이 판을 민다 — say 가 부른다. 그래서 토론이 조용하면 관리 AI 도 조용하다.
   * 문턱 셋: 토론 중일 것 · 새 발언이 READ_MIN_LINES 이상 · 앞의 읽기에서 READ_EVERY_MS 지났을 것.
   * 값의 상한은 SuspicionBook.read 가 지키고, LLM 이 없으면 아무 일도 안 일어난다 (§9 폴백).
   *
   * `closing` 은 **토론이 닫히기 직전의 마지막 한 번**이다 (openDiscussion 의 flushTimer). 그때는 간격도
   * 최소 줄 수도 안 본다 — 안 그러면 막판에 친 말이 통째로 버려진다 (READ_FLUSH_BEFORE_MS 머리말).
   */
  private async readRoom(closing = false): Promise<void> {
    if (this.phase !== 'discussion' || this.readBusy) return;
    if (this.unread.length < (closing ? 1 : READ_MIN_LINES)) return;
    const now = this.now();
    if (!closing && now - this.lastReadAt < READ_EVERY_MS) return;
    this.lastReadAt = now;
    this.readBusy = true;
    // 넘긴 장면은 비운다 — 답을 기다리는 동안 온 말은 다음 장면이다
    const lines = this.unread;
    this.unread = [];
    /**
     * 이 장면에서 **실제로 말한** 사람만 움직인다. 프롬프트에도 적혀 있지만 코드로도 지킨다 —
     * 판정기가 조용한 사람의 이름을 부르면 「조용한 것이 근거」가 되어 버리고, 그러면 입 다무는 것이
     * 최적 전략이 된다 (agents.readTalk 의 "조용한 것은 근거가 아니다").
     */
    const spoke = new Set(lines.map((l) => l.name));
    try {
      const out = await readTalk(this.deps.brain, { facts: this.facts(), results: this.history, lines });
      if (!this.active()) return;
      const deltas: SuspicionDelta[] = [];
      const said: string[] = [];
      for (const m of out.marks) {
        const seat = this.seatByName(m.name);
        if (!seat || seat.isolated || !spoke.has(seat.name)) continue;
        const d = this.book.read(seat.id, m.amount, m.reason || '발화 분석');
        if (!d) continue;
        deltas.push(d);
        said.push(LINES.read(seat.name, d.amount, m.reason));
      }
      if (!deltas.length) return;
      /**
       * 눈금은 늘 움직인다. **방송만** 토론 중일 때 내보낸다 — 마지막 읽기(closing)는 국면이 바뀌기 전에
       * 시작하지만 판정기가 늦으면 답이 시험 개시 뒤에 온다. 그때 배너를 덮으면 사람이 이번 시험에서
       * 무엇을 해야 하는지를 잃는다. 근거는 안 사라진다 — 걸음마다의 why 가 피드에 그대로 남는다 (applyDeltas).
       */
      if (this.phase === 'discussion') {
        // 판정기가 제 문장을 줬고 그 문장이 가리킨 사람이 전부 적용됐을 때만 그 문장을 쓴다 — 아니면 정해진 문장으로
        const line = out.broadcast && deltas.length === out.marks.length ? out.broadcast : said.join(' ');
        this.leader(line, deltas.some((d) => d.amount > 0) ? 'alarm' : 'readout');
      }
      this.applyDeltas(deltas);
    } finally {
      this.readBusy = false;
    }
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

/**
 * 이 판이 실제로 여는 시험들 — 차례표(GAME_TEST_ORDER) 중 엔진이 꽂혀 있는 것만.
 * 엔진이 빠진 종류는 조용히 건너뛴다: 차례가 비었다고 판이 멎는 것보다 한 판이 두 시험으로 도는 편이 낫다.
 */
function schedule(): TrialGame[] {
  const have = new Set(availableGames());
  return GAME_TEST_ORDER.filter((g) => have.has(g));
}
