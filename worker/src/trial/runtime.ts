/**
 * 물리 미니게임의 방 하나치 라운드 흐름 — RoomDO 생성자에서 한 번 만들어져 그 방의 트라이얼 전부를 맡는다.
 * 게임 규칙은 엔진(engine.ts)이 안다: 정지선(stopline-engine.ts) · 낙하 생존(fall/engine.ts) · 색 사냥(colorhunt/engine.ts).
 *
 * ★ 소켓을 직접 쥐지 않는다. roster/broadcast/send 는 전부 RoomDO 가 콜백으로 넘긴다 —
 *   room-do.test.ts 와 같은 방식(가짜 소켓 쌍 + 가짜 storage)으로 이 파일도 단위 시험이 된다.
 * ★ DO 의 단일 알람 슬롯을 새로 다투지 않는다: 이벤트제 게임은 "전원이 마쳤다"로, 시간제 게임은 자기
 *   setInterval 로 라운드를 닫고, 누가 멈춰 서 버렸을 때의 안전망만 room-do.ts 의 기존 30초 청소 알람에
 *   얹혀 간다(onSweep).
 * ★ 참가 자격은 **지금 방에 붙어 있는가**다. 라운드 도중 들어온 사람(새로고침이면 id 가 바뀐다)도 그 순간
 *   참가자가 되고, 나간 사람은 기다리지 않는다 — 그렇지 않으면 새로고침 한 번에 입력이 조용히 버려지고
 *   라운드는 영영 안 끝난다 (2026-09-04 확인).
 */

import type { PlayerSnapshot, S2CMessage, TrialGame, TrialResultWire } from '../../../src/world/mp/protocol';
import type { TrialC2SMessage } from '../../../src/world/mp/validate';
import type { GameEngine } from './engine';
import { ColorhuntEngine } from './colorhunt/engine';
import { DiscEngine } from './disc/engine';
import { FallEngine } from './fall/engine';
import { PlatformEngine } from './platform/engine';
import { appendHistory, readHistory } from './history';
import { groupStats } from './scoring';
import { StoplineEngine } from './stopline-engine';
import type { TrialResult } from './types';

/** 실제 사람이 방 정원(ROOM_MAX_PLAYERS=3)만큼도 안 모여도 판이 허전하지 않을 최소 총원. */
const TRIAL_PARTY_SIZE = 4;
/** 판이 어떤 이유로든 안 닫혔을 때의 안전망(1분 판 + 여유). room-do.ts 의 30초 청소 알람에 얹혀 확인한다. */
const ROUND_TIMEOUT_MS = 90_000;

export class TrialRuntime {
  private engine: GameEngine | null = null;
  private round = 0;
  private finished = false;
  private finalizing = false;
  private startedAt = 0;
  private aiIds: string[] = [];
  /** 이번 라운드에 나간 사람들. roster() 는 닫히는 중인 소켓을 아직 셀 수 있어서 따로 적는다 (room-do.ts handleLeave 주석) */
  private gone = new Set<string>();

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly rosterFn: () => PlayerSnapshot[],
    private readonly broadcastFn: (msg: S2CMessage) => void,
    private readonly sendFn: (ws: WebSocket, msg: S2CMessage) => void,
  ) {}

  async handle(ws: WebSocket, snap: { id: string }, msg: TrialC2SMessage): Promise<void> {
    switch (msg.t) {
      case 'trial_join':
        await this.onJoin(ws, snap.id, msg.game ?? 'stopline');
        return;
      case 'trial_accel':
        if (this.active() && this.isConnected(snap.id)) this.engine?.onAccel(snap.id);
        return;
      case 'trial_brake':
        if (this.active()) {
          this.engine?.onBrake(snap.id);
          await this.maybeFinalize();
        }
        return;
      case 'trial_pick':
        if (this.active() && this.isConnected(snap.id)) this.engine?.onPick(snap.id, msg.objectId);
        return;
      case 'trial_walk':
        // 회전 원판 — 걷기 명령. 크기는 엔진이 자른다 (worker/src/trial/disc/engine.ts onWalk)
        if (this.active() && this.isConnected(snap.id)) this.engine?.onWalk?.(snap.id, msg.x, msg.z, Date.now());
        return;
      default:
        return;
    }
  }

  /** room-do.ts 의 move 처리 뒤에 불린다 — 시간제 게임(낙하 생존)이 사람의 자리를 아는 유일한 길 */
  onMove(id: string, x: number, z: number, now: number, y = 0): void {
    if (this.active() && this.isConnected(id)) this.engine?.onMove(id, x, z, now, y);
  }

  /** room-do.ts 의 기존 30초 청소 알람에서 매번 불린다 — 멈춰 선 라운드를 강제로 닫는 안전망. */
  async onSweep(now: number): Promise<void> {
    if (!this.active()) return;
    if (now - this.startedAt > ROUND_TIMEOUT_MS) await this.finalizeRound();
  }

  /** room-do.ts 의 handleLeave 에서 불린다 — 나간 사람을 기다리느라 라운드가 안 끝나는 일이 없게 */
  async onLeave(id: string): Promise<void> {
    if (!this.active()) return;
    this.gone.add(id);
    await this.maybeFinalize();
  }

  private active(): boolean {
    return this.round > 0 && !this.finished && !this.finalizing && this.engine !== null;
  }

  private isConnected(id: string): boolean {
    return !this.gone.has(id) && this.rosterFn().some((p) => p.id === id);
  }

  private async onJoin(ws: WebSocket, id: string, game: TrialGame): Promise<void> {
    const history = await readHistory(this.storage);
    this.sendFn(ws, { t: 'trial_history', results: history.map(stripCondition) });
    if (this.active() && this.engine) {
      // 도중에 들어왔다 — 지금 라운드를 알려 준다. 시행은 이 순간부터 받는다
      this.engine.join(id);
      this.sendFn(ws, { t: 'trial_round_start', game: this.engine.game, round: this.round, startAt: this.startedAt, durationMs: this.engine.durationMs, ...paceOf(this.engine, this.round) });
      return;
    }
    // 판이 없거나(처음) 다 끝났다 — 이 사람이 고른 게임으로 새 판을 연다. 지난 판의 기록은 storage 에 그대로 쌓여 로그 탭에 남는다
    this.engine?.stop();
    this.engine =
      game === 'fall' ? new FallEngine() : game === 'colorhunt' ? new ColorhuntEngine() : game === 'platform' ? new PlatformEngine() : game === 'disc' ? new DiscEngine() : new StoplineEngine();
    this.round = 0;
    this.finished = false;
    this.aiIds = [];
    await this.startRound();
  }

  private async startRound(): Promise<void> {
    const engine = this.engine;
    if (!engine) return;
    this.round += 1;
    this.gone = new Set();
    this.startedAt = Date.now();
    this.finalizing = false;

    // 좌석 구성은 첫 라운드에 한 번만 정한다 — 라운드마다 인원이 바뀌면 비교가 안 선다
    if (this.aiIds.length === 0) {
      const aiCount = Math.max(1, TRIAL_PARTY_SIZE - this.rosterFn().length);
      this.aiIds = Array.from({ length: aiCount }, (_, i) => `SUBJECT_${String(i + 1).padStart(2, '0')}`);
    }

    const realIds = this.rosterFn().map((p) => p.id);
    this.broadcastFn({ t: 'trial_round_start', game: engine.game, round: this.round, startAt: this.startedAt, durationMs: engine.durationMs, ...paceOf(engine, this.round) });
    engine.start(this.round, realIds, this.aiIds, {
      broadcast: this.broadcastFn,
      finish: () => void this.finalizeRound(),
      bodyOf: (id) => this.rosterFn().find((p) => p.id === id)?.body,
    });
  }

  /** 기다릴 사람 = AI 좌석 + **아직 방에 있는** 실제 사람. 나간 사람 때문에 라운드가 안 닫히지 않는다 */
  private async maybeFinalize(): Promise<void> {
    if (!this.active() || !this.engine) return;
    if (this.engine.done((id) => this.aiIds.includes(id) || this.isConnected(id))) await this.finalizeRound();
  }

  private async finalizeRound(): Promise<void> {
    const engine = this.engine;
    if (!engine || this.finalizing) return;
    this.finalizing = true;
    engine.stop();

    const players = engine.results();
    const stats = groupStats(players);
    const wire: TrialResultWire = {
      game: engine.game,
      round: this.round,
      players,
      groupMean: stats.mean,
      groupStdDev: stats.stdDev,
      endedAt: Date.now(),
    };
    const result: TrialResult = { ...wire, condition: engine.condition(this.round) };

    await appendHistory(this.storage, result);
    this.broadcastFn({ t: 'trial_result', result: wire });

    // 미니게임 하나 = 판 하나(1분). 다음 판은 누가 다시 trial_join 을 보낼 때 열린다 (onJoin)
    this.finished = true;
  }
}

/** TrialResult(내부) → TrialResultWire(와이어). condition 을 뗀다 — room-do.ts 의 publicOf 와 같은 모양의 규칙. */
function stripCondition({ condition: _drop, ...wire }: TrialResult): TrialResultWire {
  return wire;
}

/** 라운드 시작에 공개로 싣는 발판 배속 — 움직이는 플랫폼만 (엔진의 paceFor). 없는 엔진은 빈 객체 */
export function paceOf(engine: GameEngine, intensity: number): { pace?: number } {
  const pace = engine.paceFor?.(intensity);
  return pace === undefined ? {} : { pace };
}
