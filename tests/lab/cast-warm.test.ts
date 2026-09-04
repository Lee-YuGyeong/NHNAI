/**
 * 미리 데우는 배역 — **기다림이 어디서 사라지나** (src/lab/cast-warm.ts).
 *
 * 지킬 것은 셋이다:
 *   1. 판당 LLM 은 **한 번만** 불린다 (길목마다 걸어 둬도 크레딧은 한 번어치)
 *   2. 받아 간 배역은 **다시 안 나온다** — 같은 성격이 두 판에 앉으면 학습이 이어진다
 *   3. 실패는 null 이다. 미리 데우다 실패한 것 때문에 판이 안 열리면 안 된다
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WARM_TTL_MS, makeCastNow, resetWarmCast, takeWarmCast, warmCast } from '@/lab/cast-warm';

const five = Array.from({ length: 5 }, (_, i) => ({ title: `성격${i}`, prompt: `본문${i}` }));

/** 등록소처럼 상류를 흉내 내지 않는다 — 막는 것은 fetch 하나뿐이다 */
let calls: unknown[] = [];
function stubCast(reply: () => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return Promise.resolve(reply());
  });
}
const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

beforeEach(() => resetWarmCast());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('지금 짓기', () => {
  it('성격 다섯을 그대로 돌려준다. 힌트는 매판 새로 뽑는다', async () => {
    stubCast(() => jsonRes({ personas: five }));
    expect(await makeCastNow()).toEqual(five);
    expect((calls[0] as { kind: string; hints: string[] }).kind).toBe('cast');
    expect((calls[0] as { hints: string[] }).hints).toHaveLength(5);
  });

  it('다섯이 아니면 null 이다 — 모자란 배역을 판에 앉히지 않는다 (손 풀로 폴백한다)', async () => {
    stubCast(() => jsonRes({ personas: five.slice(0, 3) }));
    expect(await makeCastNow()).toBeNull();
  });

  it('상류가 죽어도 **거절하지 않는다** — 미리 데우다 터진 약속은 아무도 안 받고 있다', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('down')));
    await expect(makeCastNow()).resolves.toBeNull();
  });
});

describe('데우고 받아 가기', () => {
  it('길목마다 걸어 둬도 **한 번만** 부른다 — 크레딧이 나가는 호출이다', async () => {
    stubCast(() => jsonRes({ personas: five }));
    warmCast();
    warmCast();
    warmCast();
    expect(calls).toHaveLength(1);
    expect(await takeWarmCast()).toEqual(five);
  });

  it('받아 간 배역은 다시 안 나온다 — 다음 판은 새로 데운다', async () => {
    stubCast(() => jsonRes({ personas: five }));
    warmCast();
    expect(await takeWarmCast()).toEqual(five);
    expect(takeWarmCast()).toBeNull();
  });

  it('데운 적이 없으면 null 이다 — 판만 여는 화면(/arena 직행)은 그 자리에서 짓는다', () => {
    expect(takeWarmCast()).toBeNull();
  });

  it('오래된 배역은 버린다 — 어제 데운 성격이 오늘 판에 앉으면 안 된다', () => {
    vi.useFakeTimers();
    stubCast(() => jsonRes({ personas: five }));
    warmCast();
    vi.advanceTimersByTime(WARM_TTL_MS + 1);
    expect(takeWarmCast()).toBeNull();
    // 상한 자리는 비워 둔다 — 다음에 부르는 쪽이 새로 데울 수 있게
    warmCast();
    expect(calls).toHaveLength(2);
  });
});
