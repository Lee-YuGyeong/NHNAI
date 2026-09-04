/**
 * 한 사람의 색 사냥 기록 — 기획(docs/COLORHUNT.md §8)의 표를 그대로 만든다.
 *
 *   accuracy        정답률 — 무리 평균 대비 편차로만 읽힌다 (P2)
 *   wrongPicks      오답 수
 *   hesitationMs    조명이 바뀐 뒤 첫 선택까지(ms) — **메인 판별 수치.** 사람은 멈칫하고, 기계는 안 멈칫한다 (P3)
 *   transitionError 전환 창(3초) 안 선택들의 오답 비율. 창 안에 선택이 없으면 NaN — 「전환 직후엔 손을 멈췄다」로 읽힌다
 *   errorDirection  오답마다 +1 = 합류색·미끼(물리적으로 정직한 실수) / −1 = 무관한 색(막 찍음) — P4 의 색 사냥 재해석
 *   adaptationCurve 차단 구간 선택 간격(초, 첫 5회) — 사람은 처음 느리고 점점 빨라진다. 기계는 평평하다
 *
 * 한 번도 안 주운 사람은 결과에서 빠진다(정지선과 같은 규칙 — 0 이 「완벽」으로 읽히면 안 된다).
 */
import type { TrialPlayerResult } from '../../../../src/world/mp/protocol';
import { mean } from '../scoring';

/** 조명이 바뀐 직후로 보는 창(ms) — PLANNING P3 의 태깅 창 */
export const HUNT_TRANSITION_MS = 3000;

export interface PickSample {
  at: number;
  /** 이 선택이 속한 구간(1~3) */
  phase: number;
  correct: boolean;
  /** 오답일 때 — 합류색·미끼로 틀렸나 (palette.ts confusableWith) */
  honest: boolean;
}

export class HuntStats {
  /** 서버가 아는 이 사람의 자리 — 줍기 거리 검증용. 실제 사람은 move 로, AI 는 서버 걸음으로 갱신된다 */
  x = 0;
  z = 0;
  seen = false;
  at = 0;
  private picks: PickSample[] = [];
  private lastPickAt = 0;

  setPos(x: number, z: number, now: number): void {
    this.seen = true;
    this.x = x;
    this.z = z;
    this.at = now;
  }

  /** 연타 방지 — 마지막 선택에서 이만큼 안 지났으면 거절한다 */
  cooldownOk(now: number, ms: number): boolean {
    return now - this.lastPickAt >= ms;
  }

  record(s: PickSample): void {
    this.lastPickAt = s.at;
    this.picks.push(s);
  }

  get pickCount(): number {
    return this.picks.length;
  }

  /** @param switchAts 조명이 실제로 바뀐 시각들 (ms epoch) — 전환 창과 머뭇이 여기서 나온다 */
  result(id: string, switchAts: readonly number[]): TrialPlayerResult {
    const n = this.picks.length;
    const correct = this.picks.filter((p) => p.correct).length;
    const wrong = this.picks.filter((p) => !p.correct);

    // 전환마다 — 그 뒤의 첫 선택까지 걸린 시간. 그 전환 뒤에 아무것도 안 주웠으면 그 전환은 빠진다
    const hesitations: number[] = [];
    for (const sw of switchAts) {
      const first = this.picks.find((p) => p.at >= sw);
      if (first) hesitations.push(first.at - sw);
    }
    const hesitationMs = hesitations.length ? mean(hesitations) : Number.NaN;

    // 전환 창(3초) 안의 선택들 — 오답 비율. 없으면 NaN (손을 멈췄다)
    const inWindow = this.picks.filter((p) => switchAts.some((sw) => p.at >= sw && p.at - sw <= HUNT_TRANSITION_MS));
    const transitionError = inWindow.length ? inWindow.filter((p) => !p.correct).length / inWindow.length : Number.NaN;

    // 차단 구간(2~3)의 선택 간격 — 직전 선택(구간 무관)에서 얼마나 걸렸나. 첫 선택은 시작·전환에서 잰다
    const gaps: number[] = [];
    for (let i = 0; i < this.picks.length; i += 1) {
      const p = this.picks[i];
      if (p.phase < 2) continue;
      const prevAt = i > 0 ? this.picks[i - 1].at : null;
      const sw = [...switchAts].reverse().find((s) => s <= p.at);
      const from = prevAt !== null ? Math.max(prevAt, sw ?? prevAt) : sw;
      if (from !== undefined && from !== null) gaps.push((p.at - from) / 1000);
    }

    return {
      id,
      metrics: {
        picks: n,
        accuracy: n ? correct / n : Number.NaN,
        wrongPicks: n - correct,
        hesitationMs,
        // groupStats(scoring.ts)가 metrics 를 훑어 무리 평균을 만들므로 여기에도 넣는다 (stopline.ts 와 같은 이유)
        transitionError,
      },
      transitionError,
      errorDirection: wrong.map((p) => (p.honest ? 1 : -1)),
      adaptationCurve: gaps.slice(0, 5),
    };
  }
}
