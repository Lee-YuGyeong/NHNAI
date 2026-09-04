/**
 * Anthropic Messages API 호출 — **워커에서만**. 키는 브라우저로 절대 안 나간다.
 *
 * 응답은 도구(tool) 하나로 받는다. 화면이 그대로 렌더링하는 값이라 모양이 흔들리면 안 되기 때문이다.
 *
 * tool_choice 를 강제하지 않고 auto 로 두는 이유: Opus 5 는 thinking 이 기본으로 켜져 있고,
 * 사고가 켜진 상태에서는 특정 도구를 강제하는 요청이 거부될 수 있다. 도구를 하나만 주고
 * 프롬프트로 "반드시 도구로 답하라"고 못 박은 뒤, 그래도 텍스트로 오면 JSON 으로 건져 올린다.
 *
 * effort 는 opus-5 / sonnet-5 에만 보낸다 — haiku 4.5 는 이 파라미터에서 400 이 난다.
 */

import { salvageJson, type ToolSpec } from '../../../src/lab/agent';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

export async function callTool(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  tool: ToolSpec,
  effort?: 'low' | 'medium' | 'high',
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4000, // 사고 토큰도 여기서 나간다. 너무 낮으면 도구 호출 전에 잘린다
    system,
    messages: [{ role: 'user', content: `${user}\n\n반드시 ${tool.name} 도구를 호출해서 답한다. 다른 형식으로 답하지 않는다.` }],
    tools: [tool],
    tool_choice: { type: 'auto' },
  };
  if (effort && (model.startsWith('claude-opus-5') || model.startsWith('claude-sonnet-5'))) {
    body.output_config = { effort };
  }

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': VERSION },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`anthropic ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; input?: Record<string, unknown>; text?: string }[];
    stop_reason?: string;
  };

  const used = data.content?.find((b) => b.type === 'tool_use');
  if (used?.input) return used.input;

  // 도구를 안 쓰고 텍스트로 답한 경우 — 코드펜스를 벗기고 JSON 으로 건져 본다
  const text = data.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n') ?? '';
  const salvaged = salvageJson(text);
  if (salvaged) return salvaged;

  throw new Error(`도구 호출이 없다 (stop_reason=${data.stop_reason ?? '?'}): ${text.slice(0, 200)}`);
}

