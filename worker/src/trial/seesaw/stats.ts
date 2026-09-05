/**
 * 한 사람의 무게 중심 다리 기록 — 핵심은 **어느 쪽에 서 있었나**다: 판이 기울었을 때 높은 쪽(무게가 모자란 쪽)에 서 있던 시간의
 * 비율이 곧 「균형에 기여한 비율」이다. 계산하는 몸은 딱 필요한 자리에 서서 거의 안 움직이고, 사람은 넘치고 되돌아온다.
 *   walked          판 위에서 걸은 거리(m) — 미끄러진 것은 안 센다
 *   falls           끝에서 떨어진 횟수
 *   survivalTime    첫 낙하까지(s) — 안 떨어졌으면 판 길이. 낙하 생존 · 원판과 같은 이름이라 발언권(talkFor)이 한 눈금으로 잰다
 *   counterRate     판이 눈에 띄게 기울어 있던 동안(|φ| > 0.03) 높은 쪽에 서 있던 비율(0~1)
 *   meanLever       축에서 떨어져 선 거리 |u| 의 평균(m)
 *   reactionMs      사건(상자가 닿음 · 멈춤쇠 들썩임) → 걷기 명령이 바뀌기까지(ms) 평균
 *   slideTotal      미끄러진 거리(m) 합
 *   transitionError 마찰이 바뀐 직후 5초 안에 미끄러진 거리(m) — P3
 *   errorDirection  미끄러짐 에피소드마다 끝난 자리가 낮은 쪽으로 밀렸으면 + / 높은 쪽으로 고쳤으면 −  — P4
 *   adaptationCurve 에피소드별 미끄러진 거리 첫 5개
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean } from '../scoring';
import { SLIDE_OFF, SLIDE_ON } from './sim';

export const TRANSITION_MS = 5000;
const REACT_WINDOW_MS = 3000;
const WALK_CHANGE = 0.8;
/** 이보다 기울어 있어야 「어느 쪽이 높다」가 있다 */
const TILT_SEEN = 0.03;

interface Episode {
  /** 시작 때 자리 — 끝나면 (끝 자리 − 시작 자리)·sign(φ) 가 든다: 음수면 낮은 쪽으로 밀렸다 */
  startU: number;
  dist: number;
  at: number;
  /** 시작 때 기울기 부호 */
  sign: number;
}

export class SeesawStats {
  walked = 0;
  slideTotal = 0;
  private transitionSlide = 0;
  private leverAcc = 0;
  private leverN = 0;
  private tiltedN = 0;
  private counterN = 0;
  private episodes: Episode[] = [];
  private open: Episode | null = null;
  private reactions: number[] = [];
  private eventAt: number | null = null;
  private lastW = { x: 0, z: 0 };
  private falls = 0;
  private firstFallAt: number | null = null;

  /** 틱마다 — 판 위에 있을 때만 */
  tick(u: number, phi: number, slide: number, walk: number, dtSec: number, now: number, phaseStarts: readonly number[]): void {
    this.walked += walk * dtSec;
    this.leverAcc += Math.abs(u);
    this.leverN += 1;
    if (Math.abs(phi) > TILT_SEEN) {
      this.tiltedN += 1;
      if (Math.sign(u) === Math.sign(phi)) this.counterN += 1;
    }

    const d = slide * dtSec;
    this.slideTotal += d;
    if (phaseStarts.some((p) => now >= p && now - p <= TRANSITION_MS)) this.transitionSlide += d;

    if (this.open) {
      this.open.dist += d;
      if (slide < SLIDE_OFF) {
        this.episodes.push({ ...this.open, startU: (u - this.open.startU) * this.open.sign });
        this.open = null;
      }
    } else if (slide > SLIDE_ON) {
      this.open = { startU: u, dist: d, at: now, sign: Math.sign(phi) || 1 };
    }
  }

  /** 사건 — 이 시각부터 반응을 잰다 */
  loadEvent(now: number): void {
    this.eventAt = now;
  }

  walk(x: number, z: number, now: number): void {
    const changed = Math.hypot(x - this.lastW.x, z - this.lastW.z) >= WALK_CHANGE;
    this.lastW = { x, z };
    if (!changed) return;
    if (this.eventAt !== null && now - this.eventAt <= REACT_WINDOW_MS) {
      this.reactions.push(now - this.eventAt);
      this.eventAt = null;
    }
  }

  fell(now?: number): void {
    this.falls += 1;
    if (this.firstFallAt === null && typeof now === 'number') this.firstFallAt = now;
    if (this.open) {
      this.episodes.push({ ...this.open, startU: -1 }); // 떨어졌으면 낮은 쪽으로 밀린 것이다
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
        walked: this.walked,
        falls: this.falls,
        survivalTime,
        counterRate: this.tiltedN ? this.counterN / this.tiltedN : Number.NaN,
        meanLever: this.leverN ? this.leverAcc / this.leverN : Number.NaN,
        reactionMs: this.reactions.length ? mean(this.reactions) : Number.NaN,
        slideTotal: this.slideTotal,
        transitionError,
      },
      transitionError,
      // startU 에는 「(끝 − 시작)·sign(φ)」 — 음수면 낮은 쪽으로 밀렸다(+), 양수면 높은 쪽으로 고쳤다(−)
      errorDirection: this.episodes.map((e) => (e.startU < 0 ? 1 : -1)),
      adaptationCurve: this.episodes.slice(0, 5).map((e) => Math.round(e.dist * 100) / 100),
    };
  }
}
