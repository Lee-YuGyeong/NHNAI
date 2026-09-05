/**
 * 문지기 — 워커 진입점(index.ts)이 **모든 요청에 한 번씩** 거치는 네 가지 검사.
 * 게임 규칙은 하나도 모른다. 아는 것은 「누가 어디서 얼마나」뿐이다.
 *
 * ┌─ 왜 필요한가 (2026-09-05 사용자: "게임에 영향을 주지 않을 정도의 보안 개선") ──┐
 * │ 이 워커의 /api/lab/* · /api/world/* · /api/tts 는 **로그인 없이** 열려 있고,     │
 * │ 뒤에는 요금이 나가는 API(OpenAI · ElevenLabs)가 있다. 게임이 로그인을 관문으로  │
 * │ 삼지 않는 것은 결정이라(src/shared/supabase.ts) 관문을 세우지는 않는다. 대신     │
 * │ **남의 사이트에서 부르는 것**과 **한 사람이 퍼붓는 것**만 막는다 — 정상 플레이는  │
 * │ 둘 다 아니라서 게임은 느끼지 못한다.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────┘
 *
 *   1. originAllowed   Origin 이 있으면 **우리 것**이어야 한다. 브라우저에서 남의 페이지가
 *                      fetch/WebSocket 으로 이 워커를 부르면 여기서 걸린다. Origin 이 없는
 *                      요청(curl · 서버)은 통과 — 그건 CORS 로 막을 수 있는 것이 아니다.
 *   2. corsHeaders     `*` 를 쓰지 않는다. 허용된 Origin 만 그대로 돌려준다.
 *   3. withHeaders     nosniff · referrer · 프레임 금지 · 권한 정책 — 워커를 거치는 응답에 붙는다.
 *                      ★ 정적 파일(index.html · js · 그림)은 워커를 **거치지 않는다** (wrangler.jsonc 의
 *                      run_worker_first 가 /api · /health · 소켓만 워커로 보낸다). 그쪽의 같은 헤더는
 *                      public/_headers 가 맡는다 — 값을 바꾸면 **두 곳을 같이** 바꾼다.
 *   4. bodyTooLarge    /api/* 본문 천장. 거대한 JSON 을 파싱하느라 CPU 를 태우지 않는다.
 *   5. rateLimited     IP 당 분당 호출 수 (Cloudflare Rate Limiting 바인딩). 바인딩이 없으면
 *                      **통과다** — 로컬에서 바인딩을 못 만들어도 게임은 돌아야 한다.
 *
 * 어느 것도 기존 응답 본문을 바꾸지 않는다. 헤더를 얹거나, 403 · 413 · 429 로 문 앞에서 돌려보낸다.
 */

export interface GuardEnv {
  /**
   * 우리 프론트가 사는 주소 — 워커와 **다른 호스트**에 둘 때만 적는다 (쉼표로 여럿).
   * 같은 워커에서 dist 를 서빙하는 지금 배포에서는 비워 둔다: 같은 호스트는 늘 허용이다.
   * 예: "https://game.example.com,https://staging.example.com"
   * ★ VITE_WORLD_WS_URL 로 별도 워커를 가리키는 판이면 그 워커에 프론트 주소를 여기 적어야 소켓이 붙는다.
   */
  ALLOWED_ORIGINS?: string;
  /** wrangler.jsonc 의 ratelimits 바인딩. 없으면 속도 제한은 없다 */
  API_RATE_LIMIT?: RateLimit;
}

/**
 * /api/* 본문 천장. 가장 큰 정상 요청은 /api/lab/talk 의 대화 기록·개체 목록인데 수십 KB 다.
 * 1 MB 는 그 스무 배쯤 — 정상 플레이가 닿을 수 없고, 퍼붓는 쪽에게는 충분히 낮다.
 */
export const MAX_API_BODY_BYTES = 1_048_576;

/** 개발 서버 주소들 — vite(5173 · 5174 …) 가 워커(8787) 를 프록시하므로 Origin 과 Host 가 어긋난다 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function originsOf(env: GuardEnv | undefined): Set<string> {
  return new Set(
    (env?.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

/**
 * 이 Origin 에서 온 요청을 받아도 되나.
 *
 *   Origin 없음                → 그렇다 (브라우저의 교차 출처 요청이 아니다)
 *   Origin 호스트 == 요청 호스트 → 그렇다 (같은 워커에서 서빙된 프론트)
 *   Origin 이 로컬 개발 주소    → 그렇다 (vite 프록시 뒤의 8787 은 Host 가 다르다)
 *   ALLOWED_ORIGINS 에 있다      → 그렇다
 *   그 밖                       → 아니다
 */
export function originAllowed(request: Request, env?: GuardEnv): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return !origin; // 'null' 은 샌드박스 iframe · file:// — 우리 프론트가 아니다
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (o.host === new URL(request.url).host) return true;
  if (LOCAL_HOST.test(o.host)) return true;
  return originsOf(env).has(o.origin);
}

/**
 * CORS 헤더 — 허용된 Origin 만 그대로 돌려준다. 허용되지 않았으면 **빈 객체**다:
 * 브라우저는 allow-origin 이 없는 응답을 페이지에 넘기지 않는다.
 */
export function corsHeaders(request: Request, env?: GuardEnv): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !originAllowed(request, env)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    // authorization: /api/world/ticket 이 액세스 토큰을 **헤더로** 받는다 (쿼리에 두지 않는 이유는 auth.ts 머리말)
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '600',
    // Origin 마다 응답이 다르다 — 캐시(브라우저 · 엣지)가 남의 Origin 응답을 재사용하면 안 된다
    vary: 'origin',
  };
}

/**
 * 모든 응답에 얹는 보안 헤더. **게임이 쓰는 것은 막지 않는다** —
 * 전체화면 · 마이크 · WebGL · 폰트 · Supabase · R2 영상은 전부 그대로다.
 *
 *   nosniff          .js 를 text/plain 으로 받아도 실행하지 않게 — MIME 추측 금지
 *   referrer-policy  다른 사이트로 나갈 때 경로(방 번호 · ?tk=)를 흘리지 않는다
 *   frame-ancestors  남의 페이지가 이 게임을 iframe 에 얹고 위에 무언가를 겹치지 못하게 (클릭재킹)
 *   permissions      카메라 · 위치 · 결제 — 이 게임이 안 쓰는 문은 닫아 둔다. 마이크 · 전체화면은 건드리지 않는다
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'permissions-policy': 'camera=(), geolocation=(), payment=(), usb=()',
};

/**
 * 응답에 헤더를 얹는다. 정적 파일(ASSETS) · DO 응답은 헤더가 잠겨 있어(immutable) 복사해서 얹는다.
 *
 * ★ WebSocket 응답(101)은 **그대로** 돌려준다 — 새 Response 로 감싸면 소켓이 떨어진다.
 * ★ 보안 헤더는 이미 있으면 덮지 않는다 (핸들러가 더 엄한 값을 골랐을 수 있다).
 *   CORS 헤더는 **덮는다** — 옛 핸들러가 남긴 `*` 가 여기서 허용 목록으로 바뀐다.
 */
export function withHeaders(res: Response, cors: Record<string, string>): Response {
  if (res.status === 101 || res.webSocket) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  out.headers.delete('access-control-allow-origin');
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

/** 본문이 천장을 넘는가. content-length 가 없으면(청크 전송) 모른다고 치고 통과 — 브라우저는 늘 붙인다 */
export function bodyTooLarge(request: Request, max = MAX_API_BODY_BYTES): boolean {
  if (request.method !== 'POST' && request.method !== 'PUT') return false;
  const len = Number(request.headers.get('content-length'));
  return Number.isFinite(len) && len > max;
}

/**
 * 요금이 나가는 경로. 여기만 IP 당 속도를 잰다 — 방 목록 · 정적 파일 · 소켓은 세지 않는다.
 * /api/world/ticket 은 Supabase 왕복 하나라 뺐다 (요금이 아니라 로그인 왕복이다).
 */
const METERED = /^\/api\/(lab\/|world\/(?!ticket)|world2\/|tts$|tts\/(seat-audition|library\/add)$)/;

export function isMetered(pathname: string): boolean {
  return METERED.test(pathname);
}

/**
 * 이 IP 가 분당 천장을 넘었나. 바인딩이 없으면 false — 없는 자물쇠는 잠기지 않는다.
 * 실패(바인딩 오류)도 false 다: 속도 제한이 고장 났다고 게임을 멈추면 그게 더 큰 장애다.
 */
export async function rateLimited(request: Request, env: GuardEnv | undefined): Promise<boolean> {
  const limiter = env?.API_RATE_LIMIT;
  if (!limiter) return false;
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!ip) return false; // 누군지 모르면 세지 않는다 — 전부를 한 통에 넣으면 서로가 서로를 막는다
  try {
    const { success } = await limiter.limit({ key: ip });
    return !success;
  } catch {
    return false;
  }
}

export function guardJson(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}
