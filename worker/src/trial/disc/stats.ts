/**
 * 한 사람의 회전 원판 기록 — 사용자 스펙의 핵심은 **이동거리**다: "SUBJECT 02 이동거리 12m / 낙하 0회 — 거의 움직이지 않고
 * 가장 안정적인 위치만 계속 찾아냈으니까." 그래서 센다:
 *   walked          원판 표면 기준으로 걸은 거리(m) — 실려 간 거리는 안 센다 (가만히 서 있어도 월드에서는 돈다)
 *   falls           떨어진 횟수
 *   survivalTime    첫 낙하까지의 시간(s) — 안 떨어졌으면 라운드 길이. 낙하 생존의 같은 이름 지표와 같은 뜻이라
 *                   발언권(game-protocol 의 talkFor)이 둘을 한 눈금으로 잰다
 *   meanRadius      평균 반지름(m) — 가운데 가까이 붙었나
 *   radiusStd       반지름의 표준편차(m) — 「같은 자리를 계속 유지」가 여기 보인다
 *   reactionMs      회전이 바뀐 사건 → 걷기 명령이 바뀌기까지(ms) 평균 — 사람은 몸이 밀리고 나서 반응한다
 *   slideTotal      미끄러진 거리(m) 합
 *   transitionError 마찰이 바뀐 직후 5초 안에 미끄러진 거리(m) — P3
 *   errorDirection  미끄러짐 에피소드마다 순 반지름 변화의 부호 (바깥 + / 안쪽 −) — P4
 *   adaptationCurve 에피소드별 미끄러진 거리 첫 5개
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean, stdDev } from '../scoring';
import { SLIDE_OFF, SLIDE_ON } from './sim';

/** 조건이 바뀐 직후로 보는 창(ms) — 낙하 생존과 같다 */
export const TRANSITION_MS = 5000;
/** 회전 사건 뒤 이 안에 반응이 없으면 「반응 없음」 — 가운데 서 있던 사람은 반응할 이유가 없다 */
const REACT_WINDOW_MS = 3000;
/** 걷기 명령이 「바뀌었다」고 볼 변화(m/s) */
const WALK_CHANGE = 0.8;

interface Episode {
  startR: number;
  dist: number;
  at: number;
}

export class DiscStats {
  walked = 0;
  slideTotal = 0;
  private radii: number[] = [];
  private radiusAcc = 0;
  private radiusN = 0;
  private episodes: Episode[] = [];
  private open: Episode | null = null;
  private reactions: number[] = [];
  private eventAt: number | null = null;
  private lastW = { x: 0, z: 0 };
  private falls = 0;
  private firstFallAt: number | null = null;

  /**
   * 틱마다 — 원판 위에 있을 때만. r 은 반지름, slide 는 |s|, walk 는 |w|(원판 기준).
   * @param phaseStarts 조건이 바뀐 시각들 — 그 뒤 TRANSITION_MS 안의 미끄러짐이 전환 직후 오차다
   */
  tick(r: number, slide: number, walk: number, dtSec: number, now: number, phaseStarts: readonly number[]): void {
    this.walked += walk * dtSec;
    this.radiusAcc += r;
    this.radiusN += 1;
    // 반지름 표본은 0.5초마다 하나 — 1분에 120개면 편차를 재기에 충분하다
    if (this.radiusN % 10 === 0) this.radii.push(r);

    const d = slide * dtSec;
    this.slideTotal += d;
    if (phaseStarts.some((p) => now >= p && now - p <= TRANSITION_MS)) this.transitionSlide += d;

    if (this.open) {
      this.open.dist += d;
      if (slide < SLIDE_OFF) {
        this.episodes.push({ ...this.open, dist: this.open.dist, startR: this.open.startR - r });
        this.open = null;
      }
    } else if (slide > SLIDE_ON) {
      this.open = { startR: r, dist: d, at: now };
    }
  }

  private transitionSlide = 0;

  /** 회전 목표가 바뀌었다 — 이 시각부터 반응을 잰다. 앞 사건에 반응이 없었으면 그건 잊는다 */
  spinEvent(now: number): void {
    this.eventAt = now;
  }

  /** 걷기 명령이 왔다(사람은 trial_walk, AI 는 매 틱). 충분히 바뀐 것만 「반응」이다 */
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
    // 떨어지면 에피소드는 거기서 끝이다 — 반지름 변화는 바깥(+)
    if (this.open) {
      this.episodes.push({ ...this.open, startR: -1 });
      this.open = null;
    }
  }

  /** @param gameStart · gameEnd 라운드의 시각 — 없으면 survivalTime 은 NaN (단위 시험용) */
  result(id: string, gameStart?: number, gameEnd?: number): TrialPlayerResult {
    const radiusStd = this.radii.length >= 2 ? stdDev(this.radii) : Number.NaN;
    const transitionError = this.transitionSlide;
    const survivalTime =
      typeof gameStart === 'number' && typeof gameEnd === 'number' ? ((this.firstFallAt ?? gameEnd) - gameStart) / 1000 : Number.NaN;
    return {
      id,
      metrics: {
        walked: this.walked,
        falls: this.falls,
        survivalTime,
        meanRadius: this.radiusN ? this.radiusAcc / this.radiusN : Number.NaN,
        radiusStd,
        reactionMs: this.reactions.length ? mean(this.reactions) : Number.NaN,
        slideTotal: this.slideTotal,
        transitionError,
      },
      transitionError,
      // startR 에는 「시작 반지름 − 끝 반지름」이 들어 있다 — 음수면 바깥으로 밀렸다(+), 양수면 안쪽으로 고쳤다(−)
      errorDirection: this.episodes.map((e) => (e.startR < 0 ? 1 : -1)),
      adaptationCurve: this.episodes.slice(0, 5).map((e) => Math.round(e.dist * 100) / 100),
    };
  }
}
