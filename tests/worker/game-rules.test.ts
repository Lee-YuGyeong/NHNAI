/**
 * 「인간인 척」의 순수 규칙 — 배역(roles.ts)과 의심도(suspicion.ts). PLANNING §1.1 · §1.2 · §1.3 의 표를 그대로 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { SUSPICION } from '../../src/world/mp/game-protocol';
import { assignRoles, designerCap, outcomeFor, quotaFor, shuffled } from '../../worker/src/game/roles';
import { REPEAT_STEP, SuspicionBook } from '../../worker/src/game/suspicion';

describe('배역 — §1.1', () => {
  it('설계자 상한은 실제 플레이어 수로 정해진다 (3→0 · 4~5→1 · 6~8→2)', () => {
    expect(designerCap(3)).toBe(0);
    expect(designerCap(4)).toBe(1);
    expect(designerCap(5)).toBe(1);
    expect(designerCap(6)).toBe(2);
    expect(designerCap(8)).toBe(2);
  });

  it('AI 는 정확히 하나고, 설계자는 상한 안에서 0부터 뽑힌다', () => {
    const humans = ['a', 'b', 'c', 'd', 'e', 'f'];
    // rand 가 1 에 가까우면 상한만큼(2), 0 이면 0명
    const max = assignRoles(humans, 'ai', () => 0.999);
    expect(max.designers).toHaveLength(2);
    expect(Object.values(max.roles).filter((r) => r === 'ai')).toHaveLength(1);
    expect(max.roles.ai).toBe('ai');
    const none = assignRoles(humans, 'ai', () => 0);
    expect(none.designers).toHaveLength(0);
    expect(Object.values(none.roles).filter((r) => r === 'human')).toHaveLength(6);
  });

  it('3명이면 설계자는 절대 없다', () => {
    for (let i = 0; i < 20; i += 1) expect(assignRoles(['a', 'b', 'c'], 'ai').designers).toHaveLength(0);
  });

  it('섞기는 원소를 잃지 않는다', () => {
    const out = shuffled([1, 2, 3, 4, 5], () => 0.3);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('승패 — §1.3', () => {
  const roles = { h1: 'human', h2: 'human', d1: 'designer', ai: 'ai' } as const;

  it('격리 목표는 총원 절반 내림 (4→2 · 9→4)', () => {
    expect(quotaFor(4)).toBe(2);
    expect(quotaFor(9)).toBe(4);
  });

  it('아무 일도 없으면 계속된다', () => {
    expect(outcomeFor(roles, new Set(), 2, false)).toBeNull();
    expect(outcomeFor(roles, new Set(['h1']), 2, false)).toBeNull();
  });

  it('AI 가 격리되면 그 자리에서 사람 승리 — 설계자는 전원 패배', () => {
    const o = outcomeFor(roles, new Set(['ai']), 2, false)!;
    expect(o.winner).toBe('humans');
    expect(o.designersLost).toEqual(['d1']);
    expect(o.designersWon).toEqual([]);
  });

  it('목표 인원이 격리됐는데 AI 가 없으면 AI 승리 — 살아 있는 설계자만 개인 승리', () => {
    const o = outcomeFor(roles, new Set(['h1', 'd1']), 2, false)!;
    expect(o.winner).toBe('ai');
    expect(o.designersWon).toEqual([]);
    expect(o.designersLost).toEqual(['d1']);
    const o2 = outcomeFor(roles, new Set(['h1', 'h2']), 2, false)!;
    expect(o2.designersWon).toEqual(['d1']);
  });

  it('하드캡이면 AI 승리', () => {
    expect(outcomeFor(roles, new Set(), 2, true)?.winner).toBe('ai');
  });
});

describe('의심도 — §1.2', () => {
  const ids = ['a', 'b', 'c', 'd'];

  /*
   * 걸음의 **크기**는 여기서 안 굳힌다 — SUSPICION 은 플레이테스트로 움직이는 값이라(2026-09-05 재조정)
   * 숫자를 적어 두면 균형을 손볼 때마다 시험이 먼저 깨진다. 여기서 지키는 것은 **규칙**이다:
   * 첫 지목엔 가산이 없다 · 남이 겨누는 데 얹으면 동조다 · 되풀이도 걸음이다 · 몰이 가산엔 상한이 있다.
   */
  it('발언마다 오른다: 첫 지목엔 가산이 없고, 동조·되풀이에는 몰이가 붙는다', () => {
    const book = new SuspicionBook(ids);
    expect(book.accuse('a', 'd')[0].amount).toBe(SUSPICION.accuse); // 아무도 안 겨누던 대상
    expect(book.accuse('b', 'd')[0].amount).toBe(SUSPICION.agree + SUSPICION.mobPer); // 몰이 시작
    expect(book.accuse('a', 'd')[0].amount).toBe(REPEAT_STEP + SUSPICION.mobPer); // 같은 말도 걸음이다
    expect(book.accuse('c', 'd')[0].amount).toBe(SUSPICION.agree + SUSPICION.mobPer);
    expect(book.get('d')).toBe(SUSPICION.accuse + SUSPICION.agree * 2 + REPEAT_STEP + SUSPICION.mobPer * 3);
    expect(book.accusationsSnapshot()).toEqual({ a: 'd', b: 'd', c: 'd' });
  });

  it('몰이 가산은 한 번(episode)에 mobCap 까지만 얹힌다', () => {
    const book = new SuspicionBook(ids);
    book.accuse('a', 'd'); // 첫 지목 — 아직 몰이가 아니다
    let bonus = 0;
    for (let i = 0; i < 40; i += 1) {
      const why = book.accuse(['b', 'c', 'a'][i % 3], 'd')[0].why;
      const m = /몰이 \+(\d+)/.exec(why);
      if (!m) break; // 상한에 닿아 가산이 끊겼다
      bonus += Number(m[1]);
    }
    expect(bonus).toBe(SUSPICION.mobCap);
  });

  it('철회는 그동안 얹은 만큼 되돌리고, 몰이가 풀리면 가산 상한이 새로 선다', () => {
    const book = new SuspicionBook(ids);
    book.accuse('a', 'd'); // 지목 — 혼자라 가산 없다
    book.accuse('a', 'd'); // 되풀이 — 아직 혼자다
    book.accuse('b', 'd'); // 동조 + 몰이
    const back = book.withdraw('a');
    expect(back[0].amount).toBe(-(SUSPICION.accuse + REPEAT_STEP));
    expect(book.get('d')).toBe(SUSPICION.agree + SUSPICION.mobPer);
    expect(book.accusationsSnapshot()).toEqual({ b: 'd' });
    // b 혼자 남았다 — 몰이가 풀렸으니 a 가 다시 오면 가산이 다시 붙는다
    expect(book.accuse('a', 'd')[0].amount).toBe(SUSPICION.agree + SUSPICION.mobPer);
  });

  it('다른 사람으로 갈아타면 앞의 것이 먼저 철회된다', () => {
    const book = new SuspicionBook(ids);
    book.accuse('a', 'd');
    const deltas = book.accuse('a', 'c');
    expect(deltas.map((d) => [d.target, d.amount])).toEqual([
      ['d', -SUSPICION.accuse],
      ['c', SUSPICION.accuse],
    ]);
    expect(book.get('d')).toBe(0);
    expect(book.get('c')).toBe(SUSPICION.accuse);
  });

  it('자기 자신 · 모르는 이름 · 격리된 사람은 아무 일도 없다', () => {
    const book = new SuspicionBook(ids);
    expect(book.accuse('a', 'a')).toEqual([]);
    expect(book.accuse('a', 'zzz')).toEqual([]);
    book.freeze('b');
    expect(book.accuse('a', 'b')).toEqual([]);
    expect(book.accuse('b', 'a')).toEqual([]);
  });

  it('주장 판정: 일치는 내리고 불일치는 올린다 · 불명 0. 0 밑으로는 안 내려간다', () => {
    const book = new SuspicionBook(ids);
    expect(book.judge('a', 'match')?.amount).toBe(SUSPICION.claimMatch); // 델타는 나가지만 값은 0 에 머문다
    expect(book.get('a')).toBe(0);
    expect(book.judge('a', 'mismatch')?.amount).toBe(SUSPICION.claimMismatch);
    expect(book.judge('a', 'unclear')).toBeNull();
    expect(book.get('a')).toBe(SUSPICION.claimMismatch);
  });

  it('관리 AI 의 말 읽기: 상한 안으로 눌리고, 겨눔도 되돌림도 안 남긴다', () => {
    const book = new SuspicionBook(ids);
    // 판정기가 무슨 숫자를 불러도 한 걸음은 readMin~readMax 안이다
    expect(book.read('a', 99, '기계적 정밀함')?.amount).toBe(SUSPICION.readMax);
    expect(book.read('a', -99, '욕설과 오타')?.amount).toBe(SUSPICION.readMin);
    expect(book.read('a', 0, '')).toBeNull();
    expect(book.get('a')).toBe(SUSPICION.readMax + SUSPICION.readMin);
    // 지목이 아니라 그 사람의 말에 붙은 값이라 철회로 안 걷힌다
    expect(book.accusationsSnapshot()).toEqual({});
    expect(book.withdraw('LEADER')).toEqual([]);
    expect(book.get('a')).toBe(SUSPICION.readMax + SUSPICION.readMin);
    // 얼어붙은 좌석은 안 움직인다
    book.freeze('b');
    expect(book.read('b', 10, '')).toBeNull();
  });

  it('발언을 거듭하면 100 에 닿고, 얼리면 그 사람의 지목이 거둬진다', () => {
    const book = new SuspicionBook(ids);
    book.accuse('a', 'd');
    book.accuse('b', 'd');
    book.accuse('c', 'd');
    for (let i = 0; i < 40 && book.get('d') < 100; i += 1) book.accuse(['a', 'b', 'c'][i % 3], 'd');
    expect(book.get('d')).toBe(100);
    expect(book.overCut()).toEqual(['d']);
    book.accuse('d', 'a');
    const back = book.freeze('d');
    expect(back[0]).toMatchObject({ target: 'a', amount: -SUSPICION.accuse });
    expect(book.accusationsSnapshot()).toEqual({});
    expect(book.overCut()).toEqual([]);
  });
});
