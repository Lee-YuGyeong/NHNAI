/**
 * 문지기 — **정상 플레이는 통과하고, 남의 사이트·퍼붓기만 걸리는가** (worker/src/guard.ts).
 *
 * 두 방향을 다 본다. 걸려야 할 것이 걸리는지만 보면, 문을 너무 좁게 달아 게임이 죽는 쪽은
 * 아무도 못 잡는다 — 그래서 「같은 호스트 · vite 프록시 뒤 · Origin 없는 curl」이 통과하는지를 먼저 적었다.
 *
 * 진입점(index.ts)도 통째로 부른다 — 정적 파일과 WebSocket 은 흉내 낸 ASSETS · ROOM_DO 로 받는다.
 * 헤더가 정적 파일에도 붙는지, 101 은 건드리지 않는지는 부품 시험으로는 안 보인다.
 */
import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/src/index';
import {
  MAX_API_BODY_BYTES,
  SECURITY_HEADERS,
  bodyTooLarge,
  corsHeaders,
  isMetered,
  originAllowed,
  rateLimited,
  withHeaders,
} from '../../worker/src/guard';

const HOST = 'https://nhnai.example.workers.dev';

const req = (path: string, init: RequestInit & { origin?: string; length?: number } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set('origin', init.origin);
  if (init.length != null) headers.set('content-length', String(init.length));
  return new Request(`${HOST}${path}`, { ...init, headers });
};

/* ═══════════════════════════════ Origin ═══════════════════════════════ */

describe('Origin — 우리 것만 받는다', () => {
  it('Origin 이 없으면 통과 — curl · 서버 · 같은 문서의 내비게이션은 교차 출처 요청이 아니다', () => {
    expect(originAllowed(req('/api/rooms'))).toBe(true);
  });

  it('같은 호스트면 통과 — 같은 워커에서 서빙된 프론트', () => {
    expect(originAllowed(req('/api/rooms', { origin: HOST }))).toBe(true);
  });

  it('로컬 개발 주소는 통과 — vite(5173)가 워커(8787)를 프록시하면 Origin 과 Host 가 어긋난다', () => {
    const r = new Request('http://127.0.0.1:8787/api/rooms', { headers: { origin: 'http://localhost:5173' } });
    expect(originAllowed(r)).toBe(true);
    expect(originAllowed(new Request('http://127.0.0.1:8787/x', { headers: { origin: 'http://127.0.0.1:5174' } }))).toBe(true);
  });

  it('ALLOWED_ORIGINS 에 적은 주소는 통과 (끝의 / 는 무시)', () => {
    const env = { ALLOWED_ORIGINS: 'https://game.example.com/, https://staging.example.com' };
    expect(originAllowed(req('/api/rooms', { origin: 'https://game.example.com' }), env)).toBe(true);
    expect(originAllowed(req('/api/rooms', { origin: 'https://staging.example.com' }), env)).toBe(true);
  });

  it('남의 사이트는 거절 — 여기가 이 시험의 이유다', () => {
    expect(originAllowed(req('/api/lab/talk', { origin: 'https://evil.example' }))).toBe(false);
    // 같은 이름을 앞에 붙인 가짜 호스트도 남이다
    expect(originAllowed(req('/api/lab/talk', { origin: 'https://nhnai.example.workers.dev.evil.example' }))).toBe(false);
    // 샌드박스 iframe · file:// 은 "null" 로 온다 — 우리 프론트가 아니다
    expect(originAllowed(req('/api/lab/talk', { origin: 'null' }))).toBe(false);
    expect(originAllowed(req('/api/lab/talk', { origin: '::not a url::' }))).toBe(false);
  });

  it('CORS 헤더는 허용된 Origin 을 그대로 돌려주고, 아니면 아무것도 주지 않는다 (`*` 는 없다)', () => {
    const ok = corsHeaders(req('/api/rooms', { origin: HOST }));
    expect(ok['access-control-allow-origin']).toBe(HOST);
    expect(ok.vary).toBe('origin');
    expect(corsHeaders(req('/api/rooms', { origin: 'https://evil.example' }))).toEqual({});
    expect(corsHeaders(req('/api/rooms'))).toEqual({});
  });
});

/* ═══════════════════════════════ 헤더 · 본문 · 속도 ═══════════════════════════════ */

describe('보안 헤더', () => {
  it('얹는다 — 있던 헤더는 덮지 않고, 옛 `*` CORS 는 허용 목록으로 바꾼다', () => {
    const src = new Response('x', {
      headers: { 'x-frame-options': 'SAMEORIGIN', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    });
    const out = withHeaders(src, { 'access-control-allow-origin': HOST });
    expect(out.headers.get('x-content-type-options')).toBe('nosniff');
    expect(out.headers.get('referrer-policy')).toBe(SECURITY_HEADERS['referrer-policy']);
    expect(out.headers.get('x-frame-options')).toBe('SAMEORIGIN'); // 핸들러의 선택이 남는다
    expect(out.headers.get('access-control-allow-origin')).toBe(HOST);
    expect(out.headers.get('cache-control')).toBe('no-store');
  });

  it('CORS 를 줄 것이 없으면 옛 `*` 도 지운다', () => {
    const out = withHeaders(new Response('x', { headers: { 'access-control-allow-origin': '*' } }), {});
    expect(out.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('게임이 쓰는 문은 닫지 않는다 — 마이크 · 전체화면은 permissions-policy 에 없다', () => {
    expect(SECURITY_HEADERS['permissions-policy']).not.toMatch(/microphone|fullscreen/);
  });
});

describe('본문 천장', () => {
  it('GET 은 재지 않는다', () => {
    expect(bodyTooLarge(req('/api/rooms', { length: MAX_API_BODY_BYTES * 10 }))).toBe(false);
  });
  it('천장 이하는 통과, 초과는 거절', () => {
    expect(bodyTooLarge(req('/api/lab/talk', { method: 'POST', length: MAX_API_BODY_BYTES }))).toBe(false);
    expect(bodyTooLarge(req('/api/lab/talk', { method: 'POST', length: MAX_API_BODY_BYTES + 1 }))).toBe(true);
  });
  it('content-length 가 없으면 통과 — 모르는 것을 거절하지 않는다', () => {
    expect(bodyTooLarge(new Request(`${HOST}/api/lab/talk`, { method: 'POST' }))).toBe(false);
  });
});

describe('속도 제한', () => {
  it('요금 경로만 잰다 — 방 목록 · 입장권 · 클립 GET · 정적 파일은 아니다', () => {
    for (const p of ['/api/lab/talk', '/api/world/direct', '/api/world2/say', '/api/tts', '/api/tts/seat-audition']) {
      expect(isMetered(p), p).toBe(true);
    }
    for (const p of ['/api/rooms', '/api/world/ticket', '/api/config', '/api/tts/clip', '/api/tts/leader', '/intro', '/health']) {
      expect(isMetered(p), p).toBe(false);
    }
  });

  it('바인딩이 없으면 통과 — 로컬에서 자물쇠가 없어도 게임은 돈다', async () => {
    expect(await rateLimited(req('/api/tts', { headers: { 'cf-connecting-ip': '1.2.3.4' } }), {})).toBe(false);
  });

  it('바인딩이 거절하면 걸리고, IP 를 열쇠로 쓴다', async () => {
    const keys: string[] = [];
    const env = { API_RATE_LIMIT: { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) } };
    expect(await rateLimited(req('/api/tts', { headers: { 'cf-connecting-ip': '1.2.3.4' } }), env)).toBe(true);
    expect(keys).toEqual(['1.2.3.4']);
  });

  it('IP 를 모르면 세지 않는다 — 전부를 한 통에 넣으면 서로가 서로를 막는다', async () => {
    const env = { API_RATE_LIMIT: { limit: async () => ({ success: false }) } };
    expect(await rateLimited(req('/api/tts'), env)).toBe(false);
  });

  it('바인딩이 던져도 통과 — 제한기가 고장 났다고 게임을 멈추지 않는다', async () => {
    const env = { API_RATE_LIMIT: { limit: async () => { throw new Error('boom'); } } };
    expect(await rateLimited(req('/api/tts', { headers: { 'cf-connecting-ip': '1.2.3.4' } }), env)).toBe(false);
  });
});

/* ═══════════════════════════════ 진입점 통째로 ═══════════════════════════════ */

/** 정적 파일 · 방 소켓을 흉내 낸 env. 헤더가 잠긴(immutable) 응답을 내는 것이 요점이다 */
function fakeEnv(over: Partial<Env> = {}): Env {
  // Node 의 Response 는 101 을 못 만든다 — 상태만 덧씌워 워커 런타임의 소켓 응답을 흉내 낸다
  const socket = new Response(null, { status: 200 });
  Object.defineProperty(socket, 'status', { value: 101 });
  return {
    ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher,
    ROOM_DO: {
      idFromName: (n: string) => n,
      get: () => ({ fetch: async () => socket }),
    } as unknown as DurableObjectNamespace,
    ...over,
  };
}
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

describe('진입점 — 문지기가 라우팅 앞에 선다', () => {
  it('정적 파일에도 보안 헤더가 붙고, 본문은 그대로다', async () => {
    const res = await worker.fetch(req('/intro'), fakeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<!doctype html>');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-type')).toBe('text/html');
  });

  it('WebSocket(101)은 건드리지 않는다 — 감싸면 소켓이 떨어진다', async () => {
    const res = await worker.fetch(req('/world-ws/rooms/1024/ws', { origin: HOST }), fakeEnv(), ctx);
    expect(res.status).toBe(101);
    expect(res.headers.has('x-content-type-options')).toBe(false);
  });

  it('남의 Origin 은 라우팅에 닿기 전에 403 — 소켓도 API 도', async () => {
    const env = fakeEnv();
    const ws = await worker.fetch(req('/world-ws/rooms/1024/ws', { origin: 'https://evil.example' }), env, ctx);
    expect(ws.status).toBe(403);
    const api = await worker.fetch(req('/api/rooms', { origin: 'https://evil.example' }), env, ctx);
    expect(api.status).toBe(403);
    expect(api.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('OPTIONS 예비 요청 — 허용된 Origin 에만 CORS 를 준다', async () => {
    const ok = await worker.fetch(req('/api/tts', { method: 'OPTIONS', origin: HOST }), fakeEnv(), ctx);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(HOST);
    expect(ok.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('/api 본문이 1MB 를 넘으면 413 — 핸들러가 JSON 을 뜯어보기 전에', async () => {
    const res = await worker.fetch(
      req('/api/lab/talk', { method: 'POST', length: MAX_API_BODY_BYTES + 1, body: '{}' }),
      fakeEnv(),
      ctx,
    );
    expect(res.status).toBe(413);
  });

  it('요금 경로가 천장을 넘으면 429 + retry-after. 방 목록은 같은 IP 라도 그대로 응답한다', async () => {
    const env = fakeEnv({ API_RATE_LIMIT: { limit: async () => ({ success: false }) } });
    const ip = { headers: { 'cf-connecting-ip': '9.9.9.9' } };
    const tts = await worker.fetch(req('/api/tts', { method: 'POST', body: '{}', ...ip }), env, ctx);
    expect(tts.status).toBe(429);
    expect(tts.headers.get('retry-after')).toBe('60');
    const rooms = await worker.fetch(req('/api/rooms', ip), env, ctx);
    expect(rooms.status).not.toBe(429);
  });

  it('/health 는 그대로 ok', async () => {
    const res = await worker.fetch(req('/health'), fakeEnv(), ctx);
    expect(await res.text()).toBe('ok');
  });
});
