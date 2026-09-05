/**
 * OpenAI Responses API 호출 — **워커에서만**. 키는 브라우저로 절대 안 나간다.
 *
 * 왜 두 번째 갈래가 있나: 로컬은 이 머신의 **Claude 구독**(Agent SDK, tools/vite-lab.ts)으로 돌고,
 * 배포본은 **OpenAI 키**로 돈다. 물어보는 내용(src/lab/agent.ts)은 한 곳뿐이고 여기는 관로만 다르다.
 *
 * ★ Chat Completions 가 아니라 `/v1/responses` 다. 처음엔 anthropic.ts 를 그대로 옮겨 Chat
 *   Completions 로 썼는데 배포본에서 400 이 났다 (2026-09-05 실측):
 *     "Function tools with reasoning_effort are not supported for gpt-5.6-luna in
 *      /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."
 *   이 판은 **도구로만 답을 받는다** (모양이 흔들리면 화면이 깨진다). 그러면 남는 선택은 둘인데,
 *   effort 를 'none' 으로 죽이는 쪽은 관리 AI 의 설계(effort=high)를 통째로 버리는 것이라
 *   Responses 로 옮겼다. GPT-6 Astra 는 Chat Completions 에서 도구 호출이 아예 안 되기도 한다.
 *
 * anthropic.ts 와 다른 자리 — 옮겨 적을 때 걸리는 곳이다:
 *   1. system 이 필드가 아니라 input 배열의 첫 줄이다.
 *   2. 상한은 max_output_tokens 이고 **사고 토큰까지 여기서 나간다.** 너무 낮으면 도구 호출
 *      전에 잘려서 빈 답이 온다. 안 쓴 만큼은 과금되지 않으니 상한은 싸다.
 *   3. 도구 모양이 납작하다 — {type,name,description,parameters}. Chat Completions 처럼
 *      function 아래로 한 겹 넣지 않는다.
 *   4. 답은 output **배열**이고, 사고 항목이 앞에 붙는다. 첫 칸이 아니라 function_call 을 찾아야 한다.
 *   5. arguments 는 JSON **문자열**이다 (Anthropic 의 input 은 이미 객체라 이 단계가 없다).
 */

import { salvageJson, type ToolSpec } from '../../../src/lab/agent';

const API = 'https://api.openai.com/v1/responses';

/**
 * 클로드 모델 이름 → OpenAI 모델 이름. 판은 여전히 클로드 이름으로 개체를 적는다
 * (worker/src/game/agents.ts) — 등급만 여기서 옮긴다.
 *
 * 나누는 기준은 **호출 횟수**다. 관리 AI 의 설계는 라운드당 한 번이라 좋은 것을 써도 싸고,
 * 노드 다섯은 응답·발화·투표로 페이즈마다 부르니 싼 것이어야 판이 굴러간다.
 *
 * 등급은 로컬의 클로드 짝에 맞춘다 (2026-09-05 사용자: "리더는 gpt-6-astra, 개체는 gpt-5.6-terra"):
 *   opus-5   → gpt-6-astra    같은 급 (Artificial Analysis 63 : 61). 단가는 두 배($10/$50)지만 리더 호출은 판당 몇 번이다
 *   sonnet-5 → gpt-5.6-terra  같은 급 (공유 벤치마크 35개에서 18 : 17). 예전의 luna 는 한 등급 아래였다
 *   haiku    → gpt-5.6-luna   제일 싼 것끼리
 */
const MODEL_MAP: Record<string, string> = {
  'claude-opus-5': 'gpt-6-astra',
  'claude-sonnet-5': 'gpt-5.6-terra',
  'claude-haiku-4-5': 'gpt-5.6-luna',
};

/** 모르는 이름이 오면 제일 싼 것으로 떨어뜨린다 — 판이 400 으로 멈추는 것보다 낫다 */
const FALLBACK_MODEL = 'gpt-5.6-luna';

export function mapModel(model: string, override?: string): string {
  return override?.trim() || MODEL_MAP[model] || FALLBACK_MODEL;
}

/** output 배열에서 텍스트만 이어 붙인다 — 도구를 안 썼을 때 건져 올릴 원료 */
function textOf(output: ResponseItem[] | undefined): string {
  return (output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .map((c) => c.text ?? '')
    .join('\n');
}

interface ResponseItem {
  type?: string;
  name?: string;
  arguments?: string;
  content?: { type?: string; text?: string }[];
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
    max_output_tokens: effort === 'high' ? 16000 : 6000,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: `${user}\n\n반드시 ${tool.name} 도구를 호출해서 답한다. 다른 형식으로 답하지 않는다.` },
    ],
    // 납작한 모양이다 — function 아래로 한 겹 넣지 않는다
    tools: [{ type: 'function', name: tool.name, description: tool.description, parameters: tool.input_schema }],
    // 도구를 하나만 주므로 'required' 면 곧 그 도구다. 이름을 적는 객체보다 모양이 안 흔들린다
    tool_choice: 'required',
  };
  if (effort) body.reasoning = { effort };

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
    output?: ResponseItem[];
    output_text?: string;
    status?: string;
    incomplete_details?: { reason?: string };
  };

  // 사고 항목이 앞에 붙으므로 첫 칸이 아니라 찾아야 한다
  const call = data.output?.find((o) => o.type === 'function_call' && o.arguments);
  if (call?.arguments) {
    try {
      const parsed: unknown = JSON.parse(call.arguments);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      const salvaged = salvageJson(call.arguments);
      if (salvaged) return salvaged;
    }
  }

  // 도구를 안 쓰고 텍스트로 답한 경우 — 코드펜스를 벗기고 JSON 으로 건져 본다
  const text = data.output_text ?? textOf(data.output);
  const salvaged = salvageJson(text);
  if (salvaged) return salvaged;

  // incomplete 면 사고 토큰이 상한을 다 먹은 것이다. 사유가 보여야 상한을 올릴지 판단할 수 있다
  const why = data.incomplete_details?.reason ? ` · ${data.incomplete_details.reason}` : '';
  throw new Error(`도구 호출이 없다 (status=${data.status ?? '?'}${why}): ${text.slice(0, 200)}`);
}
