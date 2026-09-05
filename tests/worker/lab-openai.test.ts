/**
 * 배포본이 실제로 타는 관로 — OpenAI **Responses API** (worker/src/lab/openai.ts).
 *
 * 로컬은 Claude 구독으로 도니까 **이 길은 배포하기 전에는 한 번도 안 밟힌다.** 그래서 여기서
 * 요청 모양을 못 박는다. 옮겨 적을 때 틀리는 자리가 정해져 있다:
 *   - system 이 필드가 아니라 input 배열 첫 줄
 *   - 상한은 max_output_tokens (사고 토큰까지 여기서 나간다)
 *   - 도구 모양이 납작하다 — function 아래로 한 겹 넣지 않는다
 *   - 답은 배열이고 사고 항목이 앞에 붙는다 → 첫 칸이 아니라 function_call 을 찾아야 한다
 *   - arguments 는 **JSON 문자열** (Anthropic 의 input 은 객체)
 * 하나라도 어긋나면 배포본에서만 AI 가 조용히 입을 다문다 — 화면에는 오류가 안 뜬다.
 *
 * ★ 첫 판은 Chat Completions 로 짰다가 배포본에서 400 이 났다 (2026-09-05):
 *   "Function tools with reasoning_effort are not supported ... use /v1/responses".
 *   그 자리를 여기 「도구와 effort 를 같이 보낸다」 테스트가 지킨다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callTool, mapModel } from '../../worker/src/lab/openai';
import { pickApi } from '../../worker/src/lab/provider';
import { makeBrain } from '../../worker/src/game/brain';
import { TEXT_TOOL } from '../../src/lab/agent';

const KEY = 'sk-proj-테스트';

/** 마지막 fetch 요청의 본문을 꺼내 쓰기 위한 스텁 */
function stubFetch(payload: unknown, status = 200) {
  const fake = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', fake);
  return fake;
}

function bodyOf(fake: ReturnType<typeof stubFetch>): Record<string, any> {
  const init = fake.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body));
}

/**
 * 도구를 제대로 부른 응답. **사고 항목을 일부러 앞에 끼운다** — 실제 추론 모델의 답이
 * 그렇게 오고, 첫 칸만 보는 코드는 여기서 걸린다.
 */
function toolReply(args: Record<string, unknown>) {
  return {
    status: 'completed',
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'function_call', name: TEXT_TOOL.name, arguments: JSON.stringify(args) },
    ],
  };
}

const ask = (model = 'claude-sonnet-5', effort: 'low' | 'medium' | 'high' = 'low', override?: string) =>
  callTool(KEY, model, '시스템 지시', '사용자 질문', TEXT_TOOL, effort, override);

afterEach(() => vi.unstubAllGlobals());

describe('openai callTool — 요청 모양', () => {
  it('Responses API 로 간다 — Chat Completions 는 도구+추론을 같이 못 받는다', async () => {
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask();
    const init = fake.mock.calls[0][1] as RequestInit;
    expect(fake.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it('system 은 input 첫 줄이다 — 최상위 필드로 보내면 페르소나가 통째로 무시된다', async () => {
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask();
    const body = bodyOf(fake);
    expect(body.system).toBeUndefined();
    expect(body.messages).toBeUndefined();
    expect(body.input[0]).toEqual({ role: 'system', content: '시스템 지시' });
    expect(body.input[1].role).toBe('user');
    expect(body.input[1].content).toContain('사용자 질문');
  });

  it('상한은 max_output_tokens 다', async () => {
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask();
    const body = bodyOf(fake);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.max_output_tokens).toBeGreaterThan(0);
  });

  it('설계(high)는 상한이 더 크다 — 사고 토큰이 같은 상한에서 나가서 잘리면 빈 답이 온다', async () => {
    const low = stubFetch(toolReply({ text: 'a' }));
    await ask('claude-opus-5', 'low');
    const lowCap = bodyOf(low).max_output_tokens;
    vi.unstubAllGlobals();
    const high = stubFetch(toolReply({ text: 'a' }));
    await ask('claude-opus-5', 'high');
    expect(bodyOf(high).max_output_tokens).toBeGreaterThan(lowCap);
  });

  it('도구 모양은 납작하다 — function 아래로 한 겹 넣지 않는다', async () => {
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask();
    const body = bodyOf(fake);
    expect(body.tools).toEqual([
      { type: 'function', name: TEXT_TOOL.name, description: TEXT_TOOL.description, parameters: TEXT_TOOL.input_schema },
    ]);
    expect(body.tool_choice).toBe('required');
  });

  it('effort 는 reasoning.effort 로 중첩해서 간다', async () => {
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask('claude-sonnet-5', 'medium');
    expect(bodyOf(fake).reasoning).toEqual({ effort: 'medium' });
    expect(bodyOf(fake).reasoning_effort).toBeUndefined();
  });

  it('★ 도구와 effort 를 **같이** 보낸다 — 이 둘을 갈라놓으라는 게 Chat Completions 의 400 이었다', async () => {
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask('claude-opus-5', 'high');
    const body = bodyOf(fake);
    expect(body.tools).toHaveLength(1);
    expect(body.reasoning.effort).toBe('high');
  });
});

describe('openai 모델 이름 옮기기', () => {
  it('관리 AI 는 좋은 것, 노드는 싼 것 — 부르는 횟수가 다르다', () => {
    expect(mapModel('claude-opus-5')).toBe('gpt-5.6-terra');
    expect(mapModel('claude-sonnet-5')).toBe('gpt-5.6-luna');
  });

  it('모르는 이름은 싼 것으로 떨어뜨린다 — 판이 400 으로 멈추지 않게', () => {
    expect(mapModel('claude-무엇-9')).toBe('gpt-5.6-luna');
  });

  it('OPENAI_MODEL 이 있으면 등급을 무시하고 그것으로 고정한다', async () => {
    expect(mapModel('claude-opus-5', 'gpt-6-astra')).toBe('gpt-6-astra');
    const fake = stubFetch(toolReply({ text: '응답' }));
    await ask('claude-opus-5', 'low', 'gpt-6-astra');
    expect(bodyOf(fake).model).toBe('gpt-6-astra');
  });

  it('빈 문자열은 고정이 아니다 — 시크릿을 이름만 만들고 비워 뒀을 때', () => {
    expect(mapModel('claude-opus-5', '  ')).toBe('gpt-5.6-terra');
  });
});

describe('openai callTool — 응답 읽기', () => {
  it('사고 항목을 건너뛰고 function_call 을 찾는다 — 첫 칸만 보면 놓친다', async () => {
    stubFetch(toolReply({ text: '규정을 지킨 발화' }));
    expect(await ask()).toEqual({ text: '규정을 지킨 발화' });
  });

  it('도구를 안 쓰고 텍스트로 답해도 JSON 을 건져 올린다', async () => {
    stubFetch({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '```json\n{"text":"건져낸 발화"}\n```' }] }],
    });
    expect(await ask()).toEqual({ text: '건져낸 발화' });
  });

  it('건질 것이 없으면 사유를 달고 던진다 — 삼키면 무엇이 막혔는지 안 보인다', async () => {
    stubFetch({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] });
    await expect(ask()).rejects.toThrow(/status=incomplete · max_output_tokens/);
  });

  it('HTTP 오류는 상태와 본문을 달고 던진다', async () => {
    stubFetch({ error: { message: 'model not found' } }, 404);
    await expect(ask()).rejects.toThrow(/openai 404.*model not found/);
  });
});

describe('pickApi — 어느 키로 가나', () => {
  it('키가 없으면 null (부르는 쪽이 개발 서버 구독 경로로 내려간다)', () => {
    expect(pickApi({})).toBeNull();
    expect(pickApi({ OPENAI_API_KEY: '  ' })).toBeNull();
  });

  it('OPENAI 만 있으면 openai — 이게 배포본의 배치다', () => {
    expect(pickApi({ OPENAI_API_KEY: KEY })?.name).toBe('openai');
  });

  it('둘 다 있으면 anthropic 이 이긴다', () => {
    expect(pickApi({ ANTHROPIC_API_KEY: 'sk-ant-x', OPENAI_API_KEY: KEY })?.name).toBe('anthropic');
  });
});

describe('brain — 판이 타는 갈래', () => {
  it('OPENAI 키가 있으면 openai 로 가고 개발 서버를 안 두드린다', async () => {
    const fake = stubFetch(toolReply({ text: '판의 발화' }));
    const dev = vi.fn();
    const brain = makeBrain({ OPENAI_API_KEY: KEY }, dev as unknown as typeof fetch);

    expect(brain.mode).toBe('openai');
    const out = await brain.ask({ model: 'claude-sonnet-5', system: 's', user: 'u', tool: TEXT_TOOL, effort: 'low' });
    expect(out).toEqual({ text: '판의 발화' });
    expect(dev).not.toHaveBeenCalled();
    expect(fake.mock.calls[0][0]).toContain('api.openai.com');
  });

  it('API 가 죽어도 null 만 돌려준다 — 판은 폴백으로 계속 굴러간다', async () => {
    stubFetch({ error: { message: '한도 초과' } }, 429);
    const brain = makeBrain({ OPENAI_API_KEY: KEY });
    expect(await brain.ask({ model: 'claude-sonnet-5', system: 's', user: 'u', tool: TEXT_TOOL, effort: 'low' })).toBeNull();
  });
});
