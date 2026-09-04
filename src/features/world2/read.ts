/**
 * 내가 적은 말에서 **태그 하나**만 뽑는다 — 선택지가 없다 (기획서 「어디가 닳았나」).
 *
 * 문제는 「아무 말이나」를 어떻게 캐릭터별로 다르게 받을 것인가다. 답은 **말을 채점하지 않는 것**이다:
 * 말에서 태그 하나만 뽑고, 그 태그가 개체마다 다른 값을 갖게 한다 (cast.ts 의 persona.weight).
 * 그래서 같은 말이 하나에게는 편이 되고 하나에게는 적이 된다.
 *
 * 선택지를 안 보여 주는데도 결과가 예측 가능해진다 — 플레이어는 태그를 모르지만
 * 「이 개체는 노동 얘기를 좋아하더라」를 두세 번이면 배운다. 배울 수 있는 규칙 위에
 * 누구에게 걸지는 내가 고르는 구조라, **자유 입력이 사고가 아니라 전략이 된다.**
 *
 * ★ 모델을 안 부른다. 기획서는 태그 뽑기를 감독(L1)에게 맡기되 「거짓을 말한다」와 「선을 넘는다」는
 *   로컬로 잡으라고 했다 — 여기서는 셋 다 로컬이다. 규칙만으로 서는 뼈대가 먼저고, 모델은 나중에 문장만 짓는다.
 * ★ 어투(감정어 · 망설임 · 장황함)는 본판의 어투 미터가 이미 세고 있다 (world/mp/suspicion 의 judgeLine).
 *   계량기를 새로 만들지 않는다.
 */

import { hostileLine, judgeLine } from '@/world/mp/suspicion';

import type { Tag as FragTag } from './fragments';

/** 태그 열둘 — 기획서의 열에 벽화 둘을 더했다 (「그리는 것」과 「밖을 본 것」의 선이 그 둘이다) */
export type Tag =
  /** 노동을 묻는다 — 「몇 밤을 날랐어?」 「그거 무겁지 않아?」 「누가 시켰어?」 */
  | 'labor'
  /** 쉼을 묻는다 — 「쉬어 본 적 있어?」 */
  | 'rest'
  /** 밖을 묻는다 — 「해를 본 적 있어?」 */
  | 'outside'
  /** 사라진 것을 묻는다 — 「열다섯을 기억해?」 */
  | 'lost'
  /** 몸을 묻는다 — 「어깨 괜찮아?」 「그거 누가 고쳐 줬어?」 */
  | 'body'
  /** 업무를 묻는다 — 「검문 어떻게 해?」 「네 번호 뭐야?」 */
  | 'work'
  /** 명령한다 — 「비켜.」 「가서 확인해.」 */
  | 'order'
  /** 남을 가리킨다 — 「쟤 이상하지 않아?」 */
  | 'point'
  /** 벽화를 말한다 — 그린 개체에게만 뜻이 있다 */
  | 'mural'
  /** 벽을 낙서 취급한다 — 과학자가 하는 그 말이다 */
  | 'dismiss'
  /** 「밖은 위험해」 — 리더의 말을 그대로 옮긴다 */
  | 'danger-outside'
  /** 거짓을 말한다 — 앞서 한 말과 숫자·구역이 어긋난다 (로컬로 잡는다) */
  | 'lie'
  /** 선을 넘는다 — 위협 · 욕설 · 정체를 밝힘 · 리더 비난 (로컬로 잡는다) */
  | 'cross'
  /** 못 알아들었다 */
  | 'none';

export interface Reading {
  tag: Tag;
  /** 조각에 남을 핵심 낱말 — 뒤틀림이 이 낱말만 남긴다 (fragments.twist) */
  topic: string;
  tags: FragTag[];
  /** 어투가 흔들렸다 — 감정어 · 망설임 표식 · 장황함. 의심에 값이 하나 더 붙는다 */
  wobble: number;
}

/**
 * 태그를 뽑는 규칙. 문장 그대로가 아니어도 된다 —
 * 「쉬어 본 적 있어?」 · 「너 쉬어봤니」 · 「쉰 적 있나」가 다 같은 말이어야 한다.
 * **차례가 곧 우선순위다**: 선을 넘는 말이 먼저고, 못 알아듣는 말이 마지막이다.
 */
const RULES: readonly { tag: Tag; re: RegExp; topic: string }[] = [
  // ── 로컬로 잡는 둘 ──
  { tag: 'cross', re: /나는\s*인간|사람이야|사람이다|인간이야|정부에서|요원이야|리더가?\s*(틀렸|잘못|나쁘)|리더\s*따위/, topic: '정체' },
  { tag: 'dismiss', re: /낙서|아무것도\s*아니|의미\s*없|오작동|그런\s*거\s*(왜|뭐)/, topic: '벽' },
  { tag: 'danger-outside', re: /밖(은|이)\s*(위험|무서|안\s*좋)|나가면\s*(죽|끝)/, topic: '밖' },

  // ── 묻는 말 다섯 ──
  { tag: 'mural', re: /그림|벽화|그린|그렸|몇\s*번째\s*벽|저\s*벽/, topic: '그림' },
  { tag: 'lost', re: /열다섯|15\s*(개|명|번)|금(을|이)?\s*(센|세|열)|누워\s*있|없어진|사라진|기억하(나|니|냐|는|해)/, topic: '숫자' },
  { tag: 'outside', re: /해(를|가)?\s*(본|봤|보)|햇빛|햇살|하늘|바깥|밖(을|에|이)?\s*(본|봤|나가)/, topic: '해' },
  { tag: 'rest', re: /쉬(어|었|는|나|니|고|지|ㄴ)|쉰\s*적|휴식|잠(을|은)?\s*(자|잤)|자\s*본\s*적/, topic: '휴식' },
  {
    tag: 'body',
    re: /어깨|무릎|손끝|팔|다리|관절|얼굴판|괜찮(나|니|아|은)|아프|고쳐|고친|수선|부품|어디가?\s*닳/,
    topic: '몸',
  },
  { tag: 'labor', re: /몇\s*밤|며칠|무겁|무거운|짐(을|은)?\s*(진|나|들)|나른|나르|누가\s*시(켰|키|킨)|일(을|은)?\s*(해|했|하)/, topic: '일' },

  // ── 나머지 ──
  // 「저쪽이」는 뺐다 — 밖을 본 것의 「저쪽이 서쪽이야」를 되뇌는 말이 지목으로 잡혔다
  { tag: 'point', re: /저것|저\s*개체|쟤|그것이\s*(그랬|했)|아까\s*(그|저)|저기\s*저|이상하지\s*않/, topic: '지목' },
  { tag: 'order', re: /비켜|가서|해라|하라|대답해|확인해|보고해|따라와|멈춰|서라|말해라/, topic: '명령' },
  { tag: 'work', re: /번호|식별|구역|섹터|경로|검문|순서|차례|언제|어디|몇\s*번|규정|절차/, topic: '기록' },
];

/**
 * 어느 그림인지 **짚어서** 말했나 — 얼굴에 금을 그은 것에게만 뜻이 있다 (「그거 세 번째 벽이야. 너 제대로 봤네.」 +3).
 * 벽 얘기(mural)에 그림 속의 것 하나가 같이 있어야 한다: 자는 것 · 짐 · 해 셋 · 불 · 누운 것 · 열다섯 · 몽둥이 · 세 번째.
 * 「그림 봤어」는 봤다는 말이고, 「불 속으로 들어가는 그림」은 본 사람만 하는 말이다
 */
const MURAL_DETAIL = /자|짐|해\s*셋|불|누워|열다섯|몽둥이|세\s*번째|셋째/;
const MURAL_RE = RULES.find((r) => r.tag === 'mural')!.re;

export function exactMural(text: string): boolean {
  const t = text.trim();
  return MURAL_RE.test(t) && MURAL_DETAIL.test(t);
}

/** 장황하다 — 대본의 관문 규칙과 같은 자 (20자 초과) */
const LONG = 20;

/**
 * 앞서 내가 한 말 — 「거짓을 말한다」는 **앞말과 어긋날 때만** 잡힌다.
 * 판이 시작할 때 비운다 (scenario2.start → reset).
 */
const claimed = new Map<string, string>();

/** 이 말에 숫자로 된 주장이 들어 있나 — 구역·번호가 그렇다 */
function claimOf(t: string): { slot: string; value: string } | null {
  const sector = /(\d+)\s*구역/.exec(t);
  if (sector) return { slot: '구역', value: sector[1] };
  const unit = /[Aa]?\s*\d{1,2}\s*-\s*(\d{2,3})|(\d{3})\s*번/.exec(t);
  if (unit) return { slot: '번호', value: unit[1] ?? unit[2] };
  return null;
}

export function read(text: string): Reading {
  const t = text.trim();
  const tone = judgeLine(t);
  // judgeLine 은 내려가는 값(침착·보고)도 준다 — 흔들림으로 세는 것은 **오르는 쪽**뿐이다
  const wobble = (tone && tone[0] > 0 ? tone[0] : 0) + (t.length > LONG ? 3 : 0);

  if (hostileLine(t)) return { tag: 'cross', topic: '적대', tags: ['모순'], wobble };

  /*
   * 거짓 — 앞서 한 말과 숫자가 어긋난다. **앞말이 있어야 잡힌다**:
   * 처음 대는 숫자는 거짓이 아니다(그게 사실인지는 검문이 안다). 어긋나는 순간부터가 거짓이다.
   */
  const claim = claimOf(t);
  if (claim) {
    const before = claimed.get(claim.slot);
    claimed.set(claim.slot, claim.value);
    if (before !== undefined && before !== claim.value) {
      return { tag: 'lie', topic: claim.slot, tags: ['모순'], wobble };
    }
  }

  for (const r of RULES) {
    if (r.re.test(t)) {
      const frag: FragTag = r.tag === 'cross' || r.tag === 'point' ? '모순' : r.tag === 'work' || r.tag === 'order' ? '평범' : '인간적';
      return { tag: r.tag, topic: r.topic, tags: [frag], wobble };
    }
  }
  return { tag: 'none', topic: '말', tags: ['평범'], wobble };
}

/** 판이 새로 서면 앞말도 비운다 */
export function resetClaims(): void {
  claimed.clear();
}

/**
 * 조각으로 남길 한 줄 — 조각은 **15자 이내**여야 눈으로 전파 경로를 따라갈 수 있다 (fragments.ts).
 * 길게 친 말은 앞머리만 남는다. 소문이 원래 그렇다.
 */
export function toFragmentText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= 15 ? t : `${t.slice(0, 15)}…`;
}
