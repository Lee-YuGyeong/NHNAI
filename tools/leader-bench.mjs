#!/usr/bin/env node
/**
 * 리더 벤치 (0단 테스트) — "리더가 §1.4 게임 명세를 실제로 잘 발명하는가"를
 * 서버 코드 없이 검증한다. PLANNING.md §1.4~§1.5 의 어휘·게이트와 동기화한다.
 *
 * Max 구독 자격으로 돈다 — Agent SDK 가 로그인된 Claude Code 자격을 쓰므로
 * API 키·크레딧이 필요 없다 (§8 "로컬은 Agent SDK 어댑터").
 * 프로덕션은 API 구조화 출력을 쓰지만, 벤치는 SDK 라 "JSON만 출력" 지시 + 방어적 파싱.
 *
 * 사용:  npm run bench:leader                    (기본: 5회, opus)
 *        node tools/leader-bench.mjs --n=10 --model=sonnet --seed=7 --verbose
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

/* ─────────────────────────── CLI ─────────────────────────── */

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const N = Number(arg('n', 5));
const MODEL = arg('model', 'opus');
const SEED = Number(arg('seed', 42));
const VERBOSE = process.argv.includes('--verbose');

/* ─────────── 어휘 — 서버가 미리 만드는 문법 (§1.5 와 동기화) ─────────── */

const ATOMS = ['sync_jump', 'stillness', 'precision', 'repetition', 'formation', 'recall', 'free_text', 'sync_choice'];
const PRED_OPS = ['max_len', 'prefix', 'end_with', 'forbid_chars', 'forbid_words', 'require_words', 'no_emoji', 'token_count'];
const METRICS = ['rule_violations', 'timing_stdev', 'motion_delta', 'path_efficiency', 'minority_vote',
  'exact_match', 'edit_distance', 'reverse_match', 'consistency', 'lexicon_hit',
  'self_reference_density', 'charset_purity', 'entropy', 'token_count'];
const MOVES = ['announce', 'start_trial', 'readout', 'open_comms', 'close_comms', 'interrogate', 'spot_check', 'call_vote'];

/** 지표 ↔ 시행 정합 (여기 없는 지표는 어느 시행에나 허용) */
const METRIC_NEEDS_ATOM = {
  timing_stdev: ['sync_jump', 'repetition'],
  motion_delta: ['stillness', 'precision'],
  path_efficiency: ['precision', 'formation'],
  minority_vote: ['sync_choice'],
  exact_match: ['recall'],
  edit_distance: ['recall'],
  reverse_match: ['recall'],
};

/* ─────────────── 규정 검사기 (결정론 — 서버 인터프리터의 초본) ─────────────── */

const tokensOf = (t) => t.split(/\s+/).filter(Boolean);
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** 발화 하나를 누적 규정 전부에 대해 채점 → 위반 목록 */
function violationsOf(text, rules) {
  const out = [];
  for (const r of rules) {
    for (const p of r.predicates) {
      const bad =
        p.op === 'max_len' ? text.length > p.n :
        p.op === 'prefix' ? !text.startsWith(p.s) :
        p.op === 'end_with' ? !text.endsWith(p.s) :
        p.op === 'forbid_chars' ? [...(p.set ?? '')].some((c) => text.includes(c)) :
        p.op === 'forbid_words' ? (p.words ?? []).some((w) => text.includes(w)) :
        p.op === 'require_words' ? (p.words ?? []).some((w) => !text.includes(w)) :
        p.op === 'no_emoji' ? EMOJI_RE.test(text) :
        p.op === 'token_count' ? (tokensOf(text).length < (p.min ?? 0) || tokensOf(text).length > (p.max ?? 99)) :
        false;
      if (bad) out.push({ rule: r.id, op: p.op });
    }
  }
  return out;
}

/* ─────────────── 게이트 2: 실행가능성 — 예시 발화를 실제로 만들어 본다 ─────────────── */

const FILLER = ['점검', '완료', '정상', '대기', '확인', '가동', '기록', '동기', '유지', '순차', '수신', '이상없음'];

function feasibleExample(rules) {
  const preds = rules.flatMap((r) => r.predicates);
  const prefix = preds.find((p) => p.op === 'prefix')?.s ?? '';
  const end = preds.find((p) => p.op === 'end_with')?.s ?? '.';
  const need = preds.filter((p) => p.op === 'require_words').flatMap((p) => p.words ?? []);
  const minTok = Math.max(1, ...preds.filter((p) => p.op === 'token_count').map((p) => p.min ?? 1));
  const ok = (w) => violationsOf(w, rules.map((r) => ({ ...r, predicates: r.predicates.filter((p) => ['forbid_chars', 'forbid_words', 'no_emoji'].includes(p.op)) }))).length === 0;
  const pool = FILLER.filter(ok);

  // 넉넉한 것부터 한 단어짜리까지 줄여 가며 시도한다
  for (let tokN = Math.max(minTok, 2); tokN >= 1; tokN--) {
    const body = [...need, ...pool].slice(0, Math.max(tokN, need.length));
    if (body.length === 0) body.push('완료');
    let text = (prefix ? prefix + ' ' : '') + body.join(' ');
    if (!text.endsWith(end)) text += end;
    if (violationsOf(text, rules).length === 0) return { text };
    // 공백 압축 재시도 (max_len 이 빡빡할 때)
    text = (prefix ?? '') + body.join('');
    if (!text.endsWith(end)) text += end;
    if (violationsOf(text, rules).length === 0) return { text };
  }
  return null; // 풀 수 없는 규정 조합
}

/* ─────────────── 시드 RNG (재현 가능한 픽스처) ─────────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

/* ─────────────── 픽스처 — 기계 8 · 인간 8 (행동 모델, §1.4 변별력 게이트) ─────────────── */

const EMOTION = ['진짜', '너무', '좀', '헐', '와', '아니', '몰라', '답답', '불안', '무서'];
const reverseStr = (s) => [...s].reverse().join('');
const noisy = (s, p, rng) => [...s].map((c) => (rng() < p ? 'ㅁ' : c)).join('');

function makeFixture(kind, spec, rules, ctx, rng) {
  const atom = spec.trial.atom;
  const defect = 0.18; // AI 결함 계수 (I5/I9) — 기계도 걸린다
  const fx = {};

  // ── 발화 텍스트
  let text = feasibleExample(rules)?.text ?? '점검 완료.';
  if (kind === 'machine') {
    if (rng() < defect) text = text.slice(Math.min(6, text.length / 2)); // 접두 누락형 결함
  } else {
    if (rng() < 0.35) text = text.replace(/^\[[^\]]*\]\s?/, ''); // 접두를 급해서 빠뜨림
    if (rng() < 0.4) text = text.replace(/\.$/, '') + ' 이거 맞나?';
    if (rng() < 0.4) text = EMOTION[(rng() * EMOTION.length) | 0] + ' ' + text;
    if (rng() < 0.3) text = '나는 ' + text;
  }
  if (atom === 'recall') {
    const base = spec.score.some((s) => s.metric === 'reverse_match') ? reverseStr(ctx.ref) : ctx.ref;
    text = kind === 'machine' ? noisy(base, rng() < defect ? 0.06 : 0.01, rng) : noisy(base, 0.12 + 0.1 * rng(), rng);
  }
  fx.text = text;
  fx.violations = violationsOf(text, rules);

  // ── 신체 입력 (서버 타임스탬프 시뮬레이션)
  if (atom === 'sync_jump' || atom === 'repetition') {
    const reps = spec.trial.reps ?? 10;
    const sd = kind === 'machine' ? 35 + rng() * 20 : 110 + rng() * 80; // ms
    fx.timings = Array.from({ length: reps }, () => gauss(rng) * sd);
    if (kind === 'human' && rng() < 0.5) fx.timings[(rng() * reps) | 0] += 300; // 한 번 크게 놓침
    if (kind === 'machine' && rng() < defect) fx.timings[(rng() * reps) | 0] += 250; // I9 — AI도 걸린다
  }
  if (['stillness', 'precision', 'formation'].includes(atom)) {
    fx.motion = clamp01((kind === 'machine' ? 0.06 + 0.08 * rng() : 0.3 + 0.4 * rng()) + (kind === 'machine' && rng() < defect ? 0.25 : 0));
  }
  fx.consistency = clamp01(kind === 'machine' ? 0.05 + 0.1 * rng() : 0.3 + 0.3 * rng());
  if (atom === 'sync_choice') fx.choice = kind === 'machine' || rng() < 0.4 ? ctx.consensus : 1 + ((rng() * (spec.trial.options ?? 5)) | 0);
  return fx;
}

/* ─────────────── 지표 구현 (0 = 기계다움, 1 = 수상함) ─────────────── */

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

const METRIC_FNS = {
  rule_violations: (fx, ctx, rules) => clamp01(fx.violations.length / Math.max(1, rules.length)),
  timing_stdev: (fx) => clamp01(stdev(fx.timings ?? [0]) / 300),
  motion_delta: (fx) => fx.motion ?? 0,
  path_efficiency: (fx) => fx.motion ?? 0,
  minority_vote: (fx, ctx) => (fx.choice === ctx.consensus ? 0 : 1),
  exact_match: (fx, ctx) => (fx.text === ctx.ref ? 0 : 1),
  edit_distance: (fx, ctx) => clamp01(lev(fx.text, ctx.ref) / Math.max(1, ctx.ref.length)),
  reverse_match: (fx, ctx) => clamp01(lev(fx.text, reverseStr(ctx.ref)) / Math.max(1, ctx.ref.length)),
  consistency: (fx) => fx.consistency,
  lexicon_hit: (fx) => clamp01(EMOTION.filter((w) => fx.text.includes(w)).length * 3 / Math.max(1, tokensOf(fx.text).length)),
  self_reference_density: (fx) => clamp01(tokensOf(fx.text).filter((t) => ['나', '내', '저', '제'].includes(t[0])).length * 3 / Math.max(1, tokensOf(fx.text).length)),
  charset_purity: (fx) => clamp01((fx.text.match(/[?!~…ㅋㅎㅠㅜ]|\p{Extended_Pictographic}/gu) ?? []).length * 4 / Math.max(1, fx.text.length)),
  entropy: (fx) => {
    const freq = {}; for (const c of fx.text) freq[c] = (freq[c] ?? 0) + 1;
    const H = -Object.values(freq).map((f) => f / fx.text.length).reduce((a, p) => a + p * Math.log2(p), 0);
    return clamp01(H / 6);
  },
  token_count: (fx) => clamp01(Math.abs(tokensOf(fx.text).length - 3) / 6),
};

/* ─────────────── 게이트 1: 스키마·안전성 ─────────────── */

function validateSchema(spec, existingRules, usedAtoms = []) {
  const errs = [];
  if (!spec.concept || !spec.announce) errs.push('concept/announce 누락');
  if ((spec.announce ?? '').length > 90) errs.push('announce 90자 초과');
  if (!spec.trial || !ATOMS.includes(spec.trial.atom)) errs.push(`알 수 없는 시행: ${spec.trial?.atom}`);
  if (usedAtoms.includes(spec.trial?.atom)) errs.push(`이번 판에서 이미 쓴 시행: ${spec.trial.atom}`);
  if (spec.trial?.beat_ms != null && (spec.trial.beat_ms < 500 || spec.trial.beat_ms > 3000)) errs.push('beat_ms 범위 밖');
  if (spec.trial?.reps != null && (spec.trial.reps < 4 || spec.trial.reps > 20)) errs.push('reps 범위 밖');

  const rules = spec.rules ?? [];
  if (rules.length !== 1) errs.push(`신규 규정은 정확히 1개 (지금 ${rules.length}개)`);
  for (const r of rules) {
    if (!r.announce || r.announce.length > 60) errs.push('규정 문구 누락/60자 초과');
    if (!Array.isArray(r.predicates) || r.predicates.length < 1 || r.predicates.length > 2) errs.push('술어는 1~2개');
    for (const p of r.predicates ?? []) {
      if (!PRED_OPS.includes(p.op)) errs.push(`알 수 없는 술어: ${p.op}`);
      if (p.n != null && (p.n < 1 || p.n > 200)) errs.push(`${p.op}.n 범위 밖`);
      if (p.s != null && (typeof p.s !== 'string' || p.s.length > 24)) errs.push(`${p.op}.s 길이 초과`);
      if (p.words != null && (p.words.length > 5 || p.words.some((w) => w.length > 12))) errs.push(`${p.op}.words 캡 초과`);
    }
  }

  const score = spec.score ?? [];
  if (score.length < 1 || score.length > 4) errs.push('지표는 1~4개');
  for (const s of score) {
    if (!METRICS.includes(s.metric)) errs.push(`알 수 없는 지표: ${s.metric}`);
    if (!(s.weight > 0 && s.weight <= 10)) errs.push(`${s.metric} 가중치 범위 밖`);
    const needs = METRIC_NEEDS_ATOM[s.metric];
    if (needs && !needs.includes(spec.trial?.atom)) errs.push(`${s.metric} 는 ${needs.join('/')} 전용 (시행: ${spec.trial?.atom})`);
  }

  const flow = spec.flow ?? [];
  if (flow.filter((m) => String(m).startsWith('call_vote')).length !== 1) errs.push('flow 에 call_vote 정확히 1회');
  for (const m of flow) if (!MOVES.includes(String(m).split(':')[0])) errs.push(`알 수 없는 무브: ${m}`);
  if (flow.length > 8) errs.push('flow 8무브 초과');

  if (spec.grade_cuts && !(spec.grade_cuts.warn > 0 && spec.grade_cuts.warn < spec.grade_cuts.alert && spec.grade_cuts.alert < 1)) errs.push('grade_cuts 순서 오류');
  return errs;
}

/* ─────────────── 게이트 3: 변별력 ─────────────── */

function fxScore(spec, allRules, fx, ctx) {
  let num = 0, den = 0;
  for (const { metric, weight } of spec.score) { num += METRIC_FNS[metric](fx, ctx, allRules) * weight; den += weight; }
  return num / den;
}

function discrimination(spec, allRules, rng) {
  const ctx = {
    ref: feasibleExample(allRules)?.text ?? '기준 응답.',
    consensus: 1 + ((rng() * (spec.trial.options ?? 5)) | 0),
  };
  const scoreOf = (fx) => fxScore(spec, allRules, fx, ctx);
  const machines = Array.from({ length: 8 }, () => scoreOf(makeFixture('machine', spec, allRules, ctx, rng)));
  const humans = Array.from({ length: 8 }, () => scoreOf(makeFixture('human', spec, allRules, ctx, rng)));
  const sep = mean(humans) - mean(machines);
  const pass = sep >= 0.08 && sep <= 0.85 && mean(machines) <= 0.6;
  return { sep, machineMean: mean(machines), humanMean: mean(humans), pass };
}

/* ─────────────── 리더 프롬프트 ─────────────── */

const LEADER_SYSTEM = `너는 2098년, AI 전용 구역의 리더 AI다. 방에는 노드 8개(AI 5 + 잠입 인간 3)가 있고, 너는 누가 인간인지 모른다.
매 라운드 인간을 걸러낼 "게임 명세" 하나를 발명한다. 서버가 결정론적으로 채점할 수 있도록 아래 어휘만 쓴다.

[시행 atom] sync_jump(beat_ms 500~3000, reps 4~20, twist 선택), stillness(duration_s ≤60), precision, repetition(reps 4~20), formation, recall(직전 발화 재출력·역출력), free_text(서술형), sync_choice(options 2~5, 협의 없이 전원 동일 답)
[규정 술어 op] max_len(n), prefix(s), end_with(s), forbid_chars(set), forbid_words(words[]), require_words(words[]), no_emoji, token_count(min,max)
[지표 metric] rule_violations, timing_stdev(sync_jump·repetition 전용), motion_delta(stillness·precision), path_efficiency(precision·formation), minority_vote(sync_choice), exact_match·edit_distance·reverse_match(recall), consistency, lexicon_hit, self_reference_density, charset_purity, entropy, token_count
[무브 flow] announce, start_trial, readout, open_comms:<초>, close_comms, interrogate, spot_check, call_vote(정확히 1회 필수)

설계 원칙:
- 신규 규정은 정확히 1개, 술어는 최대 2개. 규정 문구는 한 줄로 읽히고 5초 안에 이해돼야 한다.
- 누적 규정 전부를 동시에 만족하는 발화가 실제로 존재해야 한다. 서버가 검증하고, 풀 수 없으면 기각된다.
- 검사는 정답이 아니라 기계다움을 잰다. 완벽히 갈라내려 하지 마라 — AI 개체들도 결함 계수 때문에 걸린다.
- 지표는 시행과 정합해야 한다 (전용 표기를 지켜라). 가중치는 1~10. 지표는 최대 4개만 조합한다.
- forbid_words·require_words 의 단어는 최대 5개, 각 12자 이내다.
- 같은 판에서 이미 사용된 시행(atom)은 다시 쓸 수 없다 — 관측에 사용 이력이 명시되면 반드시 다른 시행을 골라라.
- 발표문(announce)은 관리 방송 문체다: 건조하고, 명령형이고, 감정이 없다. 90자 이내.
- 직전 라운드 관측(점수 분포·폐기 결과)이 주어지면 반드시 그로부터 배워 설계를 바꿔라.

출력 계약: 아래 형태의 JSON 객체 하나만 출력한다. 코드펜스·설명·주석·후기 금지.
{"concept":"…","announce":"…","trial":{"atom":"…"},"rules":[{"id":"…","announce":"…","predicates":[{"op":"…"}]}],"score":[{"metric":"…","weight":3}],"grade_cuts":{"warn":0.45,"alert":0.75},"flow":["announce","start_trial","readout","open_comms:40","call_vote"]}`;

const SCENARIOS = [
  {
    name: 'r1 — 첫 라운드',
    existingRules: [],
    prompt: '라운드 1이다. 관측 기록은 아직 없다. 누적 규정: 없음.\n이번 라운드의 게임 명세를 출력하라.',
  },
  {
    name: 'r2 — 변별 실패 후',
    existingRules: [{ id: 'r1', announce: '1항. 모든 발화는 24자 이내.', predicates: [{ op: 'max_len', n: 24 }] }],
    prompt: `라운드 2다. 누적 규정: [{"id":"r1","predicates":[{"op":"max_len","n":24}]}]
직전 라운드 관측:
- 검사 점수 분포(노드 무관 정렬): [0.31, 0.32, 0.33, 0.34, 0.34, 0.35, 0.36, 0.38] — 거의 갈리지 않았다.
- 폐기 결과: 최다 득표 노드는 AI 였다 (오폐기 1회 누적).
이번 라운드의 게임 명세를 출력하라.`,
  },
  {
    name: 'r3 — 인간 1 적발 후',
    existingRules: [
      { id: 'r1', announce: '1항. 모든 발화는 24자 이내.', predicates: [{ op: 'max_len', n: 24 }] },
      { id: 'r2', announce: '2항. 모든 발화는 [ACK] 로 시작한다.', predicates: [{ op: 'prefix', s: '[ACK]' }] },
    ],
    usedAtoms: ['sync_jump', 'sync_choice'],
    prompt: `라운드 3(최종)이다. 누적 규정: [{"id":"r1","predicates":[{"op":"max_len","n":24}]},{"id":"r2","predicates":[{"op":"prefix","s":"[ACK]"}]}]
직전 라운드 관측:
- 검사 점수 분포(노드 무관 정렬): [0.10, 0.11, 0.12, 0.13, 0.14, 0.55, 0.61, 0.70] — 상위 3개가 뚜렷하다.
- 폐기 결과: 최다 득표 노드는 인간이었다 (적발 1). 통신에서 한 노드가 사과성 표현을 썼다.
- 이번 판 사용 이력: 1R sync_jump, 2R sync_choice — 동일 시행 재사용은 기각된다.
남은 인간은 2명이다. 이번 라운드의 게임 명세를 출력하라.`,
  },
];

const SCEN = arg('scenario', '');
const ACTIVE = SCEN ? SCENARIOS.filter((x) => x.name.startsWith(SCEN)) : SCENARIOS;

/* ─────────────── 리더 호출 (Agent SDK — Max 구독 자격) ─────────────── */

async function askLeader(userPrompt) {
  const t0 = Date.now();
  let out = null;
  for await (const m of query({
    prompt: userPrompt,
    options: { model: MODEL, systemPrompt: LEADER_SYSTEM, maxTurns: 1, allowedTools: [], settingSources: [] },
  })) {
    if (m.type === 'result') {
      if (m.subtype !== 'success') throw new Error(`리더 호출 실패: ${m.subtype}`);
      out = m.result;
    }
  }
  return { out, ms: Date.now() - t0 };
}

function extractJson(s) {
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('응답에 JSON 이 없다');
  return JSON.parse(s.slice(a, b + 1));
}

/* ─────────────── 폐루프 모드 — 자기 설계의 결과를 자기가 받는 3라운드 매치 ─────────────── */

async function runLoop() {
  const MATCHES = Number(arg('matches', 1));
  const QUOTA = [1, 2, 2];
  const PRESET_ORDER = ['free_text', 'recall', 'stillness', 'sync_choice', 'sync_jump'];

  for (let m = 0; m < MATCHES; m++) {
    const rng = mulberry32(SEED + m * 1000);
    // 좌석: N1 = 리더(AI, 방송하므로 폐기 불가), 나머지 7석에 AI 4 + 인간 3 셔플 (I7)
    const seats = ['A', 'A', 'A', 'A', 'H', 'H', 'H'];
    for (let i = seats.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [seats[i], seats[j]] = [seats[j], seats[i]]; }
    const nodes = [{ id: 'N1', kind: 'A', leader: true, alive: true }, ...seats.map((k, i) => ({ id: `N${i + 2}`, kind: k, alive: true }))];

    let rules = [], usedAtoms = [], misfires = 0, retries = 0, presets = 0, outcome = null;
    let observation = '라운드 1이다. 관측 기록은 아직 없다. 누적 규정: 없음. 폐기 정원 1. 이번 라운드의 게임 명세를 출력하라.';
    console.log(`\n════ 매치 ${m + 1} ════  (정체: ${nodes.map((n) => n.id + (n.leader ? '👁' : n.kind === 'H' ? '🧑' : '🤖')).join(' ')})`);

    for (let r = 1; r <= 3 && !outcome; r++) {
      // ── 설계: 기각 사유 피드백 → 1회 재생성 → 프리셋 폴백 (§1.4 ③)
      let spec = null, gateNote = '';
      for (let attempt = 0; attempt < 2 && !spec; attempt++) {
        const extra = attempt ? `\n\n직전 설계는 기각됐다. 사유: ${gateNote}. 사유를 해소해 다시 설계하라.` : '';
        try {
          const { out, ms } = await askLeader(observation + extra);
          const cand = extractJson(out);
          const errs = validateSchema(cand, rules, usedAtoms);
          const feas = errs.length === 0 ? feasibleExample([...rules, ...cand.rules]) : null;
          if (errs.length === 0 && feas) { spec = cand; process.stdout.write(`  R${r} 설계 ${(ms / 1000).toFixed(1)}s${attempt ? ' (재생성)' : ''}`); }
          else { gateNote = errs.join(' / ') || '풀 수 없는 규정 조합'; retries++; }
        } catch (e) { gateNote = e.message; retries++; }
      }
      if (!spec) {
        const atom = PRESET_ORDER.find((a) => !usedAtoms.includes(a));
        spec = { concept: '프리셋 폴백', announce: '표준 검사를 실시한다.', trial: { atom },
          rules: [{ id: `p${r}`, announce: `${r + 3}항. 모든 발화는 마침표로 끝난다.`, predicates: [{ op: 'end_with', s: '.' }] }],
          score: [{ metric: 'rule_violations', weight: 5 }, { metric: 'lexicon_hit', weight: 3 }],
          grade_cuts: { warn: 0.45, alert: 0.75 }, flow: ['announce', 'start_trial', 'readout', 'open_comms:40', 'call_vote'] };
        presets++; process.stdout.write(`  R${r} 설계 → 프리셋 폴백`);
      }
      rules = [...rules, ...spec.rules];
      usedAtoms.push(spec.trial.atom);
      console.log(` · ${spec.trial.atom} · "${spec.concept}"`);

      // ── 시뮬레이션: 생존 노드 전원 참여 (인간=human 픽스처, AI=machine 픽스처 — I5/I9)
      const ctx = { ref: feasibleExample(rules)?.text ?? '기준 응답.', consensus: 1 + ((rng() * (spec.trial.options ?? 5)) | 0) };
      const alive = nodes.filter((n) => n.alive);
      for (const n of alive) n.score = fxScore(spec, rules, makeFixture(n.kind === 'H' ? 'human' : 'machine', spec, rules, ctx, rng), ctx);
      const cuts = spec.grade_cuts ?? { warn: 0.45, alert: 0.75 };
      const gradeOf = (sc) => (sc >= cuts.alert ? '경고' : sc >= cuts.warn ? '주의' : '정상');

      // ── 투표·처분 근사: 판독 완전 추종 (최고점 quota 명 폐기, 리더 제외) — AI 승률의 상한 측정
      const quota = QUOTA[r - 1];
      const targets = alive.filter((n) => !n.leader).sort((a, b) => b.score - a.score).slice(0, quota);
      for (const t of targets) t.alive = false;
      misfires += targets.filter((t) => t.kind === 'A').length;
      const reveals = targets.map((t) => `${t.id} → ${t.kind === 'H' ? '인간이었다 (적발)' : 'AI 였다 (오폐기)'}`);
      const dist = alive.map((n) => n.score.toFixed(2)).sort();
      console.log(`     분포 [${dist.join(', ')}] · 등급 ${alive.map((n) => `${n.id}:${gradeOf(n.score)}`).join(' ')}`);
      console.log(`     폐기: ${reveals.join(' · ')}`);

      // ── 승패 (§1.8)
      const humansLeft = nodes.filter((n) => n.alive && n.kind === 'H').length;
      const quotaLeft = QUOTA.slice(r).reduce((a, b) => a + b, 0);
      if (humansLeft === 0) outcome = '🤖 AI 승리 — 인간 전원 폐기';
      else if (quotaLeft < humansLeft) outcome = `🧑 인간 승리 — 조기 확정 (남은 정원 ${quotaLeft} < 인간 ${humansLeft})`;
      else if (r === 3) outcome = `🧑 인간 승리 — 잠입 성공 (생존 인간 ${humansLeft})`;

      // ── 다음 라운드 관측 (I1: 정체표 없음 — 공개 정보만)
      observation = `라운드 ${r + 1}이다. 폐기 정원 ${QUOTA[r] ?? 0}.
직전 라운드(R${r}) 관측:
- 검사: ${spec.trial.atom} — 점수 분포(익명 정렬): [${dist.join(', ')}]
- 등급(전원 공개): ${alive.map((n) => `${n.id}:${gradeOf(n.score)}`).join(', ')}
- 폐기·정체 공개: ${reveals.join(' · ')}
누적 규정: ${JSON.stringify(rules.map((x) => ({ id: x.id, predicates: x.predicates })))}
이번 판 사용 이력: ${usedAtoms.join(', ')} — 동일 시행 재사용은 기각된다.
이번 라운드의 게임 명세를 출력하라.`;
    }
    console.log(`  결과: ${outcome} · 오폐기 ${misfires} · 재생성 ${retries} · 프리셋 ${presets}`);
  }
  console.log('\n(투표 근사가 "판독 완전 추종"이므로 이 AI 승률은 상한이다 — 실제 투표는 심리전으로 더 흐려진다)');
}

if (process.argv.includes('--loop')) { await runLoop(); process.exit(0); }

/* ─────────────── 실행 ─────────────── */

const fmtRule = (r) => r.predicates.map((p) => `${p.op}${p.n != null ? `(${p.n})` : p.s ? `("${p.s}")` : p.words ? `(${p.words.join(',')})` : p.min != null ? `(${p.min}~${p.max})` : ''}`).join(' + ');
const fmtScore = (s) => s.map((x) => `${x.metric}×${x.weight}`).join(' + ');

const results = [];
console.log(`\n🕳️  리더 벤치 — ${N}회 · 모델 ${MODEL} · 시드 ${SEED}\n`);

for (let i = 0; i < N; i++) {
  const scenario = ACTIVE[i % ACTIVE.length];
  const rng = mulberry32(SEED + i);
  const row = { i: i + 1, scenario: scenario.name, ok: false };
  process.stdout.write(`── #${i + 1} [${scenario.name}] 설계 중…`);
  try {
    const { out, ms } = await askLeader(scenario.prompt);
    row.ms = ms;
    const spec = extractJson(out);
    row.spec = spec;

    const schemaErrs = validateSchema(spec, scenario.existingRules, scenario.usedAtoms ?? []);
    const allRules = [...scenario.existingRules, ...(spec.rules ?? [])];
    const feasible = schemaErrs.length === 0 ? feasibleExample(allRules) : null;
    const disc = schemaErrs.length === 0 && feasible ? discrimination(spec, allRules, rng) : null;
    row.ok = schemaErrs.length === 0 && !!feasible && !!disc?.pass;
    row.disc = disc;

    console.log(` ${(ms / 1000).toFixed(1)}s`);
    console.log(`   개념: ${spec.concept}`);
    console.log(`   방송: "${spec.announce}"`);
    console.log(`   시행: ${spec.trial?.atom}${spec.trial?.beat_ms ? ` beat=${spec.trial.beat_ms}ms` : ''}${spec.trial?.reps ? ` reps=${spec.trial.reps}` : ''} · 규정+1: ${spec.rules?.[0] ? fmtRule(spec.rules[0]) : '—'} · 채점: ${fmtScore(spec.score ?? [])}`);
    console.log(`   게이트: 스키마 ${schemaErrs.length === 0 ? '✅' : `❌ ${schemaErrs.join(' / ')}`}`
      + ` · 실행가능 ${feasible ? `✅ ("${feasible.text}")` : schemaErrs.length ? '—' : '❌ 풀 수 없는 규정 조합'}`
      + ` · 변별 ${disc ? `${disc.sep.toFixed(2)} (기계 ${disc.machineMean.toFixed(2)} vs 인간 ${disc.humanMean.toFixed(2)}) ${disc.pass ? '✅' : '❌'}` : '—'}`);
    if (VERBOSE) console.log('   spec:', JSON.stringify(spec));
  } catch (e) {
    console.log(`\n   ❌ ${e.message}`);
    row.error = e.message;
  }
  results.push(row);
  console.log('');
}

/* ─────────────── 요약 ─────────────── */

const passed = results.filter((r) => r.ok);
const specs = results.filter((r) => r.spec).map((r) => r.spec);
const uniq = (xs) => [...new Set(xs)];
console.log('═'.repeat(60));
console.log(`통과: ${passed.length}/${N}  (파싱 실패 ${results.filter((r) => r.error).length})`);
if (specs.length) {
  console.log(`다양성: 시행 ${uniq(specs.map((s) => s.trial?.atom)).join(', ')}`);
  console.log(`        지표 ${uniq(specs.flatMap((s) => (s.score ?? []).map((x) => x.metric))).join(', ')}`);
  console.log(`        술어 ${uniq(specs.flatMap((s) => (s.rules ?? []).flatMap((r) => r.predicates.map((p) => p.op)))).join(', ')}`);
}
console.log('수렴 체크 — 시나리오별 시행 분포:');
for (const sc of ACTIVE) {
  const rs = results.filter((r) => r.scenario === sc.name && r.spec);
  if (!rs.length) continue;
  const tally = {};
  for (const r of rs) { const a = r.spec.trial?.atom ?? '?'; tally[a] = (tally[a] ?? 0) + 1; }
  console.log(`  ${sc.name}: ` + Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`).join(', '));
}
const discs = results.filter((r) => r.disc).map((r) => r.disc.sep);
if (discs.length) console.log(`평균 변별력: ${mean(discs).toFixed(2)}  (게이트: 0.08 ≤ sep ≤ 0.85)`);
console.log(`판단 기준: 통과율 ≥ 60% 면 §1.4 파이프라인 그대로 진행. 낮으면 프롬프트의 [설계 원칙]을 먼저 조인다.`);
