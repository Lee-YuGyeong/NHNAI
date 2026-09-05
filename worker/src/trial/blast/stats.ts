/**
 * 한 사람의 폭발 충격파 기록 — 핵심은 **얼마나 날아갔나**와 **터질 때 무엇을 하고 있었나**다.
 *   flightTotal     날아간 거리(m) 합 · maxFlight 한 번에 가장 멀리
 *   launches        날아간 횟수
 *   survivalTime    처음 날아가기까지(s) — 안 날아갔으면 판 길이. 다른 시험의 같은 이름과 한 눈금 (talkFor)
 *   coverRate       범위(BLAST_R) 안에서 터진 폭발 가운데, 그 순간 가려져 있었거나 자세를 낮추고 있던 비율(0~1)
 *   reactionMs      가까운(5.5m 안) 폭약이 놓인 순간 → 걷기 명령이 바뀌거나 자세를 낮추기까지(ms) 평균
 *   walked          걸은 거리(m)
 *   transitionError 세기가 바뀐 직후 5초 안에 날아간 거리(m) — P3
 *   errorDirection  날아간 폭발마다, 터지는 순간 폭심 **쪽으로** 움직이고 있었으면 + / 반대로 −  — P4
 *   adaptationCurve 비행 거리 첫 5개
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean } from '../scoring';

export const TRANSITION_MS = 5000;
const REACT_WINDOW_MS = 2500;
const WALK_CHANGE = 0.8;
/** 이 안에 놓인 폭약이 「가까운」 것 — 반응을 재기 시작한다 */
export const NEAR_ARM = 5.5;

export class BlastStats {
  walked = 0;
  private flights: number[] = [];
  private flightDirs: number[] = [];
  private transitionFlight = 0;
  private inRange = 0;
  private covered = 0;
  private reactions: number[] = [];
  private eventAt: number | null = null;
  private lastW = { x: 0, z: 0 };
  private firstLaunchAt: number | null = null;
  /** 날아가기 시작한 시각 — 착지 때 전환 창 판정에 쓴다 */
  private launchAt: number | null = null;

  tick(walk: number): void {
    this.walked += walk;
  }

  /** 가까운 폭약이 놓였다 — 반응을 잰다 */
  armedNear(now: number): void {
    if (this.eventAt === null) this.eventAt = now;
  }

  walk(x: number, z: number, now: number): void {
    const changed = Math.hypot(x - this.lastW.x, z - this.lastW.z) >= WALK_CHANGE;
    this.lastW = { x, z };
    if (changed) this.react(now);
  }

  crouch(on: boolean, now: number): void {
    if (on) this.react(now);
  }

  private react(now: number): void {
    if (this.eventAt !== null && now - this.eventAt <= REACT_WINDOW_MS) {
      this.reactions.push(now - this.eventAt);
    }
    this.eventAt = null;
  }

  /** 범위 안에서 폭발이 터졌다 — 그 순간 가려져 있었나 · 자세를 낮췄나 */
  exposed(shieldedOrCrouched: boolean): void {
    this.inRange += 1;
    if (shieldedOrCrouched) this.covered += 1;
  }

  /** 날아갔다. towardCharge — 그 순간 폭심 쪽으로 움직이고 있었나 */
  launched(now: number, towardCharge: boolean): void {
    if (this.firstLaunchAt === null) this.firstLaunchAt = now;
    if (this.launchAt === null) this.launchAt = now;
    this.flightDirs.push(towardCharge ? 1 : -1);
  }

  landed(dist: number, now: number, phaseStarts: readonly number[]): void {
    this.flights.push(dist);
    const from = this.launchAt ?? now;
    if (phaseStarts.some((p) => from >= p && from - p <= TRANSITION_MS)) this.transitionFlight += dist;
    this.launchAt = null;
  }

  result(id: string, gameStart?: number, gameEnd?: number): TrialPlayerResult {
    const transitionError = this.transitionFlight;
    const survivalTime =
      typeof gameStart === 'number' && typeof gameEnd === 'number' ? ((this.firstLaunchAt ?? gameEnd) - gameStart) / 1000 : Number.NaN;
    return {
      id,
      metrics: {
        flightTotal: this.flights.reduce((a, b) => a + b, 0),
        maxFlight: this.flights.length ? Math.max(...this.flights) : 0,
        launches: this.flightDirs.length,
        survivalTime,
        coverRate: this.inRange ? this.covered / this.inRange : Number.NaN,
        reactionMs: this.reactions.length ? mean(this.reactions) : Number.NaN,
        walked: this.walked,
        transitionError,
      },
      transitionError,
      errorDirection: this.flightDirs.slice(),
      adaptationCurve: this.flights.slice(0, 5).map((v) => Math.round(v * 100) / 100),
    };
  }
}
