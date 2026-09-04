/**
 * 의심이 **풀리는** 경로 — 몰이 판정, 접힘, 해명 차례에 들어가는 프롬프트.
 *
 * 이 셋이 없으면 표심은 한 방향으로만 쌓인다 (아무도 의심을 접지 않는다).
 */

import { describe, expect, it } from 'vitest';
import {
  EXECUTE_CUT,
  EXECUTE_MIN,
  HEAT_MIN,
  RELEASE,
  executionLines,
  heatOf,
  mobPressure,
  mobsOf,
  readyToExecute,
  runTalk,
  shiftLine,
  silenceLabel,
  suspicionLabel,
  turnsSilent,
  type TalkRequest,
} from '../../src/lab/talk';
import type { Complete } from '../../src/lab/agent';

const ALIVE = ['민재', '세영', '하늘', '지우'];

describe('heatOf — 표가 몰렸는가', () => {
  it(`${HEAT_MIN}표 이상 한 사람에게 모이면 몰이로 잡는다`, () => {
    const h = heatOf({ 민재: '하늘', 세영: '하늘', 지우: '민재' }, ALIVE);
    expect(h).toEqual({ id: '하늘', by: ['민재', '세영'] });
  });

  it('1표씩 흩어져 있으면 몰이가 아니다', () => {
    expect(heatOf({ 민재: '하늘', 세영: '지우' }, ALIVE)).toBeNull();
  });

  it('2 대 2 로 갈리면 몰이가 아니다 — 해명 차례를 만들지 않는다', () => {
    expect(heatOf({ 민재: '하늘', 세영: '하늘', 하늘: '민재', 지우: '민재' }, ALIVE)).toBeNull();
  });

  it('접은 표(빈 문자열)와 폐기된 사람은 세지 않는다', () => {
    expect(heatOf({ 민재: '하늘', 세영: '', 지우: '하늘' }, ALIVE)?.by).toEqual(['민재', '지우']);
    expect(heatOf({ 민재: '도윤', 세영: '도윤' }, ALIVE)).toBeNull();
  });
});

describe('mobsOf — 갈린 판에서도 의심도는 탄다', () => {
  it('2 대 2 로 갈리면 heatOf 는 비지만 양쪽 다 몰이로 잡힌다', () => {
    const leanings = { 민재: '하늘', 세영: '하늘', 하늘: '민재', 지우: '민재' };
    expect(heatOf(leanings, ALIVE)).toBeNull();
    expect(mobsOf(leanings, ALIVE)).toEqual([
      { id: '하늘', by: ['민재', '세영'] },
      { id: '민재', by: ['하늘', '지우'] },
    ]);
  });

  it(`${HEAT_MIN}표에 못 미치는 표적은 안 든다`, () => {
    expect(mobsOf({ 민재: '하늘', 세영: '지우' }, ALIVE)).toEqual([]);
  });

  it('접은 표와 폐기된 사람은 heatOf 와 똑같이 안 센다', () => {
    expect(mobsOf({ 민재: '하늘', 세영: '', 지우: '하늘' }, ALIVE)).toEqual([{ id: '하늘', by: ['민재', '지우'] }]);
    expect(mobsOf({ 민재: '도윤', 세영: '도윤' }, ALIVE)).toEqual([]);
  });
});

describe('shiftLine — 표심이 움직인 자취', () => {
  it('갈아탄 것과 접은 것이 구분된다', () => {
    expect(shiftLine({ id: '민재', from: '세영', to: '하늘' })).toBe('민재: 세영 → 하늘');
    expect(shiftLine({ id: '민재', from: '세영', to: '' })).toBe('민재: 세영 → 접음');
    expect(shiftLine({ id: '민재', from: '', to: '하늘' })).toBe('민재: 미정 → 하늘');
  });
});

/** 모델 대신 정해진 답을 돌려주고, 받은 프롬프트를 남긴다 */
function fake(answer: Record<string, unknown>): { complete: Complete; seen: { user: string; system: string }[] } {
  const seen: { user: string; system: string }[] = [];
  return {
    seen,
    complete: async ({ system, user }) => {
      seen.push({ system, user });
      return answer;
    },
  };
}

const req = (over: Partial<TalkRequest> = {}): TalkRequest => ({
  kind: 'say',
  self: { id: '민재', prompt: '성격: 무뚝뚝하다', model: 'claude-sonnet-5', isLeader: false },
  nodes: ALIVE,
  log: [
    { nodeId: '세영', text: '어제 그 소리 또 들렸어' },
    { nodeId: '하늘', text: '환풍기겠지' },
    { nodeId: '지우', text: '세영이 아까랑 말이 다른데' },
  ],
  ...over,
});

describe('runTalk — 확신이 바닥이면 의심을 접은 것으로 친다', () => {
  it(`확신이 ${RELEASE} 밑이면 이름이 남아 있어도 표심에서 빠진다`, async () => {
    const f = fake({ text: '아 그럼 하늘이는 아닌가', leaning: '하늘', why: '해명이 됐다', confidence: 0.1 });
    const r = await runTalk(req(), f.complete);
    expect(r.leaning).toBe('');
    expect(r.confidence).toBe(0);
  });

  it('확신이 남아 있으면 그대로 유지된다', async () => {
    const f = fake({ text: '난 아직 하늘이 쪽', leaning: '하늘', why: '아까 말이 어긋났다', confidence: 0.6 });
    const r = await runTalk(req(), f.complete);
    expect(r.leaning).toBe('하늘');
    expect(r.confidence).toBeCloseTo(0.6);
  });

  it('빈 표명이 그대로 통과한다 — 3발화가 넘어도 강제하지 않는다', async () => {
    const f = fake({ text: '음 지금은 잘 모르겠는데', leaning: '', why: '', confidence: 0 });
    const r = await runTalk(req(), f.complete);
    expect(r.leaning).toBe('');
    expect(f.seen[0].user).toContain('비워도 된다');
  });
});

describe('runTalk — 몰이가 프롬프트에 들어간다', () => {
  const heat = { id: '민재', by: ['세영', '지우'] };

  it('몰린 본인에게는 해명하라고 한다', async () => {
    const f = fake({ text: '아니 내가 왜', leaning: '세영', why: '몰이가 이상하다', confidence: 0.5 });
    await runTalk(req({ heat }), f.complete);
    expect(f.seen[0].user).toContain('표가 너에게 몰렸다');
    expect(f.seen[0].user).toContain('세영, 지우');
  });

  it('남에게는 얹을지 제동을 걸지를 묻는다', async () => {
    const f = fake({ text: '나도 그쪽 같긴 한데', leaning: '하늘', why: '흐름이 그렇다', confidence: 0.4 });
    await runTalk(req({ self: { id: '하늘', prompt: 'x', model: 'm', isLeader: false }, heat }), f.complete);
    expect(f.seen[0].user).toContain('민재 에게 표가 몰려 있다');
    expect(f.seen[0].user).toContain('제동');
  });

  it('표심이 움직인 자취가 같이 실린다', async () => {
    const f = fake({ text: '지우 너 아까랑 다르잖아', leaning: '지우', why: '말을 바꿨다', confidence: 0.5 });
    await runTalk(req({ shifts: ['지우: 하늘 → 접음'] }), f.complete);
    expect(f.seen[0].user).toContain('표심이 움직인 자취: 지우: 하늘 → 접음');
  });
});

describe('runTalk — 방금 공개된 정체가 그 발화를 정한다', () => {
  it('AI 였다고 나오면 겁을 먹고 다시 찾으라고 시킨다', async () => {
    const f = fake({ text: '아니 세영이가 AI 였다고?', leaning: '', why: '', confidence: 0 });
    await runTalk(req({ justDied: { name: '세영', wasHuman: false } }), f.complete);
    const user = f.seen[0].user;
    // 조사는 이름의 받침을 따라간다 — 「세영 이」가 아니라 「세영이」다 (lab/josa)
    expect(user).toContain('세영이 폐기됐다');
    expect(user).toContain('AI 였다');
    expect(user).toContain('무서워해라');
    expect(user).toContain('사람은 아직 이 방에 있다');
  });

  it('사람이었다고 나오면 색출이 맞았다는 쪽으로 민다', async () => {
    const f = fake({ text: '진짜 사람이었네', leaning: '', why: '', confidence: 0 });
    await runTalk(req({ justDied: { name: '세영', wasHuman: true } }), f.complete);
    expect(f.seen[0].user).toContain('사람이었다');
    expect(f.seen[0].user).not.toContain('무서워해라');
  });

  it('폐기가 방금 난 게 아니면 그 문단은 아예 안 실린다', async () => {
    const f = fake({ text: '어제 그 소리 뭐였을까', leaning: '', why: '', confidence: 0 });
    await runTalk(req({ dead: [{ name: '세영', wasHuman: false }] }), f.complete);
    expect(f.seen[0].user).not.toContain('리더의 조사 결과');
    // 배경으로는 남는다 — 조사 결과는 system 쪽 폐기 목록에 있다
    expect(f.seen[0].system).toContain('세영(AI 였다)');
  });
});

describe('mobPressure — 총이 나가는 선', () => {
  it('확신의 합을 **쏟아질 수 있는 최대치**로 나눈다 (자기 자신은 못 찍는다)', () => {
    // 6명 중 3명이 하늘을 60% 로 지목 → 합 1.8, 최대 5.0 → 36%
    const m = mobPressure(
      { 민재: '하늘', 세영: '하늘', 지우: '하늘' },
      { 민재: 0.6, 세영: 0.6, 지우: 0.6 },
      ['민재', '세영', '하늘', '지우', '도윤', '준서'],
    );
    expect(m?.sum).toBeCloseTo(1.8);
    expect(m?.pressure).toBeCloseTo(0.36);
    expect(readyToExecute(m)).toBe(false);
  });

  it('같은 합계라도 사람이 줄면 압력이 올라간다 — 4명이면 같은 1.8 이 60% 다', () => {
    const m = mobPressure(
      { 민재: '하늘', 세영: '하늘', 지우: '하늘' },
      { 민재: 0.6, 세영: 0.6, 지우: 0.6 },
      ['민재', '세영', '하늘', '지우'],
    );
    expect(m?.pressure).toBeCloseTo(0.6);
    expect(readyToExecute(m)).toBe(true);
  });

  it(`지목이 ${EXECUTE_MIN}명 미만이면 압력이 높아도 총은 안 나간다 (2명은 해명 차례까지다)`, () => {
    const m = mobPressure({ 민재: '하늘', 세영: '하늘' }, { 민재: 1, 세영: 1 }, ['민재', '세영', '하늘', '지우']);
    expect(m?.pressure).toBeCloseTo(0.667, 2);
    expect(readyToExecute(m)).toBe(false);
  });

  it('확신을 안 적은 표(사람의 드롭다운)는 50% 로 친다', () => {
    const m = mobPressure({ 민재: '하늘', 세영: '하늘' }, { 민재: 0.8 }, ['민재', '세영', '하늘', '지우']);
    expect(m?.sum).toBeCloseTo(1.3);
  });

  it('압력이 제일 높은 한 명만 돌려준다', () => {
    const m = mobPressure(
      { 민재: '하늘', 세영: '하늘', 하늘: '지우', 지우: '민재' },
      { 민재: 0.5, 세영: 0.5, 하늘: 0.9, 지우: 0.9 },
      ['민재', '세영', '하늘', '지우'],
    );
    expect(m?.id).toBe('하늘'); // 합 1.0 > 지우 0.9 · 민재 0.9
  });

  it(`컷은 ${EXECUTE_CUT} — 그 사람을 뺀 전원이 60% 확신한 것과 같다`, () => {
    const alive = ['민재', '세영', '하늘', '지우', '도윤'];
    const at = (c: number) =>
      mobPressure({ 민재: '하늘', 세영: '하늘', 지우: '하늘', 도윤: '하늘' }, { 민재: c, 세영: c, 지우: c, 도윤: c }, alive);
    expect(readyToExecute(at(0.59))).toBe(false);
    expect(readyToExecute(at(0.6))).toBe(true);
  });
});

describe('executionLines — 리더의 선고', () => {
  it('먼저 입을 다물게 하고, 그다음에 쏜다', () => {
    const [hush, shot] = executionLines('하늘');
    expect(hush).toContain('중지');
    expect(shot).toContain('하늘');
    expect(shot).toContain('제거');
  });
});

describe('넘기기 · 침묵 — 말 안 하는 것도 플레이가 된다', () => {
  it('pass 를 내면 발화 없이 넘어간다', async () => {
    const f = fake({ pass: true, text: '', leaning: '하늘', confidence: 0.5 });
    const r = await runTalk(req(), f.complete);
    expect(r.pass).toBe(true);
    expect(r.text).toBe('');
  });

  it('빈 발화도 넘긴 것으로 친다 — 빈 말풍선이 찍히지 않는다', async () => {
    const f = fake({ text: '   ', leaning: '', confidence: 0 });
    expect((await runTalk(req(), f.complete)).pass).toBe(true);
  });

  it('mustSpeak 이면 넘기지 못한다 — 전원이 넘겨 판이 멎는 것을 막는다', async () => {
    const f = fake({ pass: true, text: '아 몰라 난 하늘이 쪽', leaning: '하늘', why: '말이 어긋났다', confidence: 0.5 });
    const r = await runTalk(req({ mustSpeak: true }), f.complete);
    expect(r.pass).toBeUndefined();
    expect(r.text).toBe('아 몰라 난 하늘이 쪽');
    expect(f.seen[0].user).toContain('이번엔 넘기지 말고 말한다');
  });

  it('누가 오래 조용한지가 말로 실린다 — 숫자를 주면 AI 가 "몇 턴째" 라고 그대로 읽는다', async () => {
    const f = fake({ text: '하늘아 너는 왜 말이 없어', leaning: '하늘', why: '계속 조용하다', confidence: 0.4 });
    await runTalk(req({ quiet: [{ id: '하늘', turns: 6 }, { id: '민재', turns: 9 }] }), f.complete);
    expect(f.seen[0].user).toContain('말이 없는 사람: 하늘(한참째)');
    expect(f.seen[0].user).not.toContain('민재('); // 자기 자신은 빼고 준다
    expect(f.seen[0].user).not.toContain('턴'); // 단위가 새면 그게 곧 말버릇이 된다
  });

  it('호명 무시 횟수는 따로 실린다 — 침묵 중 유일하게 근거가 되는 것', async () => {
    const f = fake({ text: '지우 아까부터 부르면 피하잖아', leaning: '지우', why: '두 번 씹었다', confidence: 0.6 });
    await runTalk(req({ ignored: { 지우: 2, 세영: 0 } }), f.complete);
    expect(f.seen[0].user).toContain('넘긴 횟수: 지우 2회');
    expect(f.seen[0].user).not.toContain('세영 0회'); // 0 은 안 싣는다
  });

  it('규칙에 조용함과 회피가 구분돼 들어간다', async () => {
    const f = fake({ text: 'ㅇㅇ', leaning: '', confidence: 0 });
    await runTalk(req(), f.complete);
    expect(f.seen[0].system).toContain('조용한 것만으로는 의심의 근거가 못 된다');
    expect(f.seen[0].system).toContain('이름을 불러 끌어들인다');
  });
});

describe('turnsSilent — 몇 턴째 말이 없나', () => {
  const log = [
    { nodeId: '민재', text: 'a' },
    { nodeId: '세영', text: 'b' },
    { nodeId: '민재', text: 'c' },
    { nodeId: '지우', text: 'd' },
  ];

  it('마지막 발화 뒤로 몇 턴이 지났는지 센다', () => {
    expect(turnsSilent(log, '지우')).toBe(0);
    expect(turnsSilent(log, '민재')).toBe(1);
    expect(turnsSilent(log, '세영')).toBe(2);
  });

  it('한 번도 말 안 했으면 전체 턴 수다', () => {
    expect(turnsSilent(log, '하늘')).toBe(4);
  });
});

describe('silenceLabel — 침묵을 숫자 아닌 말로 옮긴다', () => {
  it('길이에 따라 말이 달라지고, 어느 쪽에도 숫자가 없다', () => {
    expect(silenceLabel(3)).toBe('아까부터');
    expect(silenceLabel(6)).toBe('한참째');
  });
});

describe('suspicionLabel — 의심도를 숫자 아닌 말로 옮긴다', () => {
  it('눈금에 따라 말이 달라진다', () => {
    expect(suspicionLabel(10)).toBe('조금 쌓였다');
    expect(suspicionLabel(40)).toBe('꽤 쌓였다');
    expect(suspicionLabel(70)).toBe('거의 다 찼다');
  });

  it('어느 말에도 숫자가 없다 — 그대로 읽어도 "의심도 60%" 가 나오지 않는다', () => {
    for (const v of [0, 25, 55, 99, 100]) expect(suspicionLabel(v)).not.toMatch(/[0-9%]/);
  });
});
