/**
 * 계정 — **입장권이 위조되지 않는가**가 이 파일의 전부다.
 *
 * 이 저장소에서 로그인은 관문이 아니라 「이름의 근거」다 (src/shared/supabase.ts).
 * 그러니 지켜야 할 것도 하나다: **남의 이름으로 방에 들어갈 수 없어야 한다.**
 * 서명·만료·방 번호 셋 중 하나라도 검사가 새면 `?tk=` 를 손으로 지어내 아무 이름이나 쓸 수 있다.
 *
 * tts.test.ts 와 같은 규칙으로 쓴다 — 서버를 흉내 내지 않는다. handleConfig·handleWorldTicket 은
 * (Request, Env) → Response 인 순수 함수라 그대로 부르고, 목으로 막는 것은 **Supabase 로 나가는
 * fetch 하나뿐**이다. 이유도 같다: 진짜로 부르면 테스트가 남의 서비스에 의존한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TICKET_TTL_MS,
  handleConfig,
  handleProfile,
  handleWorldTicket,
  signTicket,
  verifyTicket,
  type AuthEnv,
} from '../../worker/src/auth';

const SECRET = 'test-secret-0123456789abcdef';
const ENV: AuthEnv = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  WORLD_TICKET_SECRET: SECRET,
};

const USER_ID = '11111111-2222-3333-4444-555555555555';

/** 상류를 대신하는 가짜 — 무엇으로 불렸는지 보려고 호출을 모아 둔다 */
let calls: { url: string; init: RequestInit | undefined }[] = [];

/**
 * @param write  쓰기(POST /rest/v1/profiles)가 어떻게 응답하나. 'ok' · 'taken' · 'noschema'
 */
function stubSupabase({
  user = true,
  name = '철수' as string | null,
  google = '이유경' as string | null,
  write = 'ok' as 'ok' | 'taken' | 'noschema',
} = {}) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('/auth/v1/user')) {
      if (!user) return Promise.resolve(new Response('{}', { status: 401 }));
      return Promise.resolve(
        new Response(JSON.stringify({ id: USER_ID, user_metadata: google ? { name: google } : {} })),
      );
    }
    if (url.includes('/rest/v1/profiles')) {
      if (init?.method === 'POST') {
        if (write === 'taken') {
          return Promise.resolve(
            new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 409 }),
          );
        }
        if (write === 'noschema') {
          return Promise.resolve(
            new Response(JSON.stringify({ code: 'PGRST106', message: 'Invalid schema: wih' }), { status: 406 }),
          );
        }
        return Promise.resolve(new Response('[]', { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify(name === null ? [] : [{ display_name: name }])));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
}

/** /api/profile 요청 하나 */
const profileReq = (method: 'GET' | 'PUT' | 'POST', body?: unknown, token: string | null = 'access-token') =>
  new Request('https://x/api/profile', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

/** 상류로 나간 쓰기 요청 */
const written = () => {
  const c = calls.find((x) => x.url.includes('/rest/v1/profiles') && x.init?.method === 'POST');
  return c ? { headers: c.init?.headers as Record<string, string>, body: JSON.parse(c.init?.body as string) } : null;
};

const post = (body: unknown, token: string | null = 'access-token') =>
  new Request('https://x/api/world/ticket', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  calls = [];
  stubSupabase();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ═══════════════════════════ 입장권 ═══════════════════════════ */

describe('입장권 서명', () => {
  it('제대로 끊은 것은 통과한다', async () => {
    const t = await signTicket({ sub: USER_ID, name: '철수', room: '1234', exp: Date.now() + 1000 }, SECRET);
    await expect(verifyTicket(t, '1234', SECRET)).resolves.toMatchObject({ sub: USER_ID, name: '철수' });
  });

  it('비밀이 다르면 거절한다 — 이게 새면 아무나 이름을 지어낸다', async () => {
    const t = await signTicket({ sub: USER_ID, room: '1234', exp: Date.now() + 1000 }, SECRET);
    await expect(verifyTicket(t, '1234', 'another-secret')).resolves.toBeNull();
  });

  it('내용을 한 글자만 바꿔도 거절한다', async () => {
    const t = await signTicket({ sub: USER_ID, name: '철수', room: '1234', exp: Date.now() + 1000 }, SECRET);
    const [body, mac] = t.split('.');
    // 서명은 그대로 두고 몸통만 「영희」로 바꿔 끼운다 — 서명을 안 보면 통과해 버린다
    const forged = Buffer.from(
      JSON.stringify({ sub: USER_ID, name: '영희', room: '1234', exp: Date.now() + 1000 }),
    )
      .toString('base64url');
    expect(forged).not.toBe(body);
    await expect(verifyTicket(`${forged}.${mac}`, '1234', SECRET)).resolves.toBeNull();
  });

  it('다른 방의 입장권은 안 받는다 — 한 방에서 받아 옆방에 쓰지 못하게', async () => {
    const t = await signTicket({ sub: USER_ID, room: '1234', exp: Date.now() + 1000 }, SECRET);
    await expect(verifyTicket(t, '5678', SECRET)).resolves.toBeNull();
  });

  it('만료되면 거절한다', async () => {
    vi.useFakeTimers();
    const t = await signTicket({ sub: USER_ID, room: '1234', exp: Date.now() + TICKET_TTL_MS }, SECRET);
    vi.advanceTimersByTime(TICKET_TTL_MS + 1);
    await expect(verifyTicket(t, '1234', SECRET)).resolves.toBeNull();
  });

  it('빈 값·모양이 아닌 값·비밀 없음은 전부 null 이다 (방은 이때 게스트로 떨어뜨린다)', async () => {
    await expect(verifyTicket(null, '1234', SECRET)).resolves.toBeNull();
    await expect(verifyTicket('', '1234', SECRET)).resolves.toBeNull();
    await expect(verifyTicket('점이없다', '1234', SECRET)).resolves.toBeNull();
    await expect(verifyTicket('.mac', '1234', SECRET)).resolves.toBeNull();
    const t = await signTicket({ sub: USER_ID, room: '1234', exp: Date.now() + 1000 }, SECRET);
    await expect(verifyTicket(t, '1234', undefined)).resolves.toBeNull();
  });
});

/* ═══════════════════════════ GET /api/config ═══════════════════════════ */

describe('GET /api/config', () => {
  it('설정이 다 있으면 주소와 anon 키를 준다', async () => {
    const body = (await handleConfig(ENV).json()) as { url: string; anonKey: string };
    expect(body).toEqual({ url: 'https://proj.supabase.co', anonKey: 'anon-key' });
  });

  it('비밀이 없으면 로그인을 꺼 버린다 — 이름을 검증 못 할 로그인은 없는 편이 낫다', async () => {
    const body = await handleConfig({ ...ENV, WORLD_TICKET_SECRET: '' }).json();
    expect(body).toEqual({ url: null, anonKey: null });
  });

  it('설정이 없어도 200 이다 — 「로그인 없음」은 고장이 아니라 정상 상태다', async () => {
    const res = handleConfig({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: null, anonKey: null });
  });

  it('service role 키는 어떤 경우에도 나가지 않는다', async () => {
    const leaky = { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '새면-안-된다' } as AuthEnv;
    expect(await handleConfig(leaky).text()).not.toContain('새면-안-된다');
  });
});

/* ═══════════════════════════ /api/profile ═══════════════════════════ */

describe('GET /api/profile', () => {
  it('이 게임에서 지은 이름과, 구글 이름을 **제안으로** 준다', async () => {
    const body = await (await handleProfile(profileReq('GET'), ENV)).json();
    expect(body).toEqual({ name: '철수', suggested: '이유경' });
  });

  it('아직 안 지었으면 name 이 null 이다 — 고장이 아니라 「물어봐야 할 상태」다', async () => {
    stubSupabase({ name: null });
    const body = (await (await handleProfile(profileReq('GET'), ENV)).json()) as { name: null };
    expect(body.name).toBeNull();
  });

  it('**humanish 의 표를 읽지 않는다** — 이름은 이 게임 것이다 (wih 스키마)', async () => {
    await handleProfile(profileReq('GET'), ENV);
    const read = calls.find((c) => c.url.includes('/rest/v1/profiles') && c.init?.method !== 'POST');
    expect((read?.init?.headers as Record<string, string>)['accept-profile']).toBe('wih');
  });

  it('토큰이 없거나 가짜면 401', async () => {
    expect((await handleProfile(profileReq('GET', undefined, null), ENV)).status).toBe(401);
    stubSupabase({ user: false });
    expect((await handleProfile(profileReq('GET'), ENV)).status).toBe(401);
  });

  it('설정이 없으면 503', async () => {
    expect((await handleProfile(profileReq('GET'), {})).status).toBe(503);
  });
});

describe('PUT /api/profile', () => {
  it('이름을 저장한다', async () => {
    const res = await handleProfile(profileReq('PUT', { name: '요원-3721' }), ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: '요원-3721' });
    expect(written()?.body).toMatchObject({ display_name: '요원-3721' });
  });

  it('user_id 를 **본문에서 안 받는다** — 받으면 남의 이름을 지을 수 있다', async () => {
    await handleProfile(profileReq('PUT', { name: '가로채기', user_id: '99999999-9999-9999-9999-999999999999' }), ENV);
    expect(written()?.body.user_id).toBe(USER_ID);
  });

  it('쓰기도 **사용자 자신의 토큰으로** 한다 — service role 을 쓰지 않는다', async () => {
    await handleProfile(profileReq('PUT', { name: '철수' }), ENV);
    const h = written()?.headers ?? {};
    expect(h.authorization).toBe('Bearer access-token');
    expect(h.apikey).toBe('anon-key');
    expect(h['content-profile']).toBe('wih');
  });

  it('앞뒤 공백을 다듬고 12자에서 자른다 — 화면·DB 와 같은 규칙', async () => {
    await handleProfile(profileReq('PUT', { name: '  가  나   다  ' }), ENV);
    expect(written()?.body.display_name).toBe('가 나 다');

    calls = [];
    await handleProfile(profileReq('PUT', { name: 'x'.repeat(50) }), ENV);
    expect(written()?.body.display_name).toHaveLength(12);
  });

  it('이미 쓰는 이름이면 409 — 이름이 사람을 가리켜야 ◈ 가 뜻을 갖는다', async () => {
    stubSupabase({ write: 'taken' });
    const res = await handleProfile(profileReq('PUT', { name: '철수' }), ENV);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'name_taken' });
  });

  it('스키마가 노출 안 됐으면 **그 사실을 그대로 올려 보낸다** — 사용자 잘못이 아니라 설정이다', async () => {
    stubSupabase({ write: 'noschema' });
    const res = await handleProfile(profileReq('PUT', { name: '철수' }), ENV);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'schema_not_exposed', schema: 'wih' });
  });

  it('빈 이름·공백뿐인 이름·문자열이 아닌 것은 400 이고, 저장하러 가지도 않는다', async () => {
    for (const name of ['', '   ', 42, null]) {
      calls = [];
      stubSupabase();
      expect((await handleProfile(profileReq('PUT', { name }), ENV)).status).toBe(400);
      expect(written()).toBeNull();
    }
  });

  it('본문이 JSON 이 아니면 400', async () => {
    expect((await handleProfile(profileReq('PUT', '{{{'), ENV)).status).toBe(400);
  });

  it('POST 는 받지 않는다 (읽기는 GET, 쓰기는 PUT)', async () => {
    expect((await handleProfile(profileReq('POST', { name: '철수' }), ENV)).status).toBe(405);
  });

  it('구글 이름은 **저장되지 않는다** — 제안일 뿐이다', async () => {
    await handleProfile(profileReq('PUT', { name: '요원-3721' }), ENV);
    expect(JSON.stringify(written()?.body)).not.toContain('이유경');
  });
});

/* ═══════════════════════════ POST /api/world/ticket ═══════════════════════════ */

describe('POST /api/world/ticket', () => {
  it('토큰을 확인하고 그 방의 입장권을 끊는다', async () => {
    const res = await handleWorldTicket(post({ room: '1234' }), ENV);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ticket: string; sub: string; name: string };
    expect(body).toMatchObject({ sub: USER_ID, name: '철수' });
    await expect(verifyTicket(body.ticket, '1234', SECRET)).resolves.toMatchObject({
      sub: USER_ID,
      name: '철수',
    });
  });

  it('토큰은 **헤더로** 상류에 넘긴다 — 주소에 실으면 로그에 남는다', async () => {
    await handleWorldTicket(post({ room: '1234' }), ENV);
    for (const c of calls) {
      expect(c.url).not.toContain('access-token');
      expect((c.init?.headers as Record<string, string>).authorization).toBe('Bearer access-token');
    }
  });

  it('이름은 **사용자 자신의 토큰으로** 읽는다 — service role 을 쓰지 않는다', async () => {
    await handleWorldTicket(post({ room: '1234' }), ENV);
    const profiles = calls.find((c) => c.url.includes('/rest/v1/profiles'));
    expect(profiles).toBeDefined();
    expect((profiles!.init?.headers as Record<string, string>).apikey).toBe('anon-key');
    expect((profiles!.init?.headers as Record<string, string>).authorization).toBe('Bearer access-token');
  });

  it('humanish 에서 이름을 안 지었으면 이름 없이 끊는다 — 여기서 지어 주지 않는다', async () => {
    stubSupabase({ name: null });
    const body = (await (await handleWorldTicket(post({ room: '1234' }), ENV)).json()) as {
      ticket: string;
      name: null;
    };
    expect(body.name).toBeNull();
    await expect(verifyTicket(body.ticket, '1234', SECRET)).resolves.toMatchObject({ sub: USER_ID });
    await expect(verifyTicket(body.ticket, '1234', SECRET)).resolves.not.toHaveProperty('name');
  });

  it('토큰이 가짜면 401 이고, 이름을 읽으러 가지도 않는다', async () => {
    stubSupabase({ user: false });
    const res = await handleWorldTicket(post({ room: '1234' }), ENV);
    expect(res.status).toBe(401);
    expect(calls.some((c) => c.url.includes('/rest/v1/profiles'))).toBe(false);
  });

  it('토큰이 아예 없으면 401 이고 상류를 부르지 않는다', async () => {
    const res = await handleWorldTicket(post({ room: '1234' }, null), ENV);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('방 번호 모양이 아니면 400 — 아무 문자열이나 받으면 DO 가 무한히 생긴다', async () => {
    for (const room of ['', 'abcd', '1234567', '../etc', 12 as unknown as string]) {
      expect((await handleWorldTicket(post({ room }), ENV)).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('본문이 JSON 이 아니면 400', async () => {
    expect((await handleWorldTicket(post('{{{'), ENV)).status).toBe(400);
  });

  it('GET 은 받지 않는다', async () => {
    const res = await handleWorldTicket(new Request('https://x/api/world/ticket'), ENV);
    expect(res.status).toBe(405);
  });

  it('설정이 없으면 503 이다 — 화면은 이걸 보고 게스트로 간다', async () => {
    expect((await handleWorldTicket(post({ room: '1234' }), {})).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('Supabase 가 안 잡히면 통과시키지 않는다 — 검사가 없는 것과 같아진다', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('네트워크 없음')));
    expect((await handleWorldTicket(post({ room: '1234' }), ENV)).status).toBe(401);
  });
});
