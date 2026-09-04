/**
 * 시행 문법 — **게임 종류를 없앤다.**
 *
 * 원자를 셋(arrive·beat·zone) 두었더니 "몇 종류냐"는 질문에 3이라고 답해야 했다.
 * 그래서 종류를 지우고 **단계(step)를 조립하는 문법**으로 바꿨다.
 * 리더는 "언제 · 어디서 · 어떤 자세로"를 순서대로 쌓고, 무엇을 잴지도 직접 고른다.
 *
 * 예전 원자 셋은 이 문법의 특수한 경우일 뿐이다:
 *   arrive = 단계 1개 (t=7 에 지점에 서 있기) + timing
 *   beat   = 단계 N개 (0.8·1.6·2.4… 에 점프) + timing
 *   zone   = 단계 1개 (t=6 에 구역 중 하나에 서 있기) + minority
 * 그리고 이런 것도 된다 — **아무도 정의한 적 없는 게임이다**:
 *   "3초에 소파2 위에 올라섰다가, 6초에 내려와 왼쪽 구역으로, 8초까지 그대로 정지"
 *
 * 몸이 할 수 있는 것(걷기·점프·정지)은 엔진이 정하고, 그 위 조합은 전부 리더 몫이다.
 */

/** 그 시각에 어떤 상태여야 하는가 */
export type Pose =
  | 'stand' // 그 자리에 서 있기
  | 'on' // 그 가구 **위에** 올라서 있기
  | 'jump' // 그 순간 뛰어 있기 (발이 떠 있기)
  | 'still'; // 직전 단계부터 움직이지 않기

/** 어디로 */
export interface Where {
  kind: 'point' | 'object' | 'zone' | 'here';
  /** point */
  x?: number;
  z?: number;
  /** object */
  object?: string;
  /** zone — 여러 개 중 **본인이 고른다.** 몸으로 하는 투표가 된다 */
  zones?: { label: string; x: number; z: number; r: number }[];
  /** zone 일 때 던지는 질문 */
  question?: string;
}

export interface Step {
  /** 시행 시작 후 몇 초 */
  at: number;
  /** 허용 창(초). 이 밖이면 어긋난 것으로 친다 */
  window?: number;
  where: Where;
  pose: Pose;
  /** 화면에 띄울 한 줄 */
  note?: string;
}

/** 무엇을 재는가 */
export type Metric =
  | 'timing' // 정해진 시각과 얼마나 어긋났나
  | 'place' // 정해진 자리와 얼마나 떨어졌나
  | 'minority' // 소수파에 섰나
  | 'stillness'; // 멈춰 있어야 할 때 얼마나 움직였나

export interface Measure {
  metric: Metric;
  /** 가중치 1~3 */
  weight: number;
}

export interface TrialSpec {
  concept: string;
  announce: string;
  why: string;
  steps: Step[];
  measures: Measure[];
  /** 등급 컷 — 리더가 정한다 */
  cuts: { warn: number; alert: number };
}

/** 한 사람의 한 시점 상태 (100ms 마다 남긴다) */
export interface Sample {
  t: number;
  x: number;
  z: number;
  /** 발 높이 */
  y: number;
}

export const SAMPLE_MS = 100;
/** 기본 허용 창 */
export const DEFAULT_WINDOW = 0.45;

export function trialLength(spec: TrialSpec): number {
  return Math.max(...spec.steps.map((s) => s.at), 0) + 1.5;
}

/** 이 단계에서 목표로 삼아야 할 자리 (zone 은 고른 구역, here 는 직전 자리) */
export function stepTarget(
  step: Step,
  chosenZone: number | undefined,
  objectSpot: (id: string, pose: Pose) => { x: number; z: number; top: number } | undefined,
  previous: { x: number; z: number } | undefined,
): { x: number; z: number; top: number } | undefined {
  const w = step.where;
  if (w.kind === 'point' && Number.isFinite(w.x) && Number.isFinite(w.z)) return { x: w.x!, z: w.z!, top: 0 };
  if (w.kind === 'object' && w.object) return objectSpot(w.object, step.pose);
  if (w.kind === 'zone' && w.zones?.length) {
    const z = w.zones[Math.min(chosenZone ?? 0, w.zones.length - 1)];
    return { x: z.x, z: z.z, top: 0 };
  }
  if (w.kind === 'here' && previous) return { ...previous, top: 0 };
  return undefined;
}

/** 표본에서 그 시각의 상태를 찾는다 */
export function sampleAt(samples: Sample[], t: number): Sample | undefined {
  let best: Sample | undefined;
  for (const s of samples) {
    if (s.t <= t + 0.001) best = s;
    else break;
  }
  return best;
}

export interface StepScore {
  /** 시각 오차(초) */
  timing: number;
  /** 자리 오차(m) */
  place: number;
  /** 멈춰 있어야 할 때 움직인 거리(m) */
  stillness: number;
}

/**
 * 한 단계를 채점한다.
 *
 * timing — 조건을 **처음 만족한 시각**과 정해진 시각의 차이.
 *          한 번도 못 만족했으면 창 밖으로 크게 친다.
 * place  — 정해진 시각에 목표와 떨어진 거리.
 */
export function scoreStep(
  step: Step,
  samples: Sample[],
  target: { x: number; z: number; top: number } | undefined,
  prevAt: number,
): StepScore {
  const window = step.window ?? DEFAULT_WINDOW;
  const ok = (s: Sample): boolean => {
    if (step.pose === 'jump') return s.y > 0.12;
    if (step.pose === 'on') return Boolean(target) && s.y >= target!.top - 0.25 && dist(s, target!) <= 1.1;
    if (step.pose === 'still') return true;
    return Boolean(target) && dist(s, target!) <= 1.1;
  };

  // 조건을 만족한 표본 중 정해진 시각에 가장 가까운 것
  let timing = window * 3;
  for (const s of samples) {
    if (!ok(s)) continue;
    const d = Math.abs(s.t - step.at);
    if (d < timing) timing = d;
  }

  const at = sampleAt(samples, step.at);
  const place = target && at ? dist(at, target) : 0;

  let stillness = 0;
  if (step.pose === 'still') {
    const inRange = samples.filter((s) => s.t >= prevAt && s.t <= step.at);
    for (let i = 1; i < inRange.length; i += 1) stillness += dist(inRange[i - 1], inRange[i]);
  }

  return { timing: Number(timing.toFixed(3)), place: Number(place.toFixed(2)), stillness: Number(stillness.toFixed(2)) };
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 단계 점수들과 소수파 여부를 리더가 정한 가중치로 합친다 */
export function totalScore(spec: TrialSpec, steps: StepScore[], minority: number): number {
  const w = (m: Metric) => spec.measures.find((x) => x.metric === m)?.weight ?? 0;
  const avg = (pick: (s: StepScore) => number) => (steps.length ? steps.reduce((a, s) => a + pick(s), 0) / steps.length : 0);

  const parts =
    w('timing') * avg((s) => s.timing) * 2 +
    w('place') * avg((s) => s.place) * 0.6 +
    w('stillness') * avg((s) => s.stillness) * 0.8 +
    w('minority') * minority;

  const weightSum = spec.measures.reduce((a, m) => a + m.weight, 0) || 1;
  return Number((parts / weightSum).toFixed(3));
}

export function gradeBy(spec: TrialSpec, score: number): 'normal' | 'warn' | 'alert' {
  if (score <= spec.cuts.warn) return 'normal';
  if (score <= spec.cuts.alert) return 'warn';
  return 'alert';
}
