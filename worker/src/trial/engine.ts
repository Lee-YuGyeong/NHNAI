/**
 * 게임 엔진 계약 — 라운드 흐름(runtime.ts)과 게임 하나의 규칙을 가른다.
 *
 * runtime 은 "누가 방에 있나 · 몇 라운드째인가 · 기록을 어디 쌓나"만 알고, 시행이 어떻게 판정되는지는
 * 엔진이 안다. 정지선은 이벤트제(전원이 3회를 마치면 끝), 낙하 생존은 시간제(틱을 돌리다 시간이 되면
 * 스스로 finish 를 부른다) — 둘 다 이 계약 하나로 runtime 에 꽂힌다.
 */
import type { BodyId } from '../../../src/world/mp/bodies';
import type { S2CMessage, TrialGame, TrialPlayerResult } from '../../../src/world/mp/protocol';
import type { TrialCondition } from './types';

export interface EngineContext {
  broadcast: (msg: S2CMessage) => void;
  /** 시간제 게임이 라운드를 끝낼 때 부른다 — runtime 이 결과를 거둬 닫는다 */
  finish: () => void;
  /** 참가자의 몸 (mp/bodies.ts) — 무거운 몸은 회전 원판에서 먼저 미끄러진다. 모르면 undefined (기준 물리) */
  bodyOf?: (id: string) => BodyId | undefined;
}

/**
 * AI 좌석이 "얼마나 티 나게" 움직일지 — PLANNING P9: AI 참가자가 테스트마다 전략을 정하고 서버가 프로파일로 실행한다.
 * precision 0 = 사람 같음(반응 지연 · 큰 오차 · 느린 적응), 1 = 기계 같음(즉답 · 작은 오차 · 즉시 적응).
 * 없으면 엔진이 좌석마다 무작위로 뽑는다.
 */
export interface SeatTuning {
  precision: number;
}

export interface GameEngine {
  readonly game: TrialGame;
  /** 시간제 게임의 라운드 길이 — 클라가 남은 시간을 보여 주는 데 쓴다. 이벤트제는 없다 */
  readonly durationMs?: number;
  condition(round: number): TrialCondition;
  start(round: number, realIds: readonly string[], aiIds: readonly string[], ctx: EngineContext, tuning?: Record<string, SeatTuning>): void;
  /** 타이머 정리. finalize 직전과 새 라운드 직전에 불린다 */
  stop(): void;
  /** 실제 사람이 라운드 도중 들어왔다 */
  join(id: string): void;
  onAccel(id: string): void;
  onBrake(id: string): void;
  /** 사람의 자리 (move 10Hz). y 는 발 높이 — 움직이는 플랫폼이 점프·착지를 이걸로 읽는다 (다른 엔진은 무시) */
  onMove(id: string, x: number, z: number, now: number, y?: number): void;
  /** 색 사냥: 구슬을 줍는다(E). 다른 게임은 무시한다 */
  onPick(id: string, objectId: number): void;
  /** 회전 원판: 걷기 입력(월드 기준 속도, m/s). 이 게임만 구현한다 — 다른 엔진은 없어도 된다 */
  onWalk?(id: string, x: number, z: number, now: number): void;
  /**
   * 낙하 생존: Space 를 눌렀다. 몸의 높이는 **서버가** 적분한다(높이가 판정 대상이다, fall/engine.ts 머리말) —
   * 클라는 눌렀다는 것만 올리고 y 는 스냅샷의 `air` 로 돌려받는다. 이 게임만 구현한다
   */
  onJump?(id: string, now: number): void;
  /** 이 라운드를 닫아도 되나. waiting(id) 는 "그 사람을 아직 기다려야 하는가"(AI 이거나 방에 붙어 있다) */
  /** 라운드 시작 메시지에 공개로 실을 배속 — 움직이는 플랫폼만 (mp/platform.ts). 없는 엔진은 안 싣는다 */
  paceFor?(intensity: number): number;
  done(waiting: (id: string) => boolean): boolean;
  results(): TrialPlayerResult[];
}
