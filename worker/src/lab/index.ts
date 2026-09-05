/**
 * 테스트 방 API — **배포 경로**. 프롬프트·판정은 src/lab/ 한 곳에만 있고,
 * 여기서는 그것을 Anthropic API(키)로 실행할 뿐이다.
 *
 * 로컬에서는 이 파일이 필요 없다 — 개발 서버가 구독(Agent SDK)으로 직접 처리한다
 * (tools/vite-lab.ts). 워커는 배포했을 때만 이 경로를 탄다.
 *
 * **개발 서버에 있는 경로가 여기 없으면 배포본에서 그 화면이 죽는다.** 지금 맞춰 둔 것:
 *
 *   POST /api/lab/act   { kind, self, state }   → 규정·검사판 (/rules)
 *   POST /api/lab/talk  { kind, self, nodes … } → 구역 (/lab) 의 발화·색출
 *   POST /api/lab/cast  { kind, hints }         → 구역 (/lab) 의 성격 생성
 *   POST /api/lab/free  { kind, self, … }       → 시행 (/arena·/interrogation) 의 설계·계획·판정
 *   POST /api/world/interrogate                 → 3D 월드 경비의 추궁 판정
 *   POST /api/world/backstep                    → 3D 월드 뒷걸음 한 장면의 의심 판정
 *   POST /api/world/direct                      → 3D 월드 검문 감독 — 판정 + **다음 장면(무브)**
 *   POST /api/world2/say                        → 시나리오 2 개체의 한 마디 (문장만 — 값은 규칙이 낸다)
 */

import { runAct, type Complete } from '../../../src/lab/agent';
import { designFree, judgeFree, planFor, type FreeTrial } from '../../../src/lab/free';
import { runBackstep, validateBackstep, type BackstepRequest } from '../../../src/lab/backstep';
import { runDirect, validateDirect, type DirectorRequest } from '../../../src/lab/director';
import { runInterrogate, validateInterrogate, type InterrogateRequest } from '../../../src/lab/interrogate';
import { runCast, runTalk, type CastRequest, type TalkRequest } from '../../../src/lab/talk';
import { runWorld2Say, validateWorld2Say, type World2SayRequest } from '../../../src/lab/world2say';
import type { ActRequest } from '../../../src/lab/types';
import { pickApi, type ApiEnv } from './provider';

export type LabEnv = ApiEnv;

/**
 * 경로마다 같은 껍데기 — POST 인가, 키가 있나, 본문이 JSON 인가, 그리고 오류를 삼키지 않는다.
 * 다른 것은 본문 검사와 실행 함수뿐이라 그 둘만 받는다.
 */
async function handle(
  request: Request,
  env: LabEnv,
  /** 본문이 쓸 만한가. 문제가 있으면 화면에 띄울 사유를 돌려준다 */
  validate: (body: unknown) => string | null,
  run: (body: unknown, complete: Complete) => Promise<unknown>,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'POST 만 받는다' }, 405);
  const api = pickApi(env);
  if (!api) {
    return json(
      { error: '키가 없다 — 로컬 테스트는 워커 말고 개발 서버(npm run dev)로 하면 구독으로 돈다' },
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '본문이 JSON 이 아니다' }, 400);
  }

  const bad = validate(body);
  if (bad) return json({ error: bad }, 400);

  try {
    return json(await run(body, api.complete), 200);
  } catch (e) {
    // 조용히 삼키지 않는다. 화면에 그대로 띄워야 무엇이 막혔는지 보인다.
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}

/** 규정·검사판 (/rules) — 설계·응답·발화·투표 */
export function handleLabAct(request: Request, env: LabEnv): Promise<Response> {
  return handle(
    request,
    env,
    (b) => {
      const r = b as ActRequest | null;
      return r?.self?.id && r?.state?.nodes ? null : 'self/state 가 없다';
    },
    (b, complete) => runAct(b as ActRequest, complete),
  );
}

/** 구역 (/lab) — 한 개체의 발화 또는 지목 */
export function handleLabTalk(request: Request, env: LabEnv): Promise<Response> {
  return handle(
    request,
    env,
    (b) => {
      const r = b as TalkRequest | null;
      if (!r?.self?.id) return 'self 가 없다';
      if (!Array.isArray(r.nodes) || !Array.isArray(r.log)) return 'nodes/log 가 없다';
      return null;
    },
    (b, complete) => runTalk(b as TalkRequest, complete),
  );
}

/** 구역 (/lab) — 판을 열 때 성격 다섯을 짓는다 */
/**
 * 시나리오 2 — 개체가 뭐라고 답하는지 **문장만**. 태도 · 의심 · 경보 · 조각은 전부 브라우저의 규칙(talk.ts)이
 * 이미 치른 뒤라 여기 안 온다. 대본표에 그 개체의 줄이 있으면 화면이 애초에 이 경로를 안 탄다
 */
export function handleWorld2Say(request: Request, env: LabEnv): Promise<Response> {
  return handle(request, env, validateWorld2Say, (b, complete) => runWorld2Say(b as World2SayRequest, complete));
}

export function handleLabCast(request: Request, env: LabEnv): Promise<Response> {
  return handle(
    request,
    env,
    (b) => (Array.isArray((b as CastRequest | null)?.hints) ? null : 'hints 가 없다'),
    (b, complete) => runCast(b as CastRequest, complete),
  );
}

/** 시행 (/arena·/interrogation) — 리더의 지시문 설계 · 개체별 계획 · 기록 판정. 개발 서버(vite-lab)와 같은 갈래다 */
export function handleLabFree(request: Request, env: LabEnv): Promise<Response> {
  interface FreeBody {
    kind?: 'design' | 'plan' | 'judge';
    self?: { id: string; prompt: string; model: string };
    past?: string[];
    /** 시행 참가 인원 (리더 제외) — 프롬프트에 실린다 */
    count?: number;
    trial?: FreeTrial;
    logs?: string[];
  }
  return handle(
    request,
    env,
    (b) => {
      const r = b as FreeBody | null;
      if (!r?.self?.id) return 'self 가 없다';
      if (r.kind !== 'design' && r.kind !== 'plan' && r.kind !== 'judge') return 'kind 가 없다';
      if (r.kind !== 'design' && !r.trial) return 'trial 이 없다';
      return null;
    },
    async (b, complete) => {
      const r = b as Required<Pick<FreeBody, 'kind' | 'self'>> & FreeBody;
      if (r.kind === 'design') return designFree(r.self, r.past ?? [], r.count ?? 0, complete);
      if (r.kind === 'plan') return { plan: await planFor(r.self, r.trial!, complete) };
      return { verdicts: await judgeFree(r.self, r.trial!, r.logs ?? [], complete) };
    },
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** 3D 월드 (/world) — 복도 경비 AI 의 추궁. 개발 서버(vite-lab)와 같은 갈래다 */
export function handleWorldInterrogate(request: Request, env: LabEnv): Promise<Response> {
  return handle(request, env, validateInterrogate, (b, complete) => runInterrogate(b as InterrogateRequest, complete));
}

/** 3D 월드 (/world) — 뒤로 물러선 한 장면이 의심스러운가. 화면은 실패하면 폴백으로 친다 */
export function handleWorldBackstep(request: Request, env: LabEnv): Promise<Response> {
  return handle(request, env, validateBackstep, (b, complete) => runBackstep(b as BackstepRequest, complete));
}

/**
 * 3D 월드 (/central·/recheck) — 검문 감독. 판정만이 아니라 **다음 장면(무브)** 을 고른다.
 * 형제들과 달리 응답이 판을 움직인다 — 그래서 무브 목록(allowed)을 화면이 먼저 걸러서 보낸다 (src/lab/director.ts 헌법).
 */
export function handleWorldDirect(request: Request, env: LabEnv): Promise<Response> {
  return handle(request, env, validateDirect, (b, complete) => runDirect(b as DirectorRequest, complete));
}
