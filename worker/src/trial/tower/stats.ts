/**
 * 한 사람의 무너지는 타워 기록 — 핵심은 **어디에 서 있었나**와 **떨어졌나**다.
 *   falls           떨어진 횟수 · survivalTime 처음 떨어지기까지(s) — 다른 시험의 같은 이름과 한 눈금 (talkFor)
 *   slabOffset      서 있던 발판의 가운데에서 떨어져 선 거리(m) 평균 — 「중심 이동」. 기계는 0 에 붙고 사람은 흩어진다
 *   centerDist      탑 가운데에서 떨어져 선 거리(m) 평균
 *   pushes · shoved · jumps 민 횟수 · 밀린 횟수 · 뛴 횟수
 *   reactionMs      발밑 발판에 경고가 뜬 순간 → 걷기 명령이 바뀌기까지(ms) 평균
 *   walked · slideTotal 걸은 거리 · 미끄러진(밀린) 거리
 *   transitionError 마찰이 바뀐 직후 5초 안에 미끄러진 거리(m) — P3
 *   errorDirection  미끄러짐 에피소드마다 끝난 자리가 발판 끝 쪽이면 + / 가운데 쪽이면 −  — P4
 *   adaptationCurve 에피소드별 미끄러진 거리 첫 5개
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean } from '../scoring';
import { SLIDE_OFF, SLIDE_ON } from './sim';

export const TRANSITION_MS = 5000;
const REACT_WINDOW_MS = 3000;
const WALK_CHANGE = 0.8;

interface Episode {
  startOff: number;
  dist: number;
}

export class TowerStats {
  walked = 0;
  slideTotal = 0;
  pushes = 0;
  shoved = 0;
  jumps = 0;
  private transitionSlide = 0;
  private offAcc = 0;
  private centerAcc = 0;
  private n = 0;
  private episodes: Episode[] = [];
  private open: Episode | null = null;
  private reactions: number[] = [];
  private eventAt: number | null = null;
  private lastW = { x: 0, z: 0 };
  private falls = 0;
  private firstFallAt: number | null = null;

  /** 틱마다 — 서 있을 때만. slabOff 는 발판 가운데에서, centerDist 는 탑 가운데에서 */
  tick(slabOff: number, centerDist: number, slide: number, walked: number, dtSec: number, now: number, phaseStarts: readonly number[]): void {
    this.walked += walked;
    this.offAcc += slabOff;
    this.centerAcc += centerDist;
    this.n += 1;
    const d = slide * dtSec;
    this.slideTotal += d;
    if (phaseStarts.some((p) => now >= p && now - p <= TRANSITION_MS)) this.transitionSlide += d;
    if (this.open) {
      this.open.dist += d;
      if (slide < SLIDE_OFF) {
        this.episodes.push({ startOff: slabOff - this.open.startOff, dist: this.open.dist });
        this.open = null;
      }
    } else if (slide > SLIDE_ON) this.open = { startOff: slabOff, dist: d };
  }

  /** 발밑 발판에 경고가 떴다 */
  warned(now: number): void {
    if (this.eventAt === null) this.eventAt = now;
  }

  walk(x: number, z: number, now: number): void {
    const changed = Math.hypot(x - this.lastW.x, z - this.lastW.z) >= WALK_CHANGE;
    this.lastW = { x, z };
    if (!changed) return;
    if (this.eventAt !== null && now - this.eventAt <= REACT_WINDOW_MS) this.reactions.push(now - this.eventAt);
    this.eventAt = null;
  }

  pushed(): void {
    this.pushes += 1;
  }

  jumped(): void {
    this.jumps += 1;
  }

  gotShoved(): void {
    this.shoved += 1;
  }

  fell(now: number): void {
    this.falls += 1;
    if (this.firstFallAt === null) this.firstFallAt = now;
    if (this.open) {
      this.episodes.push({ startOff: 1, dist: this.open.dist }); // 떨어졌으면 끝 쪽으로 밀린 것이다
      this.open = null;
    }
  }

  result(id: string, gameStart?: number, gameEnd?: number): TrialPlayerResult {
    const transitionError = this.transitionSlide;
    const survivalTime =
      typeof gameStart === 'number' && typeof gameEnd === 'number' ? ((this.firstFallAt ?? gameEnd) - gameStart) / 1000 : Number.NaN;
    return {
      id,
      metrics: {
        falls: this.falls,
        survivalTime,
        slabOffset: this.n ? this.offAcc / this.n : Number.NaN,
        centerDist: this.n ? this.centerAcc / this.n : Number.NaN,
        pushes: this.pushes,
        shoved: this.shoved,
        jumps: this.jumps,
        reactionMs: this.reactions.length ? mean(this.reactions) : Number.NaN,
        walked: this.walked,
        slideTotal: this.slideTotal,
        transitionError,
      },
      transitionError,
      errorDirection: this.episodes.map((e) => (e.startOff > 0 ? 1 : -1)),
      adaptationCurve: this.episodes.slice(0, 5).map((e) => Math.round(e.dist * 100) / 100),
    };
  }
}
