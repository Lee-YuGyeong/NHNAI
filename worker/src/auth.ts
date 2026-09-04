/**
 * 계정 — humanish 가 쓰는 **같은 Supabase 프로젝트**를 이 게임도 쓴다 (2026-08-30 사용자 지시).
 *
 * ┌─ 왜 프로젝트를 새로 파지 않았나 ─────────────────────────────────────────┐
 * │ 구글 OAuth 클라이언트에 등록된 주소는 `https://<ref>.supabase.co/        │
 * │ auth/v1/callback` 하나다. **앱 주소가 아니라 Supabase 주소다.** 같은     │
 * │ 프로젝트를 쓰는 한 구글 콘솔은 손댈 일이 없고, 새 주소(로컬이든 배포든)  │
 * │ 는 Supabase 대시보드의 Redirect URLs 에 한 줄 얹으면 끝이다.            │
 * │ 덤으로 auth.users 가 하나라 **humanish 에서 지은 이름이 여기서도 뜬다.** │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 이 파일이 지는 책임은 셋이다.
 *
 *   GET  /api/config        브라우저에게 주소 + anon 키를 준다
 *   GET  /api/profile       이 게임에서 쓰는 이름 (+ 구글이 준 이름은 **제안**으로만)
 *   PUT  /api/profile       그 이름을 정한다
 *   POST /api/world/ticket  액세스 토큰을 확인하고 **입장권**을 끊어 준다
 *
 * ┌─ 왜 토큰을 방 주소에 그냥 붙이지 않나 ───────────────────────────────────┐
 * │ WebSocket 은 헤더를 못 붙인다 — 붙일 데가 쿼리스트링뿐이다. 그런데 거기  │
 * │ 는 로그에 남는 자리다. 액세스 토큰은 **계정 전체를 여는 한 시간짜리**    │
 * │ 열쇠라 거기 두면 안 된다.                                                │
 * │                                                                          │
 * │ 그래서 한 겹 바꾼다: 토큰은 헤더로 이 엔드포인트에 오고, 나가는 것은      │
 * │ **60초짜리 · 그 방 하나짜리 · 갱신 불가**인 입장권이다. 로그에 남아도     │
 * │ 남이 할 수 있는 일이 없다. humanish 가 /api/world/ticket 에서 쓰는 수법과 │
 * │ 같다 — 다른 점은 거기는 Next 가 끊고 워커가 받았고, 여기는 **같은 워커**  │
 * │ 가 끊고 받는다는 것뿐이다 (그래서 비밀도 하나면 된다).                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 이름은 **이 게임 것**이다 (2026-08-31 사용자 결정) ─────────────────────┐
 * │ 처음에는 humanish 의 public.profiles 를 읽어다 썼다. 계정이 같으니 이름도 │
 * │ 같으면 편할 줄 알았는데, 로그인해 보니 거기서 지은 이름이 그대로 박혔다.  │
 * │ 여긴 다른 게임이다 — 다른 이름으로 놀 수 있어야 한다.                     │
 * │                                                                          │
 * │ 그래서 지금은 **wih.profiles** 만 본다 (supabase/schema.sql).             │
 * │ humanish 의 표는 읽지도 않는다: 남의 게임의 값을 몰래 참조하기 시작하면   │
 * │ 그쪽이 규칙을 바꿀 때 이쪽이 조용히 깨진다.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ service role 키는 이 파일에 없다. 여기서 하는 일은 전부 **사용자 자신의 토큰**으로
 *   한다 — 이름을 읽고 쓰는 것도 RLS 가 본인 행만 열어 주는 것에 기댄다
 *   (supabase/schema.sql 의 profiles_*_own). RLS 를 우회할 이유가 없으면 우회하지
 *   않는다: 새면 곤란한 키를 애초에 이 워커에 두지 않는 편이 낫다.
 */

import { NICK_MAX_LEN } from '../../src/world/mp/constants';

export interface AuthEnv {
  /** https://<ref>.supabase.co — humanish 와 같은 값 */
  SUPABASE_URL?: string;
  /** 브라우저까지 나가는 공개 키. 권한은 이 키가 아니라 RLS 가 지킨다 */
  SUPABASE_ANON_KEY?: string;
  /** 입장권 서명용. `openssl rand -hex 32`. 없으면 로그인이 통째로 꺼진다 */
  WORLD_TICKET_SECRET?: string;
}

/**
 * 우리 표가 사는 칸. humanish 의 public 과 겹치지 않게 따로 팠다 (supabase/schema.sql).
 *
 * ★ 이 이름이 PostgREST 에 **노출돼 있어야** 한다:
 *   Project Settings → API → Data API → Exposed schemas 에 `wih` 추가.
 *   안 하면 PGRST106 이 오고, 이 파일은 그걸 그대로 화면까지 올려 보낸다 —
 *   "이름이 안 저장된다" 로만 보이면 원인을 못 찾는다.
 */
const SCHEMA = 'wih';

const rest = (url: string) => `${url.replace(/\/$/, '')}/rest/v1`;

/** 화면·DB 와 **같은 규칙**으로 다듬는다 (src/world/mp/validate.ts 의 cleanNickname) */
function clean(raw: string): string | null {
  const v = raw.replace(/\s+/g, ' ').trim().slice(0, NICK_MAX_LEN);
  return v || null;
}

/** 입장권 수명. 로그인 화면에서 방까지 가는 데 필요한 만큼만 (그 뒤엔 소켓이 이미 붙어 있다) */
export const TICKET_TTL_MS = 60_000;

/** 입장권에 실리는 것. **좌석·id 는 없다** — 그건 방(DO)이 정한다 (protocol.ts 규칙 4) */
export interface Ticket {
  /** Supabase 사용자 id (auth.users.id). 방에서 「같은 사람인가」를 판정하는 유일한 값 */
  sub: string;
  /** humanish 에서 지은 이름. 아직 안 지었으면 없다 */
  name?: string;
  /** 이 방에서만 쓴다. 다른 방에 재사용 못 하게 */
  room: string;
  /** 만료 시각(ms) */
  exp: number;
}

/* ═══════════════════════════ GET /api/config ═══════════════════════════ */

/**
 * 브라우저가 Supabase 에 붙는 데 필요한 두 값.
 *
 * ★ 빌드에 굳히지 않는 이유 (humanish .env.local.example 이 남긴 교훈):
 *   `VITE_...` 로 박으면 그 값은 **빌드한 기계의 파일**에서 온다. 비어 있어도
 *   빌드는 조용히 통과하고 브라우저에서야 터진다. 여기로 물어보게 하면 워커 변수만
 *   고쳐도 즉시 반영되고, 다시 빌드할 일이 없다.
 *
 * 키가 없으면 null 둘을 돌려준다 — 404 가 아니다. 「설정이 없다」는 정상 상태이고
 * (로그인 없이도 이 게임은 돈다), 브라우저는 그걸 보고 로그인 UI 를 아예 안 그린다.
 */
export function handleConfig(env: AuthEnv): Response {
  const url = env.SUPABASE_URL?.trim() || null;
  const anonKey = env.SUPABASE_ANON_KEY?.trim() || null;
  // 입장권을 못 끊으면 로그인해도 방에서 알아주지 못한다 → 그건 로그인이 없는 것과 같다
  const ready = Boolean(url && anonKey && env.WORLD_TICKET_SECRET?.trim());

  return new Response(JSON.stringify({ url: ready ? url : null, anonKey: ready ? anonKey : null }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ═══════════════════════════ /api/profile ═══════════════════════════ */

/**
 * 이 게임에서 쓰는 이름을 읽고 정한다. 둘 다 `Authorization: Bearer <access token>` 이 필요하다.
 *
 *   GET  → { name, suggested }   name 이 null 이면 아직 안 지은 사람이다
 *   PUT  { name } → { name }      **한 번만 된다.** 두 번째는 409 name_frozen
 *
 * ★ suggested 는 구글이 준 이름이다. **제안일 뿐이다** — 저장하지 않는다.
 *   그대로 넣으면 사용자가 고른 적 없는 본명이 대기방에 뜬다. 고르는 것은 사람이 한다
 *   (features/lobby/Login.tsx 의 이름 짓는 칸).
 *
 * ★ user_id 는 **요청 본문에서 안 받는다.** 토큰에서 뽑는다 — 받으면 남의 이름을 지을 수 있다.
 *   (RLS 도 한 번 더 막지만, 막히는 것과 애초에 못 보내는 것은 다르다)
 */
export async function handleProfile(request: Request, env: AuthEnv): Promise<Response> {
  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return json({ error: 'auth_disabled' }, 503);

  const token = bearer(request.headers.get('authorization'));
  if (!token) return json({ error: 'no_token' }, 401);

  const user = await fetchUser(url, anonKey, token);
  if (!user) return json({ error: 'bad_token' }, 401);

  if (request.method === 'GET') {
    return json({ name: await fetchDisplayName(url, anonKey, token), suggested: user.googleName });
  }
  if (request.method !== 'PUT') return json({ error: 'method' }, 405);

  let raw: unknown;
  try {
    raw = ((await request.json()) as { name?: unknown }).name;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const name = typeof raw === 'string' ? clean(raw) : null;
  if (!name) return json({ error: 'bad_name' }, 400);

  /*
   * upsert. resolution=merge-duplicates 라 처음 지을 때도 고칠 때도 같은 요청이다 —
   * 「이미 있나」를 먼저 물어보면 그 사이에 두 번 눌린 요청이 서로를 밟는다.
   */
  let res: Response;
  try {
    res = await fetch(`${rest(url)}/profiles`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-profile': SCHEMA,
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ user_id: user.id, display_name: name }),
    });
  } catch {
    return json({ error: 'upstream' }, 502);
  }

  if (res.ok) return json({ name });

  const body = (await res.text()).slice(0, 400);
  // P0001 = 이름을 바꾸려 했다. **한 번 짓고 끝이다** (schema.sql 의 freeze_display_name).
  //   23505 보다 먼저 본다 — 이름을 바꾸려다 남의 이름과 겹치면 둘 다 해당되는데,
  //   그때 사람에게 필요한 말은 "겹친다" 가 아니라 "못 바꾼다" 다.
  if (body.includes('P0001') || body.includes('한 번 지으면')) return json({ error: 'name_frozen' }, 409);
  // 23505 = 유니크 위반. 이름은 대소문자 무시하고 하나뿐이다 (schema.sql 의 표현식 인덱스)
  if (res.status === 409 || body.includes('23505')) return json({ error: 'name_taken' }, 409);
  // PGRST106 = 스키마가 노출돼 있지 않다. **고장이 아니라 설정이다** — 그대로 올려 보낸다
  if (body.includes('PGRST106')) return json({ error: 'schema_not_exposed', schema: SCHEMA }, 503);
  return json({ error: 'upstream', detail: body }, 502);
}

/* ═══════════════════════════ POST /api/world/ticket ═══════════════════════════ */

/**
 * 입장권 발급. `Authorization: Bearer <supabase access token>` 를 보고 판단한다.
 *
 *   { room: "1234" }  →  { ticket, sub, name }
 *
 * 토큰을 우리가 직접 뜯어보지 않는다. Supabase 에게 물어본다 (`/auth/v1/user`) —
 * 서명 검증·만료·폐기를 전부 발급한 쪽이 본다. 열쇠 검사는 열쇠 만든 데 맡기는 게 맞다.
 * (JWKS 를 받아 여기서 검증하면 왕복 한 번을 아끼지만, 키 회전을 우리가 떠안는다.
 *  이 호출은 **방에 들어갈 때 한 번**뿐이라 아낄 왕복이 아니다.)
 */
export async function handleWorldTicket(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  const secret = env.WORLD_TICKET_SECRET?.trim();
  // 설정이 없는 것은 고장이 아니다 — 이 저장소는 로그인 없이도 돈다. 브라우저는 게스트로 간다
  if (!url || !anonKey || !secret) return json({ error: 'auth_disabled' }, 503);

  const token = bearer(request.headers.get('authorization'));
  if (!token) return json({ error: 'no_token' }, 401);

  let room: unknown;
  try {
    room = ((await request.json()) as { room?: unknown }).room;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  // 방 번호 모양만 받는다 (worker/src/index.ts 의 ROOM_PATH · constants 의 ROOM_CODE_RE 와 같은 규칙)
  if (typeof room !== 'string' || !/^[0-9]{1,6}$/.test(room)) return json({ error: 'bad_request' }, 400);

  const user = await fetchUser(url, anonKey, token);
  if (!user) return json({ error: 'bad_token' }, 401);

  const name = await fetchDisplayName(url, anonKey, token);

  const payload: Ticket = { sub: user.id, room, exp: Date.now() + TICKET_TTL_MS, ...(name ? { name } : {}) };
  return json({ ticket: await signTicket(payload, secret), sub: user.id, name: name ?? null });
}

/**
 * `/auth/v1/user` — 토큰이 진짜인지, 누구인지. 아니면 null.
 *
 * 구글이 준 이름도 같이 들고 온다. **쓰려고가 아니라 제안하려고**다 —
 * 그대로 넣으면 본명이 대기방에 뜬다 (handleProfile 주석).
 */
async function fetchUser(
  url: string,
  anonKey: string,
  token: string,
): Promise<{ id: string; googleName: string | null } | null> {
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    });
  } catch {
    return null; // Supabase 가 안 잡히면 로그인 실패로 친다 — 통과시키면 검사가 없는 것과 같다
  }
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: unknown; user_metadata?: Record<string, unknown> };
  if (typeof body.id !== 'string' || !body.id) return null;

  const meta = body.user_metadata ?? {};
  const raw = [meta.name, meta.full_name, meta.preferred_username].find((v) => typeof v === 'string' && v.trim());
  return { id: body.id, googleName: typeof raw === 'string' ? clean(raw) : null };
}

/**
 * 이 게임에서 쓰는 이름 (wih.profiles). **사용자 자신의 토큰으로** 읽는다 —
 * RLS 가 본인 행만 돌려주므로 조건절을 안 붙여도 남의 이름이 올 수 없다
 * (supabase/schema.sql 의 profiles_select_own).
 *
 * 없으면 null 이고 그건 정상이다: 아직 이름을 안 지은 사람이다. 그때는 화면이 묻는다.
 * ★ 여기서 이름을 **만들지 않는다.** 구글 이름을 자동으로 넣으면 사용자가 고른 적 없는
 *   본명이 대기방에 뜬다.
 */
async function fetchDisplayName(url: string, anonKey: string, token: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${rest(url)}/profiles?select=display_name&limit=1`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'accept-profile': SCHEMA },
    });
  } catch {
    return null; // 이름을 못 읽어도 로그인은 성공이다. 게스트 닉네임으로 들어간다
  }
  if (!res.ok) return null;
  const rows = (await res.json()) as { display_name?: unknown }[];
  const raw = Array.isArray(rows) && rows.length > 0 ? rows[0].display_name : null;
  return typeof raw === 'string' ? clean(raw) : null;
}

/* ═══════════════════════════ 입장권 서명 · 검증 ═══════════════════════════ */

/**
 * `<payload>.<mac>` — 둘 다 base64url. JWT 를 쓰지 않는 이유는 헤더 협상이 필요 없어서다.
 * 이 값을 만드는 곳과 읽는 곳이 같은 워커라 알고리즘을 협상할 상대가 없다.
 */
export async function signTicket(payload: Ticket, secret: string): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${b64urlEncode(new Uint8Array(await hmac(body, secret)))}`;
}

/**
 * 입장권을 푼다. **셋 다 통과해야** 한다: 서명 · 만료 · 방 번호.
 * 하나라도 어긋나면 null 이고, 부르는 쪽(RoomDO)은 그때 게스트로 떨어뜨린다 — 입장을 막지는 않는다.
 * 로그인은 이 게임에서 자격이 아니라 **이름의 근거**일 뿐이라서다.
 */
export async function verifyTicket(raw: string | null, room: string, secret: string | undefined): Promise<Ticket | null> {
  if (!raw || !secret) return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;

  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!equalsConstantTime(mac, b64urlEncode(new Uint8Array(await hmac(body, secret))))) return null;

  let t: Ticket;
  try {
    t = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Ticket;
  } catch {
    return null;
  }

  if (typeof t.sub !== 'string' || !t.sub) return null;
  if (t.room !== room) return null;
  if (typeof t.exp !== 'number' || Date.now() > t.exp) return null;
  return t;
}

async function hmac(data: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
}

/**
 * 길이를 먼저 보고 끝내지 않는다 — 글자 수까지 흘리지 않으려고 전체를 훑는다.
 * (서명 길이는 어차피 고정이라 실익은 크지 않지만, 비교를 이렇게 쓰는 버릇이 남는 게 낫다)
 */
function equalsConstantTime(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/* ═══════════════════════════ 잡부 ═══════════════════════════ */

function bearer(header: string | null): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  return m ? m[1].trim() : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
