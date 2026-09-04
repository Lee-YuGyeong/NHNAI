/**
 * 검문 감독 (src/lab/director.ts) — **판정이 아니라 헌법을 잠근다.**
 *
 * 어떤 답이 인간다운가는 모델이 정한다. 여기서 잠그는 것은 그 판단이 판을 부수지 못하게 하는 장치들이다:
 *   - 의심도가 낮은데 사격·연행이 선택지에 오르지 않는가 (allowMoves)
 *   - 모델이 목록 밖 무브를 내밀면 되돌리는가 (clamp) — 「LLM 에 진행을 맡겼는데 왜 안 망가지나」의 답
 *   - 기록(dossier)과 사실 대조(fact)가 프롬프트에 실리는가 — 모순 대질은 이게 실려야만 나온다
 *   - 감독이 죽었을 때 폴백이 판을 굴리는가, 그리고 폴백은 **사람을 쏘지 않는가**
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DETAIN_AT,
  FIRE_AT,
  PRESS_MAX,
  allowMoves,
  judgeDirect,
  readFear,
  runDirect,
  validateDirect,
  type DirectorMove,
  type DirectorRequest,
} from '../../src/lab/director';

const base: DirectorRequest = {
  kind: 'direct',
  check: 'roll',
  unit: 'UNIT-21',
  question: '식별번호.',
  answer: 'A17-091.',
  round: 1,
  fact: 'match',
  suspicion: 20,
  sync: 88,
  dossier: [],
  allowed: ['pass', 'press'],
};

describe('본문 검사', () => {
  it('성하지 않으면 사유를 돌려준다', () => {
    expect(validateDirect(null)).toBeTruthy();
    expect(validateDirect({ kind: 'backstep' })).toBeTruthy();
    expect(validateDirect({ ...base, allowed: [] })).toBeTruthy();
    expect(validateDirect(base)).toBeNull();
  });
});

describe('헌법 — 무엇을 고를 수 있는가', () => {
  it('의심도가 낮으면 연행도 사격도 목록에 없다', () => {
    const moves = allowMoves({ press: PRESS_MAX, escorted: false, suspicion: 10, canDetain: true });
    expect(moves).toContain('pass');
    expect(moves).toContain('press');
    expect(moves).not.toContain('detain');
    expect(moves).not.toContain('fire');
  });

  it('문턱을 넘으면 그때 열린다', () => {
    expect(allowMoves({ press: 1, escorted: false, suspicion: DETAIN_AT, canDetain: true })).toContain('detain');
    expect(allowMoves({ press: 1, escorted: false, suspicion: FIRE_AT, canDetain: true })).toContain('fire');
  });

  it('끌고 갈 곳이 없으면 의심도가 높아도 연행은 못 고른다', () => {
    expect(allowMoves({ press: 1, escorted: false, suspicion: 99, canDetain: false })).not.toContain('detain');
  });

  it('예산이 떨어지면 추가 심문이 사라진다 — 문답이 끝나지 않는 판을 막는다', () => {
    expect(allowMoves({ press: 0, escorted: false, suspicion: 20, canDetain: false })).not.toContain('press');
  });

  it('무대가 사격 문턱을 낮출 수 있다 — 재검실처럼 끌고 갈 곳이 없는 마지막 방', () => {
    const b = { press: 1, escorted: false, suspicion: 72, canDetain: false };
    expect(allowMoves(b)).not.toContain('fire'); // 기본 문턱(85)에서는 아직 아니고
    expect(allowMoves({ ...b, fireAt: 70 })).toContain('fire'); // 낮춰 잡은 방에서는 열린다
    expect(allowMoves({ ...b, fireAt: Number.POSITIVE_INFINITY })).not.toContain('fire'); // 첫 차례처럼 닫아 둘 수도 있다
  });

  it('감시는 한 번만 붙는다', () => {
    expect(allowMoves({ press: 1, escorted: true, suspicion: 20, canDetain: false })).not.toContain('escort');
  });

  /*
   * 2026-09-01 사용자: "심문 중에 다음 챕터로 넘어가 버린다."
   * 재검실은 세 번은 묻게 되어 있는데(chapter3 MIN_ROUNDS) 첫 차례부터 pass 가 목록에 있어서,
   * 기계처럼 짧게 답하면 감독이 그 자리에서 통과를 골라 문이 열렸다. 그 차례에는 **캐묻는 길만** 남긴다.
   */
  it('보내 줄 수 없는 차례에는 통과·감시가 목록에서 빠진다 — 캐묻는 길만 남는다', () => {
    const moves = allowMoves({ press: 2, escorted: false, suspicion: 20, canDetain: false, canRelease: false });
    expect(moves).toEqual(['press']);
  });

  it('그 차례에도 사격은 문턱을 넘으면 열린다 — 못 보내는 것과 못 쏘는 것은 다른 일이다', () => {
    const moves = allowMoves({ press: 2, escorted: false, suspicion: 90, canDetain: false, canRelease: false });
    expect(moves).toContain('fire');
    expect(moves).not.toContain('pass');
  });

  /*
   * 2026-09-01 사용자: "심문자가 결국 검출자고, 사살할 능력을 가진 사람이다. 따라가거나 뭔가 할 필요가 없다."
   * 재검실에는 감시를 붙일 데가 없다 — 묻는 자가 총을 들고 눈앞에 서 있는데 「따라간다」로 끝나면 그 총이 소품이 된다.
   */
  it('감시를 붙일 수 없는 무대에서는 escort 가 목록에서 빠진다', () => {
    const b = { press: 0, escorted: false, suspicion: 20, canDetain: false };
    expect(allowMoves(b)).toContain('escort');
    expect(allowMoves({ ...b, canEscort: false })).not.toContain('escort');
    expect(allowMoves({ ...b, canEscort: false })).toContain('pass');
  });

  it('폴백도 목록을 지킨다 — 감독이 죽어 있어도 첫 답에 문이 열리지 않는다', () => {
    const req = {
      kind: 'direct' as const,
      check: 'recheck' as const,
      unit: 'UNIT-04',
      question: '지금 무슨 생각을 하고 있었나.',
      answer: '이상 없음.',
      round: 1,
      fact: 'none' as const,
      suspicion: 20,
      sync: 90,
      dossier: [],
      allowed: ['press'] as DirectorMove[],
    };
    expect(judgeDirect(req).move).toBe('press');
  });
});

describe('모델의 답을 다듬는다', () => {
  it('목록 밖 무브는 되돌린다 — 쏘고 싶어도 허락되지 않았으면 못 쏜다', async () => {
    const complete = vi.fn().mockResolvedValue({ reply: '제거한다.', delta: 40, move: 'fire', why: '확신', note: '' });
    const out = await runDirect({ ...base, allowed: ['pass', 'press'] }, complete);
    expect(out.move).toBe('press'); // press 가 열려 있으면 캐묻는 쪽으로 되돌린다
    expect(out.delta).toBe(20); // −12 ~ +20 으로 자른다
  });

  it('되돌릴 곳이 press 도 없으면 통과시킨다', async () => {
    const complete = vi.fn().mockResolvedValue({ reply: '끌고 간다.', delta: 5, move: 'detain', why: '', note: '' });
    const out = await runDirect({ ...base, allowed: ['pass'] }, complete);
    expect(out.move).toBe('pass');
  });

  it('기록·사실 대조·무브 목록이 프롬프트에 실린다 — 모순 대질의 재료다', async () => {
    const complete = vi.fn().mockResolvedValue({ reply: '아까와 다르다.', delta: 12, move: 'press', why: '앞말과 모순', note: '' });
    await runDirect(
      {
        ...base,
        check: 'memory',
        fact: 'mismatch',
        dossier: ['[복도] 통행자: "4 구역입니다"', '[복도] 관측: 정비 명판을 들여다봤다'],
        allowed: ['pass', 'press', 'detain'],
      },
      complete,
    );
    const user = complete.mock.calls[0][0].user as string;
    expect(user).toContain('4 구역입니다');
    expect(user).toContain('정비 명판');
    expect(user).toContain('불일치');
    expect(user).toContain('detain');
  });

  it('재검 문답에는 「정답을 묻지 마라」 지침이 붙는다 — 없으면 모델이 습관대로 식별번호를 다시 묻는다', async () => {
    const complete = vi.fn().mockResolvedValue({ reply: '왜 망설였나.', delta: 4, move: 'press', why: '망설임', note: '' });
    await runDirect({ ...base, check: 'recheck', fact: 'none', allowed: ['pass', 'press', 'escort'] }, complete);
    const user = complete.mock.calls[0][0].user as string;
    expect(user).toContain('정답이 있는 것을 묻지 마라');
    expect(user).toContain('너그럽게');
    // 다른 관문에는 안 붙는다
    const other = vi.fn().mockResolvedValue({ reply: '통과.', delta: -4, move: 'pass', why: '', note: '' });
    await runDirect(base, other);
    expect(other.mock.calls[0][0].user as string).not.toContain('정답이 있는 것을 묻지 마라');
  });

  it('무응답도 그대로 실린다', async () => {
    const complete = vi.fn().mockResolvedValue({ reply: '응답 없음.', delta: 10, move: 'press', why: '무응답', note: '' });
    await runDirect({ ...base, answer: null }, complete);
    expect(complete.mock.calls[0][0].user as string).toContain('무응답');
  });
});

describe('감독이 없을 때 — 폴백', () => {
  it('사실이 맞으면 통과시킨다', () => {
    expect(judgeDirect({ ...base, fact: 'match' }).move).toBe('pass');
  });

  it('사실이 어긋나도 폴백은 쏘지도 끌고 가지도 않는다 — 판단한 게 아니라 못 물어본 것이다', () => {
    const out = judgeDirect({ ...base, fact: 'mismatch', allowed: ['pass', 'press', 'detain', 'fire'] });
    expect(out.move).toBe('press');
    expect(out.delta).toBeGreaterThan(0);
  });

  it('무응답은 그 자체가 신호다', () => {
    expect(judgeDirect({ ...base, answer: null }).delta).toBeGreaterThanOrEqual(8);
  });

  it('재검 문답에서는 너그럽게 넘긴다 — 정규식은 사람다움을 못 읽는다', () => {
    const rc = { ...base, check: 'recheck' as const, fact: 'none' as const, allowed: ['pass', 'press', 'escort'] as const };
    expect(judgeDirect({ ...rc, answer: '이상 없음.', allowed: [...rc.allowed] }).move).toBe('pass');
    const shaky = judgeDirect({ ...rc, answer: '어… 그건 좀 무섭네요, 왜 물어보시는 거죠?', allowed: [...rc.allowed] });
    expect(shaky.move).toBe('press');
    expect(shaky.delta).toBeGreaterThan(0);
    // 예산이 없으면 press 대신 감시로 — 폴백은 여전히 쏘지 않는다
    expect(judgeDirect({ ...rc, answer: '무섭습니다', allowed: ['pass', 'escort', 'fire'] }).move).toBe('escort');
  });

  it('두려움은 예전 판정과 같게 읽는다 (chapter2.readAnswer 와 한 몸)', () => {
    expect(readFear('아니다.')).toBe(0);
    expect(readFear('그 질문의 목적은.')).toBe(1);
    expect(readFear('조금은요')).toBe(2);
    expect(judgeDirect({ ...base, check: 'fear', fact: 'none', answer: '조금 무섭습니다' }).delta).toBeGreaterThan(0);
  });
});
