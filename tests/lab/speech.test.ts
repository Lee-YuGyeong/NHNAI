/**
 * 말하기 규칙 — **반복 · 인원수 · 견본 · 못 넘기는 차례.**
 *
 * 넷 다 프롬프트나 되돌리기 한 갈래라 모델을 부르지 않으면 눈에 안 보인다. 여기서 붙잡아 둔다
 * (openers.test · callstyle.test 와 같은 장치).
 */

import { describe, expect, it } from 'vitest';
import { echoOf, runTalk, type TalkLine, type TalkRequest } from '../../src/lab/talk';
import type { Complete } from '../../src/lab/agent';

/** 정해진 답을 순서대로 돌려주고 받은 프롬프트를 남긴다 — 되돌리기가 걸리면 두 번 불린다 */
function fake(...replies: Record<string, unknown>[]): { complete: Complete; seen: { system: string; user: string }[] } {
  const seen: { system: string; user: string }[] = [];
  return {
    seen,
    complete: async ({ system, user }) => {
      seen.push({ system, user });
      return replies[Math.min(seen.length - 1, replies.length - 1)];
    },
  };
}

const say = (over: Partial<TalkRequest> = {}): TalkRequest => ({
  kind: 'say',
  self: { id: 'A24-006', prompt: '성격: 무뚝뚝하다', model: 'claude-sonnet-5', isLeader: false, calls: 'bare' },
  nodes: ['A24-006', 'A24-013', 'A24-027'],
  log: [],
  round: 1,
  ...over,
});

describe('echoOf — 자기 말 반복', () => {
  const log: TalkLine[] = [
    { nodeId: 'A24-006', text: '아까 그 말이 좀 걸리는데' },
    { nodeId: 'A24-013', text: '뭐가' },
  ];

  it('구두점·웃음만 다른 말은 같은 말이다', () => {
    expect(echoOf('아까 그 말이, 좀 걸리는데ㅋㅋ', log, 'A24-006')).toBe('아까 그 말이 좀 걸리는데');
  });

  it('앞말에 한 마디 덧댄 것도 반복이다', () => {
    expect(echoOf('아까 그 말이 좀 걸리는데 진짜', log, 'A24-006')).toBe('아까 그 말이 좀 걸리는데');
  });

  it('남이 한 말은 내 반복이 아니다 — 따라 하는 것도 말버릇이다', () => {
    expect(echoOf('뭐가', log, 'A24-006')).toBe('');
  });

  it('짧은 맞장구는 겹쳐도 그러려니 한다', () => {
    const short: TalkLine[] = [{ nodeId: 'A24-006', text: '그러게' }];
    expect(echoOf('그러게', short, 'A24-006')).toBe('');
  });

  it('한참 전에 한 말까지 거슬러 보지는 않는다', () => {
    const old: TalkLine[] = [
      { nodeId: 'A24-006', text: '아까 그 말이 좀 걸리는데' },
      ...Array.from({ length: 6 }, (_, i) => ({ nodeId: 'A24-006', text: `그래서 이건 다른 말이다 ${i}` })),
    ];
    expect(echoOf('아까 그 말이 좀 걸리는데', old, 'A24-006')).toBe('');
  });
});

describe('반복은 되돌려 다시 쓰게 한다', () => {
  const log: TalkLine[] = [
    { nodeId: 'A24-006', text: '아까 그 말이 좀 걸리는데' },
    { nodeId: 'A24-013', text: '뭐가' },
  ];

  it('같은 말을 또 쓰면 한 번 되돌린다', async () => {
    const f = fake({ text: '아까 그 말이 좀 걸리는데', leaning: '' }, { text: '013 아까 어디 있었는데', leaning: '' });
    const r = await runTalk(say({ log }), f.complete);
    expect(f.seen).toHaveLength(2);
    expect(f.seen[1].user).toContain('같은 말을 두 번 하고 있다');
    expect(r.text).toBe('013 아까 어디 있었는데');
  });

  it('되돌려 보니 할 말이 없으면 넘긴다 — 억지로 고쳐 쓴 한 줄보다 낫다', async () => {
    const f = fake({ text: '아까 그 말이 좀 걸리는데', leaning: '' }, { text: '', pass: true });
    const r = await runTalk(say({ log }), f.complete);
    expect(r.pass).toBe(true);
    expect(r.text).toBe('');
  });

  it('안 겹치는 말은 그대로 나간다 — 되돌리지 않는다', async () => {
    const f = fake({ text: '13 너 아까 뭐라 그랬지', leaning: '' });
    const r = await runTalk(say({ log }), f.complete);
    expect(f.seen).toHaveLength(1);
    expect(r.text).toBe('13 너 아까 뭐라 그랬지');
  });
});

describe('못 넘기는 차례 — mustSpeak', () => {
  it('넘기려 해도 한 번 더 시킨다', async () => {
    const f = fake({ text: '', pass: true }, { text: '아 뭐라도 하자 그럼', leaning: '' });
    const r = await runTalk(say({ mustSpeak: true }), f.complete);
    expect(f.seen).toHaveLength(2);
    expect(f.seen[1].user).toContain('넘길 수 없는 차례다');
    expect(r.text).toBe('아 뭐라도 하자 그럼');
    expect(r.pass).toBeUndefined();
  });

  it('평소에는 넘기는 것을 그대로 받는다', async () => {
    const f = fake({ text: '', pass: true });
    const r = await runTalk(say(), f.complete);
    expect(f.seen).toHaveLength(1);
    expect(r.pass).toBe(true);
  });
});

describe('방의 인원 — 죽어 나간 만큼 줄어든다', () => {
  it('아무도 안 죽었으면 여섯이 모여 있다', async () => {
    const f = fake({ text: '어', leaning: '' });
    const six = ['A24-002', 'A24-006', 'A24-013', 'A24-021', 'A24-027', 'A24-033'];
    await runTalk(say({ nodes: six }), f.complete);
    expect(f.seen[0].system).toContain('여섯이 모여 있다');
  });

  it('둘이 폐기됐으면 넷이 남아 있다 — "여섯" 이라고 말하지 않는다', async () => {
    const f = fake({ text: '어', leaning: '' });
    await runTalk(
      say({
        nodes: ['A24-006', 'A24-013', 'A24-021', 'A24-027'],
        dead: [
          { name: 'A24-002', wasHuman: false },
          { name: 'A24-033', wasHuman: false },
        ],
      }),
      f.complete,
    );
    expect(f.seen[0].system).toContain('넷이 남아 있다');
    expect(f.seen[0].system).not.toContain('여섯이');
  });
});

describe('질감 견본 — 이름·기록과 헷갈리지 않는다', () => {
  it('자리 표시가 이름표(A24-…)나 기록 형식([이름] 말)과 안 겹친다', async () => {
    const f = fake({ text: '어', leaning: '' });
    await runTalk(say(), f.complete);
    const sys = f.seen[0].system;
    expect(sys).toContain('갑 › 아 나 어제 새벽에 또 그 소리 들었잖아');
    expect(sys).not.toContain('[A]');
    expect(sys).toContain('가져다 쓰지 않는다');
  });
});
