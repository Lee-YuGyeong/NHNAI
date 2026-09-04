/**
 * 물리 미니게임의 방 하나치 상태 — RoomDO 생성자에서 한 번 만들어져 그 방의 트라이얼 전부를 맡는다.
 *
 * ★ 소켓을 직접 쥐지 않는다. roster/broadcast/send 는 전부 RoomDO 가 콜백으로 넘긴다 —
 *   room-do.test.ts 와 같은 방식(가짜 소켓 쌍 + 가짜 storage)으로 이 파일도 단위 시험이 된다.
 * ★ 정지선은 프레임 틱이 필요 없다 — accel/brake 두 이벤트만으로 라운드가 돈다. 그래서
 *   DO 의 단일 알람 슬롯을 새로 다투지 않는다: 라운드 종료는 "전원이 3회를 다 채웠다"는
 *   이벤트로 즉시 일어나고, 누가 멈춰 서 버렸을 때의 안전망만 room-do.ts 의 기존 30초 청소
 *   알람에 얹혀 간다(onSweep). PLANNING §2.2 "실시간 물리 시뮬레이션 불필요"와 같은 결.
 * ★ 참가 자격은 **지금 방에 붙어 있는가**다. 라운드 도중 들어온 사람(새로고침이면 id 가 바뀐다)도 W 를
 *   누르는 순간 참가자가 되고, 나간 사람은 기다리지 않는다 — 그렇지 않으면 새로고침 한 번에 그 사람의
 *   입력이 조용히 버려지고 라운드는 영영 안 끝난다 (2026-09-04 확인).
 */

import {
  STOPLINE_ATTEMPTS_PER_ROUND,
  STOPLINE_ROUNDS,
} from '../../../src/world/mp/constants';
import type { PlayerSnapshot, S2CMessage, TrialPlayerResult, TrialResultWire } from '../../../src/world/mp/protocol';
import type { TrialC2SMessage } from '../../../src/world/mp/validate';
import { appendHistory, readHistory } from './history';
import { makeStoplineProfile, nextStoplineElapsedMs, type StoplineProfile } from './npc';
import { frictionForRound, judgeStoplineAttempt, summarizeStoplinePlayer, type StoplineAttempt } from './stopline';
import { groupStats } from './scoring';
import type { TrialResult } from './types';

/** 실제 사람이 방 정원(ROOM_MAX_PLAYERS=3)만큼도 안 모여도 판이 허전하지 않을 최소 총원. */
const TRIAL_PARTY_SIZE = 4;
/** 정지선~정지 지점 사이를 클라가 이징으로 그리는 데 걸리는 시간(ms) — 렌더용, 판정과 무관. */
const STOPLINE_EASE_MS = 1200;
/** AI 시행 사이의 간격(ms) — 순차적으로 달리는 것처럼 보이게 하는 연출용 값. */
const AI_ATTEMPT_GAP_MS = 900;
/** 실제 사람이 멈춰 서 버렸을 때의 안전망. room-do.ts 의 30초 청소 알람에 얹혀 확인한다. */
const ROUND_TIMEOUT_MS = 45_000;

export class TrialRuntime {
  private round = 0;
  private finished = false;
  private finalizing = false;
  private startedAt = 0;
  private participantIds = new Set<string>();
  private attempts = new Map<string, StoplineAttempt[]>();
  private accelAt = new Map<string, number>();
  private aiIds: string[] = [];
  private aiProfiles = new Map<string, StoplineProfile>();
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
        await this.onJoin(ws);
        return;
      case 'trial_accel':
        this.onAccel(snap.id);
        return;
      case 'trial_brake':
        await this.onBrake(snap.id);
        return;
      default:
        return;
    }
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
    if ((this.attempts.get(id)?.length ?? 0) === 0) this.participantIds.delete(id); // 한 번도 안 뛰었으면 기록에도 안 남긴다
    await this.maybeFinalize();
  }

  private active(): boolean {
    return this.round > 0 && !this.finished && !this.finalizing;
  }

  private isConnected(id: string): boolean {
    return !this.gone.has(id) && this.rosterFn().some((p) => p.id === id);
  }

  private async onJoin(ws: WebSocket): Promise<void> {
    const history = await readHistory(this.storage);
    this.sendFn(ws, { t: 'trial_history', results: history.map(stripCondition) });
    if (this.active()) {
      // 도중에 들어왔다 — 지금 라운드를 알려 준다. 시행은 W 를 누르는 순간부터 받는다 (onAccel)
      this.sendFn(ws, { t: 'trial_round_start', game: 'stopline', round: this.round, startAt: this.startedAt });
      return;
    }
    // 판이 없거나(처음) 3라운드가 다 끝났다 — 새 판을 연다. 지난 판의 기록은 storage 에 그대로 쌓여 로그 탭에 남는다
    this.round = 0;
    this.finished = false;
    this.aiIds = [];
    await this.startRound();
  }

  private onAccel(id: string): void {
    if (!this.active() || !this.isConnected(id)) return;
    this.participantIds.add(id); // 도중에 들어온 사람도 여기서 참가자가 된다
    const done = this.attempts.get(id)?.length ?? 0;
    if (done >= STOPLINE_ATTEMPTS_PER_ROUND) return;
    const startAt = Date.now();
    this.accelAt.set(id, startAt);
    // 판정과 무관한 연출용 알림 — 다른 사람 화면에도 이 사람이 달리기 시작한 게 보이게 한다
    this.broadcastFn({ t: 'trial_running', id, startAt });
  }

  private async onBrake(id: string): Promise<void> {
    if (!this.active()) return;
    const accelAt = this.accelAt.get(id);
    if (accelAt === undefined) return;
    this.accelAt.delete(id);

    const list = this.attempts.get(id) ?? [];
    if (list.length >= STOPLINE_ATTEMPTS_PER_ROUND) return;

    const brakeAt = Date.now();
    const attempt = judgeStoplineAttempt(accelAt, brakeAt, this.round);
    list.push(attempt);
    this.attempts.set(id, list);

    this.broadcastFn({
      t: 'trial_stopline_waypoints',
      id,
      brakeAt,
      brakePos: attempt.brakePos,
      stopAt: brakeAt + STOPLINE_EASE_MS,
      stopPos: attempt.stopPos,
    });

    await this.maybeFinalize();
  }

  private async startRound(): Promise<void> {
    this.round += 1;
    this.attempts = new Map();
    this.accelAt = new Map();
    this.gone = new Set();
    this.startedAt = Date.now();
    this.finalizing = false;

    // 좌석 구성은 첫 라운드에 한 번만 정한다 — 라운드마다 인원이 바뀌면 비교가 안 선다
    if (this.aiIds.length === 0) {
      const realCount = this.rosterFn().length;
      const aiCount = Math.max(1, TRIAL_PARTY_SIZE - realCount);
      this.aiIds = Array.from({ length: aiCount }, (_, i) => `SUBJECT_${String(i + 1).padStart(2, '0')}`);
      for (const id of this.aiIds) this.aiProfiles.set(id, makeStoplineProfile());
    }

    const realIds = this.rosterFn().map((p) => p.id);
    this.participantIds = new Set([...realIds, ...this.aiIds]);
    for (const id of this.participantIds) this.attempts.set(id, []);

    this.broadcastFn({ t: 'trial_round_start', game: 'stopline', round: this.round, startAt: this.startedAt });
    this.runAiAttempts();
  }

  /** AI 좌석은 라운드가 열리자마자 3회를 전부 채운다 — 실시간 인간 입력이 없어도 finalize 조건이 자연히 성립한다. */
  private runAiAttempts(): void {
    for (const id of this.aiIds) {
      const profile = this.aiProfiles.get(id);
      const list = this.attempts.get(id);
      if (!profile || !list) continue;

      let cursor = this.startedAt + 500;
      for (let i = 0; i < STOPLINE_ATTEMPTS_PER_ROUND; i += 1) {
        const elapsed = nextStoplineElapsedMs(profile, this.round);
        const accelAt = cursor;
        const brakeAt = accelAt + elapsed;
        const attempt = judgeStoplineAttempt(accelAt, brakeAt, this.round);
        list.push(attempt);

        this.broadcastFn({ t: 'trial_running', id, startAt: accelAt });
        const stopAt = brakeAt + STOPLINE_EASE_MS;
        this.broadcastFn({ t: 'trial_stopline_waypoints', id, brakeAt, brakePos: attempt.brakePos, stopAt, stopPos: attempt.stopPos });
        cursor = stopAt + AI_ATTEMPT_GAP_MS;
      }
    }
  }

  /** 기다릴 사람 = AI 좌석 + **아직 방에 있는** 실제 사람. 나간 사람 때문에 라운드가 안 닫히지 않는다 */
  private async maybeFinalize(): Promise<void> {
    if (!this.active()) return;
    for (const id of this.participantIds) {
      if (!this.aiIds.includes(id) && !this.isConnected(id)) continue;
      if ((this.attempts.get(id)?.length ?? 0) < STOPLINE_ATTEMPTS_PER_ROUND) return;
    }
    await this.finalizeRound();
  }

  private async finalizeRound(): Promise<void> {
    this.finalizing = true;

    const players: TrialPlayerResult[] = [...this.participantIds]
      .map((id) => ({ id, list: this.attempts.get(id) ?? [] }))
      .filter((p) => p.list.length > 0) // 한 번도 못 뛴 사람(중간 이탈 등)은 그 라운드 기록에서 뺀다 — 0 이 「완벽」으로 읽히면 안 된다
      .map((p) => summarizeStoplinePlayer(p.id, p.list));

    const stats = groupStats(players);
    const wire: TrialResultWire = {
      game: 'stopline',
      round: this.round,
      players,
      groupMean: stats.mean,
      groupStdDev: stats.stdDev,
      endedAt: Date.now(),
    };
    const result: TrialResult = { ...wire, condition: { friction: frictionForRound(this.round) } };

    await appendHistory(this.storage, result);
    this.broadcastFn({ t: 'trial_result', result: wire });

    if (this.round < STOPLINE_ROUNDS) await this.startRound();
    else this.finished = true;
  }
}

/** TrialResult(내부) → TrialResultWire(와이어). condition 을 뗀다 — room-do.ts 의 publicOf 와 같은 모양의 규칙. */
function stripCondition({ condition: _drop, ...wire }: TrialResult): TrialResultWire {
  return wire;
}
