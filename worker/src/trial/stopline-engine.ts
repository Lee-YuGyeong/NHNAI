/**
 * 정지선 엔진 — 이벤트제. accel/brake 두 시각만 받아 시행을 판정하고(stopline.ts), AI 좌석은
 * 라운드가 열리자마자 3회분을 채운다(npc.ts). 전원이 3회를 마치면 done.
 */
import { STOPLINE_ATTEMPTS_PER_ROUND } from '../../../src/world/mp/constants';
import type { TrialPlayerResult } from '../../../src/world/mp/protocol';
import type { EngineContext, GameEngine, SeatTuning } from './engine';
import { makeStoplineProfile, nextStoplineElapsedMs, type StoplineProfile } from './npc';
import { frictionForRound, judgeStoplineAttempt, summarizeStoplinePlayer, type StoplineAttempt } from './stopline';
import type { TrialCondition } from './types';

/** 브레이크 지점~정지 지점 사이를 클라가 이징으로 그리는 데 걸리는 시간(ms) — 렌더용, 판정과 무관. */
const STOPLINE_EASE_MS = 1200;
/** AI 시행 사이의 간격(ms) — 순차적으로 달리는 것처럼 보이게 하는 연출용 값. */
const AI_ATTEMPT_GAP_MS = 900;

export class StoplineEngine implements GameEngine {
  readonly game = 'stopline' as const;
  private round = 0;
  private ctx: EngineContext | null = null;
  private attempts = new Map<string, StoplineAttempt[]>();
  private accelAt = new Map<string, number>();
  private aiIds: readonly string[] = [];
  private aiProfiles = new Map<string, StoplineProfile>();

  condition(round: number): TrialCondition {
    return { friction: frictionForRound(round) };
  }

  start(round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void {
    this.round = round;
    this.ctx = ctx;
    this.attempts = new Map();
    this.accelAt = new Map();
    this.aiIds = aiIds;
    for (const id of aiIds) {
      const t = tuning?.[id];
      // 전략(tuning)이 오면 라운드마다 새로 뽑는다 — AI 가 테스트마다 "얼마나 티 나게"를 다시 정할 수 있어야 한다(P9)
      if (t || !this.aiProfiles.has(id)) this.aiProfiles.set(id, makeStoplineProfile(t?.precision));
    }
    for (const id of [...realIds, ...aiIds]) this.attempts.set(id, []);
    this.runAiAttempts(Date.now());
  }

  stop(): void {
    this.ctx = null;
  }

  join(id: string): void {
    if (!this.attempts.has(id)) this.attempts.set(id, []);
  }

  onAccel(id: string): void {
    if (!this.ctx) return;
    this.join(id); // 도중에 들어온 사람도 여기서 참가자가 된다
    if ((this.attempts.get(id)?.length ?? 0) >= STOPLINE_ATTEMPTS_PER_ROUND) return;
    const startAt = Date.now();
    this.accelAt.set(id, startAt);
    // 판정과 무관한 연출용 알림 — 다른 사람 화면에도 이 사람이 달리기 시작한 게 보이게 한다
    this.ctx.broadcast({ t: 'trial_running', id, startAt });
  }

  onBrake(id: string): void {
    if (!this.ctx) return;
    const accelAt = this.accelAt.get(id);
    if (accelAt === undefined) return;
    this.accelAt.delete(id);

    const list = this.attempts.get(id) ?? [];
    if (list.length >= STOPLINE_ATTEMPTS_PER_ROUND) return;

    const brakeAt = Date.now();
    const attempt = judgeStoplineAttempt(accelAt, brakeAt, this.round);
    list.push(attempt);
    this.attempts.set(id, list);

    this.ctx.broadcast({
      t: 'trial_stopline_waypoints',
      id,
      brakeAt,
      brakePos: attempt.brakePos,
      stopAt: brakeAt + STOPLINE_EASE_MS,
      stopPos: attempt.stopPos,
    });
  }

  onMove(): void {
    /* 정지선은 위치를 안 본다 — 시각 둘로 판정한다 (stopline.ts 머리말) */
  }

  done(waiting: (id: string) => boolean): boolean {
    for (const [id, list] of this.attempts) {
      if (!waiting(id)) continue;
      if (list.length < STOPLINE_ATTEMPTS_PER_ROUND) return false;
    }
    return true;
  }

  results(): TrialPlayerResult[] {
    return [...this.attempts]
      .filter(([, list]) => list.length > 0) // 한 번도 못 뛴 사람(중간 이탈 등)은 뺀다 — 0 이 「완벽」으로 읽히면 안 된다
      .map(([id, list]) => summarizeStoplinePlayer(id, list));
  }

  /** AI 좌석은 라운드가 열리자마자 3회를 전부 채운다 — 실시간 인간 입력이 없어도 done 조건이 자연히 성립한다. */
  private runAiAttempts(startedAt: number): void {
    if (!this.ctx) return;
    for (const id of this.aiIds) {
      const profile = this.aiProfiles.get(id);
      const list = this.attempts.get(id);
      if (!profile || !list) continue;

      let cursor = startedAt + 500;
      for (let i = 0; i < STOPLINE_ATTEMPTS_PER_ROUND; i += 1) {
        const elapsed = nextStoplineElapsedMs(profile, this.round);
        const accelAt = cursor;
        const brakeAt = accelAt + elapsed;
        const attempt = judgeStoplineAttempt(accelAt, brakeAt, this.round);
        list.push(attempt);

        this.ctx.broadcast({ t: 'trial_running', id, startAt: accelAt });
        const stopAt = brakeAt + STOPLINE_EASE_MS;
        this.ctx.broadcast({ t: 'trial_stopline_waypoints', id, brakeAt, brakePos: attempt.brakePos, stopAt, stopPos: attempt.stopPos });
        cursor = stopAt + AI_ATTEMPT_GAP_MS;
      }
    }
  }
}
