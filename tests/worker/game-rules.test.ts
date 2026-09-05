/**
 * 「인간인 척」의 순수 규칙 — 배역(roles.ts) · 의심도(suspicion.ts) · 표식(tells.ts).
 * PLANNING §1.1 · §1.2 · §1.3 과 **docs/SUSPICION.md** 의 표를 그대로 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { SUSPICION, SUSPICION_PRESSURE, pressureFor } from '../../src/world/mp/game-protocol';
import { assignRoles, designerCap, outcomeFor, quotaFor, shuffled } from '../../worker/src/game/roles';
import { REPEAT_STEP, SuspicionBook } from '../../worker/src/game/suspicion';
import {
  BACK_MAX_MS,
  BACK_MIN_M,
  BodyWatch,
  MENTION_MIN_SCORE,
  STILL_MS,
  calledIn,
  echoes,
  isBacking,
  seatMentions,
} from '../../worker/src/game/tells';

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

  it('격리 목표는 총원 절반 내림 (4→2 · 9→4) — 와이어에 남는 수일 뿐, 이제 판을 끝내는 문턱은 아니다', () => {
    expect(quotaFor(4)).toBe(2);
    expect(quotaFor(9)).toBe(4);
  });

  it('아무 일도 없으면 계속된다', () => {
    expect(outcomeFor(roles, new Set(), false)).toBeNull();
  });

  it('AI 가 격리되면 그 자리에서 사람 승리 — 설계자는 전원 패배', () => {
    const o = outcomeFor(roles, new Set(['ai']), false)!;
    expect(o.winner).toBe('humans');
    expect(o.designersLost).toEqual(['d1']);
    expect(o.designersWon).toEqual([]);
  });

  /*
   * 2026-09-05 사용자: "처형되면 그 순간 게임이 끝나고 … 승리 조건이 다르게" — 예전엔 격리 수가 목표(절반)에
   * 닿아야 끝나서 사람 하나가 격리돼도 판이 남은 시간을 다 돌았다. 이제 첫 격리가 곧 끝이다.
   */
  it('사람이 격리되면 그 자리에서 AI 승리 — 살아 있는 설계자는 개인 승리', () => {
    const o = outcomeFor(roles, new Set(['h1']), false)!;
    expect(o.winner).toBe('ai');
    expect(o.reason).toContain('사람이 격리');
    expect(o.designersWon).toEqual(['d1']);
    expect(o.designersLost).toEqual([]);
  });

  it('AI 설계자가 격리되면 AI 승리지만 그 설계자 본인은 진다', () => {
    const o = outcomeFor(roles, new Set(['d1']), false)!;
    expect(o.winner).toBe('ai');
    expect(o.reason).toContain('설계자');
    expect(o.designersWon).toEqual([]);
    expect(o.designersLost).toEqual(['d1']);
  });

  it('하드캡이면 AI 승리', () => {
    expect(outcomeFor(roles, new Set(), true)?.winner).toBe('ai');
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

describe('표식 — docs/SUSPICION.md', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('같은 항목에 거듭 걸리면 무거워진다 — 그 누계는 지워지지 않는다', () => {
    const book = new SuspicionBook(ids);
    expect(book.tell('a', 'echo', '되풀이')?.amount).toBe(SUSPICION.echo);
    expect(book.tell('a', 'echo', '되풀이')?.amount).toBe(SUSPICION.echo + SUSPICION.repeatWeight);
    expect(book.tell('a', 'echo', '되풀이')?.amount).toBe(SUSPICION.echo + SUSPICION.repeatWeight * 2);
    // 항목마다 따로 센다 — 되풀이 셋이 회피의 누계를 밀지 않는다
    expect(book.tell('a', 'duck', '회피')?.amount).toBe(SUSPICION.duck);
    expect(book.tellCount('a', 'echo')).toBe(3);
  });

  it('회피는 그때 몰려 있었으면 더 문다 (extra)', () => {
    const book = new SuspicionBook(ids);
    expect(book.tell('a', 'duck', '회피', SUSPICION.duckAccused)?.amount).toBe(SUSPICION.duck + SUSPICION.duckAccused);
  });

  it('몸은 bodyCap 에서 멈춘다 — 몸만으로는 격리되지 않는다', () => {
    const book = new SuspicionBook(ids);
    for (let i = 0; i < 40; i += 1) {
      book.tell('a', 'still', '부동');
      book.tell('a', 'backstep', '역방향');
    }
    expect(book.get('a')).toBe(SUSPICION.bodyCap);
    expect(book.get('a')).toBeLessThan(SUSPICION.cut);
    // 말은 상한을 안 나눠 쓴다 — 몸이 다 찼어도 말은 계속 문다
    expect(book.tell('a', 'echo', '되풀이')?.amount).toBe(SUSPICION.echo);
  });

  it('표식은 겨눔도 되돌림도 안 남긴다 — 남의 철회로 안 걷힌다', () => {
    const book = new SuspicionBook(ids);
    book.tell('a', 'echo', '되풀이');
    expect(book.accusationsSnapshot()).toEqual({});
    book.accuse('b', 'a');
    book.withdraw('b');
    expect(book.get('a')).toBe(SUSPICION.echo);
  });

  it('얼어붙은 좌석에는 아무 표식도 안 붙는다', () => {
    const book = new SuspicionBook(ids);
    book.freeze('a');
    expect(book.tell('a', 'still', '부동')).toBeNull();
  });
});

describe('국면 압력 — docs/SUSPICION.md §7', () => {
  const ids = ['a', 'b', 'c', 'd'];
  /** 압력을 밖에서 돌리는 책 — 런타임에서는 testsDone 이 이 손잡이다 */
  const bookAt = (p: { at: number }) => new SuspicionBook(ids, () => p.at);
  const up = (base: number, mult: number) => Math.min(SUSPICION.stepCap, Math.round(base * mult));

  it('사다리는 토론을 따라 오르고, 자리를 벗어나면 마지막 칸에 선다', () => {
    expect(pressureFor(0)).toBe(1);
    expect(SUSPICION_PRESSURE.every((v, i, a) => i === 0 || v >= a[i - 1])).toBe(true);
    expect(pressureFor(SUSPICION_PRESSURE.length + 5)).toBe(SUSPICION_PRESSURE[SUSPICION_PRESSURE.length - 1]);
    expect(pressureFor(-3)).toBe(SUSPICION_PRESSURE[0]);
  });

  it('압력 ×1 은 아무것도 안 바꾼다 — 전반의 동작은 그대로다', () => {
    const plain = new SuspicionBook(ids);
    const one = bookAt({ at: 1 });
    expect(one.accuse('a', 'd')[0].amount).toBe(plain.accuse('a', 'd')[0].amount);
    expect(one.read('b', 99, '')?.amount).toBe(plain.read('b', 99, '')?.amount);
    expect(one.tell('c', 'echo', '')?.amount).toBe(plain.tell('c', 'echo', '')?.amount);
  });

  it('올라가는 걸음에 곱한다 — 기본값과 몰이 가산을 **합친 뒤 한 번**', () => {
    const p = { at: 1.5 };
    const book = bookAt(p);
    expect(book.accuse('a', 'd')[0].amount).toBe(up(SUSPICION.accuse, 1.5)); // 지목 — 아직 몰이가 아니다
    expect(book.accuse('b', 'd')[0].amount).toBe(up(SUSPICION.agree + SUSPICION.mobPer, 1.5));
    expect(book.tell('c', 'echo', '되풀이')?.amount).toBe(up(SUSPICION.echo, 1.5));
    expect(book.tell('c', 'duck', '회피', SUSPICION.duckAccused)?.amount).toBe(up(SUSPICION.duck + SUSPICION.duckAccused, 1.5));
    expect(book.judge('c', 'mismatch')?.amount).toBe(up(SUSPICION.claimMismatch, 1.5));
  });

  it('말 읽기는 **클램프 뒤에** 곱해진다 — 안 그러면 압력이 readMax 에 눌려 사라진다', () => {
    const book = bookAt({ at: 1.5 });
    // 판정기는 여전히 −10~+16 한 자로 잰다 (agents.readTalk 의 프롬프트는 안 바뀐다)
    expect(book.read('a', 99, '')?.amount).toBe(up(SUSPICION.readMax, 1.5));
    expect(book.read('a', SUSPICION.readMax, '')?.amount).toBe(up(SUSPICION.readMax, 1.5));
  });

  it('한 걸음은 stepCap 을 못 넘는다', () => {
    const book = bookAt({ at: SUSPICION_PRESSURE[SUSPICION_PRESSURE.length - 1] });
    book.accuse('a', 'd');
    book.accuse('b', 'd'); // 몰이까지 붙은 제일 큰 지목 걸음
    const steps = [book.accuse('c', 'd')[0].amount, book.read('d', 99, '')?.amount ?? 0, book.judge('d', 'mismatch')?.amount ?? 0];
    for (const s of steps) expect(s).toBeLessThanOrEqual(SUSPICION.stepCap);
    expect(Math.max(...steps)).toBe(SUSPICION.stepCap); // 실제로 물었다 — 무의미한 상한이 아니다
  });

  it('내려가는 걸음은 안 곱한다 — 압력은 「빨리 쌓인다」지 「해명이 무거워진다」가 아니다', () => {
    const book = bookAt({ at: 2 });
    book.judge('a', 'mismatch');
    book.judge('a', 'mismatch');
    expect(book.judge('a', 'match')?.amount).toBe(SUSPICION.claimMatch);
    expect(book.read('a', -99, '')?.amount).toBe(SUSPICION.readMin);
  });

  it('철회는 압력이 바뀌어도 **얹은 만큼** 돌려준다 — 판정이 아니라 회계다', () => {
    const p = { at: 1 };
    const book = bookAt(p);
    const first = book.accuse('a', 'd')[0].amount;
    p.at = 2; // 후반으로 넘어갔다
    const second = book.accuse('a', 'd')[0].amount;
    expect(second).toBeGreaterThan(REPEAT_STEP); // 되풀이도 압력을 탄다
    expect(book.withdraw('a')[0].amount).toBe(-(first + second));
    expect(book.get('d')).toBe(0);
  });

  it('압력이 올라도 몸은 bodyCap 에서 멈춘다 — 더 빨리 닿을 뿐 총량은 그대로다', () => {
    const book = bookAt({ at: 2 });
    for (let i = 0; i < 40; i += 1) {
      book.tell('a', 'still', '부동');
      book.tell('a', 'backstep', '역방향');
    }
    expect(book.get('a')).toBe(SUSPICION.bodyCap);
    expect(book.get('a')).toBeLessThan(SUSPICION.cut);
  });

  it('newRound 는 몰이 상한만 비운다 — 되돌릴 빚과 누계는 판이 끝날 때까지 남는다', () => {
    const book = new SuspicionBook(ids);
    book.accuse('a', 'd');
    let bonus = 0;
    for (let i = 0; i < 40; i += 1) {
      const m = /몰이 \+(\d+)/.exec(book.accuse(['b', 'c', 'a'][i % 3], 'd')[0].why);
      if (!m) break;
      bonus += Number(m[1]);
    }
    expect(bonus).toBe(SUSPICION.mobCap); // 이 토론의 몰이는 다 냈다
    const before = book.get('d');
    book.newRound();
    // 새 토론 — 같은 몰이가 다시 값을 낸다
    expect(/몰이 \+\d+/.test(book.accuse('b', 'd')[0].why)).toBe(true);
    // 누계는 안 지워졌다: 같은 항목의 두 번째 표식은 여전히 무겁다
    book.tell('c', 'echo', '되풀이');
    expect(book.tell('c', 'echo', '되풀이')?.amount).toBe(SUSPICION.echo + SUSPICION.repeatWeight);
    // 얹은 빚도 그대로다 — 철회하면 토론을 넘어 얹은 것까지 전부 돌아온다
    book.withdraw('a');
    book.withdraw('b');
    book.withdraw('c');
    expect(book.get('d')).toBe(0);
    expect(before).toBeGreaterThan(0);
  });

  it('되살린 눈금은 복구지 판정이 아니다 — 압력도 누계도 안 탄다', () => {
    const book = bookAt({ at: 2 });
    book.restore('a', 57);
    expect(book.get('a')).toBe(57);
    book.restore('a', 999); // 격리선 위로는 안 간다
    expect(book.get('a')).toBe(SUSPICION.cut);
    book.restore('zzz', 40); // 모르는 좌석은 아무 일도 없다
    expect(book.get('zzz')).toBe(0);
  });
});

describe('좌석 부르기 — 지목과 호명이 같은 눈을 쓴다', () => {
  const seats = [1, 2, 3, 12].map((seat) => ({ id: `s${seat}`, seat }));

  it('자릿수를 맞춰 부르면 3점 · 「n번」은 2점 · 맨 숫자는 1점', () => {
    const by = (t: string, n: number) => seatMentions(t, seats).find((m) => m.id === `s${n}`)?.score ?? 0;
    expect(by('SUBJECT 03 너지', 3)).toBe(3);
    expect(by('03 이상해', 3)).toBe(3);
    expect(by('3번 이상해', 3)).toBe(2);
    expect(by('3회차 결과 몰라', 3)).toBe(1); // 문턱(2) 밑이라 혼자서는 아무것도 아니다
  });

  it('두 자리 번호를 한 자리로 잘라 읽지 않는다', () => {
    const ms = seatMentions('12번 얘기하는 거야', seats);
    // 두 자리 좌석은 맨 숫자가 곧 자릿수를 맞춘 꼴이라 3점이다
    expect(ms.find((m) => m.id === 's12')?.score).toBe(3);
    expect(ms.find((m) => m.id === 's1')).toBeUndefined();
    expect(ms.find((m) => m.id === 's2')).toBeUndefined();
  });

  it('호명은 **맨 뒤에 불린 사람**이 대답 차례다', () => {
    expect(calledIn('2번은 아까 그렇다 치고, 3번 너는?', seats)).toBe('s3');
    expect(calledIn('3번 너는? 아 2번도', seats)).toBe('s2');
    // 자기 자신은 부른 것으로 안 친다
    expect(calledIn('3번 나 말하는 중', seats, 's3')).toBeNull();
    // 문턱 밑은 호명이 아니다
    expect(calledIn('3회차 얘기야', seats)).toBeNull();
    expect(MENTION_MIN_SCORE).toBe(2);
  });
});

describe('같은 말 되풀이 — echoes', () => {
  it('문장부호·공백이 달라도 같은 말이면 잡는다', () => {
    expect(echoes('그건 아까 3번이 한 말이잖아', ['그건 아까 3번이 한 말이잖아!!'])).toBe(true);
  });

  it('짧은 말은 안 센다 — 채팅의 정상 리듬이다', () => {
    expect(echoes('ㅇㅇ', ['ㅇㅇ'])).toBe(false);
    expect(echoes('몰라', ['몰라', '몰라'])).toBe(false);
  });

  it('다른 말은 안 잡는다', () => {
    expect(echoes('나는 그때 왼쪽에 서 있었는데', ['정지선에서 너만 반대로 밀렸잖아'])).toBe(false);
  });
});

describe('몸 — BodyWatch', () => {
  it('굳음: 한자리에 STILL_MS 붙어 있으면 한 장면, 그 뒤로도 STILL_MS 마다 다시', () => {
    const w = new BodyWatch();
    expect(w.sample('a', 0, 0, 0, false)).toEqual([]);
    expect(w.sample('a', 0, 0, STILL_MS - 1, false)).toEqual([]);
    expect(w.sample('a', 0, 0, STILL_MS, false)).toEqual(['still']);
    expect(w.sample('a', 0, 0, STILL_MS * 2 - 1, false)).toEqual([]);
    expect(w.sample('a', 0, 0, STILL_MS * 2, false)).toEqual(['still']);
  });

  it('굳음: 앵커를 벗어나면 시계가 다시 선다', () => {
    const w = new BodyWatch();
    w.sample('a', 0, 0, 0, false);
    w.sample('a', 3, 0, STILL_MS - 1, false); // 걸어갔다 — 여기서 다시 센다
    expect(w.sample('a', 3, 0, STILL_MS, false)).toEqual([]);
    expect(w.sample('a', 3, 0, STILL_MS * 2 - 1, false)).toEqual(['still']);
  });

  it('뒷걸음: 장면이 끊길 때 판정하고, 짧거나 가까우면 안 문다', () => {
    const back = (dist: number, ms: number) => {
      const w = new BodyWatch();
      w.sample('a', 0, 0, 0, false);
      w.sample('a', 0, 0, 100, true); // 장면 시작
      w.sample('a', 0, -dist, 100 + ms, true);
      // 멈춘 뒤 유예를 넘기면 그 자리에서 판정된다
      return w.sample('a', 0, -dist, 100 + ms + 1_000, false);
    };
    expect(back(BACK_MIN_M + 0.5, 1_000)).toEqual(['backstep']);
    expect(back(0.3, 1_000)).toEqual([]); // 너무 가깝다
    expect(back(BACK_MIN_M + 0.5, 100)).toEqual([]); // 너무 짧다
  });

  it('뒷걸음: 계속 물러서도 BACK_MAX_MS 에서 한 번 끊는다', () => {
    const w = new BodyWatch();
    w.sample('a', 0, 0, 0, false);
    let hit = 0;
    for (let t = 100; t <= 100 + BACK_MAX_MS; t += 100) hit += w.sample('a', 0, -t / 100, t, true).length;
    expect(hit).toBe(1);
  });

  it('얼어붙은 좌석은 잊는다 — 쓰러진 몸에 「미동이 없다」가 걸리지 않게', () => {
    const w = new BodyWatch();
    w.sample('a', 0, 0, 0, false);
    w.forget('a');
    expect(w.sample('a', 0, 0, STILL_MS, false)).toEqual([]); // 처음 본 몸으로 다시 센다
  });

  it('뒤로 가는가는 보는 쪽과 가는 쪽의 각으로 정한다 (120°)', () => {
    // heading 0 = +z 를 본다
    expect(isBacking(0, -1, 0)).toBe(true); // 정반대
    expect(isBacking(0, 1, 0)).toBe(false); // 앞으로
    expect(isBacking(1, 0, 0)).toBe(false); // 옆걸음은 뒷걸음이 아니다
    expect(isBacking(0, 0, 0)).toBe(false); // 안 움직였다
  });
});
