/**
 * 부르는 버릇 — 이름표 그대로(006)냐 앞의 0 을 떼고(6)냐.
 *
 * 안 시키면 모델은 이름표를 글자 그대로 옮겨 적어서 다섯이 전부 "006" 이라고만 부른다.
 * 사람은 "6" 이라고 치므로 그 한 줄만으로 사람이 튀는데, 이 판은 말투로 갈리면 안 된다.
 * 그래서 성격과 **같이** 버릇을 배정한다 (personas.sampleCallStyle) — 프롬프트 한 갈래라
 * 모델을 불러야만 보이므로 여기서 붙잡아 둔다 (openers.test 와 같은 장치).
 */

import { describe, expect, it } from 'vitest';
import { calledNode, resolveName, runTalk, type TalkRequest } from '../../src/lab/talk';
import { fiveFrom, sampleCallStyle } from '../../src/lab/personas';
import type { Complete } from '../../src/lab/agent';

function fake(): { complete: Complete; seen: { system: string }[] } {
  const seen: { system: string }[] = [];
  return {
    seen,
    complete: async ({ system }) => {
      seen.push({ system });
      return { text: '그러게' };
    },
  };
}

const req = (over: Partial<TalkRequest> = {}): TalkRequest => ({
  kind: 'say',
  self: { id: 'A24-006', prompt: '성격: 무뚝뚝하다', model: 'claude-sonnet-5', isLeader: false },
  nodes: ['A24-006', 'A24-013', 'A24-027'],
  log: [{ nodeId: 'A24-013', text: '다들 어디 있었어' }],
  round: 1,
  ...over,
});

describe('부르는 버릇 — 프롬프트', () => {
  it('bare 는 앞의 0 을 떼고 부른다', async () => {
    const f = fake();
    await runTalk(req({ self: { ...req().self, calls: 'bare' } }), f.complete);
    expect(f.seen[0].system).toContain('앞의 0 을 떼고 부르는 버릇이 있다');
    expect(f.seen[0].system).not.toContain('이름표에 적힌 그대로 부르는 버릇');
  });

  it('pad 는 이름표 그대로 부른다', async () => {
    const f = fake();
    await runTalk(req({ self: { ...req().self, calls: 'pad' } }), f.complete);
    expect(f.seen[0].system).toContain('이름표에 적힌 그대로 부르는 버릇이 있다');
    expect(f.seen[0].system).not.toContain('앞의 0 을 떼고 부르는 버릇');
  });

  it('버릇이 무엇이든 **듣는 쪽 규칙은 같다** — 어느 모양으로 불려도 내가 불린 것이다', async () => {
    for (const calls of ['pad', 'bare', undefined] as const) {
      const f = fake();
      await runTalk(req({ self: { ...req().self, calls } }), f.complete);
      expect(f.seen[0].system).toContain('누가 네 뒷자리를 불렀으면 너를 부른 것이다');
    }
  });
});

describe('부르는 버릇 — 배정', () => {
  it('성격과 같이 배정된다 — 다섯에게 전부 붙는다', () => {
    for (const p of fiveFrom(null)) expect(['pad', 'bare']).toContain(p.calls);
  });

  it('한쪽으로 굳지 않는다 — 여러 판을 돌리면 두 버릇이 다 나온다', () => {
    const seen = new Set(Array.from({ length: 60 }, () => sampleCallStyle()));
    expect(seen).toEqual(new Set(['pad', 'bare']));
  });
});

/** 버릇이 갈려도 대답할 차례는 그대로 가야 한다 — 안 그러면 부른 쪽이 답을 영영 못 받는다 */
describe('부르는 버릇 — 어느 모양이든 그 개체를 부른 것이다', () => {
  const units = ['A24-006', 'A24-013', 'A24-027'].map((id) => ({ id }));

  it('006 도 6 도 같은 개체다', () => {
    for (const text of ['006아 너는?', '6아 너는?', '6은 왜 조용해', '6번 너는?', 'A24-006 너는?']) {
      expect(calledNode([{ nodeId: 'A24-013', text }], units)?.id).toBe('A24-006');
    }
  });

  it('표도 두 모양 다 그 개체에 꽂힌다', () => {
    const ids = units.map((u) => u.id);
    for (const said of ['006', '6', '6번', 'A24-006']) expect(resolveName(said, ids)).toBe('A24-006');
  });
});
