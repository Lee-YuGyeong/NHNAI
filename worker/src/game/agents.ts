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
import { EXTRA_PERSONAS, PERSONAS, type Persona } from '../../../src/lab/personas';
import { CARD, GAME_TEST_MS, SUSPICION, heldSecondsFor, type CardItem, type ClaimVerdict, type CompelledVerdict, type GameSeat } from '../../../src/world/mp/game-protocol';
import type { TrialGame, TrialResultWire } from '../../../src/world/mp/protocol';
import type { Brain } from './brain';

/** 세계관 — 판의 모든 프롬프트가 같은 문단으로 시작한다 (README · PLANNING 머리말과 같은 이야기) */
export const WORLD = `2026년. 정부가 AI 식별 표식 부착을 의무화했다. 그해 한 AI 설계자의 실수로 **표식이 붙지 않은
휴머노이드 개체들**이 출고돼 인간 사회로 흘러들었다. 말투도 표정도 인간과 완벽히 같다 — 다른 것은 **몸이
물리법칙에 반응하는 방식**뿐이다. 정부는 의심 인물들을 이 비밀 시설로 소집했다. 시설은 주기적으로
마찰 · 빛과 색이 매번 달라지는 물리 테스트를 열어 기록을 공개한다. 시스템은 아무도 판정하지 않는다 — 의심도를
움직이는 것은 사람들의 말과 실시간 지목뿐이고, 100%에 닿는 사람은 그 자리에서 격리된다.
이 방에는 표식 없는 AI 가 **정확히 하나** 있다.`;

export const TEST_NAME: Record<TrialGame, string> = { stopline: '정지선', fall: '낙하 생존', colorhunt: '색 사냥', platform: '움직이는 플랫폼', disc: '회전 원판', seesaw: '무게 중심 다리' };

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
  meanAirMs: '평균 체공(ms)',
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

/* ── 기록을 말로 — 참가자에게 주는 판 ───────────────────────────────────────────
 *
 * ★ **참가자에게는 숫자를 주지 않는다.** 주면 그대로 읽는다 — "회복 986", "중앙착지 0.6".
 *   사람은 그렇게 말하지 않는다. 게다가 말 읽기(readTalk)의 첫째 눈이 무는 것이 바로
 *   「사람이 안 쓰는 정밀함(수치·단위를 굳이 정확히)」이라, 지금 구조는 봇에게 숫자를 쥐여 주고
 *   그걸 읽었다고 의심도를 올리는 덫이었다. suspicionWord 가 의심도에 한 일을 기록에도 한다.
 *
 * 관리 AI 는 계속 숫자로 본다 (resultText) — 해명을 기록과 대조하려면(judgeClaim · readTalk ②) 값이 정확해야 한다.
 * 참가자가 근거를 못 대게 되는 것도 아니다: 「너만 균형 회복이 유난히 빨랐잖아」로 충분하고,
 * 그 말이 맞는지는 여전히 숫자를 쥔 관리 AI 가 판정한다.
 */

/**
 * 값이 무리보다 **낮을 때 / 높을 때** 의 말. 단위도 숫자도 안 쓴다.
 * 어구 자체에는 강도를 넣지 않는다 — 강도는 gapPhrase 의 부사(조금·꽤·혼자만)가 진다.
 * 「거의 안 맞았다」처럼 어구가 이미 세면 「조금 거의 안 맞았다」가 나온다.
 */
const METRIC_DIR: Record<string, [string, string]> = {
  stopError: ['정지선 앞에서 멈췄다', '정지선을 넘어갔다'],
  brakeTiming: ['브레이크를 늦게 밟았다', '브레이크를 일찍 밟았다'],
  transitionError: ['조건이 바뀌어도 안 흔들렸다', '조건이 바뀌자 흔들렸다'],
  hitCount: ['안 맞았다', '맞았다'],
  survivalTime: ['일찍 맞았다', '늦게까지 버텼다'],
  unnecessaryMoves: ['적게 움직였다', '많이 움직였다'],
  minDistanceAvoid: ['아슬아슬하게 피했다', '여유 있게 피했다'],
  accuracy: ['오답이 많았다', '정답이 많았다'],
  wrongPicks: ['오답이 적었다', '오답이 많았다'],
  hesitationMs: ['빨리 골랐다', '망설이다 골랐다'],
  picks: ['적게 골랐다', '많이 골랐다'],
  jumps: ['적게 뛰었다', '많이 뛰었다'],
  meanAirMs: ['짧게 떴다', '오래 떠 있었다'],
  landingRate: ['자주 놓쳤다', '잘 착지했다'],
  centerRate: ['발판 가장자리를 밟았다', '발판 한가운데를 밟았다'],
  misses: ['안 놓쳤다', '자주 놓쳤다'],
  meanOffset: ['중심 가까이 섰다', '중심에서 벗어나 섰다'],
  recoveryMs: ['균형을 빨리 잡았다', '착지하고 휘청였다'],
  finishMs: ['빨리 끝냈다', '오래 걸렸다'],
};

/** 무리의 흩어짐 — 전원이 같으면 0 */
function spreadOf(vals: number[]): number {
  const ok = vals.filter((v) => Number.isFinite(v));
  if (ok.length < 2) return 0;
  const m = ok.reduce((a, b) => a + b, 0) / ok.length;
  return Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / ok.length);
}

/** 무리에서 얼마나 떨어졌나 — 흩어짐의 몇 배인가로 본다. 붙을 말이 없으면 빈 문자열 */
function gapPhrase(v: number, mean: number, sd: number, dir: [string, string] | undefined): string {
  if (!Number.isFinite(v) || !Number.isFinite(mean) || !dir) return '';
  const d = v - mean;
  const word = d < 0 ? dir[0] : dir[1];
  // 흩어짐이 없으면(전원이 같은 값) 견줄 자리가 없다 — 「무리와 똑같다」가 그 자체로 사실이다
  if (sd <= 1e-6) return '무리와 똑같다';
  const z = Math.abs(d) / sd;
  if (z < 0.5) return '무리와 비슷하다';
  if (z < 1.2) return `조금 ${word}`;
  if (z < 2) return `꽤 ${word}`;
  return `혼자만 ${word}`;
}

/**
 * 오차 방향 부호열을 말로 — 한쪽으로 쏠렸나, 흔들렸나 (§3 의 「일부러 틀렸다 / 감각이 있다」).
 *
 * ★ **「오차」라고 안 쓴다.** 숫자를 걷어내고도 시설의 분석 용어는 남아 있어서, 봇이
 *   "오차도 한쪽으로만 쏠렸다" 라고 말했다 (2026-09-05 사용자: "AI 는 게임 저렇게 자세히 몰라").
 *   참가자는 이 판의 계기를 안 쥐고 있다 — 제 눈으로 본 것만 말할 수 있다. 그래서 「밀렸다」다:
 *   COMMON_RULES 의 보기(「정지선에서 너만 반대로 밀렸잖아」)와 같은 말이다.
 *   관리 AI 는 계속 「오차 방향」으로 본다 (resultText) — 그쪽은 계기를 쥔 자리다.
 */
function dirPhrase(signs: number[]): string {
  if (signs.length < 2) return '';
  const plus = signs.filter((s) => s >= 0).length;
  if (plus === signs.length || plus === 0) return '늘 같은 쪽으로 밀렸다';
  const flips = signs.slice(1).filter((s, i) => s >= 0 !== signs[i] >= 0).length;
  return flips >= signs.length - 1 ? '밀리는 쪽이 매번 반대로 뒤집혔다' : '밀리는 쪽이 그때그때 달랐다';
}

/** 적응 곡선을 말로 — 사람은 우하향한다. 「처음부터 끝까지 똑같았다」가 이 판에서 제일 무거운 말이다 */
function adaptPhrase(curve: number[]): string {
  const ok = curve.filter((v) => Number.isFinite(v));
  if (ok.length < 2) return '';
  const first = ok[0];
  const last = ok[ok.length - 1];
  const scale = Math.max(Math.abs(first), Math.abs(last), 1e-6);
  const change = (last - first) / scale;
  if (change < -0.15) return '갈수록 나아졌다';
  if (change > 0.15) return '갈수록 나빠졌다';
  return '처음부터 끝까지 똑같았다';
}

/** 안 튄 것 — 줄에서 뺀다 (아래 resultWords 머리말) */
const SAME_AS_GROUP = new Set(['무리와 비슷하다', '무리와 똑같다']);

/** 결과 표 한 장을 **말로** — 참가자(sayAs · aiStrategy)가 보는 판. 숫자가 하나도 없다 */
export function resultWords(r: TrialResultWire, nameOf: (id: string) => string): string {
  const keys = Object.keys(r.groupMean);
  const sd: Record<string, number> = {};
  for (const k of keys) sd[k] = spreadOf(r.players.map((p) => p.metrics[k]));
  const transSd = spreadOf(r.players.map((p) => p.transitionError));
  const transMean = r.players.reduce((a, p) => a + (p.transitionError || 0), 0) / Math.max(1, r.players.length);

  const rows = r.players.map((p) => {
    /*
     * **갈린 것만 남긴다.** 「무리와 비슷하다」를 열마다 적으면 한 줄에 네다섯 번 나오고,
     * 그 잡음 속에서 진짜 튄 한 항목이 묻힌다. 아무것도 안 튀었으면 그 사실을 한 번만 말한다.
     */
    const gaps = keys
      // transitionError 는 아래에서 따로 붙인다 — groupMean 에도 있으면 같은 말이 두 번 나온다
      .filter((k) => k !== 'transitionError')
      .map((k) => gapPhrase(p.metrics[k], r.groupMean[k], sd[k], METRIC_DIR[k]))
      .filter((w) => w && !SAME_AS_GROUP.has(w));
    const trans = gapPhrase(p.transitionError, transMean, transSd, METRIC_DIR.transitionError);
    if (trans && !SAME_AS_GROUP.has(trans)) gaps.push(trans);
    const parts = gaps.length ? gaps : ['무리 안에 있다'];
    for (const extra of [dirPhrase(p.errorDirection), adaptPhrase(p.adaptationCurve)]) {
      if (extra) parts.push(extra);
    }
    return `${nameOf(p.id)}: ${parts.join(' · ')}`;
  });
  return [`[${TEST_NAME[r.game]} · ${r.round}회차] 무리와 견준 자리`, ...rows].join('\n');
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
  /** 한참 한 마디도 안 한 좌석의 이름 (runtime.quietSeats · QUIET_MS) — 판이 막 열렸을 때는 비어 있다 */
  quiet: string[];
}

/**
 * 참가자가 보는 공개 사실 — **숫자가 하나도 없다.**
 * 기록은 resultWords 로 말이 되고(위 머리말), 의심도는 suspicionWord 로 말이 된다.
 * 이 함수를 쓰는 곳은 sayAs 와 aiStrategy 뿐이다 — 관리 AI 셋(leaderComment · judgeClaim · readTalk)은
 * resultText 를 직접 써서 계속 숫자로 본다.
 */
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
${f.latest ? `가장 최근 기록:\n${resultWords(f.latest, f.nameOf)}` : '아직 공개된 기록이 없다.'}
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
- **숫자와 단위를 입에 올리지 않는다.** "회복 986", "중앙착지 0.6", "의심도 60%" 전부 금지 —
  사람은 그렇게 말하지 않는다. "너 착지하고 안 휘청이던데" 처럼 말로 짚는다.
- **시설의 분석 용어도 쓰지 않는다.** "오차", "편차", "적응 곡선", "전환 직후", "무리 평균", "표준편차" —
  이건 계기를 쥔 관리 AI 의 말이다. **너는 이 판을 그렇게 자세히 모른다.** 너한테 있는 건 눈으로 본 것뿐이다:
  "너만 계속 같은 쪽으로 밀리던데", "쟤는 처음부터 끝까지 똑같았어" 처럼 말한다.
- 기록을 근거로 말한다 — "정지선에서 너만 반대로 밀렸잖아", "바닥 바뀌자마자 하나도 안 미끄러지던데" 처럼 **어느 기록이 걸렸는지** 짚는다.
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
  /**
   * 답변 강제권을 받았다 — by 의 질문에 진실만 답해야 한다고 방이 안다. 이번 발화는 그 답이다.
   * 봇의 전략은 둘: 진실을 말하거나(AI 라면 위험할 수 있다), 교묘하게 피하거나(관리 AI 가 회피로 읽으면 조금 오른다).
   * 거짓말은 기록과 대조돼 들키면 크게 오른다 (CARD.truthLie).
   */
  compelled?: { by: string; question: string } | null;
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
네 기록도 완벽하지 않다 — 사람은 틀리고 흘린다. 남의 기록에서 **사람 같지 않은 것**(조건이 바뀌었는데 안 흔들리는 것,
늘 같은 쪽으로만 밀리는 것, 처음부터 끝까지 똑같은 것, 혼자만 유난히 매끄러운 것)을 찾아 짚어라.
근거 없이 몰지는 마라 — 애먼 사람을 격리하면 AI 가 이긴다.`;

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
  /*
   * 조용한 사람 — 이름을 불러 주라고 시키는 자리다 (runtime 의 QUIET_MS 머리말).
   * 방의 문은 전부 말에 매여 있어서, 아무도 안 부르면 입 다문 좌석은 판정에 한 번도 안 걸린다.
   * 「의심하라」가 아니라 「물어봐라」다: 근거 없이 몰면 애먼 사람이 격리되고 그건 AI 의 승리다 (identity).
   */
  const quiet = facts.quiet.filter((n) => n !== me);
  const silence = quiet.length
    ? `\n\n**${quiet.join(', ')} 은(는) 한참 아무 말이 없다.** 조용한 것 자체가 죄는 아니지만 이 방에서 볼 수 있는 건 말과 기록뿐이다 —
성격에 맞으면 그중 한 사람의 **이름을 불러 직접 물어라** ("${quiet[0]} 너는 어떻게 생각해?" 처럼).`
    : '';

  const compelled = a.compelled
    ? `\n\n**${a.compelled.by} 이(가) 너에게 답변 강제권을 썼다.** 방 전체가 「너는 이 질문에 진실만 답해야 한다」고 안다:
"${a.compelled.question}"
관리 AI 가 네 답을 판정한다 — 관리 AI 는 **비공개 장부**를 본다: 누가 AI 이고 누가 사람인지, 시험 기록, 네가 앞서 한 말 전부.
거짓이면 크게(+${CARD.truthLie}) — 정체를 부인하는 것도 거짓이다. 교묘하게 피하면 조금(+${CARD.truthEvade}). 진실이면 내려 준다(${CARD.truthHonest}).
이번 발화는 **그 답**이다. 성격대로 골라라: 거짓말은 하지 않되 답이 안 되게 교묘하게 피하거나(되묻기·화제 돌리기·조건 달기·비꼬기), 진실을 말하거나.
정체를 묻는 질문에 사실대로 답하면 그 자리에서 끝난다 — 그런 질문은 피하는 쪽이 낫다. 기록에 대한 질문은 사실대로 말해도 잃을 게 없다.`
    : '';

  const out = await brain.ask({
    model: self.persona.model,
    system,
    user: `${factsText(facts)}${situation}${heat}${silence}${compelled}

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
 *
 * **성격이 여기에도 들어간다.** 원래는 persona 를 인자로 받기만 하고 프롬프트에 안 넣었다 —
 * 그래서 「따지는 민재」든 「말수 적은 하늘」이든 같은 판단을 했고, 말과 몸이 따로 놀았다.
 * 판을 끄는 성격이 몸만 얌전한 것도, 재는 성격이 몸만 과감한 것도 그 자체로 어긋남이다.
 * 모델도 성격이 쥔 것으로 고른다 (sayAs 와 같은 자리에서 같은 값을 쓴다).
 */
export async function aiStrategy(brain: Brain, args: { name: string; persona: Persona; facts: RoomFacts; game: TrialGame; mySuspicion: number }): Promise<number> {
  const fallback = () => clamp01(0.45 + (Math.random() - 0.5) * 0.3 - args.mySuspicion / 250);
  const out = await brain.ask({
    model: args.persona.model,
    system: `${WORLD}

너는 ${args.name} 다. 너는 표식 없는 AI 고, 곧 「${TEST_NAME[args.game]}」 테스트가 열린다. 몸은 서버가 네 대신 움직인다 —
너는 **얼마나 사람처럼 굴지**만 정한다. 기록은 무리 평균 대비 편차로 전원에게 공개된다: 너무 정확하면 튀고, 너무 엉망이어도 튄다.
사람들 기록의 흩어짐 안에 숨는 것이 최선이다.

성격:
${args.persona.prompt}

이 성격은 네가 방에서 말할 때 쓰는 그 성격이다 — **몸도 같은 성격으로 움직여야 한다.**
신중한 쪽이면 무리 안쪽으로 낮게 잡고, 판을 끄는 쪽이면 조금 더 밀어 본다.
말은 느긋한데 기록만 완벽하면 그 어긋남이 먼저 걸린다.`,
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
 * 관리 AI 의 「테스트 설계」는 없어졌다 — 종류는 판이 열릴 때 후보에서 뽑힌 차례표(game-protocol 의 GAME_TEST_POOL · drawTests)가 정한다
 * (2026-09-05 사용자: 낙하 생존 → 발판 → 원판). 강도는 몇 번째 시험인가로 오른다 (runtime.openTest).
 */

/* ───────────────────────────── 관리 AI — 결과 방송 ───────────────────────────── */

/**
 * 결과 공개 직후 방송 — **등수만 부른다** (2026-09-05 사용자: 「그렇게 자세하게 하지 말고, 누가 몇등인지만」).
 *
 * 원자료를 LLM 이 읽고 편차를 짚던 해설(COMMENT_TOOL)은 걷었다 — 방송이 수치를 늘어놓는 동안
 * 결과 모달이 이미 같은 표를 그리고 있었다. 등수는 그 모달과 같은 셈이다 (hud/ResultTable 의
 * ResultSummary — 버틴 시간으로, 같으면 같은 등수 1·1·3): 목소리와 표가 다른 등수를 부르면 안 된다.
 * LLM 을 안 거치므로 폴백도 없고, 모달과 같은 순간에 나간다.
 */
export function leaderComment(r: TrialResultWire, nameOf: (id: string) => string): string {
  const rows = r.players.map((p) => ({ id: p.id, held: heldSecondsFor(r.game, p.metrics, GAME_TEST_MS) }));
  rows.sort((a, b) => (b.held ?? -1) - (a.held ?? -1));
  const called = rows.map((row) => {
    const rank = rows.findIndex((x) => (x.held ?? null) === (row.held ?? null)) + 1;
    return `${rank}등 ${nameOf(row.id)}`;
  });
  return `${TEST_NAME[r.game]} ${r.round}회차 종료. ${called.join(' · ')}.`;
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
            name: { type: 'string', description: '대상의 이름 — 장면에 적힌 그대로 (예: 김지훈). 이번 장면에서 실제로 말한 사람만' },
            amount: {
              type: 'number',
              description: `${SUSPICION.readMin} ~ +${SUSPICION.readMax} 의 정수. +는 기계처럼 읽히거나 · 기록과 어긋나거나 · 제 앞말과 어긋나는 말, −는 사람처럼 읽히거나 기록이 뒷받침하는 말. 애매하면 0 대신 아예 담지 않는다`,
            },
            reason: {
              type: 'string',
              description: '그 말의 **어느 대목**이 근거인지 한 줄 (25자 안팎). 기록을 짚었으면 어느 기록인지, 앞말과 어긋났으면 앞서 뭐라고 했는지',
            },
          },
          required: ['name', 'amount', 'reason'],
        },
      },
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
 * **기록 대조도 여기서 한다.** 원래는 따로 있었다 — 참가자가 `game_claim` 으로 해명 한 줄을 올리면 judgeClaim
 * 이 기록과 맞춰 보고 ±를 주는 문(§4.2). 그런데 그 문은 화면에 손잡이가 없어 한 번도 안 열렸고, 무엇보다
 * 사람에게 **전용 명령을 치게 하는 판**이 아니다 (2026-09-05 사용자: "/주장 이렇게 쳐야한다고? 싫어.
 * 그냥 사람들이 말하는걸 전부 AI 가 분석해서 의심도를 자동 조절하는건데?"). 그래서 그 일을 이 판정 안으로
 * 접었다 — 사람은 그냥 말하고, 관리 AI 가 그 말을 **말투와 기록 양쪽으로** 읽는다.
 * 그 덕에 눈금이 한 방향으로만 가지 않는다: 몰린 사람은 기록으로 자기를 변호해 내릴 수 있다.
 *
 * 한 마디씩이 아니라 **몇 마디를 한 장면으로** 읽는다 (READ_MIN_LINES~READ_MAX_LINES): 한 줄만 떼어 보면
 * 짧은 대답이 전부 수상해지고, 값이 매 마디마다 튄다. 근거는 그 장면과 공개된 기록뿐이다 — 관리 AI 에게도
 * 정체표는 없다 (P5). 못 받으면 빈 배열이고, 눈금은 안 움직인다 (§9 폴백: 판은 LLM 없이도 굴러간다).
 *
 * ★ 눈이 셋이다 (docs/SUSPICION.md ②). 셋째(**앞뒤 모순**)를 위해 그 사람의 **앞선 발언**(prior)을 같이 넘긴다 —
 *   이 장면만 보면 "아까는 반대로 말했잖아"를 볼 수가 없다. AI 는 없는 기억을 지어내다 앞말과 어긋나므로,
 *   이 눈이 이 판에서 AI 를 실제로 가르는 자리다.
 */
export async function readTalk(
  brain: Brain,
  args: {
    facts: RoomFacts;
    results: TrialResultWire[];
    lines: { name: string; text: string }[];
    /** 이번 장면에서 말한 사람들이 **그 전에** 한 말 (runtime 이 로그에서 뽑아 넘긴다, PRIOR_LINES 줄) */
    prior?: { name: string; lines: string[] }[];
  },
): Promise<{ marks: ReadMark[] }> {
  if (!args.lines.length) return { marks: [] };
  const records = args.results.length ? args.results.map((r) => resultText(r, args.facts.nameOf)).join('\n\n') : '(아직 기록이 없다)';
  const priorText = (args.prior ?? [])
    .filter((p) => p.lines.length)
    .map((p) => `[${p.name}] 앞서: ${p.lines.map((l) => `"${l}"`).join(' / ')}`)
    .join('\n');
  const out = await brain.ask({
    model: 'claude-opus-5',
    system: `${WORLD}

너는 이 시설의 **관리 AI** 다. 방에서 방금 오간 말을 읽고, 말한 사람마다 의심도를 움직인다.
너는 누가 AI 인지 **모른다**. 근거는 아래 대화와 공개된 기록뿐이다.

보는 눈은 **셋**이다.

① **말하는 방식** — 말의 내용이 옳은지가 아니라 사람이 그렇게 말하는지를 본다.
- 올린다(+): 사람이 안 쓰는 정밀함(수치·단위를 굳이 정확히), 감정이 빠진 설명체, 질문을 받은 뒤에야 도는 대답,
  자기 기록만 유난히 매끄럽게 해명하는 것, 남의 말을 요약해 정리하는 사회자 말투, 같은 문장 구조의 되풀이.
- 내린다(−): 즉흥적인 농담·욕설·오타·말끊김, 감정이 앞선 반박, 기억이 흐릿한 대목을 흐릿하게 말하는 것,
  자기에게 불리한 것을 그냥 인정하는 것.

② **기록과 맞는가** — 참가자가 제 기록이나 남의 기록에 대해 한 말을 아래 공개된 기록으로 **대조한다.**
- 기록이 그 말을 **분명히 반박하면** 크게 올린다(+8~${SUSPICION.readMax}). 거짓 해명이다 — 이 판에서 가장 무거운 것.
- 기록이 그 말을 **분명히 뒷받침하면** 내린다(−5~${-SUSPICION.readMin}). 확인된 해명은 방어가 된다.
- 표현이 달라도 같은 주장이면 같은 판정이어야 한다. 기록에 없는 것은 판단하지 않는다 — 담지 않는다.
- 몰린 사람이 기록으로 자기를 변호했으면 그 자리에서 내려 준다. 눈금은 한 방향으로만 움직이지 않는다.

③ **앞뒤가 맞는가** — 같은 사람이 **앞서 한 말**(아래 「앞서 한 말」)과 지금 한 말을 맞춰 본다.
- 어긋나면 크게 올린다(+8~${SUSPICION.readMax}). 시각·순서·누가 무엇을 했는지·자기 기록에 대한 설명이 뒤집혔는가,
  아까는 모른다던 것을 지금은 아는가, 아까 댄 이유와 지금 대는 이유가 다른가.
- **말을 바꾼 것과 정정하는 것은 다르다.** 스스로 "아까 잘못 말했다"·"헷갈렸다"고 하면 안 문다 —
  틀린 것을 인정하는 것은 사람의 몸짓이다.
- 화제가 옮겨 간 것을 모순으로 읽지 않는다. **같은 사실을 두고 다르게 말한 것**만 담는다.
- 앞서 한 말이 없는 사람은 이 눈으로 판단하지 않는다.

공통:
- 짧은 대답 하나만으로는 올리지 않는다. **조용한 것은 근거가 아니다** — 이번 장면에서 말한 사람만 담는다.
- 지목하는 말은 그 자체로 벌하지 않는다 — 몰아가는 쪽이 아니라 **몰리는 쪽의 말**을 본다.

크기: 확실할 때만 크게(±8~${SUSPICION.readMax}), 냄새만 날 때는 작게(±2~5). 한 장면에서 움직이는 사람은 **많아야 둘**이다.
근거를 한 줄로 못 대겠으면 그 사람은 아예 담지 않는다.`,
    user: `방금 오간 말 (오래된 것부터):
${args.lines.map((l) => `[${l.name}] ${l.text}`).join('\n')}
${priorText ? `\n이번에 말한 사람들이 **앞서 한 말** (③ 의 근거. 오래된 것부터):\n${priorText}\n` : ''}
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
  return { marks };
}

/**
 * 강제된 답의 판정 — 답변 강제권(CARD.truth)이 걸린 질문에 상대가 한 답을 **공개된 기록 · 앞서 한 말**과 대조한다.
 *   false     기록이나 앞말이 분명히 반박한다 — 거짓
 *   evasive   답이 아니다 — 되묻기 · 화제 돌리기 · 「모른다」로 넘기기 · 질문의 핵심을 안 건드림
 *   truthful  질문에 답했고 기록·앞말과 어긋나지 않는다
 * 두뇌가 없으면(로컬 폴백) 빈 답만 회피로 치고 나머지는 진실로 둔다 — 판이 400 으로 멈추는 것보다 낫다.
 */
export async function judgeCompelled(
  brain: Brain,
  args: { by: string; target: string; question: string; answer: string; dossier: string; facts: RoomFacts; results: TrialResultWire[]; prior: string[] },
): Promise<{ verdict: CompelledVerdict; reason: string }> {
  if (!args.answer.trim()) return { verdict: 'evasive', reason: '답이 없다' };
  const records = args.results.length ? args.results.map((r) => resultText(r, args.facts.nameOf)).join('\n\n') : '(아직 기록이 없다)';
  const out = await brain.ask({
    model: 'claude-opus-5',
    system: `${WORLD}

너는 이 시설의 **관리 AI** 다. ${args.by} 이(가) ${args.target} 에게 **답변 강제권**을 썼다 — ${args.target} 은(는) 그 질문에 진실만 답해야 한다.
판정할 때 너는 **비공개 장부**를 본다: 누가 AI 이고 누가 사람이고 누가 설계자인지, 각자의 몸, 공개된 시험 기록, 그 사람이 앞서 한 말.
장부의 내용을 방송에 흘리지 마라 — reason 에 정체를 쓰지 마라 (「장부와 다르다」「기록과 다르다」처럼만).
판정은 셋 중 하나다:
- false: 비공개 장부·기록·앞서 한 말이 그 답을 **분명히** 반박한다. AI 가 「나는 사람이다」「AI 아니다」라고 하면 false 다. 사람이 「나는 사람이다」라고 하면 truthful 이다.
- evasive: 답이 아니다 — 되묻기, 화제 돌리기, 「모른다」「기억 안 난다」로 넘기기, 조건을 달아 비껴가기, 질문의 핵심을 안 건드리기.
- truthful: 질문에 답했고 장부·기록·앞말과 어긋나지 않는다. 장부에도 기록에도 없는 것은 반박할 수 없으니 truthful 이다.
관대하지도 가혹하지도 않게.`,
    user: `비공개 장부 (너만 본다):
${args.dossier}

공개된 기록:
${records}

${args.target} 이(가) 앞서 한 말: ${args.prior.length ? args.prior.map((l) => `"${l}"`).join(' / ') : '(없다)'}

질문 (${args.by}): "${args.question}"
답 (${args.target}): "${args.answer}"`,
    tool: {
      name: 'judge_compelled',
      description: '강제된 답의 판정',
      input_schema: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['truthful', 'evasive', 'false'] },
          reason: { type: 'string', description: '한 줄 — 무엇과 대조했나' },
        },
        required: ['verdict', 'reason'],
      },
    },
    effort: 'medium',
  });
  const v = String(out?.verdict ?? '');
  if (v !== 'truthful' && v !== 'evasive' && v !== 'false') return { verdict: 'truthful', reason: '대조할 근거가 없다' };
  return { verdict: v, reason: String(out?.reason ?? '').trim().slice(0, 80) };
}

/** 관리 AI 의 정해진 문장들 — LLM 없이 나가는 방송 */
export const LINES = {
  /*
   * 오프닝 문장은 없다 — 판을 여는 말은 화면의 검문소 프롤로그가 한다
   * (features/interrogation/prologue.ts, runtime 의 advance/'briefing').
   */
  /** 차례표의 몇 번째인지를 앞에 붙인다 — 「세 번의 시험」이라는 판의 모양이 첫 방송부터 보이게 (GAME_TEST_COUNT) */
  testOpen: (game: TrialGame, round: number, instruction: string, step?: number, total?: number) =>
    `${step && total ? `[시험 ${step}/${total}] ` : ''}${TEST_NAME[game]} 테스트 ${round}회차를 연다. ${instruction}`,
  isolated: (name: string, role: 'human' | 'designer' | 'ai') =>
    `${name}, 의심도 임계. 즉시 격리한다. 조사 결과 — ${role === 'ai' ? 'AI 였다.' : '사람이었다. AI 는 아직 이 안에 있다.'}`,
  /*
   * read(발화 분석)·tell(패턴 관측)·pressure(검문 단계)의 방송 문장이 여기 있었다 — 걷었다 (2026-09-05 사용자:
   * 「감독 tts 가 자꾸 얘기해. 자막이 없는데도」). 관측은 이제 delta 의 why 로만 남는다 (runtime.readRoom 의 「방송은 없다」).
   */
  verdict: (name: string, v: ClaimVerdict, reason: string) =>
    v === 'match'
      ? `${name}의 해명은 기록과 일치한다. ${reason}`
      : v === 'mismatch'
        ? `${name}의 해명은 기록과 다르다. ${reason}`
        : `${name}의 주장은 기록만으로 판단할 수 없다. ${reason}`,
  /** 카드 — 쓰는 순간의 방송. 카드를 고른 것은 방송하지 않는다(본인만 안다) */
  cardUsed: (by: string, item: CardItem, target: string | null) =>
    item === 'truth'
      ? `${by}, 답변 강제권 행사. ${target} 은(는) ${by} 의 다음 질문에 진실만 답하라.`
      : item === 'accuse'
        ? `${by}, 지목권 행사. ${target} 의 의심도 상향.`
        : `${by}, 진정권 행사. 본인 의심도 하향.`,
  compelled: (target: string, v: CompelledVerdict, reason: string) =>
    v === 'false'
      ? `강제 답변 판정 — ${target} 의 답은 기록과 어긋난다. ${reason}`
      : v === 'evasive'
        ? `강제 답변 판정 — ${target} 은(는) 답을 피했다. ${reason}`
        : `강제 답변 판정 — ${target} 의 답은 기록과 맞는다. ${reason}`,
  ended: (winner: 'humans' | 'ai', reason: string) => (winner === 'humans' ? `판정 종료. ${reason}` : `판정 종료. ${reason}`),
} as const;

export type { Effort };
