/**
 * 개발 서버 안에서 /api/lab/act 를 처리한다 — **Claude 구독(Max)** 으로.
 *
 * 왜 여기 있나: Agent SDK 는 Claude Code CLI 를 자식 프로세스로 띄운다. Cloudflare 워커
 * 안에서는 프로세스를 못 띄우니 배포본에서는 못 쓴다. 반대로 개발 서버(vite)는 그냥 Node 라
 * 그대로 된다 → **로컬 테스트는 워커도 API 키도 필요 없다.** `npm run dev` 하나면 된다.
 *
 * 배포할 때는 같은 로직(src/lab/agent.ts)을 워커가 API 키로 부른다.
 */

import type { Plugin } from 'vite';
import { jsonInstruction, runAct, salvageJson, type Complete } from '../src/lab/agent';
import { runBackstep, validateBackstep, type BackstepRequest } from '../src/lab/backstep';
import { runDirect, validateDirect, type DirectorRequest } from '../src/lab/director';
import { runInterrogate, validateInterrogate, type InterrogateRequest } from '../src/lab/interrogate';
import { runWorld2Say, validateWorld2Say, type World2SayRequest } from '../src/lab/world2say';
import { runCast, runTalk, type CastRequest, type TalkRequest } from '../src/lab/talk';
import { designFree, judgeFree, planFor, type FreeTrial } from '../src/lab/free';
import type { ActRequest } from '../src/lab/types';

/** CLI 가 아는 이름. 구독으로는 별칭(opus/sonnet/haiku)이 가장 안전하다. */
const MODEL_ALIAS: Record<string, string> = {
  'claude-opus-5': 'opus',
  'claude-sonnet-5': 'sonnet',
  'claude-haiku-4-5': 'haiku',
};

/** CLI 프로세스를 한꺼번에 너무 많이 띄우지 않는다. 한 페이즈에 에이전트 5개가 동시에 들어온다 */
/**
 * 동시에 띄우는 Claude Code 프로세스 수.
 *
 * 실측: 1개 10.7s / 2개 11.8s / **3개에서 하나가 깨진다.**
 * 그래서 2다. 대기열은 남은 요청을 순서대로 흘려보내므로 여섯이 붙어도 다 처리된다 —
 * 다만 그만큼 늦어진다.
 */
const MAX_CONCURRENT = Number(process.env.LAB_CONCURRENCY ?? 2);
let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

const complete: Complete = async ({ model, system, user, tool }) => {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  await acquire();
  try {
    let lastError = '응답이 비었다';
    // CLI 가 죽어도(멀티턴 시도 · 일시 오류) 판이 영어 에러로 끊기지 않게 — 본문을 받았으면
    // 그걸로 건지고, 빈손일 때만 같은 슬롯 안에서 한 번 더 묻는다.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const q = query({
        prompt: user + jsonInstruction(tool),
        options: {
          model: MODEL_ALIAS[model] ?? model,
          systemPrompt: system, // Claude Code 프리셋이 아니라 이 게임의 페르소나를 쓴다
          maxTurns: 1,
          // 도구를 통째로 뗀다. allowedTools: [] 는 빈 배열이면 CLI 에 아무 플래그도 안 넘겨서
          // 도구가 그대로 남았고, 모델이 도구를 집는 순간 maxTurns(1) 에 걸려 판이 죽었다.
          tools: [],
          settingSources: [], // 이 저장소의 CLAUDE.md·훅·권한 설정을 끌어오지 않는다
        },
      });

      let text = '';
      try {
        for await (const message of q as AsyncIterable<Record<string, unknown>>) {
          if (message?.type !== 'assistant') continue;
          // SDK 버전에 따라 content 위치가 다르다 (message.content / message.message.content)
          const inner = message.message as { content?: unknown[] } | undefined;
          const blocks = (message.content as unknown[] | undefined) ?? inner?.content ?? [];
          for (const raw of blocks) {
            const block = raw as { type?: string; text?: string };
            if (block?.type === 'text' && block.text) text += block.text;
          }
        }
      } catch (e) {
        // 에러 결과로 끝나도 그 전에 받은 본문은 유효하다 — 버리지 않는다
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (!text) continue;

      const parsed = salvageJson(text);
      if (parsed) return parsed;

      // 스키마가 문자열 필드 하나뿐인 도구(발화 같은 것)라면 원문을 그대로 담는다.
      // 형식 하나 어긋났다고 대화가 끊기는 편이 더 나쁘다.
      const props = (tool.input_schema.properties ?? {}) as Record<string, { type?: string }>;
      const keys = Object.keys(props).filter((k) => props[k]?.type === 'string');
      if (keys.length) {
        const bare = text.replace(/^[\s\S]*?[:：]\s*"?/, '').replace(/"?\s*[}\]]*\s*$/, '').trim();
        return { [keys[0]]: bare || text.trim() };
      }
      lastError = `JSON 을 못 건졌다: ${text.slice(0, 200)}`;
    }
    throw new Error(`발화 생성이 두 번 다 실패했다 — ${lastError}`);
  } finally {
    release();
  }
};

export function labPlugin(): Plugin {
  return {
    name: 'lab-agents',
    configureServer(server) {
      const endpoint = (
        path: string,
        run: (body: unknown) => Promise<unknown>,
        label: (body: unknown) => string,
      ) =>
        server.middlewares.use(path, (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'POST 만 받는다' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk;
            if (body.length > 1_000_000) req.destroy();
          });
          req.on('end', () => {
            void (async () => {
              const started = Date.now();
              let tag = '?';
              try {
                const parsed: unknown = JSON.parse(body);
                tag = label(parsed);
                const out = await run(parsed);
                server.config.logger.info(`[lab] ${tag} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify(out));
              } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                server.config.logger.error(`[lab] ${tag} 실패: ${message}`);
                res.statusCode = 502;
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: message }));
              }
            })();
          });
        });

      // 규정·검사판 (/lab)
      endpoint(
        '/api/lab/act',
        (body) => runAct(body as ActRequest, complete),
        (body) => {
          const b = body as ActRequest;
          return `${b.self?.id}/${b.kind}/${b.self?.model}`;
        },
      );

      // 대화 방 — 판 시작 시 성격 다섯을 즉석 생성
      endpoint(
        '/api/lab/cast',
        (body) => runCast(body as CastRequest, complete),
        () => 'cast',
      );

      // 자유 시행 — 지시문 · 개체별 계획 · 리더 판정. 열거가 없다
      endpoint(
        '/api/lab/free',
        async (body) => {
          const b = body as {
            kind: 'design' | 'plan' | 'judge';
            self: { id: string; prompt: string; model: string };
            past?: string[];
            /** 시행 참가 인원 (리더 제외) — 프롬프트에 실린다 */
            count?: number;
            trial?: FreeTrial;
            logs?: string[];
          };
          if (b.kind === 'design') return designFree(b.self, b.past ?? [], b.count ?? 0, complete);
          if (b.kind === 'plan') return { plan: await planFor(b.self, b.trial!, complete) };
          return { verdicts: await judgeFree(b.self, b.trial!, b.logs ?? [], complete) };
        },
        (body) => `${(body as { self?: { id?: string } }).self?.id}/free-${(body as { kind?: string }).kind}`,
      );

      // 3D 월드 — 복도 경비 AI 의 추궁 (챕터 1)
      endpoint(
        '/api/world/interrogate',
        (body) => {
          const bad = validateInterrogate(body);
          if (bad) throw new Error(bad);
          return runInterrogate(body as InterrogateRequest, complete);
        },
        () => 'interrogate',
      );

      // 3D 월드 — 뒷걸음 한 장면이 의심스러운가 (챕터 1·2 공용)
      endpoint(
        '/api/world/backstep',
        (body) => {
          const bad = validateBackstep(body);
          if (bad) throw new Error(bad);
          return runBackstep(body as BackstepRequest, complete);
        },
        () => 'backstep',
      );

      // 3D 월드 — 검문 감독 (챕터 2 관문 · 챕터 3 재검). 판정과 함께 **다음 장면**이 온다
      endpoint(
        '/api/world/direct',
        (body) => {
          const bad = validateDirect(body);
          if (bad) throw new Error(bad);
          return runDirect(body as DirectorRequest, complete);
        },
        (body) => `direct/${(body as { check?: string }).check ?? '?'}`,
      );

      // 시나리오 2 — 개체의 한 마디. **문장만** 온다: 태도·의심·경보는 브라우저의 규칙이 이미 치렀다
      endpoint(
        '/api/world2/say',
        (body) => {
          const bad = validateWorld2Say(body);
          if (bad) throw new Error(bad);
          return runWorld2Say(body as World2SayRequest, complete);
        },
        (body) => `w2say/${(body as { unit?: string }).unit ?? '?'}`,
      );

      // 대화 방 — 페르소나·색출
      endpoint(
        '/api/lab/talk',
        (body) => runTalk(body as TalkRequest, complete),
        (body) => {
          const b = body as TalkRequest;
          return `${b.self?.id}/${b.kind}/${b.self?.model}`;
        },
      );
    },
  };
}
