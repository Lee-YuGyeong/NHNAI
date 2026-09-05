/**
 * 참가자가 보는 기록은 **말**이다 — docs/SPEECH.md §5.
 *
 * 봇이 "회복 986", "중앙착지 0.6" 이라고 말하던 자리다. 원인은 프롬프트였다:
 * factsText 가 원자료 표(resultText)를 그대로 먹였고, 모델은 준 것을 읽었다.
 * 게다가 말 읽기(readTalk)의 첫째 눈이 무는 것이 「사람이 안 쓰는 정밀함(수치·단위)」이라,
 * 봇에게 숫자를 쥐여 주고 그걸 읽었다고 의심도를 올리는 덫이었다.
 *
 * 관리 AI 는 계속 숫자로 본다 — 그쪽은 원자료를 읽고(방송) 대조해야(판정) 하는 자리다.
 */
import { describe, expect, it } from 'vitest';
import { resultText, resultWords } from '../../worker/src/game/agents';
import type { TrialResultWire } from '../../src/world/mp/protocol';

const nameOf = (id: string) => id.toUpperCase();

/** 낙하 생존 한 장 — 셋 중 하나(machine)만 무리에서 멀다 */
const RESULT: TrialResultWire = {
  game: 'fall',
  round: 1,
  groupMean: { hitCount: 2, survivalTime: 9, recoveryMs: 700 },
  players: [
    {
      id: 'a',
      metrics: { hitCount: 2, survivalTime: 9.2, recoveryMs: 690 },
      transitionError: 0.4,
      errorDirection: [1, -1, 1],
      adaptationCurve: [1.2, 0.9, 0.6],
    },
    {
      id: 'b',
      metrics: { hitCount: 3, survivalTime: 8.1, recoveryMs: 760 },
      transitionError: 0.55,
      errorDirection: [-1, 1, -1],
      adaptationCurve: [1.1, 0.95, 0.7],
    },
    {
      id: 'machine',
      metrics: { hitCount: 0, survivalTime: 22, recoveryMs: 120 },
      transitionError: 0.02,
      errorDirection: [1, 1, 1],
      adaptationCurve: [0.3, 0.3, 0.3],
    },
  ],
};

describe('참가자가 보는 기록 — resultWords', () => {
  // 머리말의 회차(「1회차」)는 남는다 — 사람도 "아까 1회차 때" 라고 말한다. 값이 새면 안 되는 곳은 각자의 줄이다
  it('각자의 줄에 숫자가 하나도 없다', () => {
    const rows = resultWords(RESULT, nameOf).split('\n').slice(1);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).not.toMatch(/\d/);
  });

  it('무리에서 먼 개체는 「혼자만」으로 읽힌다', () => {
    const line = resultWords(RESULT, nameOf)
      .split('\n')
      .find((l) => l.startsWith('MACHINE'))!;
    expect(line).toContain('혼자만 균형을 빨리 잡았다');
    expect(line).toContain('혼자만 늦게까지 버텼다');
  });

  /** 안 튄 항목은 아예 안 적는다 — 「무리와 비슷하다」가 줄마다 네다섯 번 나오면 진짜 튄 것이 묻힌다 */
  it('아무것도 안 튄 개체는 「무리 안에 있다」 한 마디로 끝난다', () => {
    const line = resultWords(RESULT, nameOf)
      .split('\n')
      .find((l) => l.startsWith('A'))!;
    expect(line).toContain('무리 안에 있다');
    expect(line).not.toContain('무리와 비슷하다');
    expect(line).not.toContain('혼자만');
  });

  it('오차 방향과 적응 곡선도 말이 된다 — 「처음부터 끝까지 똑같았다」가 제일 무거운 말', () => {
    const words = resultWords(RESULT, nameOf);
    const machine = words.split('\n').find((l) => l.startsWith('MACHINE'))!;
    const human = words.split('\n').find((l) => l.startsWith('A'))!;
    expect(machine).toContain('늘 같은 쪽으로 밀렸다');
    expect(machine).toContain('처음부터 끝까지 똑같았다');
    expect(human).toContain('밀리는 쪽이 매번 반대로 뒤집혔다');
    expect(human).toContain('갈수록 나아졌다');
  });

  /**
   * 숫자를 걷어내고도 시설의 분석 용어가 남아 있었다 — 봇이 "오차도 한쪽으로만 쏠렸다" 라고 말했다
   * (2026-09-05 사용자: "AI 는 게임 저렇게 자세히 몰라"). 참가자는 계기를 안 쥐고 있다.
   */
  it('계기의 말이 참가자 줄에 새지 않는다 — 「오차」·「편차」는 관리 AI 의 말이다', () => {
    const rows = resultWords(RESULT, nameOf).split('\n').slice(1);
    for (const row of rows) expect(row).not.toMatch(/오차|편차|표준편차|적응 곡선|전환 직후/);
  });

  it('전원이 같은 값이면 견줄 자리가 없다 — 그것도 「무리 안에 있다」', () => {
    const flat: TrialResultWire = {
      ...RESULT,
      groupMean: { hitCount: 1 },
      // transitionError 도 같이 평평하게 — 여기가 갈리면 그 한 줄이 튄다
      players: RESULT.players.map((p) => ({ ...p, metrics: { hitCount: 1 }, transitionError: 0.4 })),
    };
    const rows = resultWords(flat, nameOf).split('\n').slice(1);
    for (const row of rows) expect(row).toContain('무리 안에 있다');
  });
});

describe('관리 AI 가 보는 기록 — resultText 는 그대로 숫자다', () => {
  it('원자료를 읽는 자리라 값이 남아 있어야 한다', () => {
    const text = resultText(RESULT, nameOf);
    expect(text).toMatch(/\d/);
    expect(text).toContain('무리 평균');
  });
});
