/**
 * 어느 API 로 물어볼까 — 키가 있는 쪽으로. 부르는 자리가 둘이라(판 · /lab) 여기 한 곳에만 둔다.
 *
 * 이 저장소의 배치는 이렇다:
 *   로컬  키를 안 넣는다 → 여기서 null 이 나오고, 부르는 쪽이 개발 서버(Claude 구독)로 간다.
 *   배포  OPENAI_API_KEY 하나만 넣는다 → GPT 로 돈다. Claude Agent SDK 는 CLI 프로세스를
 *         띄워야 해서 워커 안에서는 애초에 못 쓴다 (tools/vite-lab.ts 머리말).
 *
 * 둘 다 있으면 Anthropic 이 이긴다 — 개발 중에 앤트로픽 키를 잠깐 꽂아 비교해 볼 때
 * 그쪽이 켜지는 편이 덜 놀랍다. 순서를 바꾸고 싶으면 여기 한 줄이다.
 */

import type { Complete } from '../../../src/lab/agent';
import { callTool as anthropicCallTool } from './anthropic';
import { callTool as openaiCallTool } from './openai';

export interface ApiEnv {
  /** Anthropic Messages API. 없어도 된다 — 이 저장소의 배포는 아래 OpenAI 로 간다 */
  ANTHROPIC_API_KEY?: string;
  /** OpenAI Responses API. 배포본의 길 */
  OPENAI_API_KEY?: string;
  /** 개체 등급을 무시하고 한 모델로 고정할 때 (예: gpt-5.6-terra). 비우면 등급대로 나뉜다 */
  OPENAI_MODEL?: string;
}

export type ApiName = 'anthropic' | 'openai';

/** 쓸 수 있는 API 가 있으면 그 관로를, 없으면 null */
export function pickApi(env: ApiEnv): { name: ApiName; complete: Complete } | null {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      name: 'anthropic',
      complete: ({ model, system, user, tool, effort }) => anthropicCallTool(anthropicKey, model, system, user, tool, effort),
    };
  }

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      name: 'openai',
      complete: ({ model, system, user, tool, effort }) =>
        openaiCallTool(openaiKey, model, system, user, tool, effort, env.OPENAI_MODEL),
    };
  }

  return null;
}
