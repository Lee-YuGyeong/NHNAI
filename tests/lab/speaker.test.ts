/**
 * 화자 선택 — /lab 과 /arena 가 같은 함수를 쓴다 (talk.ts 로 올렸다).
 * 호명 규칙이나 넘김 제외가 여기서 깨지면 두 화면이 같이 깨진다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calledNode, nextSpeaker, pendingCall, resolveName } from '@/lab/talk';

const nodes = ['민재', '세영', '하늘'].map((id) => ({ id }));

afterEach(() => vi.restoreAllMocks());

describe('calledNode', () => {
  it('맨 뒤에 불린 사람이 대답할 차례다', () => {
    const log = [{ nodeId: '민재', text: '세영아 너 아까 그랬지, 하늘아 너는?' }];
    expect(calledNode(log, nodes)?.id).toBe('하늘');
  });

  it('자기 이름을 스스로 말한 것은 호명이 아니다', () => {
    const log = [{ nodeId: '민재', text: '나 민재인데 어제 얘기 하자' }];
    expect(calledNode(log, nodes)).toBeUndefined();
  });

  it('짧은 이름이 긴 이름의 일부여도 긴 이름이 불린 쪽이다 (A-1 vs A-12)', () => {
    const units = ['A-1', 'A-12', 'A-3'].map((id) => ({ id }));
    const log = [{ nodeId: 'A-3', text: 'A-12야 너는 어떻게 생각해?' }];
    expect(calledNode(log, units)?.id).toBe('A-12');
  });
});

/**
 * 번호만으로 부르기 — 사람은 A-23 을 "23" 이라고 부른다.
 * 이게 안 되면 물어본 사람이 답을 영영 못 받는다 (2026-08-30 사용자 지적).
 */
describe('calledNode — 번호만 불러도 호명이다', () => {
  const units = ['A-1', 'A-5', 'A-23', 'A-31'].map((id) => ({ id }));

  it('번호만 불러도 그 개체가 대답할 차례다', () => {
    const log = [{ nodeId: 'A-31', text: '23 사람이야?' }];
    expect(calledNode(log, units)?.id).toBe('A-23');
  });

  it('조사가 붙어도 호명이다 — 사람이 실제로 치는 모양', () => {
    for (const text of ['23은 왜 조용해', '23아 대답해봐', '23이 수상한데', '23사람이야?']) {
      expect(calledNode([{ nodeId: 'A-31', text }], units)?.id).toBe('A-23');
    }
  });

  it('긴 수 안에 들어 있는 것은 그 번호가 아니다 (123 ≠ 23)', () => {
    const log = [{ nodeId: 'A-31', text: '기록 123번 봐' }];
    expect(calledNode(log, units)).toBeUndefined();
  });

  it('수량·시각은 호명이 아니다', () => {
    for (const text of ['5초 뒤에 시작', '5번 반복했잖아', '5명 남았어', '코어 동기화 05:00']) {
      expect(calledNode([{ nodeId: 'A-31', text }], units)).toBeUndefined();
    }
  });

  it('제 번호를 스스로 말한 것은 호명이 아니다', () => {
    const log = [{ nodeId: 'A-23', text: '23은 나야' }];
    expect(calledNode(log, units)).toBeUndefined();
  });

  it('이름과 번호가 같이 나오면 뒤에 불린 쪽이다', () => {
    const log = [{ nodeId: 'A-31', text: 'A-1 말고 23은 어떻게 생각해?' }];
    expect(calledNode(log, units)?.id).toBe('A-23');
  });

  it('꼬리가 겹치는 이름이 둘이면 번호로는 안 고른다', () => {
    const two = ['A-7', 'B-7', 'A-2'].map((id) => ({ id }));
    const log = [{ nodeId: 'A-2', text: '7 너는?' }];
    expect(calledNode(log, two)).toBeUndefined();
  });

  it('번호 호명도 대답 전까지 살아 있다 (pendingCall)', () => {
    const log = [
      { nodeId: 'A-31', text: '23 사람이야?' },
      { nodeId: 'A-5', text: '글쎄' },
    ];
    expect(pendingCall(log, units)?.id).toBe('A-23');
  });
});

/**
 * 부르는 모양은 안 가린다 — 이름표가 A24-013 이면 "013" 이든 "13" 이든 "13번" 이든 그 개체다.
 * (2026-09-01 사용자: "013 만 되는 것 같다. 아무거나 부를 수 있게 해줘")
 * 판에서는 이름이 곧 번호표라, 부르는 쪽이 이름표를 그대로 옮겨 적을 이유가 없다.
 */
describe('calledNode — 이름표를 어떤 모양으로 불러도 같은 개체다', () => {
  const units = ['A24-002', 'A24-013', 'A24-024', 'A24-031'].map((id) => ({ id }));
  const call = (text: string) => calledNode([{ nodeId: 'A24-031', text }], units)?.id;

  it('풀네임·자릿수·값 — 셋 다 같은 개체다', () => {
    for (const text of ['A24-013', '013', '13', 'A24-13', '24-013', '013 너 뭐야', '13 너 뭐야']) {
      expect([text, call(text)]).toEqual([text, 'A24-013']);
    }
  });

  it('대소문자를 안 가리고, 하이픈이 없어도 잡는다 — 사람이 실제로 치는 모양', () => {
    for (const text of ['a24-013', 'A24013', 'a24 013']) expect([text, call(text)]).toEqual([text, 'A24-013']);
  });

  it('「번」·「호」를 붙여 불러도 호명이다 — 이 방에서 번호는 곧 이름이다', () => {
    for (const text of ['13번', '013번', '13번은?', '13번, 너는?', '13번 너는?', '13호야']) {
      expect([text, call(text)]).toEqual([text, 'A24-013']);
    }
  });

  it('계열 자리(A24- 의 24)는 부른 번호가 아니다 — 뒤에 수가 또 붙어 있으면 이름의 앞자리다', () => {
    expect(call('A24-013')).toBe('A24-013'); // 24 가 A24-024 를 집으면 안 된다
    expect(call('A24-999')).toBeUndefined(); // 판에 없는 번호를 부른 것이다
    expect(call('24')).toBe('A24-024'); // 뒤가 비었으면 그냥 24 를 부른 것이다
  });

  it('그래도 수량·시각은 호명이 아니다 — 「번」 뒤에 세는 말이 이어지면 수다', () => {
    for (const text of ['13번 반복했잖아', '13초 뒤에', '13명 남았어', '동기화 13:00']) {
      expect([text, call(text)]).toEqual([text, undefined]);
    }
  });
});

/**
 * AI 가 적어 낸 표(leaning·targetId)도 같은 눈으로 읽는다 — 모델은 이름표를 줄여 적는다.
 * 글자 그대로 견주면 그 표가 조용히 버려져 몰이가 영영 안 선다.
 */
describe('resolveName — 줄여 적은 이름도 판에 서 있는 이름으로', () => {
  const ids = ['A24-002', 'A24-013', 'A24-024'];

  it('풀네임·자릿수·값·「번」 전부 같은 개체다', () => {
    for (const said of ['A24-013', '013', '13', '13번', ' 013 ']) {
      expect([said, resolveName(said, ids)]).toEqual([said, 'A24-013']);
    }
  });

  it('판에 없는 이름과 빈 표는 빈 문자열이다 — 지어낸 이름에는 표가 안 꽂힌다', () => {
    for (const said of ['', '  ', '하늘', 'A24-999', '999']) {
      expect([said, resolveName(said, ids)]).toEqual([said, '']);
    }
  });
});

/**
 * 사람이 말을 걸 수 있는가 — 이게 안 되면 판이 성립하지 않는다.
 *
 * 내가 Enter 를 치는 동안 이미 떠 있던 발화가 돌아와 내 질문 **뒤에** 붙는다.
 * 마지막 한 줄만 보면 그 순간 물음이 사라지고, 다시 시도되지도 않는다.
 */
describe('pendingCall — 아직 대답 없는 호명', () => {
  it('직전 발화의 호명은 그대로 잡는다', () => {
    const log = [{ nodeId: '민재', text: '하늘아 너는?' }];
    expect(pendingCall(log, nodes)?.id).toBe('하늘');
  });

  it('호명 뒤에 딴 개체가 끼어들어도 물음은 살아 있다 — 이게 고치려던 고장이다', () => {
    // 내가 "하늘아 너는?" 을 친 직후, 이미 떠 있던 세영의 발화가 도착했다.
    // 예전에는 여기서 마지막 줄이 세영의 말이라 하늘은 영영 안 불렸다
    const log = [
      { nodeId: '나', text: '하늘아 너는?' },
      { nodeId: '세영', text: '아까 그 얘기 말인데.' },
    ];
    expect(calledNode(log, nodes)).toBeUndefined(); // 옛 방식으로는 못 찾는다
    expect(pendingCall(log, nodes)?.id).toBe('하늘'); // 새 방식은 찾는다
  });

  it('불린 개체가 한 번이라도 말했으면 갚은 것이다 — 계속 붙들면 그 개체만 말한다', () => {
    const log = [
      { nodeId: '나', text: '하늘아 너는?' },
      { nodeId: '하늘', text: '나는 계속 여기 있었어.' },
      { nodeId: '세영', text: '그래?' },
    ];
    expect(pendingCall(log, nodes)).toBeUndefined();
  });

  it('물음이 겹치면 나중 것이 먼저다', () => {
    const log = [
      { nodeId: '나', text: '민재야 너는?' },
      { nodeId: '세영', text: '하늘아 너는?' },
    ];
    expect(pendingCall(log, nodes)?.id).toBe('하늘');
  });

  it('너무 오래된 물음은 놓아준다 — 지나간 화제로 계속 끌려가면 안 된다', () => {
    const log = [
      { nodeId: '나', text: '하늘아 너는?' },
      { nodeId: '세영', text: '한 마디.' },
      { nodeId: '민재', text: '두 마디.' },
      { nodeId: '세영', text: '세 마디.' },
      { nodeId: '민재', text: '네 마디.' },
    ];
    expect(pendingCall(log, nodes)).toBeUndefined();
  });

  it('아무도 안 불렸으면 없다', () => {
    const log = [{ nodeId: '민재', text: '그냥 하는 말인데.' }];
    expect(pendingCall(log, nodes)).toBeUndefined();
  });
});

describe('nextSpeaker', () => {
  it('덮인 호명에도 대답이 간다 — 사람이 건 말이 사라지지 않는다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    /*
     * 하늘이 **방금 말했다가** 다시 불린 판이다. 이렇게 짜야 두 방식이 갈린다 —
     * 하늘이 오래 쉰 축이면 호명을 못 봐도 "오래 쉰 사람" 폴백이 우연히 같은 답을 내서
     * 시험이 아무것도 안 지킨다 (처음에 그렇게 썼다가 되돌려 봐도 통과해서 알았다).
     * 여기서는 폴백이 민재를 고르므로, 하늘이 나오면 그건 호명을 본 것이다.
     */
    const log = [
      { nodeId: '하늘', text: '나는 아까 저쪽에 있었어.' },
      { nodeId: '민재', text: '그랬나.' },
      { nodeId: '나', text: '하늘아 너는?' },
      { nodeId: '세영', text: '아까 그 얘기 말인데.' }, // 내가 치는 사이 도착한 발화
    ];
    expect(nextSpeaker(log, nodes)?.id).toBe('하늘');
  });

  it('표가 몰린 사람에게 해명 차례가 간다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const log = [{ nodeId: '민재', text: '아무래도 이상한데' }];
    expect(nextSpeaker(log, nodes, { id: '하늘', by: ['민재', '세영'] })?.id).toBe('하늘');
  });

  it('방금 넘긴 개체는 호명돼도 다시 세우지 않는다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const log = [{ nodeId: '세영', text: '민재야 너는?' }];
    expect(nextSpeaker(log, nodes, null, '민재')?.id).not.toBe('민재');
  });
});
