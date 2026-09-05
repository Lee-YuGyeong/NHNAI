/**
 * 한 사람의 회전 봉 기록 — 핵심은 **타이밍**이다: 봉이 몸을 지나는 순간이 체공의 한가운데면 오차 0 이고,
 * 이르게·늦게 뛴 만큼이 오차다. 수직축이 전부 공개인 판이라(sim.ts 머리말) 이 오차는 순수하게 몸의 리듬이다.
 *   hits            봉에 맞은 횟수
 *   clears          넘은 횟수
 *   clearRate       넘은 비율 — clears / (clears + hits)
 *   leadErrMs       스침마다 |체공 중심 − 스침 시각| 평균(ms). 맞은 스침은 상한(ERR_CAP)으로 친다
 *   unnecessaryJumps 봉이 오지도 않는데 뛴 횟수 — 낙하 생존의 헛움직임과 같은 결
 *   walked          실제로 움직인 거리(m)
 *   slideTotal      명령과 다르게 움직인 거리(m) — 발밑(숨은 μ)이 여기 남는다
 *   falls           가장자리 밖으로 떨어진 횟수
 *   transitionError 조건이 바뀐 직후 5초 안의 스침 오차 합 — P3. 속도·방향·발밑이 한꺼번에 바뀌는 그 창이다
 *   errorDirection  스침마다 부호 — 이르게 뛰면 +, 늦게(또는 안) 뛰면 −
 *   adaptationCurve 스침별 오차 첫 5개 — 사람은 우하향(적응)한다
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean } from '../scoring';

/** 조건이 바뀐 직후로 보는 창(ms) — 다른 게임과 같다 */
export const TRANSITION_MS = 5000;
/** 맞은 스침의 오차(초) — 넘은 스침의 오차는 체공의 절반을 넘을 수 없으니 이 값이 뚜렷이 크다 */
export const ERR_CAP = 1.0;

export class BarStats {
  hits = 0;
  clears = 0;
  unnecessaryJumps = 0;
  walked = 0;
  slideTotal = 0;
  falls = 0;
  private errs: number[] = [];
  private dirs: number[] = [];
  private transitionErr = 0;

  /** 틱마다 — 무대 위에 있을 때만 */
  tick(moved: number, slid: number): void {
    this.walked += moved;
    this.slideTotal += slid;
  }

  /**
   * 봉이 몸을 지났다. err 는 타이밍 오차(초, 맞았으면 ERR_CAP), dir 는 이르게(+) · 늦게(−).
   * @param phaseStarts 조건이 바뀐 시각들 — 그 뒤 TRANSITION_MS 안의 오차가 전환 직후 오차다
   */
  sweep(hit: boolean, err: number, dir: number, now: number, phaseStarts: readonly number[]): void {
    if (hit) this.hits += 1;
    else this.clears += 1;
    this.errs.push(err);
    this.dirs.push(dir);
    if (phaseStarts.some((p) => now >= p && now - p <= TRANSITION_MS)) this.transitionErr += err;
  }

  unnecessaryJump(): void {
    this.unnecessaryJumps += 1;
  }

  fell(): void {
    this.falls += 1;
  }

  result(id: string): TrialPlayerResult {
    const sweeps = this.hits + this.clears;
    const transitionError = Math.round(this.transitionErr * 100) / 100;
    return {
      id,
      metrics: {
        hits: this.hits,
        clears: this.clears,
        clearRate: sweeps ? this.clears / sweeps : Number.NaN,
        leadErrMs: this.errs.length ? mean(this.errs) * 1000 : Number.NaN,
        unnecessaryJumps: this.unnecessaryJumps,
        walked: this.walked,
        slideTotal: this.slideTotal,
        falls: this.falls,
        transitionError,
      },
      transitionError,
      errorDirection: this.dirs.map((d) => (d >= 0 ? 1 : -1)),
      adaptationCurve: this.errs.slice(0, 5).map((e) => Math.round(e * 100) / 100),
    };
  }
}
