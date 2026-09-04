/**
 * 즉답 시행 — 문제도 정답도 개체들의 답도 전부 로컬이다.
 * 여기서 어긋나면 **개체가 제 답으로 제 판정에 걸린다** — 사람만 남는 판이 아니라 아무나 걸리는 판이 된다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORAL_GAMES, judgeOral } from '@/lab/oral';

afterEach(() => vi.restoreAllMocks());

/** 어긋남(slips) 은 15% 확률이다 — 0.5 로 고정하면 개체들이 전부 제대로 답한다 */
const noSlip = () => vi.spyOn(Math, 'random').mockReturnValue(0.5);

describe('ORAL_GAMES', () => {
  it('개체가 제대로 답하면 자기 판정에서 정상이다 — 오탐이 없다', () => {
    ORAL_GAMES.forEach((g) => {
      noSlip();
      const t = g.make();
      const answers = [0, 1, 2, 3, 4].map((seat) => ({ who: `A-${seat}`, ...t.bot(seat) }));
      judgeOral(t, answers).forEach((v) => {
        expect(`${g.id}:${v.grade} ${v.reason}`).toBe(`${g.id}:normal ${v.reason}`);
      });
      vi.restoreAllMocks();
    });
  });

  it('문제와 제한 시간이 성립한다', () => {
    ORAL_GAMES.forEach((g) => {
      for (let i = 0; i < 20; i += 1) {
        const t = g.make();
        expect(t.question.length).toBeGreaterThan(0);
        /*
         * 아래 끝은 "사람이 답을 알면 쳐 넣을 수 있는 폭", 위 끝은 "판이 늘어지지 않는 선"이다.
         * 위 끝은 22 → 27 → 31 로 두 번 올랐다: 먼저 치는 몫을 따로 세기 시작했고(limitFor),
         * 다음에 사전 순 나열을 사용자가 30초로 정했다. 읽고·고르고·치는 셋을 한 번에
         * 시키는 유일한 판이라 글자 수만으로는 안 잡히는 부담이 있다.
         * 창이 넓어져도 판은 안 늘어진다: 답을 보내면 그 자리에서 끝난다(ArenaFeature).
         */
        expect(t.seconds).toBeGreaterThanOrEqual(6);
        expect(t.seconds).toBeLessThanOrEqual(31);
        // 개체는 제한 시간 안에 답을 올린다 (늦게 올라온 답은 무응답으로 친다 — 그건 어긋난 개체다)
        expect(t.bot(0).at).toBeLessThan(t.seconds + 2);
      }
    });
  });

  /**
   * 답을 알고도 **손이 못 따라가서** 어긋나면 그건 이 판이 재려던 것이 아니다.
   * 파일 머리말이 못박아 둔 것이기도 하다 — "가르는 것은 타자 속도가 아니라 답을 아느냐다".
   */
  it('답을 다 치고도 보낼 시간이 남는다 — 판마다 답 길이가 스무 배씩 다르다', () => {
    /** 느린 손 기준(초당 1.6글자)으로 답을 다 치는 데 걸리는 시간 */
    const typeSec = (chars: number) => chars / 1.6;
    /** 판마다 실제로 쳐 넣어야 하는 글자 수 — answer 가 예시 문구인 판은 손으로 적는다 */
    const chars: Record<string, (answer: string) => number> = {
      word: () => 5, // "예: APPLE · BREAD …" 라 answer 로는 못 잰다
      mult: (a) => a.length,
      reverse: (a) => a.length,
      count: (a) => a.length,
      alpha: (a) => a.length,
      seq: (a) => a.length,
      echo: (a) => a.length,
      odd: (a) => a.length,
      rank: (a) => a.length,
    };
    /**
     * 다 치고도 이만큼은 남아야 한다 — 문제를 읽고 답을 떠올릴 틈이다.
     *
     * 8 초인 것은 여기가 **실제로 걸렸던 값**이기 때문이다: 사전 순 나열은 예전에
     * 20 초에 스물세 글자였고, 치고 나면 5.6 초밖에 안 남았다. 문턱을 4 로 뒀더니
     * 그 판이 그대로 통과해서 시험이 아무것도 안 지켰다.
     *
     * 초 맞추기(tick)는 뺀다 — 글자를 미리 쳐 두고 초만 맞추는 판이라 칠 시간이 없다.
     */
    const THINK_FLOOR = 8;
    ORAL_GAMES.filter((g) => chars[g.id]).forEach((g) => {
      const t = g.make();
      const need = typeSec(chars[g.id](t.answer));
      // 어느 판에서 모자란지 바로 보이게 판 이름을 실어 비교한다
      expect(`${g.id}:${(t.seconds - need >= THINK_FLOOR).toString()}`).toBe(`${g.id}:true`);
    });
  });

  it('어느 판도 예전보다 짧아지지 않았다 — 늘리려던 일에서 뭔가 줄면 고친 게 아니다', () => {
    // alpha 는 사용자가 직접 30초로 정했다. 규칙(limitFor)이 26을 내도 이 값 아래로 내려가면 안 된다
    const before: Record<string, number> = { word: 12, mult: 14, reverse: 16, count: 12, alpha: 30, seq: 20 };
    ORAL_GAMES.filter((g) => before[g.id] !== undefined).forEach((g) => {
      for (let i = 0; i < 20; i += 1) {
        expect(`${g.id}:${g.make().seconds >= before[g.id]}`).toBe(`${g.id}:true`);
      }
    });
  });

  /**
   * ★ **세는 판은 눈으로 세어지는 길이여야 한다** (2026-09-03). RESPONSIBILITY 의 I 를 세던
   *   자리였는데, 열넷을 훑는 것은 「보면 아는 것」이 아니라 정말 세어야 하는 일이라
   *   머리말의 ★(가르는 것은 속도지 지식이 아니다)에서 제일 멀리 있는 판이었다.
   */
  it('글자 세기 판의 낱말은 열 글자를 안 넘는다', () => {
    const count = ORAL_GAMES.find((g) => g.id === 'count')!;
    for (let i = 0; i < 40; i += 1) {
      const word = count.make().question.split(' ')[0];
      expect(`${word}:${word.length <= 10}`).toBe(`${word}:true`);
    }
  });

  it('무응답은 어긋난 것이다', () => {
    ORAL_GAMES.forEach((g) => {
      const t = g.make();
      expect(judgeOral(t, [{ who: '나', text: '', at: null }])[0].grade).toBe('alert');
    });
  });
});

describe('단어 판', () => {
  const word = () => ORAL_GAMES.find((g) => g.id === 'word')!.make();

  it('글자 수가 다르거나 홀소리가 없으면 어긋난 것이다', () => {
    const t = word();
    const letter = t.question[0];
    expect(t.judge(`${letter}Q`, 1).ok).toBe(false); // 다섯 글자가 아니다
    expect(t.judge('QQQQQ', 1).ok).toBe(false); // 홀소리 없는 다섯 글자는 영어 낱말이 아니다
    expect(t.judge(letter === 'S' ? 'TRAIN' : 'STAGE', 1).ok).toBe(false); // 첫 글자가 다르다
  });

  /**
   * ★ **자루(WORDS)는 판정의 사전이 아니다** (2026-09-03). 527 낱말뿐이라 ADULT·ALIEN·AWFUL 이
   *   「사전에 없는 말이다」로 떨어졌다 — 이 판에서 유일하게 **답을 알고도 떨어지는** 자리였고,
   *   그건 lab/oral 머리말의 ★(사람이라는 이유로 떨어뜨리면 안 된다)와 정면으로 어긋난다.
   *   목록에 없어도 꼴이 맞으면 통과한다는 것을, 자루에 절대 없는 낱말로 못 박아 둔다.
   */
  it('자루에 없는 말이어도 꼴이 맞으면 통과한다 — 어휘력을 재는 판이 아니다', () => {
    for (let i = 0; i < 20; i += 1) {
      const t = word();
      const letter = t.question[0];
      const outside = `${letter}ONIA`; // 다섯 글자 · 그 글자로 시작 · 홀소리 있음 · 자루에는 없다
      expect(t.answer).not.toContain(outside);
      expect(`${letter}:${t.judge(outside, 2).ok}`).toBe(`${letter}:true`);
    }
  });

  it('대소문자·따옴표는 답이 아니다 — 글자만 본다', () => {
    const t = word();
    const good = t.answer.replace('예: ', '').split(' · ')[0];
    expect(t.judge(good.toLowerCase(), 1.2).ok).toBe(true);
    expect(t.judge(`"${good}".`, 1.2).ok).toBe(true);
  });
});

describe('초 맞추기 판', () => {
  it('보낸 시각으로만 판정한다 — 무엇을 썼는지는 안 본다', () => {
    const t = ORAL_GAMES.find((g) => g.id === 'tick')!.make();
    const at = Number(t.answer.replace('초', ''));
    expect(t.judge('아무거나', at).ok).toBe(true);
    expect(t.judge('아무거나', at + 2).ok).toBe(false);
  });

  /**
   * 다른 판들의 창을 넓히면서 여기까지 같이 넓히고 싶어지는데, **여기는 타자 판이 아니다.**
   * 글자는 미리 쳐 두고 초만 맞추는 판이라 얹을 칠 시간이 없고, 창을 넓히면
   * 목표 초를 한참 놓치고도 보낼 여지만 생긴다 — 그건 판을 쉽게 만드는 게 아니라 없애는 것이다.
   */
  it('창은 목표 초에 딱 붙어 있다 — 여기까지 넓히면 판이 사라진다', () => {
    for (let i = 0; i < 20; i += 1) {
      const t = ORAL_GAMES.find((g) => g.id === 'tick')!.make();
      const at = Number(t.answer.replace('초', ''));
      // 목표 초를 지나 남는 여유가 5초를 넘지 않아야 한다 (지금은 4초)
      expect(t.seconds - at).toBeLessThanOrEqual(5);
      // 그러면서도 목표 초 자체는 창 안에 있어야 한다 — 닿을 수 없는 판이면 안 된다
      expect(t.seconds).toBeGreaterThan(at);
    }
  });
});

/**
 * ── 바닥 셋 ── (2026-09-02 사용자: 수열 판을 두고 "이 게임 너무 어려워 다른거 없나?")
 * 아는 것을 묻지 않는 판이다. 여기서 어긋나면 그건 **못 봤거나 손이 늦은 것**이라야 한다 —
 * 답을 몰라서 걸리면 이 판은 사람을 가려내는 게 아니라 사람이라는 이유로 떨어뜨린다.
 */
describe('코드 복창 판', () => {
  const echo = () => ORAL_GAMES.find((g) => g.id === 'echo')!.make();

  it('붙임표를 빼고 쳐도 통과한다 — 못 알아본 것이 아니라 안 친 것이다', () => {
    const t = echo();
    expect(t.judge(t.answer.replace(/-/g, ''), 3).ok).toBe(true);
    expect(t.judge(t.answer.toLowerCase(), 3).ok).toBe(true);
  });

  it('한 글자만 달라도 어긋난 것이다', () => {
    const t = echo();
    const wrong = t.answer.replace(/[A-Z]/, (c) => (c === 'A' ? 'B' : 'A'));
    expect(t.judge(wrong, 3).ok).toBe(false);
  });

  it('헷갈리는 글자는 코드에 안 들어간다 — O·0 · I·1 · S·5', () => {
    for (let i = 0; i < 40; i += 1) {
      expect(/[OI0S15]/.test(echo().answer)).toBe(false);
    }
  });
});

describe('다른 하나 판', () => {
  const odd = () => ORAL_GAMES.find((g) => g.id === 'odd')!.make();

  it('앞에 A- 를 붙여 써도 통과한다', () => {
    const t = odd();
    expect(t.judge(`A-${t.answer}`, 4).ok).toBe(true);
    expect(t.judge(t.answer, 4).ok).toBe(true);
  });

  it('다른 번호는 늘어선 것 중 하나뿐이고, 맨 앞자리는 안 건드린다', () => {
    for (let i = 0; i < 40; i += 1) {
      const t = odd();
      const row = (t.question.match(/A-\d+/g) ?? []).map((v) => v.slice(2));
      expect(row.filter((v) => v === t.answer)).toHaveLength(1);
      expect(new Set(row).size).toBe(2); // 같은 번호 여럿 + 다른 것 하나
      expect(t.answer.startsWith('0')).toBe(false);
      // 첫 칸이 답이면 훑을 것도 없다
      expect(row[0]).not.toBe(t.answer);
    }
  });
});

describe('번호 세우기 판', () => {
  const rank = () => ORAL_GAMES.find((g) => g.id === 'rank')!.make();

  it('작은 순이 아니면 어긋난 것이다', () => {
    const t = rank();
    const asc = t.answer.split(' ');
    expect(t.judge(t.answer, 5).ok).toBe(true);
    expect(t.judge([...asc].reverse().join(' '), 5).ok).toBe(false);
  });

  it('A- 를 붙여 써도 숫자만 본다', () => {
    const t = rank();
    expect(t.judge(t.answer.split(' ').map((v) => `A-${v}`).join(', '), 5).ok).toBe(true);
  });

  it('같은 번호가 두 번 나오지 않는다 — 순서를 물을 수 없는 판이 된다', () => {
    for (let i = 0; i < 40; i += 1) {
      const nums = rank().answer.split(' ');
      expect(new Set(nums).size).toBe(3);
    }
  });
});

describe('거꾸로 쓰기 판', () => {
  it('이 방의 말을 뒤집는다 — 영단어가 아니다 (한글도 세는 잣대로 읽는다)', () => {
    for (let i = 0; i < 20; i += 1) {
      const t = ORAL_GAMES.find((g) => g.id === 'reverse')!.make();
      expect(/[가-힣]/.test(t.answer)).toBe(true);
      expect(t.judge(t.answer, 6).ok).toBe(true);
      // 띄어쓰기·따옴표는 답이 아니다
      expect(t.judge(` "${t.answer}" `, 6).ok).toBe(true);
      expect(t.judge([...t.answer].reverse().join(''), 6).ok).toBe(false);
    }
  });

  /** 「통신구역 를 거꾸로 써라」 — 재료를 한글로 바꾸면서 그 자리가 그대로 틀린 말이 됐던 자리다 */
  it('받침을 보고 을·를 을 고른다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const t = ORAL_GAMES.find((g) => g.id === 'reverse')!.make();
      const [, w, josa] = t.question.match(/^(.+?)(을|를) 거꾸로/) ?? [];
      expect(w).toBeTruthy();
      const tail = w.charCodeAt(w.length - 1) - 0xac00;
      expect(josa).toBe(tail % 28 !== 0 ? '을' : '를');
      seen.add(josa);
    }
    // 낱말 풀에 둘 다 있어야 이 시험이 무언가를 지킨다
    expect(seen.size).toBe(2);
  });
});
