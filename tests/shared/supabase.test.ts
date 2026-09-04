// @vitest-environment jsdom
/**
 * 계정 설정을 어디서 읽나 — 그리고 **못 읽었을 때 조용히 꺼지나.**
 *
 * 이 저장소는 로그인 없이 도는 것이 정상이다 (src/shared/guest.ts). 그래서 여기서 제일
 * 중요한 검사는 「값을 잘 읽는다」가 아니라 **「없거나 깨져도 터지지 않는다」**이다 —
 * 워커를 안 띄운 로컬에서 /api/config 는 실패하는 게 기본값이고, 그때 화면이 죽으면 안 된다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetAuthForTests, loadAuthConfig, takeReturnPath } from '@/shared/supabase';

const CONFIG = { url: 'https://proj.supabase.co', anonKey: 'anon-key' };

function stubConfigRoute(res: () => Response) {
  vi.stubGlobal('fetch', (url: string) => {
    expect(url).toBe('/api/config');
    return Promise.resolve(res());
  });
}

beforeEach(() => {
  __resetAuthForTests();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('설정 읽기', () => {
  it('워커에게 물어서 받는다 (배포본이 도는 길)', async () => {
    stubConfigRoute(() => new Response(JSON.stringify(CONFIG)));
    await expect(loadAuthConfig()).resolves.toEqual(CONFIG);
  });

  it('로컬 파일에 값이 있으면 그게 이긴다 — 워커 없이 `npm run dev` 만으로 시험하는 길', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://local.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'local-anon');
    // 물어보지도 않아야 한다
    vi.stubGlobal('fetch', () => {
      throw new Error('부르면 안 된다');
    });
    await expect(loadAuthConfig()).resolves.toEqual({ url: 'https://local.supabase.co', anonKey: 'local-anon' });
  });

  it('한쪽만 있으면 로컬 값을 안 쓴다 — 반쪽 설정으로 붙으면 브라우저에서야 터진다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://local.supabase.co');
    stubConfigRoute(() => new Response(JSON.stringify(CONFIG)));
    await expect(loadAuthConfig()).resolves.toEqual(CONFIG);
  });

  it('워커가 안 떠 있으면 null 이다 — 던지지 않는다', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(loadAuthConfig()).resolves.toBeNull();
  });

  it('워커가 null 둘을 주면 「로그인 없음」이다', async () => {
    stubConfigRoute(() => new Response(JSON.stringify({ url: null, anonKey: null })));
    await expect(loadAuthConfig()).resolves.toBeNull();
  });

  it('응답이 JSON 이 아니어도 null 로 떨어진다', async () => {
    stubConfigRoute(() => new Response('<html>프록시 오류</html>'));
    await expect(loadAuthConfig()).resolves.toBeNull();
  });

  it('404 면 null', async () => {
    stubConfigRoute(() => new Response('{}', { status: 404 }));
    await expect(loadAuthConfig()).resolves.toBeNull();
  });

  it('한 번만 묻는다 — 화면 여럿이 각자 물어보면 그만큼 왕복이 는다', async () => {
    let hits = 0;
    vi.stubGlobal('fetch', () => {
      hits += 1;
      return Promise.resolve(new Response(JSON.stringify(CONFIG)));
    });
    await Promise.all([loadAuthConfig(), loadAuthConfig(), loadAuthConfig()]);
    expect(hits).toBe(1);
  });
});

describe('돌아갈 자리', () => {
  it('넣어 둔 경로를 돌려주고 **지운다** — 남겨두면 다음 로그인이 엉뚱한 데로 간다', () => {
    sessionStorage.setItem('wih:auth-return', '/lobby?step=rooms');
    expect(takeReturnPath()).toBe('/lobby?step=rooms');
    expect(takeReturnPath()).toBeNull();
  });

  it('없으면 null', () => {
    expect(takeReturnPath()).toBeNull();
  });

  it('남의 사이트로 보내는 값은 버린다 — `//evil.com` 은 브라우저가 다른 호스트로 읽는다', () => {
    for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', 'lobby']) {
      sessionStorage.setItem('wih:auth-return', bad);
      expect(takeReturnPath()).toBeNull();
    }
  });
});
