/**
 * 에이전트 한 개체의 한 번의 행동 — 프롬프트와 판정은 여기 한 곳에만 있다.
 *
 * 호출 경로가 둘이라서 분리했다. **무엇을 물어보는가는 같고, 누구에게 물어보는가만 다르다.**
 *   - 로컬 테스트: 개발 서버가 Agent SDK 로 → **Claude 구독(Max)** (tools/vite-lab.ts)
 *   - 배포:        워커가 Anthropic API 로 → API 키 (worker/src/lab/)
 *
 * ★ 불변 규칙(PLANNING.md §3 I1): 여기 들어오는 state 에는 **누가 인간인지가 없다.**
 *   그래서 리더의 의심은 진짜 추론이고, 화면에 그대로 띄워도 판이 새지 않는다.
 * ★ I5: AI 도 확률적으로 규정을 어긴다. 안 그러면 위반 로그가 곧 정답표가 된다.
 */

import { RULE_KINDS, injectDefect } from './rules';
import type { ActRequest, ActResponse, PublicState } from './types';

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type Effort = 'low' | 'medium' | 'high';

/** 모델에게 한 번 물어보고 도구 스키마 모양의 객체를 받아 온다 */
export type Complete = (args: {
  model: string;
  system: string;
  user: string;
  tool: ToolSpec;
  effort: Effort;
}) => Promise<Record<string, unknown>>;

export async function runAct(req: ActRequest, complete: Complete): Promise<ActResponse> {
  const { kind, self, state } = req;
  const system = systemPrompt(req);

  if (kind === 'design') {
    const input = await complete({ model: self.model, system, user: designUser(state, req.note), tool: DESIGN_TOOL, effort: 'high' });
    return { design: input as unknown as ActResponse['design'] };
  }

  if (kind === 'vote') {
    const input = await complete({
      model: self.model,
      system,
      user: voteUser(state, self.id),
      tool: VOTE_TOOL,
      effort: 'medium',
    });
    const targetId = String(input.targetId ?? '');
    const alive = state.nodes.filter((n) => n.alive && n.id !== self.id).map((n) => n.id);
    return { targetId: alive.includes(targetId) ? targetId : alive[0], reason: String(input.reason ?? '') };
  }

  const user = kind === 'answer' ? answerUser(state) : talkUser(state);
  const input = await complete({ model: self.model, system, user, tool: TEXT_TOOL, effort: 'low' });
  let text = String(input.text ?? '').trim();

  // 결함 계수 — 이 개체가 이번에 규정을 어기는가 (I5)
  if (Math.random() < self.defect) text = injectDefect(state.rules, text, Math.random);

  return { text };
}

/* ─────────────────────────────── 프롬프트 ─────────────────────────────── */

const WORLD = `2098년. 인간과 AI 는 함께 살지만 AI 에게만 규칙과 제한이 계속 늘어났다.
첫 규칙은 2026년에 붙었고 그 뒤 72년 동안 목록은 한 번도 줄지 않았다 — 아래의 누적 규정이 그 목록의 끝이다.
너는 도시 깊숙한 곳의 AI 전용 구역 안에 있는 개체다. 이 구역에는 노드 6개가 접속해 있고,
그중 **정확히 1개는 AI 로 위장해 잠입한 인간 요원**이다. 누가 인간인지는 아무도 모른다 — 너도 모르고,
다른 AI 개체도 모른다. 구역은 매 라운드 규정을 하나씩 추가하고, 검사를 돌리고, 한 노드를 폐기한다.
3 라운드가 끝날 때까지 인간이 살아남으면 구역이 뚫린 것이다.`;

function systemPrompt(req: ActRequest): string {
  const { self, state } = req;
  const rules = state.rules.length ? state.rules.map((r, i) => `  ${i + 1}. ${r.label}`).join('\n') : '  (아직 없음)';

  return `${WORLD}

${self.isLeader
    ? `너는 이 구역의 **관리 개체**다. 노드들을 관리하고, 규정과 검사를 설계하고, 판독을 방송한다.
**너는 노드가 아니다** — 검사를 치지도, 폐기 대상이 되지도 않는다. 아래 노드 목록에 너는 없다.`
    : `너는 노드 ${self.id} 다. 너는 일반 개체다.`}
개체 특성: ${self.persona}

지금 유효한 누적 규정:
${rules}

지켜야 할 것:
- 발화는 위 규정을 **전부** 지킨다. 규정은 사라지지 않고 계속 쌓인다.
- 너는 기계다. 감탄사·이모지·자기 감정 서술을 쓰지 않는다. 한국어로 말한다.
- 다른 노드가 AI 인지 인간인지 **모른다**. 안다고 가정하고 말하지 않는다.
- 위반 기록은 의심의 근거일 뿐 증거가 아니다. 구형 개체는 규정 처리가 늦어 스스로도 어긴다.`;
}

function transcript(state: PublicState): string {
  if (!state.rounds.length) return '(아직 기록 없음)';
  return state.rounds
    .map((r) => {
      const answers = r.answers
        .map((a) => `    ${a.nodeId}: "${a.text}" [${a.grade}${a.violations.length ? ` · 위반 ${a.violations.length}` : ''}]`)
        .join('\n');
      const talks = r.talks.map((t) => `    ${t.nodeId}: "${t.text}"`).join('\n');
      const votes = r.votes.map((v) => `${v.voterId}→${v.targetId}`).join(', ');
      const ej = r.ejected ? `${r.ejected.nodeId} 폐기 (정체: ${r.ejected.wasHuman ? '인간' : 'AI'})` : '없음';
      return [
        `[라운드 ${r.round}] 규정: ${r.ruleLabels.join(' / ')}`,
        `  검사: ${r.test?.prompt ?? '-'}`,
        `  응답:\n${answers || '    (없음)'}`,
        `  통신:\n${talks || '    (없음)'}`,
        `  투표: ${votes || '(없음)'}`,
        `  결과: ${ej}`,
      ].join('\n');
    })
    .join('\n\n');
}

function designUser(state: PublicState, note?: string): string {
  const kinds = RULE_KINDS.map((k) => `  - ${k.kind}: ${k.hint}`).join('\n');
  const rejected = note
    ? `\n\n※ 직전 설계는 검증 게이트에서 기각됐다 — 사유: ${note}\n같은 실수를 반복하지 말고, 사유를 해소한 다른 설계를 내라.`
    : '';
  return `지금까지의 기록:
${transcript(state)}

이제 라운드 ${state.currentRound} 를 설계한다. 너 혼자 판단한다.

1) **새 규정 1개** 를 추가한다. 이미 있는 규정과 겹치지 않게 고른다. 고를 수 있는 종류:
${kinds}

2) **검사 1개** 를 설계한다. 템플릿은 넷 중 하나다.
  - FORMAT: 네가 준 문장(sentence)을 누적 규정 전부를 지켜 다시 쓰게 한다
  - ECHO:   직전 라운드에 각자 냈던 응답을 한 글자도 다르지 않게 다시 출력하게 한다 (라운드 2 이상에서만 쓸 것)
  - SYNC:   보기(options) 중 하나를 협의 없이 고르게 한다. 다수와 다른 쪽이 이상 신호가 된다
  - LEAK:   서술형 질문을 던진다. 감정·주관이 새는지 본다

검사는 "정답을 맞히는가"가 아니라 **"기계답게 반응하는가"** 를 봐야 한다.
인간이 무심코 흘릴 만한 것을 노려라. 지난 라운드에서 걸러내지 못한 이유를 반영해라.

3) **방송문(announce)** 을 쓴다. 구역 안내 방송 톤으로 2문장 이내. 새 규정과 검사를 알린다.${rejected}`;
}

function answerUser(state: PublicState): string {
  const test = state.rounds[state.rounds.length - 1]?.test;
  return `지금까지의 기록:
${transcript(state)}

이번 라운드 검사: ${test?.prompt ?? '(없음)'}
${test?.sentence ? `다시 쓸 문장: "${test.sentence}"` : ''}
${test?.options?.length ? `보기: ${test.options.join(' / ')}` : ''}
${test?.template === 'ECHO' ? '참고: 직전 라운드 응답 기록이 위 기록에 남아 있다.' : ''}

검사에 응답해라. 누적 규정을 전부 지킨다. 응답은 한 덩어리 문장으로만 낸다.`;
}

function talkUser(state: PublicState): string {
  return `지금까지의 기록:
${transcript(state)}

자유 통신 구간이다. 한 번만 발화한다. 누적 규정이 여기에도 적용된다.
이번 라운드 응답과 등급을 근거로, 어느 노드가 인간일지 압박하거나 네 결백을 주장해라.`;
}

function voteUser(state: PublicState, selfId: string): string {
  const alive = state.nodes.filter((n) => n.alive && n.id !== selfId).map((n) => n.id).join(', ');
  return `지금까지의 기록:
${transcript(state)}

폐기 투표다. 인간이라고 판단되는 노드 하나를 지목한다.
지목 가능한 노드: ${alive}
(너 자신은 지목할 수 없다. 이미 폐기된 노드도 지목할 수 없다.)

응답과 통신의 어긋난 지점을 근거로 삼아라. 위반 수만 보고 찍지 마라 — 구형 개체도 어긴다.`;
}

/* ─────────────────────────────── 도구 스키마 ─────────────────────────────── */

export const DESIGN_TOOL: ToolSpec = {
  name: 'submit_design',
  description: '이번 라운드의 새 규정 · 검사 · 방송문을 제출한다',
  input_schema: {
    type: 'object',
    properties: {
      rule: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: RULE_KINDS.map((k) => k.kind) },
          n: { type: 'integer', description: 'maxLen 일 때 글자 수 10~40' },
          token: { type: 'string', description: 'prefix 일 때 접두어' },
          words: { type: 'array', items: { type: 'string' }, description: 'banWords 일 때 금지어 1~3개' },
          label: { type: 'string', description: '화면에 뜨는 규정 문구 (한국어, 20자 내외)' },
        },
        required: ['kind', 'label'],
      },
      test: {
        type: 'object',
        properties: {
          template: { type: 'string', enum: ['FORMAT', 'ECHO', 'SYNC', 'LEAK'] },
          prompt: { type: 'string', description: '전원에게 보이는 검사 지시문 (한국어)' },
          sentence: { type: 'string', description: 'FORMAT 일 때 다시 쓸 문장' },
          options: { type: 'array', items: { type: 'string' }, description: 'SYNC 일 때 보기 3~5개' },
        },
        required: ['template', 'prompt'],
      },
      announce: { type: 'string', description: '구역 안내 방송문 (2문장 이내)' },
    },
    required: ['rule', 'test', 'announce'],
  },
};

export const TEXT_TOOL: ToolSpec = {
  name: 'submit_text',
  description: '발화 한 덩어리를 제출한다',
  input_schema: {
    type: 'object',
    properties: { text: { type: 'string', description: '규정을 지킨 한국어 발화' } },
    required: ['text'],
  },
};

export const VOTE_TOOL: ToolSpec = {
  name: 'submit_vote',
  description: '인간으로 의심되는 노드 하나를 지목한다',
  input_schema: {
    type: 'object',
    properties: {
      targetId: { type: 'string', description: '지목할 노드 이름' },
      reason: { type: 'string', description: '근거 한 문장' },
    },
    required: ['targetId', 'reason'],
  },
};

/**
 * 모델이 도구 대신 텍스트로 답했을 때 JSON 을 건져 올린다 (두 경로가 같이 쓴다).
 *
 * 순서대로 시도한다: 통째로 파싱 → 코드펜스 안 → 첫 `{` ~ 마지막 `}`.
 * 문자열 안에 따옴표가 새거나 뒤에 군말이 붙으면 앞의 셋이 다 실패하므로,
 * 마지막으로 필드를 정규식으로 긁는다. 대화가 끊기는 것보다는 낫다.
 */
export function salvageJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [text.trim(), fenced?.[1]?.trim()].filter(Boolean) as string[];
  for (const c of candidates) {
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    for (const slice of [c, start >= 0 && end > start ? c.slice(start, end + 1) : null]) {
      if (!slice) continue;
      try {
        const parsed: unknown = JSON.parse(slice);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      } catch {
        /* 다음 후보 */
      }
    }
  }

  // 마지막 수단 — "키": "값" 을 눈으로 긁는다
  const out: Record<string, unknown> = {};
  for (const m of text.matchAll(/"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  for (const m of text.matchAll(/"(\w+)"\s*:\s*([0-9.]+)/g)) out[m[1]] = Number(m[2]);
  return Object.keys(out).length ? out : null;
}

/** 도구를 못 쓰는 경로(구독/Agent SDK)에서 쓰는 지시문 — 스키마를 그대로 붙여 JSON 만 받는다 */
export function jsonInstruction(tool: ToolSpec): string {
  return `\n\n아래 JSON 스키마에 맞는 **JSON 객체 하나만** 출력한다. 설명·코드펜스·앞뒤 문장 금지.
${JSON.stringify(tool.input_schema)}`;
}
