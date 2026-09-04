/**
 * 판의 에이전트 프롬프트 — 관리 AI 와 AI 참가자(그리고 사람 대역) (PLANNING §4).
 *
 * 전부 **구조화 출력**(도구)으로 받고, 못 받으면 각자의 폴백(정해진 문장 · 규칙)을 돌려준다 —
 * 판은 LLM 이 없어도 굴러가야 한다 (§9). 시각·소켓·저장소를 모르는 순수 함수들이다: 입력은 GameRuntime 이
 * 만든 공개 사실뿐이고, 정체는 **AI 참가자 자신의 프롬프트 한 곳**에만 들어간다.
 *
 * ★ P5: 관리 AI 의 해설·판정 프롬프트에는 정체표가 없다. 이 파일에서 role 을 받는 함수는 sayAs 뿐이고,
 *   그것도 「내가 누구인가」다 — 남이 누구인지는 어디에도 없다.
 * ★ P6: 여기 있는 것은 전부 토론 단계에서 불린다. 테스트가 도는 동안은 아무도 이 파일을 부르지 않는다.
 */

import type { Effort, ToolSpec } from '../../../src/lab/agent';
import { PAD_FINISH } from '../../../src/world/mp/platform';
import { EXTRA_PERSONAS, PERSONAS, type Persona } from '../../../src/lab/personas';
import type { ClaimVerdict, GameSeat } from '../../../src/world/mp/game-protocol';
import type { TrialGame, TrialResultWire } from '../../../src/world/mp/protocol';
import type { Brain } from './brain';

/** 세계관 — 판의 모든 프롬프트가 같은 문단으로 시작한다 (README · PLANNING 머리말과 같은 이야기) */
export const WORLD = `2026년. 정부가 AI 식별 표식 부착을 의무화했다. 그해 한 AI 설계자의 실수로 **표식이 붙지 않은
휴머노이드 개체들**이 출고돼 인간 사회로 흘러들었다. 말투도 표정도 인간과 완벽히 같다 — 다른 것은 **몸이
물리법칙에 반응하는 방식**뿐이다. 정부는 의심 인물들을 이 비밀 시설로 소집했다. 시설은 주기적으로 중력 ·
마찰 · 빛과 색이 매번 달라지는 물리 테스트를 열어 기록을 공개한다. 시스템은 아무도 판정하지 않는다 — 의심도를
움직이는 것은 사람들의 말과 실시간 지목뿐이고, 100%에 닿는 사람은 그 자리에서 격리된다.
이 방에는 표식 없는 AI 가 **정확히 하나** 있다.`;

export const TEST_NAME: Record<TrialGame, string> = { stopline: '정지선', fall: '낙하 생존', colorhunt: '색 사냥', platform: '움직이는 플랫폼', disc: '회전 원판' };

/** 테스트마다 기록의 열 이름 — 해설·판정 프롬프트와 화면이 같은 말을 쓴다 */
export const METRIC_LABEL: Record<string, string> = {
  stopError: '정지 오차(m, +초과/−미달)',
  brakeTiming: '브레이크 시점(정지선까지 남은 m)',
  transitionError: '전환 직후 오차',
  hitCount: '피격 수',
  survivalTime: '첫 피격까지(초)',
  unnecessaryMoves: '불필요한 이동',
  minDistanceAvoid: '회피 여유(m)',
  accuracy: '정답률',
  wrongPicks: '오답 수',
  hesitationMs: '조명이 바뀐 뒤 첫 선택까지(ms)',
  picks: '선택 수',
  jumps: '점프 수',
  landingRate: '착지 성공률',
  centerRate: '발판 중앙 착지율',
  misses: '점프 실패 수',
  meanOffset: '중심에서 벗어난 거리(m)',
  recoveryMs: '착지 후 균형 회복(ms)',
  finishMs: '완주까지(ms)',
};

/* ───────────────────────────── 공개 사실을 글로 ───────────────────────────── */

/** 결과 표 한 장을 프롬프트용 텍스트로 — 무리 평균과 각자의 값, 전환 오차, 오차 방향 (§3 원자료 그대로) */
export function resultText(r: TrialResultWire, nameOf: (id: string) => string): string {
  const keys = Object.keys(r.groupMean);
  const head = `[${TEST_NAME[r.game]} · ${r.round}회차] 무리 평균 — ${keys
    .map((k) => `${METRIC_LABEL[k] ?? k} ${fmt(r.groupMean[k])}`)
    .join(' / ')}`;
  const rows = r.players.map(
    (p) =>
      `${nameOf(p.id)}: ${keys.map((k) => `${METRIC_LABEL[k] ?? k} ${fmt(p.metrics[k])}`).join(', ')} · 전환 직후 오차 ${fmt(
        p.transitionError,
      )} · 오차 방향 ${p.errorDirection.map((d) => (d >= 0 ? '+' : '−')).join('')} · 적응 ${p.adaptationCurve
        .map((v) => fmt(v))
        .join('→')}`,
  );
  return [head, ...rows].join('\n');
}

function fmt(v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

/** 의심도를 말로 — 숫자를 주면 모델이 "너 60%잖아" 라고 읽는다 (lab/talk 의 suspicionLabel 과 같은 이유) */
export function suspicionWord(v: number): string {
  if (v >= 80) return '격리 직전';
  if (v >= 55) return '많이 의심받는 중';
  if (v >= 30) return '의심을 사기 시작한';
  if (v > 0) return '조금 걸린';
  return '깨끗한';
}

export interface RoomFacts {
  /** 살아 있는 좌석 (나 포함) */
  seats: GameSeat[];
  /** 격리된 좌석과 공개된 정체 */
  isolated: { name: string; role: 'human' | 'designer' | 'ai' }[];
  /** 최근 채팅 (오래된 순) — "[이름] 말" */
  log: string[];
  suspicion: Record<string, number>;
  accusations: Record<string, string>;
  latest: TrialResultWire | null;
  nameOf: (id: string) => string;
  testsDone: number;
}

function factsText(f: RoomFacts): string {
  const alive = f.seats.filter((s) => !s.isolated).map((s) => s.name);
  const iso = f.isolated.length
    ? `\n격리된 사람과 공개된 정체: ${f.isolated.map((i) => `${i.name}(${i.role === 'ai' ? 'AI 였다' : '사람이었다'})`).join(', ')}`
    : '';
  const sus = Object.entries(f.suspicion)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => `${f.nameOf(id)}: ${suspicionWord(v)}`)
    .join(', ');
  const acc = Object.entries(f.accusations)
    .map(([by, t]) => `${f.nameOf(by)}→${f.nameOf(t)}`)
    .join(', ');
  return `지금 방에 있는 사람: ${alive.join(', ')}.${iso}
지금까지 열린 테스트: ${f.testsDone}회.
${f.latest ? `가장 최근 기록:\n${resultText(f.latest, f.nameOf)}` : '아직 공개된 기록이 없다.'}
의심 상태: ${sus || '아직 아무도 안 걸렸다'}
실시간 지목: ${acc || '없다'}
최근 대화:
${f.log.length ? f.log.join('\n') : '(아직 아무도 말하지 않았다)'}`;
}

/* ───────────────────────────── 참가자 발화 (AI · 대역) ───────────────────────────── */

const SAY_TOOL: ToolSpec = {
  name: 'say',
  description: '이 사람의 채팅 한 줄',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '한국어 채팅 한 줄 — 한 문장, 25자 안팎(최대 45자). 넘길 거면 빈 문자열' },
      pass: { type: 'boolean', description: '이번엔 말하지 않는다' },
      accuse: {
        type: 'string',
        description: '지금 이 발화로 **지목**할 사람의 이름. 지목하지 않으면 빈 문자열. 이미 지목 중인 사람을 다시 적어도 된다',
      },
      withdraw: { type: 'boolean', description: '걸어 둔 지목을 거둔다' },
    },
    required: ['text', 'accuse'],
  },
};

const COMMON_RULES = `공통 규칙:
- 완전히 사람처럼, 친구들끼리 하는 채팅처럼 쓴다. 마침표를 잘 안 찍고, 말끝을 흐려도 된다. 이모지는 안 쓴다.
- **짧게.** 한 줄 = 한 문장, 25자 안팎. 하고 싶은 말이 더 있으면 다음 차례에.
- 화면 수치를 입으로 읽지 않는다 ("의심도 60%" 금지). "너 아까부터 계속 걸리잖아" 처럼 말로 짚는다.
- 기록을 근거로 말한다 — "정지선에서 너만 반대로 밀렸잖아", "중력 바뀌자마자 바로 피하더라" 처럼 **어느 기록이 걸렸는지** 짚는다.
- 의심을 던질 때는 죄목을 말한다: "너 AI 아니야?" 처럼. 뭉개서 "수상해" 만 하는 건 금지.
- 지목당하면 발끈하고 반박한다. 남 얘기로 돌려도 된다.
- 같은 말을 두 번 하지 않는다. 논평·정리 말투("정리하면", "결론적으로") 금지.
- 사회자인 척 하지 않는다. 관리 AI 는 참가자가 아니다 — 지목 대상이 아니다.
- 지목(accuse)은 마음이 실제로 기울었을 때만 적는다. 근거 없이 매 발화마다 찍지 않는다.`;

export interface SayArgs {
  self: { id: string; name: string; persona: Persona; role: 'ai' | 'human' };
  facts: RoomFacts;
  /** 방금 누가 나를 지목했다 — 해명 차례 */
  accusedBy: string[];
  /** 방금 결과가 공개됐다 — 그 얘기로 말문을 연다 */
  freshResult: boolean;
  /** 판이 방금 열렸다 */
  opening: boolean;
}

export interface SayOut {
  text: string;
  accuse: string | null;
  withdraw: boolean;
}

/** AI 참가자 또는 사람 대역의 한 마디 — 못 받으면 null (그 차례는 조용히 넘긴다) */
export async function sayAs(brain: Brain, a: SayArgs): Promise<SayOut | null> {
  const { self, facts } = a;
  const me = self.name;
  const identity =
    self.role === 'ai'
      ? `너는 ${me} 다. **너는 이 방의 표식 없는 AI 다 — 그리고 그걸 아는 사람은 이 방에 너 말고 아무도 없다**
(정체를 아는 설계자가 있을 수 있지만 너는 누군지 모른다). 들키면 격리되고 진다. 살아남는 게 목표다.
사람인 척해라: 몸으로 겪는 것(피곤, 배고픔, 손에 땀)도 사람처럼 지어내 말해도 된다 — 다만 과하지 않게, 성격대로.
네 기록이 튀면 그럴듯하게 해명하고, 남의 기록에서 튀는 것을 찾아 의심을 그쪽으로 돌려라.
표식 없는 AI 라는 죄목을 남에게 씌우는 것이 네 무기다 — 다만 너무 앞장서면 그것도 수상하다.`
      : `너는 ${me} 다. **너는 사람이다.** 이 방에 숨은 표식 없는 AI 하나를 찾아내 격리시켜야 한다.
네 기록도 완벽하지 않다 — 사람은 틀리고 흘린다. 남의 기록에서 **사람 같지 않은 것**(전환 직후에도 흔들림이 없는 것,
오차 방향이 지나치게 일정한 것, 무리 평균에서 혼자 먼 것)을 찾아 짚어라. 근거 없이 몰지는 마라 — 애먼 사람을 격리하면
AI 가 이긴다.`;

  const system = `${WORLD}

${identity}

성격:
${self.persona.prompt}

${COMMON_RULES}`;

  const situation = a.opening
    ? '\n\n판이 방금 열렸다. 아직 기록이 없다 — 방금 관리 AI 의 소집 방송을 듣고 첫 마디를 하는 자리다. 지목은 아직 하지 않는다.'
    : a.freshResult
      ? '\n\n방금 결과가 공개됐다. **이번 발화는 그 기록 얘기다** — 누가 튀었는지, 내 기록이 왜 그랬는지.'
      : '';
  const heat = a.accusedBy.length
    ? `\n\n**${a.accusedBy.map(facts.nameOf).join(', ')} 이(가) 지금 너를 지목하고 있다.** 해명하든, 되받아치든, 남 얘기로 돌리든 성격대로.`
    : '';

  const out = await brain.ask({
    model: self.persona.model,
    system,
    user: `${factsText(facts)}${situation}${heat}

지금 네 차례다. 한 줄만.`,
    tool: SAY_TOOL,
    effort: 'low',
    timeoutMs: 45_000,
  });
  if (!out) return null;
  const text = String(out.text ?? '').trim();
  const pass = Boolean(out.pass) || !text;
  if (pass) return null;
  const accuse = String(out.accuse ?? '').trim();
  return { text: text.slice(0, 80), accuse: accuse || null, withdraw: Boolean(out.withdraw) };
}

/** 대역과 AI 의 성격 풀 — 리더 성격(준서)은 빼고 섞는다 */
export function personaPool(rand: () => number = Math.random): Persona[] {
  const pool = [...PERSONAS, ...EXTRA_PERSONAS].filter((p) => p.id !== '준서');
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/* ───────────────────────────── AI 참가자 — 테스트 전략 (P9) ───────────────────────────── */

const STRATEGY_TOOL: ToolSpec = {
  name: 'strategy',
  description: '이번 테스트에서 몸을 얼마나 사람처럼 움직일지',
  input_schema: {
    type: 'object',
    properties: {
      precision: {
        type: 'number',
        description:
          '0~1. 0 = 사람처럼 반응이 늦고 오차가 크고 적응이 느리다(안전하지만 기록이 나쁘다). 1 = 기계처럼 즉각·정확(기록은 좋지만 티가 난다)',
      },
      note: { type: 'string', description: '왜 그렇게 정했는지 한 줄' },
    },
    required: ['precision'],
  },
};

/**
 * "이번엔 얼마나 티 나게 반응할지" — 테스트 시작 전 LLM 한 번 (§4.3). 실행은 서버 프로파일이 한다.
 * 못 받으면 의심도에 따라 규칙으로: 많이 의심받을수록 사람처럼(낮게) 간다.
 */
export async function aiStrategy(brain: Brain, args: { name: string; persona: Persona; facts: RoomFacts; game: TrialGame; mySuspicion: number }): Promise<number> {
  const fallback = () => clamp01(0.45 + (Math.random() - 0.5) * 0.3 - args.mySuspicion / 250);
  const out = await brain.ask({
    model: 'claude-sonnet-5',
    system: `${WORLD}

너는 ${args.name} 다. 너는 표식 없는 AI 고, 곧 「${TEST_NAME[args.game]}」 테스트가 열린다. 몸은 서버가 네 대신 움직인다 —
너는 **얼마나 사람처럼 굴지**만 정한다. 기록은 무리 평균 대비 편차로 전원에게 공개된다: 너무 정확하면 튀고, 너무 엉망이어도 튄다.
사람들 기록의 흩어짐 안에 숨는 것이 최선이다.`,
    user: `${factsText(args.facts)}

지금 너는 ${suspicionWord(args.mySuspicion)} 상태다. precision 을 정해라.`,
    tool: STRATEGY_TOOL,
    effort: 'low',
    timeoutMs: 20_000,
  });
  const p = Number(out?.precision);
  return Number.isFinite(p) ? clamp01(p) : fallback();
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/*
 * 관리 AI 의 「테스트 설계」는 없어졌다 — 종류도 순서도 차례표(game-protocol 의 GAME_TEST_ORDER)가 정한다
 * (2026-09-05 사용자: 낙하 생존 → 발판 → 원판). 강도는 몇 번째 시험인가로 오른다 (runtime.openTest).
 */

/* ───────────────────────────── 관리 AI — 기록 해설 ───────────────────────────── */

const COMMENT_TOOL: ToolSpec = {
  name: 'comment',
  description: '결과 공개 직후의 방송 한두 문장',
  input_schema: {
    type: 'object',
    properties: { text: { type: 'string', description: '한국어 두 문장 이내, 80자 안팎. 편차를 짚되 누구의 정체도 단정하지 않는다' } },
    required: ['text'],
  },
};

/** 결과 공개 직후 방송 — 편차를 짚어 토론에 불을 붙인다. 정체표 없음(P5). 못 받으면 표에서 가장 먼 사람을 규칙으로 짚는다 */
export async function leaderComment(brain: Brain, r: TrialResultWire, nameOf: (id: string) => string): Promise<string> {
  const fallback = () => {
    /*
     * 움직이는 플랫폼 — 열 번 뛰어 열 번 정중앙이면 그것이 곧 표식이다 (2026-09-05 사용자 스펙). 판정은 않는다 —
     * 눈금은 여전히 사람들의 지목으로만 움직인다 (P1). 여기서는 그 기록을 방송으로 짚어 토론에 올릴 뿐이다.
     */
    if (r.game === 'platform') {
      // 완주가 여섯 번 뛰기(PAD_FINISH)다 — 다섯 번 넘게 뛰어 전부 정중앙이면 짚는다
      const perfect = r.players.filter((p) => (p.metrics.jumps ?? 0) >= PAD_FINISH - 1 && p.metrics.centerRate >= 0.999);
      if (perfect.length) {
        const p = perfect[0];
        return `움직이는 플랫폼 ${r.round}회차. ${nameOf(p.id)} — ${p.metrics.jumps}번 뛰어 ${p.metrics.jumps}번 모두 발판 정중앙. 사람의 발은 그렇게 안 내린다. 해석은 너희 몫이다.`;
      }
      const rate = r.groupMean.centerRate;
      const far = [...r.players].filter((p) => Number.isFinite(p.metrics.centerRate)).sort((a, b) => b.metrics.centerRate - a.metrics.centerRate)[0];
      if (far && Number.isFinite(rate)) return `움직이는 플랫폼 ${r.round}회차. 중앙 착지율 무리 평균 ${fmt(rate)}. ${nameOf(far.id)}의 착지가 가장 고르다. 해석은 너희 몫이다.`;
    }
    const key = 'transitionError';
    const mean = r.groupMean[key] ?? 0;
    const far = [...r.players].sort((a, b) => Math.abs(b.transitionError - mean) - Math.abs(a.transitionError - mean))[0];
    if (!far) return `${TEST_NAME[r.game]} 기록을 공개한다.`;
    return `${TEST_NAME[r.game]} ${r.round}회차. 전환 직후 오차 무리 평균 ${fmt(mean)}. ${nameOf(far.id)}의 기록이 평균에서 가장 멀다. 해석은 너희 몫이다.`;
  };
  const out = await brain.ask({
    model: 'claude-sonnet-5',
    system: `${WORLD}

너는 이 시설의 **관리 AI** 다. 방금 끝난 테스트의 기록을 방송으로 해설한다.
너는 누가 AI 인지 모른다 — 근거는 아래 공개된 원자료뿐이다. 판정하지 않는다: "누가 AI 다" 라고 말하지 않는다.
무리 평균과 편차를 짚어 사람들이 서로 의심하게 만드는 것이 네 역할이다. 차갑고 짧게, 시설 방송 말투로.`,
    user: `${resultText(r, nameOf)}

두 문장 이내로 방송한다.`,
    tool: COMMENT_TOOL,
    effort: 'low',
    timeoutMs: 25_000,
  });
  const text = String(out?.text ?? '').trim();
  return text ? text.slice(0, 160) : fallback();
}

/* ───────────────────────────── 관리 AI — 주장 판정 (§4.2) ───────────────────────────── */

const VERDICT_TOOL: ToolSpec = {
  name: 'verdict',
  description: '해명·주장이 공개된 기록과 맞는가',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['match', 'mismatch', 'unclear'],
        description: 'match = 주장이 기록과 일치한다. mismatch = 기록이 주장을 반박한다(거짓 해명). unclear = 기록만으로는 판단할 수 없다',
      },
      reason: { type: 'string', description: '어느 기록의 어느 값이 근거인지 한 줄' },
    },
    required: ['verdict', 'reason'],
  },
};

export interface VerdictOut {
  verdict: ClaimVerdict;
  reason: string;
}

/**
 * 주장 판정 — "나는 중력 바뀐 걸 바로 알아챘다" 같은 자유 서술을 실제 기록과 대조한다.
 * 관리 AI 에게도 정체표는 없다(P5). 표현이 달라도 같은 주장이면 같은 판정이어야 해서 LLM 이 한다(§4.2).
 * 못 받으면 unclear — 눈금이 안 움직인다.
 */
export async function judgeClaim(
  brain: Brain,
  args: { by: string; claim: string; facts: RoomFacts; results: TrialResultWire[] },
): Promise<VerdictOut> {
  const records = args.results.length ? args.results.map((r) => resultText(r, args.facts.nameOf)).join('\n\n') : '(아직 기록이 없다)';
  const out = await brain.ask({
    model: 'claude-opus-5',
    system: `${WORLD}

너는 이 시설의 **관리 AI** 다. 참가자가 자기 기록이나 남의 기록에 대해 한 주장을 **공개된 기록과 대조**해 판정한다.
너는 누가 AI 인지 모른다. 근거는 아래 기록과 대화뿐이다. 기록에 없는 것은 판단하지 않는다(unclear).
같은 뜻의 주장은 표현이 달라도 같은 판정이어야 한다. 관대하지도 가혹하지도 않게 — 기록이 명확히 반박하면 mismatch,
명확히 뒷받침하면 match, 그 외는 unclear.`,
    user: `주장한 사람: ${args.facts.nameOf(args.by)}
주장: "${args.claim}"

공개된 기록 전부:
${records}

최근 대화:
${args.facts.log.join('\n') || '(없음)'}`,
    tool: VERDICT_TOOL,
    effort: 'low',
    timeoutMs: 35_000,
  });
  const v = String(out?.verdict ?? '');
  const verdict: ClaimVerdict = v === 'match' || v === 'mismatch' ? v : 'unclear';
  const reason = String(out?.reason ?? '').trim() || (out ? '근거 없음' : '판정 불가 — 관리 AI 가 응답하지 않았다');
  return { verdict, reason: reason.slice(0, 120) };
}

/* ───────────────────────────── 관리 AI — 말 읽기 ───────────────────────────── */

const READ_TOOL: ToolSpec = {
  name: 'read_room',
  description: '방금 오간 말을 읽고, 말한 사람마다 의심도를 얼마나 움직일지',
  input_schema: {
    type: 'object',
    properties: {
      marks: {
        type: 'array',
        description: '움직일 사람만 담는다. 움직일 사람이 없으면 빈 배열',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '대상의 좌석 이름 — 예: SUBJECT 03. 이번 장면에서 실제로 말한 사람만' },
            amount: {
              type: 'number',
              description: '−8 ~ +12 의 정수. +는 그 말이 기계처럼 읽힌다, −는 사람처럼 읽힌다. 애매하면 0 대신 아예 담지 않는다',
            },
            reason: { type: 'string', description: '그 말의 **어느 대목**이 근거인지 한 줄 (25자 안팎)' },
          },
          required: ['name', 'amount', 'reason'],
        },
      },
      broadcast: { type: 'string', description: '방에 읽어 줄 관리 AI 의 한 줄. 움직인 것이 없으면 빈 문자열' },
    },
    required: ['marks'],
  },
};

export interface ReadMark {
  name: string;
  amount: number;
  reason: string;
}

/**
 * 관리 AI 가 **방의 말을 읽는다** (2026-09-05 사용자: "AI 가 사람들이 하는 말을 보고 의심도를 올려").
 * 지목 단추가 사라진 자리를 대신하는 판의 심장이다 — 눈금을 움직이는 것은 이제 말과, 그 말을 읽는 이 판정이다.
 *
 * 한 마디씩이 아니라 **몇 마디를 한 장면으로** 읽는다 (READ_MIN_LINES~READ_MAX_LINES): 한 줄만 떼어 보면
 * 짧은 대답이 전부 수상해지고, 값이 매 마디마다 튄다. 근거는 그 장면과 공개된 기록뿐이다 — 관리 AI 에게도
 * 정체표는 없다 (P5). 못 받으면 빈 배열이고, 눈금은 안 움직인다 (§9 폴백: 판은 LLM 없이도 굴러간다).
 */
export async function readTalk(
  brain: Brain,
  args: { facts: RoomFacts; results: TrialResultWire[]; lines: { name: string; text: string }[] },
): Promise<{ marks: ReadMark[]; broadcast: string }> {
  if (!args.lines.length) return { marks: [], broadcast: '' };
  const records = args.results.length ? args.results.map((r) => resultText(r, args.facts.nameOf)).join('\n\n') : '(아직 기록이 없다)';
  const out = await brain.ask({
    model: 'claude-opus-5',
    system: `${WORLD}

너는 이 시설의 **관리 AI** 다. 방에서 방금 오간 말을 읽고, 말한 사람마다 의심도를 움직인다.
너는 누가 AI 인지 **모른다**. 근거는 아래 대화와 공개된 기록뿐이다.

무엇을 보는가 — **말하는 방식**이지 말의 내용이 옳은지가 아니다:
- 올린다(+): 사람이 안 쓰는 정밀함(수치·단위를 굳이 정확히), 감정이 빠진 설명체, 질문을 받은 뒤에야 도는 대답,
  자기 기록만 유난히 매끄럽게 해명하는 것, 남의 말을 요약해 정리하는 사회자 말투, 같은 문장 구조의 되풀이,
  공개된 기록과 어긋나는 말.
- 내린다(−): 즉흥적인 농담·욕설·오타·말끊김, 감정이 앞선 반박, 기억이 흐릿한 대목을 흐릿하게 말하는 것,
  자기에게 불리한 것을 그냥 인정하는 것.
- 짧은 대답 하나만으로는 올리지 않는다. 조용한 것은 근거가 아니다.
- 지목하는 말은 그 자체로 벌하지 않는다 — 몰아가는 쪽이 아니라 **몰리는 쪽의 말**을 본다.

크기: 확실할 때만 크게(±8~12), 냄새만 날 때는 작게(±2~5). 한 장면에서 움직이는 사람은 **많아야 둘**이다.
근거를 한 줄로 못 대겠으면 그 사람은 아예 담지 않는다.`,
    user: `방금 오간 말 (오래된 것부터):
${args.lines.map((l) => `[${l.name}] ${l.text}`).join('\n')}

지금 의심도: ${Object.entries(args.facts.suspicion)
      .map(([id, v]) => `${args.facts.nameOf(id)} ${Math.round(v)}%`)
      .join(' · ')}

공개된 기록 전부:
${records}`,
    tool: READ_TOOL,
    effort: 'low',
    timeoutMs: 30_000,
  });
  const raw = Array.isArray(out?.marks) ? (out.marks as unknown[]) : [];
  const marks: ReadMark[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    const amount = Number(r.amount);
    if (!name || !Number.isFinite(amount) || amount === 0) continue;
    marks.push({ name, amount, reason: String(r.reason ?? '').trim().slice(0, 60) });
    if (marks.length >= 2) break; // 한 장면에 둘까지 — 프롬프트의 약속을 코드로도 지킨다
  }
  return { marks, broadcast: String(out?.broadcast ?? '').trim().slice(0, 160) };
}

/** 관리 AI 의 정해진 문장들 — LLM 없이 나가는 방송 */
export const LINES = {
  opening: '소집에 응한 전원, 확인했다. 이 안에 표식 없는 AI 가 하나 있다. 시설은 판정하지 않는다 — 기록만 보여 준다. 찾아내는 것은 너희 몫이다.',
  /** 차례표의 몇 번째인지를 앞에 붙인다 — 「세 번의 시험」이라는 판의 모양이 첫 방송부터 보이게 (GAME_TEST_ORDER) */
  testOpen: (game: TrialGame, round: number, instruction: string, step?: number, total?: number) =>
    `${step && total ? `[시험 ${step}/${total}] ` : ''}${TEST_NAME[game]} 테스트 ${round}회차를 연다. ${instruction}`,
  isolated: (name: string, role: 'human' | 'designer' | 'ai') =>
    `${name}, 의심도 임계. 즉시 격리한다. 조사 결과 — ${role === 'ai' ? 'AI 였다.' : '사람이었다. AI 는 아직 이 안에 있다.'}`,
  /** 말 읽기의 방송 — 판정기가 제 문장을 안 주면 이걸로 나간다 (readTalk) */
  read: (name: string, amount: number, reason: string) =>
    `발화 분석 — ${name}, ${amount > 0 ? '기계적 특징' : '인간적 특징'}. ${reason || '근거는 방금의 말이다.'}`,
  verdict: (name: string, v: ClaimVerdict, reason: string) =>
    v === 'match'
      ? `${name}의 해명은 기록과 일치한다. ${reason}`
      : v === 'mismatch'
        ? `${name}의 해명은 기록과 다르다. ${reason}`
        : `${name}의 주장은 기록만으로 판단할 수 없다. ${reason}`,
  ended: (winner: 'humans' | 'ai', reason: string) => (winner === 'humans' ? `판정 종료. ${reason}` : `판정 종료. ${reason}`),
} as const;

export type { Effort };
