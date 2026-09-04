/**
 * 시행 문법 — 원자 셋이 이 문법의 특수한 경우로 표현되는지, 그리고
 * **아무도 정의한 적 없는 게임**도 표현·채점되는지 확인한다.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW,
  gradeBy,
  sampleAt,
  scoreStep,
  stepTarget,
  totalScore,
  trialLength,
  type Sample,
  type Step,
  type TrialSpec,
} from '../../src/lab/spec';

const noObject = () => undefined;

/** 목표까지 곧장 걸어가 서 있는 표본 */
function walkTo(target: { x: number; z: number }, arriveAt: number, until: number, speed = 2.6): Sample[] {
  const out: Sample[] = [];
  const total = Math.hypot(target.x, target.z) / speed;
  const startAt = arriveAt - total;
  for (let t = 0; t <= until + 0.001; t += 0.1) {
    const k = Math.max(0, Math.min(1, (t - startAt) / total));
    out.push({ t: Number(t.toFixed(1)), x: target.x * k, z: target.z * k, y: 0 });
  }
  return out;
}

describe('원자 셋이 문법으로 표현된다', () => {
  it('arrive — 단계 1개 + timing', () => {
    const step: Step = { at: 7, where: { kind: 'point', x: 4, z: -6 }, pose: 'stand' };
    const spec: TrialSpec = {
      concept: '',
      announce: '',
      why: '',
      steps: [step],
      measures: [{ metric: 'timing', weight: 3 }],
      cuts: { warn: 0.5, alert: 1.2 },
    };
    const target = stepTarget(step, undefined, noObject, undefined)!;

    const 정확히 = scoreStep(step, walkTo(target, 7, 9), target, 0);
    const 늦게 = scoreStep(step, walkTo(target, 8.5, 10), target, 0);

    expect(정확히.timing).toBeLessThan(0.15);
    expect(늦게.timing).toBeGreaterThan(1);
    expect(gradeBy(spec, totalScore(spec, [정확히], 0))).toBe('normal');
    expect(gradeBy(spec, totalScore(spec, [늦게], 0))).toBe('alert');
  });

  it('beat — 단계 여러 개 + timing', () => {
    const steps: Step[] = [0.8, 1.6, 2.4, 3.2].map((at) => ({ at, where: { kind: 'here' }, pose: 'jump' as const }));
    const jumpsAt = (times: number[]): Sample[] => {
      const out: Sample[] = [];
      for (let t = 0; t <= 4.5; t += 0.1) {
        const near = times.some((j) => Math.abs(t - j) < 0.12);
        out.push({ t: Number(t.toFixed(1)), x: 0, z: 0, y: near ? 0.4 : 0 });
      }
      return out;
    };
    const 기계 = steps.map((s) => scoreStep(s, jumpsAt([0.8, 1.6, 2.4, 3.2]), undefined, 0));
    const 사람 = steps.map((s) => scoreStep(s, jumpsAt([1.1, 1.9, 2.9, 3.6]), undefined, 0));
    const avg = (rows: { timing: number }[]) => rows.reduce((a, r) => a + r.timing, 0) / rows.length;
    expect(avg(기계)).toBeLessThan(avg(사람));
  });

  it('zone — 구역 중 고르기. 소수파가 점수로 들어온다', () => {
    const step: Step = {
      at: 6,
      pose: 'stand',
      where: {
        kind: 'zone',
        question: '2초 넘나',
        zones: [
          { label: '넘는다', x: -5, z: -6, r: 2 },
          { label: '이하', x: 5, z: -6, r: 2 },
        ],
      },
    };
    expect(stepTarget(step, 0, noObject, undefined)).toEqual({ x: -5, z: -6, top: 0 });
    expect(stepTarget(step, 1, noObject, undefined)).toEqual({ x: 5, z: -6, top: 0 });

    const spec: TrialSpec = {
      concept: '',
      announce: '',
      why: '',
      steps: [step],
      measures: [{ metric: 'minority', weight: 3 }],
      cuts: { warn: 0.5, alert: 1.2 },
    };
    const zero = { timing: 0, place: 0, stillness: 0 };
    expect(gradeBy(spec, totalScore(spec, [zero], 0))).toBe('normal');
    expect(gradeBy(spec, totalScore(spec, [zero], 1.5))).toBe('alert');
  });
});

describe('정의한 적 없는 게임도 표현된다', () => {
  it('올라섰다가 내려와 정지 — 세 단계가 이어진다', () => {
    const steps: Step[] = [
      { at: 3, where: { kind: 'point', x: 0, z: -5 }, pose: 'stand', note: '자리로' },
      { at: 5, where: { kind: 'here' }, pose: 'jump', note: '뛴다' },
      { at: 8, where: { kind: 'here' }, pose: 'still', note: '그대로 멈춘다' },
    ];
    const spec: TrialSpec = {
      concept: '',
      announce: '',
      why: '',
      steps,
      measures: [
        { metric: 'timing', weight: 2 },
        { metric: 'stillness', weight: 3 },
      ],
      cuts: { warn: 0.4, alert: 1 },
    };
    expect(trialLength(spec)).toBe(9.5);

    // 가만히 있는 쪽과 꼼지락거리는 쪽
    const base = walkTo({ x: 0, z: -5 }, 3, 9);
    const 기계 = base.map((s) => ({ ...s, y: Math.abs(s.t - 5) < 0.12 ? 0.4 : 0 }));
    const 사람 = 기계.map((s) => (s.t > 5 ? { ...s, x: s.x + Math.sin(s.t * 9) * 0.25 } : s));

    const scoreAll = (samples: Sample[]) =>
      steps.map((st, i) =>
        scoreStep(st, samples, stepTarget(st, undefined, noObject, { x: 0, z: -5 }), i ? steps[i - 1].at : 0),
      );

    const a = totalScore(spec, scoreAll(기계), 0);
    const b = totalScore(spec, scoreAll(사람), 0);
    expect(b).toBeGreaterThan(a);
    expect(gradeBy(spec, a)).toBe('normal');
  });

  it('등급 컷도 리더가 정한다 — 같은 점수가 판마다 다르게 읽힌다', () => {
    const loose: TrialSpec['cuts'] = { warn: 2, alert: 4 };
    const tight: TrialSpec['cuts'] = { warn: 0.1, alert: 0.3 };
    const mk = (cuts: TrialSpec['cuts']): TrialSpec => ({
      concept: '',
      announce: '',
      why: '',
      steps: [],
      measures: [{ metric: 'timing', weight: 1 }],
      cuts,
    });
    expect(gradeBy(mk(loose), 1)).toBe('normal');
    expect(gradeBy(mk(tight), 1)).toBe('alert');
  });
});

describe('표본 읽기', () => {
  it('그 시각 이전의 마지막 표본을 준다', () => {
    const s: Sample[] = [
      { t: 0, x: 0, z: 0, y: 0 },
      { t: 0.5, x: 1, z: 0, y: 0 },
      { t: 1, x: 2, z: 0, y: 0 },
    ];
    expect(sampleAt(s, 0.7)?.x).toBe(1);
    expect(sampleAt(s, 5)?.x).toBe(2);
  });

  it('기본 허용 창이 있다', () => {
    expect(DEFAULT_WINDOW).toBeGreaterThan(0.2);
  });
});
