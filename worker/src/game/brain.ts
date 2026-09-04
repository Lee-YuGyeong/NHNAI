/**
 * 판 안의 LLM 호출 — **DO 안에서만** 부른다 (PLANNING §4.4 "API 키는 브라우저에 절대 넣지 않는다 —
 * 모든 호출은 Worker/DO 안에서"). 정체표를 쥔 쪽이 곧 프롬프트를 짜는 쪽이어야 AI 참가자가 자기가
 * AI 라는 것을 알면서도 그 사실이 와이어로 새지 않는다.
 *
 * 세 갈래 — 위에서부터 되는 것을 쓴다:
 *   1. ANTHROPIC_API_KEY 가 있다 → Anthropic Messages API (worker/src/lab/anthropic.ts). 배포본의 길.
 *   2. 없다 → 개발 서버의 구독 경로 `POST {LAB_DEV_URL}/api/lab/complete` (tools/vite-lab.ts).
 *      `npm run dev` 하나로 워커도 키 없이 돈다는 이 저장소의 약속을 판에도 그대로 잇는다.
 *      한 번 실패하면 이 방에서는 다시 안 두드린다 — 배포본에서 로컬 주소를 매번 찌르지 않게.
 *   3. 둘 다 없다 → null. 부르는 쪽이 제 폴백(정해진 문장 · 규칙)으로 판을 계속 굴린다 (§9 "폴백").
 *
 * 시간 상한이 있다 — 판은 사람의 시계로 돈다. 늦은 답은 버린다.
 */

import type { Complete, Effort, ToolSpec } from '../../../src/lab/agent';
import { callTool } from '../lab/anthropic';

export interface BrainEnv {
  ANTHROPIC_API_KEY?: string;
  /** 개발 서버 주소 — 기본은 vite 의 5173 */
  LAB_DEV_URL?: string;
}

/**
 * 개발 서버 후보 — vite 는 IPv6(::1)에만 뜨는 날도, IPv4 에만 뜨는 날도 있다 (2026-09-04 실측: 127.0.0.1 거절, localhost 통과).
 * 처음 답한 주소를 이 방에서 계속 쓴다.
 */
const DEV_URL_CANDIDATES = ['http://localhost:5173', 'http://[::1]:5173', 'http://127.0.0.1:5173'];

export interface Brain {
  /** 물어보고 도구 모양의 객체를 받는다. 못 받으면 null — 절대 던지지 않는다 */
  ask(args: { model: string; system: string; user: string; tool: ToolSpec; effort: Effort; timeoutMs?: number }): Promise<Record<
    string,
    unknown
  > | null>;
  /** 지금 어느 길로 가나 — 로그용 */
  readonly mode: 'api' | 'dev' | 'none';
}

const DEFAULT_TIMEOUT_MS = 40_000;

export function makeBrain(env: BrainEnv, fetchFn: typeof fetch = fetch): Brain {
  let devDead = false;
  const apiKey = env.ANTHROPIC_API_KEY;
  const candidates = env.LAB_DEV_URL ? [env.LAB_DEV_URL.replace(/\/$/, '')] : DEV_URL_CANDIDATES;
  /** 답한 적 있는 개발 서버 주소 — 처음 한 번만 후보를 돈다 */
  let devUrl: string | null = null;

  const viaApi: Complete = ({ model, system, user, tool, effort }) => callTool(apiKey!, model, system, user, tool, effort);

  const post = async (base: string, body: string) =>
    fetchFn(`${base}/api/lab/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  const viaDev: Complete = async ({ model, system, user, tool, effort }) => {
    const body = JSON.stringify({ model, system, user, tool, effort });
    let res: Response | null = null;
    if (devUrl) res = await post(devUrl, body);
    else {
      let lastErr: unknown = new Error('개발 서버 없음');
      for (const base of candidates) {
        try {
          res = await post(base, body);
          devUrl = base;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!res) throw lastErr;
    }
    if (!res.ok) throw new Error(`dev lab ${res.status}`);
    const data = (await res.json()) as { input?: Record<string, unknown>; error?: string };
    if (!data.input) throw new Error(data.error ?? '빈 응답');
    return data.input;
  };

  return {
    get mode() {
      if (apiKey) return 'api';
      return devDead ? 'none' : 'dev';
    },
    async ask({ timeoutMs = DEFAULT_TIMEOUT_MS, ...args }) {
      const complete = apiKey ? viaApi : devDead ? null : viaDev;
      if (!complete) return null;
      try {
        return await withTimeout(complete(args), timeoutMs);
      } catch (e) {
        // 개발 서버를 한 번도 못 찾았으면 이 방에서는 더 안 두드린다. 찾은 뒤의 실패(시간 초과 · CLI 오류)는 그 한 번뿐이다
        if (!apiKey && !devUrl) devDead = true;
        console.warn(`[game/brain] ${apiKey ? 'api' : 'dev'} 실패: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`시간 초과 ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
