/**
 * 계정 — humanish 가 쓰는 **같은 Supabase 프로젝트**에 붙는다 (2026-08-30 사용자 지시).
 *
 * 이 파일은 React 를 모른다. 화면이 쓰는 손잡이는 shared/useAccount.ts 다.
 *
 * ┌─ 로그인은 **선택**이다 ──────────────────────────────────────────────────┐
 * │ 이 게임은 로그인 없이 돈다 (shared/guest.ts). 여기서 붙이는 것은 「없던    │
 * │ 관문」이 아니라 「게스트 닉네임보다 나은 이름」이다:                       │
 * │                                                                          │
 * │   로그인 안 함  localStorage 닉네임. 아무나 같은 이름을 쓸 수 있다        │
 * │   로그인 함     humanish 에서 지은 이름. 방에서 **사칭되지 않는다**       │
 * │                 (워커가 서명한 입장권으로 들어가므로 — worker/src/auth.ts) │
 * │                                                                          │
 * │ 그래서 설정이 없으면(=키가 안 꽂혀 있으면) 이 모듈은 조용히 null 을        │
 * │ 돌려주고, 화면은 로그인 단추를 **아예 그리지 않는다.** 고장이 아니다.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 주소·키를 어디서 얻나 ──────────────────────────────────────────────────┐
 * │ 1. import.meta.env.VITE_SUPABASE_*   로컬 파일에 적어 두면 이게 이긴다     │
 * │ 2. GET /api/config                   워커가 준다 (worker/src/auth.ts)     │
 * │                                                                          │
 * │ 왜 둘인가: 1은 **워커 없이 `npm run dev` 만으로** 로그인을 시험하려고 있다.│
 * │ 2는 배포용이다 — 빌드에 굳히면 값이 빌드한 기계의 파일에서 오고, 비어      │
 * │ 있어도 빌드는 조용히 통과한 뒤 브라우저에서야 터진다 (humanish 가 실제로   │
 * │ 그렇게 한 번 배포됐다). 워커 변수만 고치면 되도록 2를 남겨 둔다.           │
 * │                                                                          │
 * │ 넣는 자리는 README 「키 · 시크릿」 절에 적어 뒀다.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthConfig {
  url: string;
  anonKey: string;
}

/** 로그인하고 돌아왔을 때 되돌아갈 자리. 쿼리를 redirectTo 에 못 싣는 이유는 signInWithGoogle 주석 */
const RETURN_KEY = 'wih:auth-return';

/**
 * 세션을 담는 칸 이름.
 *
 * ★ humanish 와 **다른 이름을 쓴다.** 지금은 오리진이 달라(localhost:3000 / :5173,
 *   배포도 다른 도메인) 어차피 저장소가 갈리지만, 언젠가 한 도메인에 같이 올리면
 *   같은 이름이 서로의 세션을 덮는다. 그때 원인을 찾는 것보다 지금 이름을 다르게
 *   두는 편이 싸다.
 */
const STORAGE_KEY = 'wih:auth';

/* ═══════════════════════════ 설정 ═══════════════════════════ */

let configOnce: Promise<AuthConfig | null> | null = null;

/** 한 번만 묻는다. null 이면 「이 저장소에는 로그인이 없다」는 뜻이고 그것도 정상이다 */
export function loadAuthConfig(): Promise<AuthConfig | null> {
  configOnce ??= resolveConfig();
  return configOnce;
}

async function resolveConfig(): Promise<AuthConfig | null> {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (url && anonKey) return { url, anonKey };

  // 워커에게 묻는다. 워커가 안 떠 있는 로컬(`npm run dev` 만)에서는 그냥 실패하고 로그인이 꺼진다
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/config', { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: unknown; anonKey?: unknown };
    return typeof body.url === 'string' && typeof body.anonKey === 'string' && body.url && body.anonKey
      ? { url: body.url, anonKey: body.anonKey }
      : null;
  } catch {
    return null;
  }
}

/** 시험이 설정을 갈아 끼울 자리. 실제 코드에서는 부르지 않는다 */
export function __resetAuthForTests(): void {
  configOnce = null;
  clientOnce = null;
}

/* ═══════════════════════════ 클라이언트 ═══════════════════════════ */

let clientOnce: Promise<SupabaseClient | null> | null = null;

/**
 * supabase-js 는 **설정이 있을 때만** 받는다 (동적 import).
 * 로그인이 꺼진 저장소에서 60KB 를 받게 할 이유가 없고, 이 게임의 첫 화면은 로그인이 아니다.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  clientOnce ??= createClientOnce();
  return clientOnce;
}

async function createClientOnce(): Promise<SupabaseClient | null> {
  const cfg = await loadAuthConfig();
  if (!cfg) return null;

  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      // PKCE — 돌아올 때 주소에 실리는 것이 액세스 토큰이 아니라 한 번 쓰고 버리는 코드다
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: STORAGE_KEY,
    },
  });
}

/* ═══════════════════════════ 로그인 · 로그아웃 ═══════════════════════════ */

/**
 * 구글로 로그인. 부르는 순간 이 페이지는 구글로 떠난다 — 중간 화면이 없다.
 *
 * ★ 돌아오는 곳은 **늘 `/login` 한 자리**다 (지금 있는 화면이 아니라).
 *   이유가 둘이다:
 *     1. Supabase 허용 목록에 들어갈 주소가 하나면 된다. 목록과 글자가 안 맞으면
 *        **에러 없이** Site URL 로 떨어진다 — 로컬에서 로그인했는데 humanish 배포
 *        사이트로 튕기는 증상이 정확히 그것이었다 (humanish 콜백이 남긴 교훈).
 *     2. 돌아온 순간 화면에 「확인됐다」가 뜨고 곧바로 원래 가려던 곳으로 간다.
 *        브리핑 한복판으로 떨어졌다가 다시 튕겨 나가는 것보다 낫다.
 *
 * ★ redirectTo 에 쿼리를 붙이지 않는다 — 같은 이유로 글자가 어긋난다.
 *   돌아갈 자리는 주소가 아니라 sessionStorage 로 나른다.
 *
 * 대시보드에 넣을 값 (Authentication → URL Configuration → Redirect URLs):
 *   http://localhost:5173/**       ← 이걸 권한다. 아래 한 줄만 넣어도 지금은 돌지만,
 *   http://localhost:5173/login       옛 탭·뒤로가기로 되살아난 옛 코드가 다른 경로를
 *   https://<배포 주소>/**            요청하면 그때 Site URL(= humanish)로 떨어진다.
 * 구글 콘솔은 **건드리지 않는다** — 구글이 아는 주소는 Supabase 의 콜백 하나뿐이다.
 */
export async function signInWithGoogle(next?: string): Promise<{ error: string | null }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: '로그인이 설정돼 있지 않다' };

  // next 를 준 쪽(로그인 화면)은 「원래 가려던 곳」을 알고 있다. 안 주면 지금 있는 자리로 돌아온다.
  try {
    sessionStorage.setItem(RETURN_KEY, next ?? window.location.pathname + window.location.search);
  } catch {
    /* 저장 못 하면 지금 경로로 돌아오는 것까지만 된다 — 로그인 자체엔 지장 없다 */
  }

  /*
   * ★ 이동을 supabase-js 에 맡기지 않고 **직접 replace 한다** (2026-08-31).
   *
   *   맡기면 location.assign 이라 구글로 떠나는 주소가 히스토리에 한 칸 쌓인다.
   *   그러면 로그인하고 돌아온 뒤 **뒤로가기**를 눌렀을 때 그 authorize 주소가
   *   다시 열리고, 이미 쓴 흐름이라 Supabase 가 실패로 처리해 **Site URL 로**
   *   떨어뜨린다 — 그 Site URL 이 humanish 다. 사용자에게는 "뒤로가기 하니까
   *   가끔 humanish 가 나온다" 로 보인다 (2026-08-31 보고).
   *
   *   replace 로 가면 그 칸이 안 생긴다. 뒤로가기는 로그인 **이전** 화면으로 간다.
   */
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login`, skipBrowserRedirect: true },
  });
  if (error) return { error: error.message };
  if (!data?.url) return { error: '로그인 주소를 받지 못했다' };
  window.location.replace(data.url);
  return { error: null };
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  await supabase?.auth.signOut();
}

/** 로그인하러 떠나기 전에 있던 자리. 한 번 읽으면 지운다 — 남겨두면 다음 로그인이 엉뚱한 데로 간다 */
export function takeReturnPath(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    if (v) sessionStorage.removeItem(RETURN_KEY);
    // 열린 리다이렉트 방어 — '//evil.com' 은 브라우저가 다른 호스트로 읽는다
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════ 이름 ═══════════════════════════ */

export interface ProfileName {
  /** 이 게임에서 쓰는 이름. null 이면 아직 안 지었다 */
  name: string | null;
  /** 구글이 준 이름 — **제안일 뿐이다.** 저장돼 있는 값이 아니다 */
  suggested: string | null;
}

/** 이름을 정하다 실패하는 이유. 화면이 사람 말로 바꿔 준다 (features/lobby/Login.tsx) */
export type SaveNameError = 'name_taken' | 'name_frozen' | 'bad_name' | 'schema_not_exposed' | 'offline';

/**
 * 이 게임에서 쓰는 이름을 워커에게 묻는다 (wih.profiles).
 *
 * ┌─ humanish 이름을 안 가져온다 (2026-08-31 사용자 결정) ───────────────────┐
 * │ 계정은 같이 쓰지만 **이름은 이 게임 것**이다. 거기서 지은 이름이 그대로   │
 * │ 박히는 게 싫다는 것이 출발점이었다 — 여긴 다른 게임이다.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 왜 브라우저가 직접 안 읽고 워커를 거치나: 이 표는 humanish 와 겹치지 않게 `wih`
 * 스키마에 있어서, supabase-js 로 읽으려면 클라이언트마다 스키마를 지정해야 한다.
 * 통로를 워커 하나로 좁히면 그 규칙이 한 군데에만 있다 (worker/src/auth.ts).
 */
export async function fetchProfileName(): Promise<ProfileName> {
  const token = await accessToken();
  if (!token) return { name: null, suggested: null };
  try {
    const res = await fetch('/api/profile', { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return { name: null, suggested: null };
    const body = (await res.json()) as Partial<ProfileName>;
    return {
      name: typeof body.name === 'string' ? body.name : null,
      suggested: typeof body.suggested === 'string' ? body.suggested : null,
    };
  } catch {
    return { name: null, suggested: null };
  }
}

/** 이름을 정한다. 성공하면 null, 아니면 이유 */
export async function saveProfileName(name: string): Promise<SaveNameError | null> {
  const token = await accessToken();
  if (!token) return 'offline';
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    const known: SaveNameError[] = ['name_taken', 'name_frozen', 'bad_name', 'schema_not_exposed'];
    return known.find((e) => e === body.error) ?? 'offline';
  } catch {
    return 'offline';
  }
}

async function accessToken(): Promise<string | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/* ═══════════════════════════ 입장권 ═══════════════════════════ */

/**
 * 방에 들어가기 직전에 받는다. 액세스 토큰을 **헤더로** 보내고 60초짜리 입장권을 받는다 —
 * WebSocket 은 헤더를 못 붙여서 주소에 실어야 하는데, 거기 계정 열쇠를 두면 안 되기 때문이다
 * (worker/src/auth.ts 머리말).
 *
 * 로그인 안 했거나 워커가 안 떠 있으면 null 이고, 그때는 게스트로 들어간다 — 막지 않는다.
 */
export async function requestWorldTicket(room: string): Promise<string | null> {
  const token = await accessToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/world/ticket', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ room }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ticket?: unknown };
    return typeof body.ticket === 'string' ? body.ticket : null;
  } catch {
    return null;
  }
}
