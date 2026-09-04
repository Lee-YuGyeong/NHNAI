/**
 * 물리 미니게임 공통 통계 — 평균 · 표준편차뿐이다. 등급을 매기지 않는다.
 *
 * PLANNING P2("절대 성적으로 판별하지 않는다. 모든 지표는 그 판 참가자 전원의 평균과
 * 표준편차를 기준으로 상대 평가한다")를 위해 존재한다. 여기서 "정상"·"의심" 같은 판정을
 * 내리지 않는다 — 그건 `TrialResultWire`를 본 사람이 토론에서 할 일이다.
 */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** 모집단 표준편차(그 판 전원이 모집단이지 표본이 아니다). */
export function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** 참가자 전원의 metrics 에서 키별 평균 · 표준편차를 뽑는다. TrialResultWire 의 groupMean/groupStdDev 를 채운다. */
export function groupStats(players: { metrics: Record<string, number> }[]): {
  mean: Record<string, number>;
  stdDev: Record<string, number>;
} {
  const keys = new Set<string>();
  for (const p of players) for (const k of Object.keys(p.metrics)) keys.add(k);

  const meanOut: Record<string, number> = {};
  const stdOut: Record<string, number> = {};
  for (const k of keys) {
    const xs = players.map((p) => p.metrics[k]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (xs.length === 0) continue;
    meanOut[k] = mean(xs);
    stdOut[k] = stdDev(xs);
  }
  return { mean: meanOut, stdDev: stdOut };
}
