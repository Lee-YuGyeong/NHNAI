// @vitest-environment jsdom
/**
 * 뒷걸음 판정기(features/world/backstep.ts) — 장면에 **상황**을 붙여 보내고, 늦게 오는 답을 판이 견디는가.
 *
 * 여기서 잠그는 것 셋:
 *   ① 장면에 무대·근거가 붙어 나간다 (판정은 그걸로만 상황을 안다)
 *   ② 답을 기다리는 동안 이어진 물러섬은 **합쳐서** 다시 묻는다 — 폴백으로 새면 AI 판정이 아니라 규칙으로 돌아간다
 *   ③ 호출이 죽어도 판은 돈다 (폴백)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 센서 대신 — bind() 가 넘긴 판정 함수를 붙잡아 장면을 직접 먹인다 */
let feed: ((ep: { seconds: number; meters: number; watchers: { kind: 'ai' | 'player'; from: number; to: number; approaching: boolean }[] }) => void) | null = null;
vi.mock('@/world/mp/sensor', () => ({
  setBackstepJudge: (fn: typeof feed) => {
    feed = fn;
  },
}));

const { backstepJudge } = await import('@/features/world/backstep');
const { suspicion } = await import('@/world/mp/suspicion');
const { chapter1 } = await import('@/features/world/chapter1');

const episode = (seconds = 2, meters = 1.8) => ({
  seconds,
  meters,
  watchers: [{ kind: 'ai' as const, from: 3.2, to: 4.9, approaching: false }],
});

/** 붙잡아 둔 fetch 응답 — 답이 늦게 오는 상황을 손으로 만든다 */
function deferredFetch(delta: number) {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  const fetchMock = vi.fn((_url: string, init: { body: string }) => {
    calls.push(init.body);
    return new Promise((resolve) => {
      release = () => resolve({ ok: true, json: async () => ({ delta, why: '판정' }) });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, release: () => release?.(), fetchMock };
}

describe('뒷걸음 판정기', () => {
  beforeEach(() => {
    backstepJudge.reset();
    suspicion.reset();
    chapter1.reset();
    feed = null;
    vi.unstubAllGlobals();
  });

  it('장면에 무대와 근거를 붙여 보낸다 — 판정은 그것으로만 상황을 안다', async () => {
    const { calls, release } = deferredFetch(0);
    backstepJudge.bind();
    chapter1.enter('central'); // 코어로 접근하라 · phase arrive
    feed!(episode());
    await Promise.resolve();
    release();
    await vi.waitFor(() => expect(backstepJudge.last()).not.toBeNull());
    const sent = JSON.parse(calls[0]);
    expect(sent.kind).toBe('backstep');
    expect(sent.scene).toContain('코어로 접근하라');
    expect(sent.watchers[0].kind).toBe('ai');
    expect(typeof sent.suspicion).toBe('number');
    expect(typeof sent.sync).toBe('number');
    expect(backstepJudge.last()?.source).toBe('llm');
  });

  it('기다리는 동안 이어진 물러섬은 합쳐서 다시 묻는다 — 폴백으로 새지 않는다', async () => {
    const { calls, release } = deferredFetch(3);
    backstepJudge.bind();
    feed!(episode(2, 1.8));
    await Promise.resolve();
    feed!(episode(1.5, 1.2)); // 아직 답이 안 왔다 — 합쳐 둔다
    feed!(episode(1, 0.9));
    expect(calls).toHaveLength(1);
    release();
    await vi.waitFor(() => expect(calls.length).toBe(2));
    const second = JSON.parse(calls[1]);
    expect(second.seconds).toBeCloseTo(2.5, 1); // 1.5 + 1
    expect(second.meters).toBeCloseTo(2.1, 1);
    expect(backstepJudge.last()?.source).toBe('llm');
  });

  it('호출이 죽어도 판은 돈다 — 거친 폴백으로 친다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('오프라인'))),
    );
    backstepJudge.bind();
    feed!(episode());
    await vi.waitFor(() => expect(backstepJudge.last()?.source).toBe('fallback'));
    expect(suspicion.get().value).toBeGreaterThan(0);
    expect(suspicion.get().last?.reason).toBe('뒷걸음');
  });
});
