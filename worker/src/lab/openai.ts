/**
 * OpenAI Chat Completions 호출 — **워커에서만**. 키는 브라우저로 절대 안 나간다.
 *
 * 왜 두 번째 갈래가 있나: 로컬은 이 머신의 **Claude 구독**(Agent SDK, tools/vite-lab.ts)으로 돌고,
 * 배포본은 **OpenAI 키**로 돈다. 물어보는 내용(src/lab/agent.ts)은 한 곳뿐이고 여기는 관로만 다르다.
 *
 * anthropic.ts 와 다른 점 셋 — 옮겨 적을 때 걸리는 자리다:
 *   1. system 이 필드가 아니라 messages 의 첫 줄이다.
 *   2. max_tokens 는 폐기됐다. max_completion_tokens 를 쓴다 — **사고 토큰까지 여기서 나간다.**
 *      너무 낮으면 도구 호출 전에 잘려서 빈 답이 온다. 그래서 effort 에 맞춰 넉넉히 잡는다
 *      (안 쓴 만큼은 과금되지 않으니 상한은 싸다).
 *   3. 도구를 강제할 수 있다. Anthropic 쪽은 사고가 켜진 모델이 강제 도구를 거부해서 auto 로 뒀지만,
 *      이쪽은 tool_choice 로 이름을 못 박는다. 그래도 텍스트로 오면 똑같이 JSON 으로 건져 올린다.
 */

import { salvageJson, type ToolSpec } from '../../../src/lab/agent';

const API = 'https://api.openai.com/v1/chat/completions';

/**
 * 클로드 모델 이름 → OpenAI 모델 이름. 판은 여전히 클로드 이름으로 개체를 적는다
 * (worker/src/game/agents.ts) — 등급만 여기서 옮긴다.
 *
 * 나누는 기준은 **호출 횟수**다. 관리 AI 의 설계는 라운드당 한 번이라 좋은 것을 써도 싸고,
 * 노드 다섯은 응답·발화·투표로 페이즈마다 부르니 싼 것이어야 판이 굴러간다.
 */
const MODEL_MAP: Record<string, string> = {
  'claude-opus-5': 'gpt-5.6-terra',
  'claude-sonnet-5': 'gpt-5.6-luna',
  'claude-haiku-4-5': 'gpt-5.6-luna',
};

/** 모르는 이름이 오면 제일 싼 것으로 떨어뜨린다 — 판이 400 으로 멈추는 것보다 낫다 */
const FALLBACK_MODEL = 'gpt-5.6-luna';

export function mapModel(model: string, override?: string): string {
  return override?.trim() || MODEL_MAP[model] || FALLBACK_MODEL;
}

export async function callTool(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  tool: ToolSpec,
  effort?: 'low' | 'medium' | 'high',
  /** 모든 개체를 한 모델로 고정할 때 (OPENAI_MODEL) */
  modelOverride?: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model: mapModel(model, modelOverride),
    // 사고 토큰이 여기서 나간다. 설계(high)는 길게 생각하므로 상한을 따로 준다
    max_completion_tokens: effort === 'high' ? 16000 : 6000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${user}\n\n반드시 ${tool.name} 도구를 호출해서 답한다. 다른 형식으로 답하지 않는다.` },
    ],
    tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
    tool_choice: { type: 'function', function: { name: tool.name } },
  };
  if (effort) body.reasoning_effort = effort;

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`openai ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };
      finish_reason?: string;
    }[];
  };

  const choice = data.choices?.[0];
  const args = choice?.message?.tool_calls?.[0]?.function?.arguments;
  if (args) {
    // arguments 는 JSON **문자열**이다 (Anthropic 의 input 은 이미 객체라 이 단계가 없다)
    try {
      const parsed: unknown = JSON.parse(args);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      const salvaged = salvageJson(args);
      if (salvaged) return salvaged;
    }
  }

  // 도구를 안 쓰고 텍스트로 답한 경우 — 코드펜스를 벗기고 JSON 으로 건져 본다
  const text = choice?.message?.content ?? '';
  const salvaged = salvageJson(text);
  if (salvaged) return salvaged;

  // length 로 끊겼다면 사고 토큰이 상한을 다 먹은 것이다. 사유가 보여야 상한을 올릴지 판단할 수 있다
  throw new Error(`도구 호출이 없다 (finish_reason=${choice?.finish_reason ?? '?'}): ${text.slice(0, 200)}`);
}
