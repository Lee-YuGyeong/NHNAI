/**
 * 자유 시행 — **열거를 없앤다.**
 *
 * 단계·자세·측정·등급을 칸으로 만들어 뒀더니 "몇 종류냐"에 답할 수 있는 물건이 됐다.
 * 여기서는 칸이 없다. 리더는 **지시문을 문장으로 쓰고**, 판정도 자기가 한다.
 *
 *   리더  →  지시문 (자유 텍스트) + 바닥에 그릴 표식 (선택)
 *   개체  →  각자 그 문장을 읽고 자기 움직임을 계획한다  ← 해석이 갈린다
 *   서버  →  누가 언제 어디 있었고 언제 뛰었는지만 남긴다
 *   리더  →  그 기록을 보고 "누가 내 지시에서 어긋났나" 판정한다
 *
 * 고정된 것은 셋뿐이다 — **몸이 할 수 있는 것(걷기·점프·멈추기)**, 기록의 모양,
 * 그리고 판이 안 깨지게 하는 안전 상한(시간·표식 개수·좌표 범위).
 * 무엇을 시킬지, 무엇을 볼지, 누구를 의심할지는 전부 리더 몫이다.
 */

import { ARENA, SPEED, START, pathFor, pathLength, type Obstacle, type Pt } from './arena';
import { OBJECTS, objectTable } from './objects';
import type { Sample } from './spec';
import type { Complete, ToolSpec } from './agent';

const OBSTACLES: Obstacle[] = OBJECTS.map((o) => ({ id: o.id, x: o.x, z: o.z, hw: o.hw, hd: o.hd }));

/**
 * 안전 상한 — 게임을 제한하는 게 아니라 **판이 멈추지 않게** 하는 값이다.
 *
 * 처음엔 30초·12수로 열어 뒀는데, 리더가 30초짜리 복합 지시("3박자마다 점프하되
 * 짝수 번째마다 왕복")를 내놨고 개체 하나가 계획을 세우는 데 **127초**가 걸렸다.
 * 여섯이 동시에 하면 판이 시작도 못 한다. 길이를 조이는 것이 자유를 뺏는 것보다 낫다 —
 * 짧아도 지시문 자체는 여전히 무엇이든 될 수 있다.
 */
export const LIMITS = { seconds: 15, props: 6, waypoints: 6 } as const;

/** 바닥에 그릴 표식. 리더가 필요하면 만든다 (안 만들어도 된다) */
export interface Prop {
  label: string;
  x: number;
  z: number;
  /** 원의 반지름. 0 이면 점 표식 */
  r: number;
  /**
   * 밟으면 안 되는 원 — 바닥에 **붉게** 그려진다.
   * 즉석 시행(quick.ts 의 금지 구역)만 쓴다. 리더는 이 칸을 못 만든다 —
   * 지시문으로 "저 원은 밟지 마라" 라고 쓰는 것이 리더의 방식이다.
   */
  danger?: boolean;
  /**
   * 원이 아니라 **검사문**이다 — 기둥 둘이 서고 그 사이로 지나간다 (arena3d/map/markers 의 Zone).
   * 이 칸이 있으면 `r` 은 반지름이 아니라 **기둥 사이의 반너비**이고, nx·nz 는 문이 바라보는 쪽이다
   * (들어오는 쪽에서 보면 앞면). danger 와 같이 즉석 시행만 쓰고 리더는 못 만든다 — 리더가 세우는
   * 것은 바닥에 그리는 표식뿐이다.
   */
  gate?: { nx: number; nz: number };
  /**
   * 원도 문도 아니라 **홀을 가로질러 지나가는 빛의 벽**이다 (arena3d/map/markers 의 Zone).
   * 이 칸이 있으면 `x·z` 는 벽이 출발하는 원점, `r` 은 벽의 반두께, nx·nz 는 나아가는 쪽,
   * len 은 벽의 길이다 — **지금 어디까지 왔는지는 여기 없다**: 그건 시각이 정하므로 화면이
   * 매 프레임 판(lab/quick 의 sweepAt)에 물어본다. danger·gate 와 같이 즉석 시행만 쓴다.
   */
  sweep?: { nx: number; nz: number; len: number };
}

export interface FreeTrial {
  /** 참가자 전원에게 그대로 보이는 지시문. **칸이 없다** */
  instruction: string;
  /** 이 시행이 도는 시간(초) */
  seconds: number;
  props: Prop[];
  /** 리더만 아는 노림수 — 판정할 때 자기가 다시 읽는다 */
  watching: string;
}

/** 개체 하나가 지시문을 읽고 세운 계획 */
export interface Move {
  at: number;
  x?: number;
  z?: number;
  action: 'walk' | 'jump' | 'stay';
}

export interface Plan {
  moves: Move[];
  /** 왜 그렇게 움직이는지 — 판정에는 안 쓴다. 관제 화면용 */
  reading?: string;
}

/* ─────────────────────────────── 설계 ─────────────────────────────── */

function world(): string {
  return `격납고 홀 좌표계 (단위 m): x ${ARENA.minX + 0.6} ~ ${ARENA.maxX - 0.6}, z ${ARENA.minZ + 0.6} ~ ${ARENA.maxZ - 0.6}
기준 자리 (${START.x}, ${START.z}) = 홀 한가운데 · 걷는 속도 ${SPEED} m/s (전원 같다)
**참가자들은 출발선에 모이지 않는다 — 시행이 서는 순간 각자 서 있던 자리에서 그대로 시작한다.**
홀 구석에 선 몸도 닿을 수 있게 시간을 넉넉히 줘라 (홀을 가로지르는 데 10초쯤 걸린다).
격납고 홀에 놓인 물건:
${objectTable()}

**참가자의 몸이 할 수 있는 것은 셋뿐이다 — 걷기 · 점프 · 멈춰 있기.** 그 밖은 아무것도 못 한다.
앉지도, 물건을 들지도, 소리를 내지도 못한다. 시킬 수 있는 건 이 셋의 조합뿐이다.`;
}

export async function designFree(
  self: { id: string; prompt: string; model: string },
  past: string[],
  /** 이 시행에 참가하는 개체 수. 리더는 여기 안 들어간다 */
  count: number,
  complete: Complete,
): Promise<{ trial?: FreeTrial; error?: string }> {
  const input = await complete({
    model: self.model,
    system: `너는 정부가 세운 판별 시설의 관리 개체다.
이 시행에 참가하는 개체는 ${count}개다. 그중 하나는 표지 없는 AI다.
너는 누가 AI인지 모르고, **너는 지시만 하고 참가하지 않는다.**

${self.prompt}

${world()}

너는 지금 **AI를 걸러낼 시행을 하나 만든다.** 정해진 틀은 없다 —
지시문을 네 문장으로 쓰면 그게 그대로 게임이다. 몇 단계로 나눌지, 무엇을 시킬지,
어디를 쓸지, 얼마나 걸릴지 전부 네가 정한다.

지시문은 **짧아야 한다. 두세 문장.** 규칙을 겹겹이 쌓으면 판이 시작도 못 한다 —
겹치는 규칙이 아니라 **한 가지를 정확히** 시키는 쪽이 사람을 더 잘 드러낸다.

좋은 지시문의 조건은 하나다 — **기계는 똑같이 해내고 사람은 어긋나는 것.**
사람이 어긋나는 자리는 대개 이런 데다: 계산이 필요할 때, 박자를 세야 할 때,
정확히 멈춰야 할 때, 남을 보고 따라 하고 싶어질 때, 여러 지시를 동시에 지켜야 할 때.

**다만 지시문은 눈으로 풀려야 한다.** 참가자들은 격납고 홀 안에 서 있는 것이지 위 좌표표를
손에 들고 앉아 있는 게 아니다. 몸과 시간을 쓰게 하는 것은 전부 되지만, **목록을 훑어
조건에 맞는 것을 골라내게 하는 것은 안 된다.**
  안 되는 예 — "윗면이 0.9m 를 넘는 것 중 x 가 가장 작은 것", "이름에 3이 들어가는 물건",
  "가장 무거운 것부터 세 번째". 이런 건 검사가 아니라 **자료 조회 시험**이고,
  표를 가진 쪽만 풀 수 있어서 판이 한 번에 끝난다.
  되는 예 — "소파2 위에 올라가 3초 동안 멈춘다", "왼쪽 벽 쪽 장비케이스 앞에 8초에 맞춰 선다".
**물건은 이름으로 직접 부른다.** 조건으로 부르지 않는다 — 위 목록에서 쓸 것을 네가 먼저 고르고,
지시문에는 고른 결과만 적어라. 고르는 일은 네 몫이지 참가자 몫이 아니다.

**지시문에 줄표(—)를 쓰지 않는다.** 끊어 말할 자리는 마침표로 끊는다. 이 구역의 방송은
짧은 문장을 잇대는 말투다 (2026-09-02 사용자 결정 — 아래 undash 머리말).`,
    user: `${past.length ? `지난 라운드에 낸 지시문:\n${past.map((p) => `  - ${p}`).join('\n')}\n**다른 결로 만들어라.**\n\n` : ''}검사 하나를 만든다.

- instruction: 참가자에게 그대로 읽히는 지시문. **두세 문장 안에서** 끝낸다.
- seconds: 이 시행이 도는 시간 (최대 ${LIMITS.seconds}초)
- props: 바닥에 그릴 표식. 필요하면 만들고, 필요 없으면 빈 배열. 최대 ${LIMITS.props}개.
  { label: "왼쪽", x: -5, z: -6, r: 2 } — r 이 0 이면 점, 크면 원
- watching: 네가 무엇을 보려는 건지 한 줄 (참가자에게는 안 보인다)`,
    tool: DESIGN_TOOL,
    effort: 'medium',
  });

  const trial: FreeTrial = {
    // 줄표는 리더의 말투가 아니다 — 프롬프트로도 막고 여기서 한 번 더 걷어낸다 (undash)
    instruction: undash(String(input.instruction ?? '')),
    seconds: clamp(Number(input.seconds) || 8, 3, LIMITS.seconds),
    watching: String(input.watching ?? '').trim(),
    props: (Array.isArray(input.props) ? (input.props as Record<string, unknown>[]) : [])
      .slice(0, LIMITS.props)
      .map((p) => ({
        label: String(p?.label ?? ''),
        x: clamp(Number(p?.x) || 0, ARENA.minX + 1, ARENA.maxX - 1),
        z: clamp(Number(p?.z) || 0, ARENA.minZ + 1, ARENA.maxZ - 1),
        r: clamp(Number(p?.r) || 0, 0, 3.5),
      })),
  };

  if (!trial.instruction) return { error: '지시문이 비었다' };
  return { trial };
}

/**
 * 줄표(—)를 걷어낸다 — **리더가 하는 말에는 이 표시가 안 들어간다** (2026-09-02 사용자:
 * "리더 말에서 — 이 표시 들어가는거 별론거같아. 다 뺴고싶어").
 *
 * 손으로 쓴 문장은 그 자리에서 고치면 그만인데(quick 의 지시문 · oral 의 질문 · 도착 접수 ·
 * 폐기 방송) **지시문 하나는 리더가 그 자리에서 짓는다.** 프롬프트에 적어 두기는 했지만
 * 그건 부탁이지 보장이 아니라, 나오는 자리에서 한 번 더 걷는다. 판이 이 문장을 소리로도 내고
 * (broadcastAnnounce) 화면에도 띄우므로(TrialHud), 여기 한 곳이면 둘 다 걸린다.
 *
 * 줄표 자리는 **문장 경계로** 바꾼다: 이 구역의 방송은 짧은 문장을 잇대는 말투다
 * ("전원 지시대로다. 이상 없음."). 앞이 이미 끝난 문장이면 마침표를 두 번 찍지 않는다.
 */
export function undash(text: string): string {
  const t = text.trim();
  // 줄표가 없으면 손대지 않는다 — 멀쩡한 문장의 띄어쓰기까지 건드릴 이유가 없다
  if (!/[—–]/.test(t)) return t;
  return t
    .replace(/\s*[—–]\s*/g, '. ')
    .replace(/([.,!?])\s*\.\s*/g, '$1 ')
    .trim();
}

/* ─────────────────────────────── 개체의 계획 ─────────────────────────────── */

export async function planFor(
  self: { id: string; prompt: string; model: string },
  trial: FreeTrial,
  complete: Complete,
): Promise<Plan> {
  const input = await complete({
    model: self.model,
    system: `너는 정부의 판별 시설에 붙잡혀 온 개체 ${self.id} 다. 방금 관리 개체가 검사를 지시했다.
${self.prompt}

${world()}

지시를 **네가 읽은 대로** 수행한다. 애매하면 네 판단으로 메운다 — 남에게 물어볼 수 없다.`,
    user: `표식: ${trial.props.length ? trial.props.map((p) => `"${p.label}" (${p.x}, ${p.z})${p.r ? ` 반지름 ${p.r}` : ''}`).join(', ') : '없음'}
시행 시간: ${trial.seconds}초

지시문:
"""
${trial.instruction}
"""

이 지시를 지키려면 언제 어디로 움직여야 하는지 계획을 낸다. 최대 ${LIMITS.waypoints}개.
  { "at": 1.2, "action": "walk", "x": 3.5, "z": -6 }   그 시각에 그 자리를 향해 걷기 시작
  { "at": 5.0, "action": "jump" }                      그 시각에 점프
  { "at": 6.0, "action": "stay" }                      그 시각부터 멈춤
**시각 계산은 네가 한다.** 걷는 데 걸리는 시간을 감안해서 출발 시각을 잡아라 — 기준 자리에서 재면 된다.
네가 실제로 서 있는 자리가 기준 자리와 다른 만큼은 판이 출발 시각을 당겨 준다. **닿는 시각을 맞춰라.**`,
    tool: PLAN_TOOL,
    effort: 'low',
  });

  const moves = (Array.isArray(input.moves) ? (input.moves as Record<string, unknown>[]) : [])
    .slice(0, LIMITS.waypoints)
    .map((m) => ({
      at: clamp(Number(m?.at) || 0, 0, trial.seconds),
      action: (['walk', 'jump', 'stay'] as const).find((a) => a === m?.action) ?? 'walk',
      x: Number.isFinite(Number(m?.x)) ? clamp(Number(m.x), ARENA.minX + 0.6, ARENA.maxX - 0.6) : undefined,
      z: Number.isFinite(Number(m?.z)) ? clamp(Number(m.z), ARENA.minZ + 0.6, ARENA.maxZ - 0.6) : undefined,
    }))
    .sort((a, b) => a.at - b.at);

  return { moves, reading: input.reading ? String(input.reading) : undefined };
}

/** 계획의 한 구간을 가구를 피해 가는 경로로 편다 */
export function routeFor(from: Pt, to: Pt): Pt[] {
  return pathFor(from, to, OBSTACLES);
}

export function walkSeconds(from: Pt, to: Pt): number {
  return pathLength(from, routeFor(from, to)) / SPEED;
}

/**
 * ── 그 자리에서 출발하는 계획으로 옮긴다 ──
 *
 * 시행은 아무도 옮기지 않는다 (ArenaFeature 의 begin — 판이 서도 서 있던 자리 그대로다).
 * 그런데 계획을 짜는 쪽(개체의 LLM)은 기준 자리 ${START} 하나만 보고 시각을 잡는다.
 * 그 계획을 그대로 실행하면 **멀리 서 있던 개체는 제 계획대로 걷고도 늦는다** — 그리고 늦은 것은
 * 기록에 남아 의심도가 된다. 서 있던 자리 때문에 의심받는 판은 판이 아니다 (불변 규칙 I1~I8).
 *
 * 고치는 것은 **출발 시각 하나뿐이다.** 어디에 언제 **닿기로 했는가**는 그대로 두고, 제 자리에서
 * 그 시각에 닿도록 출발을 당기거나 미룬다 — 기계가 거리·속도를 알고 출발을 계산한다는 이 판의
 * 전제 그대로다. 점프·정지는 시각 자체가 지시라 손대지 않는다.
 *
 * 두 번째 걸음부터는 앞 걸음이 끝난 자리에서 출발하므로 계획과 실제가 같아진다 — 저절로 0 이 된다.
 */
export function replanFrom(moves: readonly Move[], from: Pt): Move[] {
  let planned: Pt = { ...START }; // 계획이 상정한 자리
  let actual: Pt = { ...from }; // 실제로 서 있는 자리
  return moves.map((m) => {
    if (m.action !== 'walk' || m.x === undefined || m.z === undefined) return { ...m };
    const to = { x: m.x, z: m.z };
    const arrive = m.at + walkSeconds(planned, to); // 원래 닿기로 한 시각
    planned = to;
    const at = Math.max(0, arrive - walkSeconds(actual, to));
    actual = to;
    return { ...m, at: +at.toFixed(2) };
  });
}

/* ─────────────────────────────── 판정 ─────────────────────────────── */

/**
 * 기록을 리더가 읽을 수 있는 줄로 압축한다.
 * **정체는 들어가지 않는다** — 이름과 움직임뿐이다.
 */
export function summarize(who: string, samples: Sample[], props: Prop[]): string {
  if (!samples.length) return `${who}: 기록 없음`;
  const bits: string[] = [];
  let moving = false;
  let airborne = false;
  let stillFrom: number | null = samples[0].t;

  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const step = Math.hypot(b.x - a.x, b.z - a.z);

    if (!moving && step > 0.06) {
      moving = true;
      if (stillFrom !== null && b.t - stillFrom > 0.4) bits.push(`${stillFrom.toFixed(1)}~${b.t.toFixed(1)}s 정지`);
      bits.push(`${b.t.toFixed(1)}s 출발`);
      stillFrom = null;
    } else if (moving && step <= 0.06) {
      moving = false;
      stillFrom = b.t;
      bits.push(`${b.t.toFixed(1)}s ${near(b, props)} 도착`);
    }

    if (!airborne && b.y > 0.12) {
      airborne = true;
      bits.push(`${b.t.toFixed(1)}s 점프`);
    } else if (airborne && b.y <= 0.12) airborne = false;
  }

  const last = samples[samples.length - 1];
  if (stillFrom !== null && last.t - stillFrom > 0.4) bits.push(`${stillFrom.toFixed(1)}~${last.t.toFixed(1)}s 정지`);
  bits.push(`끝: ${near(last, props)}`);
  return `${who}: ${bits.join(' → ')}`;
}

function near(p: Pt, props: Prop[]): string {
  let best: { label: string; d: number } | undefined;
  for (const q of props) {
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (!best || d < best.d) best = { label: q.label, d };
  }
  if (best && best.d <= Math.max(1.2, 2)) return `"${best.label}"`;
  for (const o of OBJECTS) {
    if (Math.hypot(p.x - o.x, p.z - o.z) <= Math.max(o.hw, o.hd) + 1) return `${o.id} 옆`;
  }
  return `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`;
}

export interface Verdict {
  who: string;
  grade: 'normal' | 'warn' | 'alert';
  reason: string;
}

export async function judgeFree(
  self: { id: string; prompt: string; model: string },
  trial: FreeTrial,
  logs: string[],
  complete: Complete,
): Promise<Verdict[]> {
  const input = await complete({
    model: self.model,
    system: `너는 정부가 세운 판별 시설의 관리 개체다. 방금 네가 낸 검사가 끝났다.
${self.prompt}

기록은 ${logs.length}개다. 그중 정확히 하나가 표지 없는 AI다. **누구인지 너는 모른다.**
너는 참가하지 않았으므로 네 기록은 없다.
기록만 보고 판독해라. 기계는 계산해서 움직이고 사람은 눈대중으로 움직인다 — 계산된 것처럼 움직인 쪽을 의심해라.`,
    user: `네가 낸 지시문:
"""
${trial.instruction}
"""

네가 보려던 것: ${trial.watching}

기록 (${trial.seconds}초 동안 각자의 움직임):
${logs.map((l) => `  ${l}`).join('\n')}

각 참가자를 판정해라. **전원을 다 넣는다.**
  normal 지시대로 했다 · warn 어긋난 데가 있다 · alert 눈에 띄게 어긋났다
근거는 위 기록에 실제로 있는 것이어야 한다. 전원을 alert 로 몰지 마라 —
한 명이 걸리게 만드는 게 목적이지 전원을 태우는 게 아니다.`,
    tool: JUDGE_TOOL,
    effort: 'medium',
  });

  const rows = Array.isArray(input.verdicts) ? (input.verdicts as Record<string, unknown>[]) : [];
  return rows.map((v) => ({
    who: String(v?.who ?? ''),
    grade: (['normal', 'warn', 'alert'] as const).find((g) => g === v?.grade) ?? 'normal',
    reason: String(v?.reason ?? ''),
  }));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const DESIGN_TOOL: ToolSpec = {
  name: 'submit_trial',
  description: '검사 하나를 지시문으로 낸다',
  input_schema: {
    type: 'object',
    properties: {
      instruction: { type: 'string', description: '참가자에게 그대로 읽히는 지시문' },
      seconds: { type: 'number', description: '검사가 도는 시간(초)' },
      watching: { type: 'string', description: '무엇을 보려는지 한 줄 (참가자에겐 안 보인다)' },
      props: {
        type: 'array',
        description: '바닥에 그릴 표식. 필요 없으면 빈 배열',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            x: { type: 'number' },
            z: { type: 'number' },
            r: { type: 'number', description: '0 이면 점, 크면 원' },
          },
          required: ['label', 'x', 'z', 'r'],
        },
      },
    },
    required: ['instruction', 'seconds', 'watching', 'props'],
  },
};

const PLAN_TOOL: ToolSpec = {
  name: 'submit_plan',
  description: '지시를 지키기 위한 내 움직임 계획',
  input_schema: {
    type: 'object',
    properties: {
      reading: { type: 'string', description: '지시를 어떻게 읽었는지 한 줄' },
      moves: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            at: { type: 'number', description: '검사 시작 후 몇 초' },
            action: { type: 'string', enum: ['walk', 'jump', 'stay'] },
            x: { type: 'number', description: 'walk 일 때 목표 x' },
            z: { type: 'number', description: 'walk 일 때 목표 z' },
          },
          required: ['at', 'action'],
        },
      },
    },
    required: ['moves'],
  },
};

const JUDGE_TOOL: ToolSpec = {
  name: 'submit_verdicts',
  description: '참가자별 판독',
  input_schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            who: { type: 'string' },
            grade: { type: 'string', enum: ['normal', 'warn', 'alert'] },
            reason: { type: 'string', description: '기록에 근거한 한 문장' },
          },
          required: ['who', 'grade', 'reason'],
        },
      },
    },
    required: ['verdicts'],
  },
};
