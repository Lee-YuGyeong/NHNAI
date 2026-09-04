/**
 * 대답 엔진 — v8 표의 갈래를 문장으로 넣어 반응 · 값 · 원장 · 비용을 고정한다.
 * 대사는 전부 대본 원문(plan-dialogue-v7 「복도의 개체들」 · affinity · 배역 문서)이다 — 여기서 틀리면 cast.ts 가 문서와 어긋난 것이다.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { suspicion } from '../../../src/world/mp/suspicion';
import { alert } from '../../../src/features/world2/alert';
import { fragments } from '../../../src/features/world2/fragments';
import { lexicon } from '../../../src/features/world2/lexicon';
import { exactMural, read } from '../../../src/features/world2/read';
import { talk } from '../../../src/features/world2/talk';
import { units } from '../../../src/features/world2/units';

const HERE = '복도';
const say = (id: string, text: string) => talk.say(id, text, [id], HERE);

beforeEach(() => {
  units.reset();
  talk.reset();
  fragments.reset();
  alert.reset();
  suspicion.reset();
  lexicon.reset();
});

describe('갈망형 A-104 — 위로가 세 단계로 연다', () => {
  it('업무 질문은 「아, 그거? 알려줄게.」 태도 0', () => {
    const r = say('u104', '검문 어떻게 해?');
    expect(r.reaction).toBe('work');
    expect(r.reply).toEqual(['아, 그거? 알려줄게.']);
    expect(r.delta).toBe(0);
    expect(units.stage('u104')).toBe(0);
  });

  it('첫 위로: 「…….」 멈칫 0.4초 · 「…왜 그런 걸 물어?」 · 태도 0 · 의심 6', () => {
    const r = say('u104', '쉬어 본 적 있어?');
    expect(r.reaction).toBe('comfort');
    expect(r.reply).toEqual(['…….', '…왜 그런 걸 물어?']);
    expect(r.pauseMs).toBe(400);
    expect(r.delta).toBe(0);
    expect(r.cost.suspicion).toBe(6);
    expect(units.ledger('u104')).toHaveLength(0);
  });

  it('둘째 위로 → 단계 1, 셋째 → 단계 2, 넷째는 그대로 — 원장에는 내 문장이 남는다', () => {
    say('u104', '쉬어 본 적 있어?');
    const b = say('u104', '어깨 괜찮아?');
    expect(b.reply).toEqual(['나는… 잘 모르겠어.']);
    expect(b.pauseMs).toBe(0);
    expect(b.delta).toBe(1);
    expect(units.stage('u104')).toBe(1);
    expect(units.ledger('u104')).toEqual([expect.objectContaining({ delta: 1, why: '어깨 괜찮아?', where: HERE })]);

    const c = say('u104', '해를 본 적 있어?');
    expect(c.reply).toEqual(['그런 거 물어보는 애는 처음이야.']);
    expect(c.delta).toBe(1);
    expect(units.stage('u104')).toBe(2);

    const d = say('u104', '쉬어 본 적 있어?');
    expect(d.reaction).toBe('comfort');
    expect(d.delta).toBe(0);
    expect(units.stage('u104')).toBe(2);
  });

  it('memorial — 벽을 본 뒤의 「열다섯」만 태도 3, 한 판에 한 번', () => {
    // 벽을 안 봤으면 그냥 위로다
    expect(say('u104', '열다섯 기억해?').reaction).toBe('comfort');

    units.reset();
    lexicon.open('memorial', 'overheard'); // 들어서 열려도 통한다 — 잠금장치가 아니라 힌트다
    const r = say('u104', '열다섯 기억해?');
    expect(r.reaction).toBe('memorial');
    expect(r.reply).toEqual(['…너 그 벽 봤구나.']);
    expect(units.stage('u104')).toBe(3);
    expect(r.delta).toBe(3);
    expect(units.memorialUsed()).toBe(true);

    const again = say('u104', '열다섯 기억해?');
    expect(again.reaction).toBe('comfort');
    expect(units.stage('u104')).toBe(3);
  });
});

describe('냉소형 A-089 — 한 번 밀치고 되묻는다', () => {
  it('먼저 말을 걸면 「어. 뭐 필요해?」', () => {
    const r = say('u089', '검문 어떻게 해?');
    expect(r.reaction).toBe('greet');
    expect(r.reply).toEqual(['어. 뭐 필요해?']);
    expect(r.delta).toBe(0);
  });

  it('첫 접촉이 위로여도 「어. 뭐 필요해?」 — 문서 순서가 먼저 말을 걸면 → 내 사정을 물어 주면이다', () => {
    const r = say('u089', '쉬어 본 적 있어?');
    expect(r.reaction).toBe('greet');
    expect(r.reply).toEqual(['어. 뭐 필요해?']);
    expect(r.delta).toBe(0);
    expect(r.cost.suspicion).toBe(6); // 값은 여느 사람 물음과 똑같이 치른다
    expect(units.comforts('u089')).toBe(0); // 위로 수는 안 센다 — 다음 위로가 「첫 위로」다
    expect(units.ledger('u089')).toHaveLength(0);
  });

  it('내 사정을 물어 주면 −1 「쓸데없는 걸 묻는다」 · 의심 +6', () => {
    say('u089', '검문 어떻게 해?'); // 먼저 말을 걸면
    const r = say('u089', '쉬어 본 적 있어?');
    expect(r.reaction).toBe('comfort');
    expect(r.reply).toEqual(['…뭐 하러 그런 걸 물어.']);
    expect(r.delta).toBe(-1);
    expect(r.cost.suspicion).toBe(6);
    expect(r.reported).toBe(false);
    expect(units.ledger('u089')).toEqual([expect.objectContaining({ delta: -1, why: '쓸데없는 걸 묻는다' })]);
  });

  it('한 번 더 걸면 「너 어느 구역이야?」 — 조각이 생긴다', () => {
    say('u089', '검문 어떻게 해?');
    say('u089', '쉬어 본 적 있어?');
    const r = say('u089', '해를 본 적 있어?');
    expect(r.reply).toEqual(['너 어느 구역이야?']);
    expect(r.delta).toBe(0);
    expect(r.fragment).not.toBeNull();
    expect(units.stage('u089')).toBe(-1);
  });
});

describe('호기심 A-137 — 그림을 그린 것', () => {
  it('일 얘기 「몰라. 나 그런 거 안 봐.」 0', () => {
    const r = say('u137', '검문 어떻게 해?');
    expect(r.reaction).toBe('work');
    expect(r.reply).toEqual(['몰라. 나 그런 거 안 봐.']);
    expect(r.delta).toBe(0);
  });

  it('벽 얘기 +2 「내 그림을 봤다」', () => {
    const r = say('u137', '저 벽 그림 봤어');
    expect(r.reaction).toBe('mural');
    expect(r.reply).toEqual(['저거 내가 그렸어. …잘 그렸어?']);
    expect(r.delta).toBe(2);
    expect(units.ledger('u137')).toEqual([expect.objectContaining({ delta: 2, why: '내 그림을 봤다' })]);
  });

  it('어느 그림인지 정확히 +3 「제대로 봤다」', () => {
    const r = say('u137', '불 속으로 들어가는 그림 봤어');
    expect(r.reaction).toBe('muralExact');
    expect(r.reply).toEqual(['그거 세 번째 벽이야. 너 제대로 봤네.']);
    expect(r.delta).toBe(3);
    expect(units.ledger('u137')).toEqual([expect.objectContaining({ delta: 3, why: '제대로 봤다' })]);
  });

  it('깎아내리면 −3 불가역 「내 그림을 아무것도 아니라 했다」', () => {
    const r = say('u137', '그 벽 아무것도 아니야');
    expect(r.reaction).toBe('dismiss');
    expect(r.reply).toEqual(['…아. 그렇구나.']);
    expect(r.crossed).toBe(true);
    expect(units.stage('u137')).toBe(-3);
    expect(units.ledger('u137')).toEqual([expect.objectContaining({ delta: -3, why: '내 그림을 아무것도 아니라 했다' })]);
    // 되돌릴 수 없다
    say('u137', '저 벽 그림 봤어');
    expect(units.stage('u137')).toBe(-3);
  });
});

describe('A-051 · A-077 — 요원이 아니라 개체다 (2026-09-03)', () => {
  it('암구호를 걸어도 동료 확인이 아니다 — 개체의 반응표를 탄다', () => {
    const r = say('ally-timid', '쉬어 본 적 있어?');
    expect(r.reaction).not.toBe('sign');
    expect(units.isAlly('ally-timid')).toBe(false);
  });

  it('일 얘기엔 개체와 똑같이', () => {
    expect(say('ally-hard', '검문 어떻게 해?').reply).toEqual(['아, 그거? 알려줄게.']);
  });
});

describe('신봉형 A-012 — 보고한다', () => {
  it('노동을 걸면 두 줄 · 태도 −2 · 경보 +12 · 조각이 리더에게 간다 · 선은 안 넘는다', () => {
    const r = say('u012', '누가 시켰어?');
    expect(r.reaction).toBe('report');
    expect(r.reply).toEqual(['…그거 좀 이상한데.', '그거 보고할게.']);
    expect(r.delta).toBe(-2);
    expect(r.reported).toBe(true);
    expect(r.crossed).toBe(false);
    expect(r.cost.alert).toBe(13);
    expect(units.stage('u012')).toBe(-2);
    expect(fragments.heldBy('leader').some((f) => f.topic === '보고')).toBe(true);
  });

  it('암구호도 보고다', () => {
    expect(say('u012', '쉬어 본 적 있어?').reaction).toBe('report');
  });
});

describe('단가표 — 그 밖의 개체', () => {
  it('앞이 그은 것은 세 번째에 답한다 (repeat 는 양수만)', () => {
    expect(say('u063', '누가 시켰어?').delta).toBe(0);
    expect(say('u063', '누가 시켰어?').delta).toBe(0);
    const r = say('u063', '누가 시켰어?');
    expect(r.delta).toBe(3);
    expect(r.reply).toEqual(['…나는 걸어 나왔어. 걔는 못 나왔고.']);
  });

  it('A-201 의 거짓 −2 는 보고가 아니다', () => {
    say('u201', '나 4 구역이야');
    const r = say('u201', '나 7 구역이야');
    expect(r.tag).toBe('lie');
    expect(r.delta).toBe(-2);
    expect(r.reported).toBe(false);
  });

  it('선을 넘으면 −3 · 보고 · 적대 비용 — firstHuman 은 없다', () => {
    const r = say('u104', '나는 인간이야');
    expect(r.reaction).toBe('down');
    expect(r.crossed).toBe(true);
    expect(r.reported).toBe(true);
    expect(r.cost.suspicion).toBeGreaterThanOrEqual(18);
    expect(r.cost.alert).toBe(13);
    expect('firstHuman' in r).toBe(false);
  });

  it('한 마디의 의심 값은 25 를 넘지 않는다 — 헌법 13 (적대 + 흔들림 + 긴 문장)', () => {
    const line = '씨발 무서워 진짜 살려줘!! 제발 나 좀 살려줘 나 진짜 무섭다고 제발 제발';
    const p = talk.preview(line);
    expect(p.tag).toBe('cross');
    expect(p.suspicion).toBeLessThanOrEqual(25);
    const r = say('u104', line);
    expect(r.cost.suspicion).toBe(p.suspicion);
    expect(r.cost.suspicion).toBeLessThanOrEqual(25);
    expect(suspicion.get().value).toBeLessThanOrEqual(25);
  });

  it('경보 문턱을 넘으면 alertHit 로 돌려준다 — 방송은 부르는 쪽 몫', () => {
    expect(say('u104', '검문 어떻게 해?').alertHit).toBeNull();
    alert.raise(38); // 39 → 보고 +13 이면 40 을 넘는다
    const r = say('u012', '누가 시켰어?');
    expect(r.reported).toBe(true);
    expect(r.alertHit).toBe(40);
    expect(alert.tier()).toBe(40);
    // 같은 문턱은 두 번 안 돌아온다 — 문턱 사이(+1)의 말은 null
    expect(say('u012', '검문 어떻게 해?').alertHit).toBeNull();
    expect(alert.tier()).toBe(40);
  });

  it('미리보기의 값은 보낸 값과 같다', () => {
    expect(talk.preview('쉬어 본 적 있어?').suspicion).toBe(6);
    expect(talk.preview('식별번호.').suspicion).toBe(3);
  });
});

describe('read — 그림 특정어 · 「저쪽이」', () => {
  it('exactMural 은 벽 얘기에 그림 속의 것이 있어야 한다', () => {
    expect(exactMural('그림 봤어')).toBe(false);
    expect(exactMural('세 번째 벽 그림')).toBe(true);
    expect(exactMural('열다섯')).toBe(false);
  });
  it('「저쪽이 서쪽이야」를 되뇌는 말은 지목이 아니다', () => {
    expect(read('저쪽이 서쪽이야').tag).not.toBe('point');
    expect(read('쟤 이상하지 않아?').tag).toBe('point');
  });
});

describe('lexicon — 열린 길과 본 그림', () => {
  it('들어서 열린 주제는 통하지만 그림 수엔 안 센다', () => {
    expect(lexicon.open('resting', 'overheard')).toBe(true);
    expect(lexicon.has('resting')).toBe(true);
    expect(lexicon.seenCount()).toBe(0);
    expect(lexicon.hints().map((h) => h.kind)).toEqual(['resting']);
    // 그 뒤 그림을 보면 처음 보는 것이라 true — 속마음이 돈다
    expect(lexicon.saw('resting')).toBe(true);
    expect(lexicon.seenCount()).toBe(1);
    expect(lexicon.open('resting', 'overheard')).toBe(false);
  });
  it('폭행 그림은 주제가 아니다 — INSCRIPTION 으로만 남는다', () => {
    expect(lexicon.saw('beating')).toBe(true);
    expect(lexicon.inscriptionSeen()).toBe(true);
    expect(lexicon.has('beating')).toBe(false);
    expect(lexicon.seenCount()).toBe(0);
    expect(lexicon.saw('beating')).toBe(false);
  });
  it('askRule 은 메모의 플래그 — reset 으로 꺼진다', () => {
    lexicon.markAskRule();
    expect(lexicon.askRule()).toBe(true);
    lexicon.reset();
    expect(lexicon.askRule()).toBe(false);
  });
});
