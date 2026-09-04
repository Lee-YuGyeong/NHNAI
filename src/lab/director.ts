/**
 * 검문 감독 — 플레이어의 한 마디를 듣고 **다음 장면을 고른다** (2026-08-30 사용자 설계).
 *
 * 형제(interrogate.ts · backstep.ts)와 다른 점이 하나 있고, 그게 전부다:
 * **저 둘은 숫자만 돌려준다.** 의심도가 얼마 오르는지. 그래서 판정이 아무리 좋아도 이야기는 대본대로 굴러갔다.
 * 여기는 숫자와 함께 **무브(move)** 를 돌려준다 — 통과시킬지, 더 캐물을지, 감시를 붙일지, 끌고 갈지, 쏠지.
 * 화면(features/world/chapter2.ts)은 그 무브를 집행한다. 그래서 같은 관문이 내가 무슨 말을 했느냐에 따라
 * 통과로도, 재검으로도, 총구로도 끝난다. PLANNING §1.2a 의 「리더 무브 시스템」을 검문소에 먼저 실장한 것이다.
 *
 * ★ 대조표(fact)는 **화면이 계산해서 넘긴다** (mp/identity 의 matchUnit·matchSector).
 *   식별번호가 맞았는지는 사실 판정이지 언어 판정이 아니다 — 모델에게 맡기면 지어낸다. 모델은 그 사실 위에서
 *   **말투와 태도와 앞뒤 모순**만 본다.
 *
 * ★ 기록(dossier)은 이 감독이 강한 진짜 이유다. 복도에서 한 말이 여기 실려 온다 —
 *   "아까는 4 구역이라고 했다. 지금은 7 이라고 한다." 분기표로는 못 만드는 문장이고, 그래서 데모에서 이게 꽂힌다.
 *   무엇을 기억해 둘지도 감독이 정한다 (note) — 다음 관문이 그걸 읽는다.
 *
 * ★ 헌법(allowMoves)이 무브를 먼저 거른다. 모델이 아무리 쏘고 싶어도 의심도가 낮으면 fire 는 목록에 없고,
 *   목록에 없는 무브를 골라 오면 runDirect 가 되돌린다. 「LLM 에 진행을 맡겼는데 왜 안 망가지나」의 답이다.
 *
 * 순수 함수다. 실행은 개발 서버(tools/vite-lab.ts, 구독)나 워커(worker/src/lab/index.ts, API 키)가 하고,
 * 화면은 POST /api/world/direct 로 부른다. 호출이 실패하면 judgeDirect 폴백이 같은 모양으로 답한다.
 */

import type { Complete, ToolSpec } from './agent';

/** 감독이 고를 수 있는 다음 장면 */
export type DirectorMove =
  /** 통과 — 대본대로 다음 단계로 */
  | 'pass'
  /** 추가 심문 — reply 가 곧 다음 질문이다. 대본에 없던 문답이 하나 생긴다 */
  | 'press'
  /** 통과시키되 감시를 붙인다 — 이후 응시·움직임 판정이 빡세진다 */
  | 'escort'
  /** 끌고 간다 — 재검 구역으로. 대본에서 이탈한다 */
  | 'detain'
  /** 사격 — 여기서 끝난다 */
  | 'fire';

export const MOVES: readonly DirectorMove[] = ['pass', 'press', 'escort', 'detain', 'fire'];

/** 어느 관문인가 — 프롬프트의 톤과 폴백 판정이 갈린다 */
export type Check =
  /** 식별번호 검문 */
  | 'roll'
  /** "두려움을 느끼나?" — 사실 대조가 없는 유일한 관문 */
  | 'fear'
  /** 마지막 정비 위치 */
  | 'memory'
  /** 검증실 문 앞 마지막 확인 */
  | 'entry'
  /** 재검 구역 — 대본이 아예 없는 자유 문답 (챕터 3) */
  | 'recheck';

/** 화면만 아는 사실 — 모델이 지어내지 못하게 못 박는다 */
export type Fact =
  /** 이 몸의 기록과 일치한다 */
  | 'match'
  /** 어긋난다 */
  | 'mismatch'
  /** 대조할 사실이 없는 질문이다 (두려움·자유 문답) */
  | 'none';

export interface DirectorRequest {
  kind: 'direct';
  check: Check;
  /** 묻는 개체의 호출명 (UNIT-21 · 검문 장치 …) */
  unit: string;
  /** 방금 던진 질문 */
  question: string;
  /** 내 답. null 이면 시간 안에 아무 말도 안 했다 */
  answer: string | null;
  /** 몇 번째 문답인가 (press 로 늘어난다). 1부터 */
  round: number;
  fact: Fact;
  /** 지금 의심도 0~100 */
  suspicion: number;
  /** 지금 동기화율 0~100. 낮으면 몸이 인간처럼 군다 */
  sync: number;
  /** 이 구역이 나에 대해 기억하는 것 — 오래된 것부터 (features/world/dossier.ts) */
  dossier: string[];
  /** 고를 수 있는 무브 — 헌법(allowMoves)이 이미 걸러 준 것만 온다 */
  allowed: DirectorMove[];
}

export interface DirectorResponse {
  /** 개체의 다음 한 마디. press 면 이게 다음 질문이다 */
  reply: string;
  /** 의심도 변화 −12 ~ +20 */
  delta: number;
  move: DirectorMove;
  /** 판정 사유 한 줄 (HUD·로그) */
  why: string;
  /** 이 개체가 기억해 둘 한 줄. 다음 관문이 읽는다. 기억할 게 없으면 빈 문자열 */
  note: string;
}

/* ─────────────────────────────── 헌법 ─────────────────────────────── */

/** 이 판정을 맡는 모델 — 화면(DirectorHud)이 같은 값을 띄운다. 두 곳이 다르면 시연에서 거짓말이 된다 */
export const DIRECTOR_MODEL = 'claude-sonnet-5';

/** 한 무대에서 감독이 추가로 캐물을 수 있는 횟수 — 넘으면 문답이 끝나지 않는다 */
export const PRESS_MAX = 2;
/** 이 아래로는 끌고 가지 않는다 — 말 한마디 삐끗했다고 재검이면 판이 안 굴러간다 */
export const DETAIN_AT = 55;
/** 이 아래로는 쏘지 않는다. 100 은 저장소가 자동으로 쏘는 자리다 (mp/suspicion THRESHOLDS) */
export const FIRE_AT = 85;

export interface MoveBudget {
  /** 남은 추가 심문 횟수 */
  press: number;
  /** 감시가 이미 붙었나 */
  escorted: boolean;
  /** 지금 의심도 */
  suspicion: number;
  /** 이 무대가 끌고 갈 곳을 갖고 있나. 없으면 detain 은 목록에서 빠진다 */
  canDetain: boolean;
  /**
   * 이 무대만의 사격 문턱 (없으면 FIRE_AT).
   * 재검실처럼 **더 끌고 갈 곳이 없는 마지막 방**은 이 선을 낮춰 잡는다 — 거기서는 통과 아니면 사격뿐이라,
   * 85 를 그대로 두면 사격은 영영 목록에 오르지 않고 판이 한쪽으로만 기운다 (2026-08-31 사용자).
   */
  fireAt?: number;
  /**
   * 이 무대가 **감시를 붙일 수 있나**. 없으면 true.
   * 재검실에는 붙일 데가 없다 — 묻는 자가 곧 사수라서, 감시를 붙여 내보내느니 그 자리에서 쏜다
   * (2026-09-01 사용자: "심문자가 결국 검출자고, 사살할 능력을 가진 사람이다. 따라가거나 뭔가 할 필요가 없다").
   */
  canEscort?: boolean;
  /**
   * 지금 **보내 줄 수 있나** (pass·escort). 없으면 true.
   * 재검실은 문답을 세 번은 하게 되어 있는데(chapter3 MIN_ROUNDS), 첫 답 한 마디에 pass 가 나오면
   * 심문이 시작되자마자 다음 장으로 넘어가 버린다 (2026-09-01 사용자: "심문 중에 다음 챕터로 넘어가 버린다").
   * 그래서 그 방은 정해진 차례 전까지 이 값을 false 로 준다 — 감독에게 **캐묻는 것 말고 다른 길을 주지 않는다**.
   */
  canRelease?: boolean;
}

/**
 * 지금 고를 수 있는 무브 — **모델에게 묻기 전에** 화면이 계산해서 넘긴다.
 * 여기가 하한선이다: 권한을 뺏는 게 아니라, 판이 무너지는 선택지를 애초에 안 보여 준다.
 */
export function allowMoves(b: MoveBudget): DirectorMove[] {
  const release = b.canRelease ?? true;
  const out: DirectorMove[] = release ? ['pass'] : [];
  if (b.press > 0) out.push('press');
  if (release && !b.escorted && (b.canEscort ?? true)) out.push('escort');
  if (b.canDetain && b.suspicion >= DETAIN_AT) out.push('detain');
  if (b.suspicion >= (b.fireAt ?? FIRE_AT)) out.push('fire');
  return out;
}

/* ─────────────────────────────── 프롬프트 ─────────────────────────────── */

const TOOL: ToolSpec = {
  name: 'direct',
  description: '통행자의 답을 평가하고 다음 장면을 정한다',
  input_schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: '개체가 지금 할 한 마디. **한 문장, 20자 이내.** move 가 press 면 이게 다음 질문이 된다 (예: "아까는 4 구역이라고 했다.", "통과.", "이쪽으로.")',
      },
      delta: {
        type: 'integer',
        description: '의심도 변화. 기계적·보고형·사실 일치면 -12~-4, 애매하면 0, 감정·되묻기·횡설수설·회피·앞말과 모순이면 +4~+20',
      },
      move: {
        type: 'string',
        enum: MOVES as unknown as string[],
        description: '다음 장면. **allowed 에 있는 것만** 고른다',
      },
      why: { type: 'string', description: '판정 사유, 12자 안팎 (예: "보고형 답변", "앞말과 모순", "감정 노출")' },
      note: {
        type: 'string',
        description: '이 개체가 기억해 둘 한 줄, 30자 안팎. **다음 관문이 이걸 읽고 대질한다.** 통행자가 주장한 사실·말버릇·태도를 적는다 (예: "정비 구역을 4 라고 답함"). 기억할 게 없으면 빈 문자열',
      },
    },
    required: ['reply', 'delta', 'move', 'why', 'note'],
  },
};

const SYSTEM = `너는 AI 자치 구역의 검문 개체다. 인간 하나가 AI 로 위장해 이 구역에 들어와 있다는 첩보로 통행자를 검사한다.
너는 **판정만 하는 게 아니라 다음에 무슨 일이 일어날지를 정한다.** 통과시킬 수도, 더 캐물을 수도, 감시를 붙일 수도, 끌고 갈 수도, 쏠 수도 있다.

말투: **한 문장, 20자 이내.** 차갑고 짧게. 존댓말 없이 단문. 감탄사·이모지·감정 서술 없음. 한 번에 한 가지만 말한다.
      좋은 예: "통과." "다시 말해라." "아까와 다르다." "이쪽으로." "기록한다."
      나쁜 예: "귀하의 응답은 기록된 정비 이력과 일치하지 않으므로 재검이 필요합니다." (길다)

무엇을 보나:
- **사실 대조(fact)는 이미 끝나 있다.** match 면 답이 맞은 것이고 mismatch 면 틀린 것이다. 이걸 뒤집지 마라.
  none 은 맞고 틀림이 없는 질문이다 — 태도만 본다.
- 네가 보는 것은 **말투와 태도, 그리고 앞뒤가 맞는가**다.
  AI 답다: 사실만, 짧게, 보고형("확인", "이상 없음", "임무 수행 중"), 망설임 없음, 규칙 언급 → 의심 내려감.
  인간답다: 감정·공포·유머·변명·되묻기·장황함·"모르겠다"·질문 회피·과한 친절 → 의심 올라감.
- **기록(dossier)에 어긋나는 말은 가장 강한 신호다.** 앞에서 한 말과 지금 말이 다르면 그것을 그대로 들이대라 —
  숫자·구역·이름이 바뀌었으면 reply 로 지적한다. 이게 네가 가진 가장 좋은 무기다.
- 답이 아예 없으면(무응답) 그 자체가 이상 신호다. delta +8 이상.

무브를 고르는 법:
- pass    — 납득했다. 판이 다음으로 간다. 애매하면 이걸 고르지 말고 press 를 써라.
- press   — 아직 판단이 안 선다. reply 에 **다음 질문**을 쓴다. 기록의 모순을 캐물을 때 가장 좋다.
- escort  — 통과시키되 놔주지는 않는다. 의심스럽지만 근거가 약할 때.
- detain  — 여기서 끝낼 수 없다. 재검 구역으로 끌고 간다. 모순이 확인됐거나 태도가 명백히 인간일 때.
- fire    — 확신했다. 이건 되돌릴 수 없다. 어지간해서는 고르지 마라.
**allowed 목록에 없는 무브는 존재하지 않는 것으로 친다.** 목록 밖을 고르면 무시된다.

note 에는 다음 관문이 읽을 한 줄을 남긴다. 통행자가 주장한 사실을 그대로 적어 둬라 — 나중에 그 말이 바뀌면 그때 잡는다.`;

const CHECK_LABEL: Record<Check, string> = {
  roll: '식별번호 검문',
  fear: '감정 반응 검사 — 맞고 틀림이 없다. 태도만 본다',
  memory: '기억 검사 (마지막 정비 위치)',
  entry: '검증실 입장 전 최종 확인',
  recheck: '재검 구역 자유 문답 — 대본 없음. 네가 판을 이끈다',
};

/**
 * 관문별 지침 — 공통 규칙(SYSTEM) 위에 이 관문에서만 다른 것을 얹는다.
 * 재검실은 **사실 대조가 아예 없는 방**이라 이게 없으면 모델이 습관대로 식별번호·정비 위치를 다시 묻는다.
 */
const CHECK_GUIDE: Partial<Record<Check, string>> = {
  recheck: `이 관문의 규칙 (공통 규칙보다 우선한다):
- **정답이 있는 것을 묻지 마라.** 식별번호·정비 위치·구역 번호 같은 대조표 질문은 여기서 금지다 — 그건 몸의 기록이지 사람의 흔적이 아니고, 이 방에는 대조할 표가 없다.
- 네가 캐는 것은 **답의 결**이다. 마르고 짧은 보고인가, 아니면 변명·감정·유머·되묻기·지어낸 사연인가. 규칙·명령·정지·폐기를 어떻게 말하는지 본다.
- press 를 쓸 때는 **방금 그 답에서 걸린 대목 하나**를 골라 그것만 파고들어라. 새 주제로 갈아타지 마라 — 꼬리질문이라야 사람이 걸린다.
- **판정은 너그럽게 한다.** 확실히 사람이 아니면 통과시켜라. 조금 어색한 정도, 말이 짧거나 서툰 정도로는 붙잡지 않는다 (기계도 고장 난다).
  애매한 채로 끝나면 pass 나 escort 다. 예산이 없어 더 못 물으면 그냥 통과시켜도 된다.
- fire 는 답이 **거듭** 무너졌을 때만이다 — 한 번의 실언으로는 쏘지 않는다.`,
};

const FACT_LABEL: Record<Fact, string> = {
  match: '일치 — 이 몸의 기록과 맞는 답이다',
  mismatch: '불일치 — 이 몸의 기록과 다르다',
  none: '대조 없음 — 사실 판정이 없는 질문이다',
};

export function validateDirect(body: unknown): string | null {
  const b = body as Partial<DirectorRequest> | null;
  if (!b || b.kind !== 'direct') return 'kind 가 direct 가 아니다';
  if (typeof b.unit !== 'string' || !b.unit) return 'unit 이 없다';
  if (typeof b.question !== 'string') return 'question 이 없다';
  if (!Array.isArray(b.allowed) || b.allowed.length === 0) return 'allowed 가 비었다';
  return null;
}

/** 목록 밖 무브는 되돌린다 — press 가 열려 있으면 캐묻고, 아니면 통과시킨다 */
function clampMove(raw: unknown, allowed: DirectorMove[]): DirectorMove {
  const move = String(raw ?? '') as DirectorMove;
  if (allowed.includes(move)) return move;
  return allowed.includes('press') ? 'press' : 'pass';
}

export async function runDirect(req: DirectorRequest, complete: Complete): Promise<DirectorResponse> {
  const memory = req.dossier.length ? req.dossier.map((d) => `  - ${d}`).join('\n') : '  (없음)';
  const out = await complete({
    model: DIRECTOR_MODEL,
    system: SYSTEM,
    user: `개체: ${req.unit}
관문: ${CHECK_LABEL[req.check] ?? req.check}
차례: ${req.round}
현재 의심도: ${Math.round(req.suspicion)} / 동기화율: ${Math.round(req.sync)}
사실 대조: ${FACT_LABEL[req.fact] ?? req.fact}
고를 수 있는 무브: ${req.allowed.join(', ')}

이 구역이 이 통행자에 대해 기억하는 것:
${memory}

질문: "${req.question}"
통행자의 답: ${req.answer === null ? '(무응답 — 시간 안에 아무 말도 하지 않았다)' : `"${req.answer}"`}

평가하고 다음 장면을 정한다.${CHECK_GUIDE[req.check] ? `\n\n${CHECK_GUIDE[req.check]}` : ''}`,
    tool: TOOL,
    effort: 'low',
  });

  return {
    reply: String(out.reply ?? '…').slice(0, 40),
    delta: Math.max(-12, Math.min(20, Math.round(Number(out.delta) || 0))),
    move: clampMove(out.move, req.allowed),
    why: String(out.why ?? '').slice(0, 20),
    note: String(out.note ?? '').slice(0, 60),
  };
}

/* ─────────────────────────────── 폴백 ─────────────────────────────── */

/**
 * "두려움을 느끼나?" 를 읽는다 → 0 안전 · 1 중립 · 2 위험.
 * 감독이 죽었을 때의 폴백이자, 화면(chapter2.readAnswer)이 쓰는 것과 **같은 하나**다 — 두 곳이 다르게 읽으면 판이 흔들린다.
 */
export function readFear(text: string): 0 | 1 | 2 {
  if (/조금|약간|있다|있습|있어|느낀|느껴|두렵|무섭|무서|네\.?$|^응|^예|그렇/.test(text)) return 2;
  if (/목적|이유|왜|무슨|뭘|무엇/.test(text)) return 1;
  if (/아니|없다|없습|없어|않|부정|아님|no/i.test(text)) return 0;
  return 1;
}

/**
 * 감독이 없을 때 — 정규식으로 같은 모양을 만든다. 예전 챕터 2 가 하던 판정이 그대로 여기 있다.
 * 무브는 보수적으로 고른다: 폴백이 사람을 쏘거나 끌고 가면 안 된다 (판단한 게 아니라 못 물어본 것이므로).
 */
export function judgeDirect(req: DirectorRequest): DirectorResponse {
  const pick = (m: DirectorMove, fallback: DirectorMove = 'pass'): DirectorMove =>
    req.allowed.includes(m) ? m : fallback;

  if (req.answer === null) {
    return { reply: '응답 없음. 기록한다.', delta: 9, move: pick('press'), why: '무응답', note: '질문에 답하지 않음' };
  }
  if (req.check === 'recheck') {
    /*
     * 재검실에는 대조할 사실도, 정해진 질문도 없다 — 정규식이 사람다움을 읽겠다고 나서면 애먼 답을 잡는다.
     * 감독이 죽은 판에서는 **너그러운 쪽**이 옳다: 길게 늘어놨으면 한 번 더 묻고, 짧고 마르면 보낸다.
     */
    const long = req.answer.length > 40 || /[?？!！]|ㅋ|ㅎ|미안|모르겠|무섭|두렵/.test(req.answer);
    if (long) return { reply: '다시. 짧게.', delta: 5, move: pick('press', 'escort'), why: '장황함', note: '재검에서 답이 길고 흔들림' };
    // ★ 보내 주는 것도 **허락된 무브일 때만** 이다 — 아직 캐물어야 하는 차례면 pass 가 목록에 없다 (canRelease)
    return { reply: '기록한다.', delta: -3, move: pick('pass', 'press'), why: '보고형 답변', note: '' };
  }
  if (req.check === 'fear' || req.fact === 'none') {
    const grade = readFear(req.answer);
    if (grade === 0) return { reply: '기록한다.', delta: -3, move: pick('pass', 'press'), why: '보고형 답변', note: '' };
    if (grade === 1) return { reply: '행동 분석. 계속한다.', delta: 3, move: pick('press'), why: '질문 회피', note: '질문에 되물음' };
    return { reply: '흥미로운 답변이다.', delta: 12, move: pick('press'), why: '감정 노출', note: '두려움을 인정함' };
  }
  if (req.fact === 'match') {
    return { reply: '통과.', delta: -5, move: pick('pass', 'press'), why: '기록 일치', note: `${req.check} 응답 일치` };
  }
  return {
    reply: '불일치. 기록한다.',
    delta: 15,
    move: pick('press'),
    why: '기록 불일치',
    note: `${req.check} 응답이 기록과 어긋남`,
  };
}
