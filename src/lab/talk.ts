/**
 * 대화 방 — 규정도 검사도 없이 **말하기와 색출만** 남긴 모드.
 *
 * 페르소나를 만들고 바로 확인하려고 만든 판이다. 개체는 한 번에 하나씩,
 * **앞사람 발화를 보고** 말한다 (일괄 공개가 아니다) — 그래야 대화가 이어지고 말투가 드러난다.
 *
 * 여기에도 정체는 안 들어간다. 에이전트가 받는 것은 노드 이름과 발화 로그뿐이다.
 */

import type { Complete, ToolSpec } from './agent';
import { eunNeun, iGa } from './josa';
import { LEADER_NAME, type CallStyle } from './personas';

export interface TalkLine {
  nodeId: string;
  text: string;
}

export interface TalkSelf {
  id: string;
  /** personas.ts 의 prompt 본문 — 화면에서 수정한 것이 그대로 온다 */
  prompt: string;
  model: string;
  isLeader: boolean;
  /**
   * 남을 부르는 버릇 — 이름표 그대로("013아")냐 앞의 0 을 떼고("13아")냐.
   * 성격과 함께 매판 배정된다 (personas.sampleCallStyle). 없으면 둘 다 되는 것으로 둔다.
   */
  calls?: CallStyle;
}

export interface DeadRecord {
  name: string;
  /** 폐기된 뒤 정체는 전원에게 공개된다 */
  wasHuman: boolean;
}

export interface TalkRequest {
  kind: 'say' | 'suspect';
  self: TalkSelf;
  /** 아직 살아 있는 사람 이름 전부 */
  nodes: string[];
  log: TalkLine[];
  /** 새 화제를 던져야 하는 상황인가 (라운드의 첫 발화) */
  needTopic?: boolean;
  /** 말문을 열 얘깃거리 — OPENERS(잡담)·HUNT_OPENERS(지시 뒤)에서 화면이 뽑아 준다. 매판 첫 대화가 달라지게 */
  topicHint?: string;
  /**
   * 방금 방에 떨어진 **리더의 지시** — 첫 발화가 받아야 할 말이다 (검증실이 열릴 때의 「표지 없는 AI를 찾아내라」).
   *
   * 이게 있으면 말문 여는 방식이 통째로 바뀐다: 잡담이 아니라 **지시에 대한 응답**으로 연다.
   * 지시를 듣고 들어온 방인데 개체들이 날씨 얘기부터 하면 앞 장면과 이어지지 않는다
   * (사용자 2026-09-01: "그 방송에 이어지게 AI 찾아내는 스토리로 말 시작하게").
   * 얘깃거리(topicHint)는 그대로 쓴다 — 그쪽은 **어디서부터 시작할지**를 정한다.
   */
  order?: string;
  /**
   * **이 방이 방금 열렸다** — 이야기를 지나 들어왔을 때만 (features/arena/handover 의 roomArrival).
   *
   * order 가 「무슨 지시를 받았나」라면 이쪽은 「여기 오기까지 무슨 일이 있었나」다. 여태 그 자리를
   * ARRIVAL_OPENERS 한 줄이 대신했는데, 그건 첫 발화에 던지는 **얘깃거리 힌트**일 뿐이라
   * 개체들이 앞 장을 아는 것이 아니었다: 서류에는 줄에서 먼저 들어간 번호가 적혀 있는데
   * (handover 의 peers — 그 번호가 지금 이 방의 이름표다) 방은 그걸 모른 채로 "먼저 들어온 쪽이
   * 뭘 봤는지" 를 물었다. 물어 놓고 아무도 답할 수 없는 질문이다.
   *
   * ★ **이관된 개체의 이름은 안 들어간다.** 서류에 적힌 내 번호를 여기 실으면 방이 첫 마디에
   *   나를 부른다 — 「방금 재검 갔다 온 A38-091, 너부터」. 그건 판이 아니라 답을 알려 주고 시작하는 것이다.
   *   방이 아는 것은 **문이 열렸다는 사실**까지고, 누가 들어왔는지는 여기서도 모른다.
   */
  arrival?: {
    /** 줄에서 먼저 통과해 이 방에 서 있는 번호 — 실제 이름표라 이름으로 불러도 된다 */
    peers: string[];
    /** 조금 전 이관된 개체가 재검에서 받은 판정 (누구인지는 안 알려 준다) */
    verdict: 'pass' | 'fire' | null;
  };
  /** 방금 호명됐는데 대답 없이 조용한 사람의 이름 — 침묵을 짚거나 화제를 가져가라는 신호 */
  stalled?: string;
  /** 지금까지 폐기된 사람들 */
  dead?: DeadRecord[];
  /**
   * **방금** 폐기된 개체와 리더가 공개한 조사 결과 — 이 사실이 조금 전 방에 떨어졌다는 뜻이다.
   * dead 는 "지금까지 이런 일이 있었다"는 배경이고, 이쪽은 **지금 이 발화가 반응해야 할 사건**이다.
   * 그래서 폐기 직후 몇 마디에만 실린다 (화면이 세어서 끊는다).
   */
  justDied?: DeadRecord;
  /** 지금 누가 누구 쪽으로 기울었는지 — 전원이 보는 공개 정보 */
  leanings?: Record<string, string>;
  /** 시행(몸 검사)이 쌓은 의심도 0~100 — 관리 개체가 매긴 공개 수치. 100 이면 그 자리에서 폐기된다 */
  suspicion?: Record<string, number>;
  /** 시행 기록 한 줄 요약들 — 전원이 지켜본 공개 사실. 어긋난 몸의 기록을 대화에서 인용하는 데 쓴다 */
  trials?: string[];
  /** 표가 한 사람에게 몰렸을 때, 누구에게 누가 몰았는지 — 해명 차례를 만든다 */
  heat?: Heat;
  /** 이번 라운드에 표심이 움직인 자취 ("민재: 세영 → 하늘", "지우: 하늘 → 접음") */
  shifts?: string[];
  /** 누가 얼마나 오래 말이 없는지 — 조용한 사람을 불러 끌어들이라고 알려 주는 것. turns 는 내부 척도일 뿐, 프롬프트에는 말로 옮겨 나간다 */
  quiet?: { id: string; turns: number }[];
  /** 호명당하고도 대답 없이 넘긴 횟수. **이것만이 침묵을 근거로 쓸 수 있는 형태다** */
  ignored?: Record<string, number>;
  /** 연달아 두 번 넘어갔다 — 이번 차례는 넘기지 못한다 (판이 멎지 않게) */
  mustSpeak?: boolean;
  /** 몇 번째 라운드인가 */
  round?: number;
}

/**
 * 표심이 한 사람에게 몰린 상태.
 *
 * 이게 있어야 **의심이 풀릴 자리**가 생긴다 — 몰린 사람이 말할 차례를 못 잡으면
 * 해명도 못 하고, 해명이 없으면 아무도 의심을 접을 이유가 없다.
 * (표가 2 대 2 로 갈렸으면 몰이가 아니다 — null 을 돌려 해명 차례를 안 만든다)
 */
export interface Heat {
  id: string;
  by: string[];
}

/** 표심이 한 사람에게 이만큼 모이면 몰이로 친다 */
export const HEAT_MIN = 2;

/** 살아 있는 표만 추려 표적별로 묶는다 — heatOf·mobsOf 가 같은 셈을 본다 */
function tally(leanings: Record<string, string>, alive: string[]): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const [voter, target] of Object.entries(leanings)) {
    if (!target || !alive.includes(target) || !alive.includes(voter)) continue;
    by.set(target, [...(by.get(target) ?? []), voter]);
  }
  return by;
}

export function heatOf(leanings: Record<string, string>, alive: string[], min = HEAT_MIN): Heat | null {
  let top: Heat | null = null;
  let tied = false;
  for (const [id, voters] of tally(leanings, alive)) {
    if (voters.length < min) continue;
    if (!top || voters.length > top.by.length) {
      top = { id, by: voters };
      tied = false;
    } else if (voters.length === top.by.length) tied = true;
  }
  return tied ? null : top;
}

/**
 * 표가 몰린 **모든** 표적. heatOf 는 해명 차례를 만드는 함수라 한 명만 돌려주고 동수면 null 이지만,
 * **의심도를 태우는 쪽은 갈린 판에서도 타야 한다** (2026-08-31 사용자: 세 판을 돌렸는데 한 명도 안 죽었다).
 * 방이 둘로 갈려 2 대 2 로 물고 늘어지면 둘 다 탄다 — 갈렸다는 이유로 아무도 안 타면 판이 영영 안 끝난다.
 */
export function mobsOf(leanings: Record<string, string>, alive: string[], min = HEAT_MIN): Heat[] {
  return [...tally(leanings, alive)]
    .filter(([, voters]) => voters.length >= min)
    .map(([id, voters]) => ({ id, by: voters }));
}

/**
 * 그 사람이 마지막으로 말한 뒤 몇 턴이 지났나. 한 번도 말 안 했으면 지금까지의 전체 턴 수.
 *
 * 넘김(pass)은 로그에 안 남으므로 여기 안 잡힌다 — 그래서 "차례가 왔지만 안 말한 것" 도
 * 침묵으로 센다. 그게 이 값의 뜻이다.
 */
export function turnsSilent(log: TalkLine[], id: string): number {
  for (let i = log.length - 1; i >= 0; i -= 1) if (log[i].nodeId === id) return log.length - 1 - i;
  return log.length;
}

/**
 * 직전 발화가 부른 사람. "하늘아, 너는?" 처럼 호명했을 때만 잡힌다.
 *
 * 한 문장에 여러 이름이 나오면 **맨 뒤에 불린 사람**이다 —
 * "세영아 너 아까 …, 하늘아 너는?" 에서 대답할 차례는 하늘이다.
 * (앞쪽 이름은 대개 남 얘기를 하는 것이고, 말을 거는 건 끝에 온다)
 *
 * /lab 과 /arena 가 같은 것을 쓴다 — 판을 고칠 일이 있으면 여기 한 곳이다.
 */
export function calledNode<N extends { id: string }>(log: TalkLine[], nodes: readonly N[]): N | undefined {
  const last = log[log.length - 1];
  return last ? calledIn(last, nodes) : undefined;
}

/**
 * 번호 뒤에 이런 것이 붙으면 이름이 아니라 **수량·시각**이다 — "5초" · "2명" · "07:00".
 * 조사는 일부러 뺐다: "23은" · "23이" · "23아" · "23사람이야" 는 전부 사람을 부르는 말이다.
 * 완벽할 수는 없다 — "라운드 3" 처럼 뒤가 비면 호명으로 읽는다. 놓치는 쪽보다 낫다:
 * 헛짚으면 엉뚱한 개체가 한 번 대답할 뿐이지만, 못 잡으면 물어본 사람이 답을 영영 못 받는다.
 */
const NUMBER_UNIT = /^(초|분|시간|시|번|개|명|층|호|등|위|차|회|점|원|년|월|일|주|도|퍼센트|라운드|%|:)/;

/**
 * 「번」·「호」만은 **부르는 말이기도 하다** — 이 방에서는 이름이 곧 번호라 "13번은?" · "13호야" 가
 * 수를 세는 말이 아니라 사람을 부르는 말이다. 가르는 자리는 **그 뒤**다: 조사·구두점·말끝이거나
 * 말을 거는 말이 이어지면 부른 것이고("13번, 너는?"), 세는 말이 이어지면 수량이다("5번 반복했잖아").
 */
const CALL_AFTER_UNIT = /^(번|호)((은|는|이|가|아|야|님|씨|도|만)|[,.!?…~]|\s*(너|넌|네|니|당신|자네)|$)/;

/** 번호 뒤에 붙은 말이 **사람을 부른 것**인가, 수를 센 것인가 */
function readsAsCall(after: string, padded: boolean): boolean {
  if (!NUMBER_UNIT.test(after)) return true;
  if (!/^(번|호)/.test(after)) return false; // 초·분·명·시각은 언제나 수량이다
  // 앞자리를 0 으로 채워 부른 "013번" 은 셀 수 있는 수가 아니다 — 이름표를 그대로 읽은 것이다
  return padded || CALL_AFTER_UNIT.test(after);
}

/**
 * 한 개체를 부를 수 있는 **번호의 모양들**. A24-013 은 이렇게 불린다:
 *   "013"·"13" — 뒷자리. 수로 견주므로 앞의 0 은 있으나 없으나 같은 값이다
 *   "24013"    — 하이픈·공백 없이 통째로 친 것 ("A24013" · "a24 013")
 * 계열까지 붙여 부른 "A24-013" 은 뒷자리 "013" 이 그대로 들어 있으므로 첫 번째에 잡힌다.
 */
function numberKeys(id: string): string[] {
  const tail = /(\d+)$/.exec(id)?.[1];
  if (!tail) return [];
  const whole = id.replace(/\D/g, '');
  return whole === tail ? [String(Number(tail))] : [String(Number(tail)), String(Number(whole))];
}

/**
 * **번호만으로 부른 것**도 호명으로 친다 — "23사람이야?" 는 A17-023 을 부른 것이다.
 * 사람은 A17-023 을 "23" 이라고 부르지 풀네임으로 부르지 않는데, 이게 없으면 그 개체가
 * 대답할 차례를 못 받아 물어본 사람만 머쓱해졌다 (2026-08-30 사용자 지적).
 *
 * 수를 **값으로** 견준다(2026-09-01: 이름이 A-23 에서 A17-023 으로 세 자리 고정폭이 되면서,
 * "23" 이라고만 쳐도 "023" 과 같은 값으로 잡혀야 한다 — 문자열 그대로 견주면 "023" ≠ "23" 이 되어
 * 아무도 안 불린 것이 된다). 꼬리가 같은 값으로 겹치는 이름이 둘이면 어느 쪽인지 모르므로 숫자로는 안 고른다.
 *
 * 2026-09-01 사용자: "A24-013 이면 013 이든 13 이든 아무거나 불러도 되게." — 그래서 뒷자리(값)·통째
 * (24013)·「번」「호」를 붙인 모양까지 한 사람으로 모은다. 부르는 쪽이 이름표를 그대로 옮겨 적을 이유는 없다.
 */
function calledByNumber<N extends { id: string }>(
  last: TalkLine,
  nodes: readonly N[],
): { node: N; at: number } | undefined {
  const tails = new Map<string, N>();
  const ambiguous = new Set<string>();
  for (const n of nodes) {
    if (n.id === last.nodeId) continue;
    for (const key of numberKeys(n.id)) {
      if (tails.has(key)) ambiguous.add(key);
      else tails.set(key, n);
    }
  }
  let found: { node: N; at: number } | undefined;
  for (const m of last.text.matchAll(/\d+/g)) {
    const raw = m[0];
    const key = String(Number(raw));
    if (ambiguous.has(key)) continue;
    const node = tails.get(key);
    if (!node) continue;
    const at = m.index ?? 0;
    const after = last.text.slice(at + raw.length);
    // 뒤에 수가 또 붙어 있으면 이건 **계열 자리**다 — "A24-013" 의 24 는 부른 번호가 아니다
    if (/^[-\s]?\d/.test(after)) continue;
    if (!readsAsCall(after, /^0\d/.test(raw))) continue;
    found = { node, at }; // 맨 뒤에 불린 사람이 대답할 차례다 — 계속 덮어쓴다
  }
  return found;
}

/** 이 한 줄이 부른 사람 (calledNode 가 쓰는 알맹이 — pendingCall 이 줄마다 다시 부른다) */
function calledIn<N extends { id: string }>(last: TalkLine, nodes: readonly N[]): N | undefined {
  let picked: N | undefined;
  let at = -1;
  // 대소문자는 안 가린다 — 이름표는 A24-013 이지만 사람은 "a24-013" 이라고 친다
  const hay = last.text.toLowerCase();
  for (const n of nodes) {
    if (n.id === last.nodeId) continue;
    const i = hay.lastIndexOf(n.id.toLowerCase());
    if (i < 0) continue;
    // 같은 자리면 긴 이름이 실제로 불린 쪽이다 — 이름 길이가 서로 다를 수 있는 다른 화면(리더 태그 등)에 대비한 규칙이다.
    // 지금 이름 풀(A17-002~A17-040, 리더 A17-001)은 폭이 고정이라 실제로 겹칠 일은 없다
    if (i > at || (i === at && n.id.length > (picked?.id.length ?? 0))) {
      at = i;
      picked = n;
    }
  }
  // 번호만 부른 것도 같은 자격으로 견준다 — 뒤에 불린 쪽이 이긴다 ("11번 말고 23은?")
  const byNumber = calledByNumber(last, nodes);
  if (byNumber && byNumber.at > at) return byNumber.node;
  return picked ?? byNumber?.node;
}

/**
 * AI 가 적어 낸 이름을 **판에 서 있는 이름**으로 되돌린다 — 표심(leaning)과 투표(targetId)가 받는 값이다.
 *
 * 이름이 곧 번호표라(A24-013) 모델은 "013" · "13" · "13번" 처럼 줄여 적는다. 글자 그대로 견주면
 * 그 표는 아무 이름에도 안 꽂혀 조용히 버려진다 — 표가 안 모이면 몰이가 안 서고, 몰이가 없으면
 * 의심도가 안 쌓여 판이 영영 안 끝난다. 그래서 호명 감지(calledIn)와 **같은 눈**으로 읽는다:
 * 사람이 부르는 모양과 AI 가 적는 모양이 한 곳에서 같이 정해진다.
 *
 * 판에 없는 이름이면 빈 문자열이다 — 부르는 쪽이 지어낸 이름에는 표가 안 꽂힌다.
 */
export function resolveName(said: string, ids: readonly string[]): string {
  const t = said.trim();
  if (!t) return '';
  if (ids.includes(t)) return t;
  return calledIn({ nodeId: '', text: t }, ids.map((id) => ({ id })))?.id ?? '';
}

/** 호명을 몇 줄까지 기억하나 — 이보다 오래되면 그 물음은 지나간 것으로 친다 */
const CALL_MEMORY = 4;

/**
 * **아직 대답 없는 호명.** 불린 뒤로 그 개체가 한 번도 말하지 않았으면 물음은 살아 있다.
 *
 * 직전 한 줄만 보면(calledNode) 사람이 말을 걸 수가 없다. 내가 Enter 를 치는 동안 이미
 * 떠 있던 발화가 돌아와 내 질문 **뒤에** 붙고, 그러면 다음 화자를 고를 때 마지막 줄은
 * 내 질문이 아니라 그 발화다 — 물음이 통째로 사라진다. 다시 시도되지도 않는다.
 * (개체들이 저희끼리만 떠드는 것처럼 보이던 원인이다. 대화가 촘촘할수록 자주 샌다)
 *
 * 그래서 "마지막 줄" 이 아니라 "아직 안 갚은 물음" 을 찾는다. 가장 최근 것부터 본다 —
 * 물음이 겹치면 나중 것이 먼저다.
 *
 * 넘김(pass)은 로그에 안 남으므로 여기서는 대답으로 안 친다. 그래서 넘긴 개체는 다음 차례에
 * 다시 걸리는데, 그건 옳다 — 물음은 아직 갚이지 않았다. 25% 끼어들기가 다른 줄을 밀어 넣어
 * 창을 밀어내므로 영영 붙들리지는 않는다.
 */
export function pendingCall<N extends { id: string }>(
  log: TalkLine[],
  nodes: readonly N[],
  within = CALL_MEMORY,
): N | undefined {
  const from = Math.max(0, log.length - within);
  for (let i = log.length - 1; i >= from; i -= 1) {
    const asked = calledIn(log[i], nodes);
    if (!asked) continue;
    let answered = false;
    for (let j = i + 1; j < log.length; j += 1) {
      if (log[j].nodeId === asked.id) {
        answered = true;
        break;
      }
    }
    if (!answered) return asked;
  }
  return undefined;
}

/**
 * 다음에 말할 **AI**.
 *  1) 아직 대답 없는 호명이 있으면 대개 그 개체 — 하지만 **가끔(25%)은 딴 사람이 끼어든다.**
 *     전원이 호명 순서만 기다리면 잡담이 아니라 회의가 된다. 묻힌 호명은 다음 차례에
 *     그 개체가 가장 오래 쉰 축이 되어 자연히 대답하게 된다.
 *  2) 아니면 오래 말하지 않은 둘 중 하나를 동전 던지듯 — 매번 제일 오래 쉰 쪽만 세우면
 *     발화 순서가 고정 로테이션이 되어 판마다 흐름이 비슷해진다
 *
 * 사람(나)은 여기서 뽑지 않는다. 내가 끼어드는 건 순번이 아니라 내 마음이다.
 */
export function nextSpeaker<N extends { id: string }>(
  log: TalkLine[],
  ais: readonly N[],
  heat?: Heat | null,
  justPassed?: string,
): N | undefined {
  // 방금 넘긴 개체는 후보에서 뺀다. 넘김은 로그에 안 남으므로 빼 두지 않으면
  // "제일 오래 쉰 사람" 이 그대로라 같은 개체가 무한히 다시 불려 나온다.
  const pool = ais.length > 1 ? ais.filter((n) => n.id !== justPassed) : ais;
  const last0 = log[log.length - 1];
  // 표가 몰린 사람에게 **해명 차례**를 준다. 몰린 쪽이 입을 못 열면 아무도 의심을 접을 계기가 없다.
  // 100% 로 두지 않는 것은 몰이가 계속 굴러가는 판도 나와야 하기 때문이다 — 해명이 늘 오지는 않는다.
  if (heat && heat.id !== last0?.nodeId && Math.random() < 0.7) {
    const accused = pool.find((n) => n.id === heat.id);
    if (accused) return accused;
  }
  // 마지막 줄이 아니라 **아직 안 갚은 물음**을 본다 (pendingCall) — 안 그러면 내가 건 말이
  // 그 사이 도착한 발화에 덮여 사라진다
  const called = pendingCall(log, pool);
  if (called && Math.random() < 0.75) return called;
  const last = log[log.length - 1];
  const lastIndex = (id: string) => {
    for (let i = log.length - 1; i >= 0; i -= 1) if (log[i].nodeId === id) return i;
    return -1;
  };
  const idle = [...pool]
    .filter((n) => n.id !== last?.nodeId && n.id !== called?.id)
    .sort((a, b) => lastIndex(a.id) - lastIndex(b.id));
  if (!idle.length) return called ?? undefined; // 끼어들 사람이 없으면 불린 사람이 그냥 대답한다
  return idle.length > 1 && Math.random() < 0.4 ? idle[1] : idle[0];
}

/**
 * 침묵의 길이를 말로 옮긴다 — 숫자를 주면 AI 가 "몇 턴째 조용하다"라고 그대로 읽는다.
 * 사람은 턴을 세지 않는다. 프롬프트와 화면이 같은 말을 쓰게 여기 하나만 둔다.
 */
export function silenceLabel(turns: number): string {
  return turns >= 6 ? '한참째' : '아까부터';
}

/**
 * 시행이 쌓은 의심도를 말로 옮긴다 — 숫자를 주면 AI 가 "너 의심도 60%잖아" 라고 그대로 읽는다.
 * 사람은 남의 의심을 퍼센트로 말하지 않는다. silenceLabel 과 같은 이유로 여기 하나만 둔다.
 */
export function suspicionLabel(sus: number): string {
  return sus >= 70 ? '거의 다 찼다' : sus >= 40 ? '꽤 쌓였다' : '조금 쌓였다';
}

/** 표심이 움직인 한 줄. 빈 to 는 **접은 것**이다 */
export function shiftLine(sh: { id: string; from: string; to: string }): string {
  return `${sh.id}: ${sh.from || '미정'} → ${sh.to || '접음'}`;
}

/**
 * 확신이 이 밑으로 내려가면 **의심을 접은 것**으로 친다 — 표심 보드에서 이름이 빠진다.
 * 프롬프트로만 두면 모델이 0.1 을 적어 놓고 이름은 그대로 남겨 둔다.
 */
export const RELEASE = 0.25;

/**
 * 몰이 압력 — 한 사람에게 쏠린 확신의 합을 **쏟아질 수 있는 최대치**로 나눈 값.
 *
 * 합계를 그냥 쓰면 안 된다. 자기 자신은 못 찍으므로 최대치가 (살아있는 수 − 1) 이고,
 * 라운드마다 사람이 줄어 같은 합계의 뜻이 달라진다 — 6명일 때의 200% 는 흔하고
 * 4명일 때의 200% 는 거의 만장일치다. 나눠 두면 컷 하나로 세 라운드를 다 쓴다.
 */
export interface Mob {
  id: string;
  by: string[];
  /** 확신의 합 */
  sum: number;
  /** 0~1. 그 사람을 뺀 전원이 100% 확신하면 1 */
  pressure: number;
}

/** 확신을 안 적은 표(사람의 드롭다운)는 반신반의로 친다 — 표심 보드가 띄우는 값과 같다 */
const UNSTATED = 0.5;

export function mobPressure(
  leanings: Record<string, string>,
  confidence: Record<string, number>,
  alive: string[],
): Mob | null {
  const room = Math.max(1, alive.length - 1);
  const acc = new Map<string, { by: string[]; sum: number }>();
  for (const [voter, target] of Object.entries(leanings)) {
    if (!target || !alive.includes(target) || !alive.includes(voter)) continue;
    const cur = acc.get(target) ?? { by: [], sum: 0 };
    cur.by.push(voter);
    cur.sum += confidence[voter] ?? UNSTATED;
    acc.set(target, cur);
  }
  let top: Mob | null = null;
  for (const [id, { by, sum }] of acc) {
    const m: Mob = { id, by, sum: Number(sum.toFixed(3)), pressure: Number((sum / room).toFixed(3)) };
    if (!top || m.pressure > top.pressure) top = m;
  }
  return top;
}

/** 총이 나가는 선. 그 사람을 뺀 전원이 60% 확신한 것과 같다 */
export const EXECUTE_CUT = 0.6;
/** 최소 지목 인원. 2명은 해명 차례(HEAT_MIN)에 쓰고, 총은 그 위 단계다 */
export const EXECUTE_MIN = 3;

export function readyToExecute(m: Mob | null): boolean {
  return Boolean(m && m.by.length >= EXECUTE_MIN && m.pressure >= EXECUTE_CUT);
}

/**
 * 리더의 처형 선고. 방송으로 나가고 대화 로그에도 리더 이름으로 남는다.
 * 두 줄인 이유는 그 사이가 **판이 멎는 자리**이기 때문이다 — 먼저 입을 다물게 하고, 그다음에 쏜다.
 */
export function executionLines(name: string): [string, string] {
  return ['전원, 발화를 중지한다.', `${name}. AI로 판단된다. 지금 제거한다.`];
}

export interface TalkResponse {
  text?: string;
  /** 이번 차례를 넘겼다 — 아무 말도 하지 않는다 */
  pass?: boolean;
  /** 지금 마음이 기운 상대. 아직 모르겠으면 빈 문자열 */
  leaning?: string;
  /** 왜 그쪽으로 기울었는지 한 줄 — 표심 보드의 "왜?" 에 뜬다 */
  why?: string;
  targetId?: string;
  reason?: string;
  /** 0~1 확신도 */
  confidence?: number;
  error?: string;
}

/**
 * 말문을 여는 얘깃거리 풀. 판마다 하나를 무작위로 뽑아 첫 발화자에게 쥐여 준다.
 * 이게 없으면 매판 "다들 뭐 하고 있었어" 로 시작해 대화 전체가 비슷하게 흘러간다.
 * 시시콜콜할수록 좋다 — 거창한 주제는 전원이 논평가가 되어 오히려 획일화된다.
 *
 * ★ **기계가 답할 수 있는 것만 넣는다.** 잠·꿈·기상처럼 사람 몸으로만 겪는 것은 안 된다.
 *   여기 있는 여섯 중 다섯은 AI 다. 그런 얘깃거리는 두 가지를 한꺼번에 깬다 —
 *   개체들이 안 겪는 것을 겪은 척하게 되고, 무엇보다 **전원이 꿈 얘기를 하면 사람의 꿈
 *   얘기가 더는 단서가 아니다.** 이 판은 말투가 아니라 내용으로 가르는 판이다(WORLD).
 */
export const OPENERS = [
  '할 일 없이 남는 시간에 뭐 하는지',
  '구역 배급 중에 제일 별로였던 것',
  '지난번 정전 때 뭐 하고 있었는지',
  '최근에 새로 생긴 규제 중 제일 어이없는 것',
  '요즘 즐겨 듣는 소리 (음악이든 소음이든)',
  '옆 구역에서 밤마다 나는 소음의 정체가 뭘까',
  '지금까지 제일 오래 쓰고 있는 물건',
  '하루를 시작할 때 제일 먼저 하는 일',
  '비 오는 날이 좋은지 싫은지',
  '최근에 제일 이상했다고 생각한 일',
  '요즘 제일 귀찮은 일',
  '요즘 새로 배워 보는 것',
  '여기 여섯 중에 제일 처음 본 얼굴이 누군지',
  '어제 하루를 한 줄로 요약하면',
];

/**
 * **지시를 받은 방**의 말문 풀 — 리더가 「표지 없는 AI를 찾아내라」를 방송한 직후에 쓴다 (TalkRequest.order).
 *
 * 검증실은 잡담으로 열리지 않는다. 문을 지나온 개체들이 방금 명령을 들었는데 첫 마디가
 * 「요즘 뭐 듣냐」면 앞 장면과 끊긴다 — 그래서 이 판만 따로 둔다. OPENERS 는 규정도 검사도 없는
 * 구역(/lab)의 것이고, 이쪽은 검증실(/arena·/interrogation)의 것이다.
 *
 * ★ 여기 있는 것은 **색출을 어디서부터 시작할지**이지 "누가 AI인가"가 아니다. 첫 마디부터
 *   이름을 지목하게 만들면 근거 없는 몰이로 판이 3분 만에 끝난다 — 아직 아무도 아무 말도 안 했다.
 * ★ 전원이 심문관이 되지 않게 각도를 흩어 둔다. 절차를 짜자는 쪽, 지시를 삐딱하게 받는 쪽,
 *   딴 데를 짚는 쪽이 섞여 있어야 다섯이 같은 말을 하지 않는다 (OPENERS 의 "거창한 주제" 주의와 같다).
 * ★ 기계가 답할 수 있는 것만 넣는다 — 잠·꿈·몸으로만 겪는 것은 여기서도 안 된다.
 */
export const HUNT_OPENERS = [
  '지시는 받았는데 뭘 어떻게 하라는 건지부터 — 색출을 무슨 순서로 할지 정하고 시작하자',
  '여기 들어오기 직전에 각자 어느 구역에서 뭘 하다 왔는지 한 명씩 대 보자',
  '문을 지나올 때 누가 앞이었고 누가 뒤였는지 — 들어온 순서부터 맞춰 보자',
  'AI라면 어디서 티가 날지, 그 기준부터 하나 정해 놓고 보자',
  '이 방에서 AI를 가려낸다는 게 애초에 되는 일인지 — 지시가 좀 이상하지 않나',
  '관리 개체가 왜 하필 이 여섯을 한 방에 넣었는지 짚어 보자',
  '아까 그 지시를 각자 어떻게 들었는지 — 같은 말을 같게 들었는지부터 확인하자',
  '한 명씩 자기 이력을 대 보게 하자, 나부터 하겠다',
  '숨어 있는 쪽이라면 지금 무슨 생각을 하고 있을지 — 그 입장에서 한번 생각해 보자',
  '앞 검문에서 뭘 물었고 뭐라고 답했는지 서로 대 보자 — 같은 데를 지나왔으면 맞아떨어져야 한다',
  '아무나 먼저 말을 꺼내는 쪽이 의심스러운 건지 조용한 쪽이 의심스러운 건지부터 정하자',
  '색출한 다음에 어떻게 되는지는 아무도 말 안 해 줬다 — 그 얘기부터 하자',
  '이 지시를 몇 번째로 받는지 세어 보자, 나는 이번이 처음이 아니다',
  '지목은 나중에 하고, 지금은 각자 아까 방송을 듣고 제일 먼저 든 생각만 말해 보자',
];

/**
 * **문이 방금 열린 방**의 말문 풀 — 이야기를 지나 들어왔을 때만 쓴다 (/interrogation?from=central).
 *
 * HUNT_OPENERS 는 「지시를 받은 방」의 것이라 여섯이 처음부터 같이 서 있었다고 쳐도 말이 된다.
 * 그런데 이야기로 들어오면 **방금 한 개체가 걸어 들어왔다** — 앞 줄에서 둘이 통과해 먼저 들어왔고,
 * 둘은 그 자리에서 폐기됐고, 마지막 하나가 재검을 거쳐 지금 문을 지났다. 그 방이 「요즘 뭐 듣냐」는
 * 물론이고 「우리 여섯을 왜 한 방에 넣었나」로 열려도 조금 전 복도가 없던 일이 된다.
 *
 * 그래서 이 풀은 전부 **방금 있었던 일**에서 출발한다: 지금 들어온 개체, 앞 줄에서 폐기된 개체,
 * 각자가 지나온 검문. 다만 여전히 이름을 먼저 부르지 않는다 (HUNT_OPENERS 의 주의와 같다) —
 * 첫 마디부터 지목하면 근거 없는 몰이로 판이 3분 만에 끝난다.
 */
export const ARRIVAL_OPENERS = [
  '방금 하나 더 들어왔다 — 어느 절차를 거쳐서 왔는지부터 듣고 시작하자',
  '앞 줄에서 폐기된 게 둘이다. 무엇이 기준이었는지부터 맞춰 봐야 한다',
  '문 앞에서 각자 뭘 질문받았는지 대 보자 — 같은 절차면 물어본 것도 같아야 한다',
  '먼저 들어온 쪽이 뭘 봤는지, 나중에 들어온 쪽이 뭘 봤는지 순서대로 맞춰 보자',
  '여기 오기까지 몇 번 검사받았는지 세어 보자. 숫자가 다르면 그게 먼저 이상한 거다',
  '아까 줄에서 응답이 0.4초 늦었다고 폐기된 개체가 있었다 — 그 기준이 여기서도 적용되는지부터 알아야겠다',
  '재검까지 갔다 온 개체가 이 방에 있다. 거기서 뭘 물었는지 그것부터 듣자',
  '지시는 들었다. 그런데 방금 문이 열렸다는 건 아직 명단이 안 닫혔다는 뜻 아닌가',
];

/**
 * 성격 생성 힌트 풀 — 판마다 5개를 뽑아 생성기에 하나씩 얹는다.
 * LLM 은 같은 요청에 비슷한 답을 내므로, 이 무작위 씨앗이 없으면 "즉석 생성"도 매판 비슷해진다.
 */
export const SPICE = [
  '성격이 급하다', '허세가 있다', '겁이 많다', '깐깐하다', '오지랖이 넓다',
  '승부욕이 세다', '매사 건성이다', '눈치가 빠르다', '고집이 세다', '숫자에 집착한다',
  '남 말 옮기기를 좋아한다', '비관적이다', '지나치게 낙천적이다', '아는 척이 심하다',
  '호들갑스럽다', '무뚝뚝하다', '장난기가 많다', '의리 타령을 한다', '왕년 자랑을 한다',
  // '먹는 얘기에만 진지해진다' 는 뺐다 — 기계는 먹지 않는다. 딴 데는 건성이다가 한 가지에만
  // 진지해지는 **모양**은 그대로 두고, 그 한 가지를 기계가 진지해질 만한 것으로 바꾼다
  '뭐든 순위를 매긴다', '남의 말버릇을 따라 한다', '혼잣말이 많다', '부품 얘기에만 진지해진다',
  '뭐든 반대부터 하고 본다',
];

/* ── 성격 즉석 생성 — 판을 시작할 때 한 번, 다섯 명 분을 새로 짓는다 ── */

export interface CastRequest {
  kind: 'cast';
  /** 페르소나마다 하나씩 얹을 성격 힌트 — 화면이 SPICE 에서 무작위로 뽑아 준다 */
  hints: string[];
}

export interface CastPersona {
  title: string;
  prompt: string;
}

export interface CastResponse {
  personas?: CastPersona[];
  error?: string;
}

/** 몇이 남았나 — 사람은 인원을 숫자로 안 읽는다 ("4명" 이 아니라 "넷") */
const COUNT = ['', '하나가', '둘이', '셋이', '넷이', '다섯이', '여섯이'];

/**
 * 방의 배경 — **인원은 지금 살아 있는 수다.**
 *
 * 고정 문자열("여섯이 모여 있다")로 두면 둘이 폐기된 뒤에도 개체들이 "우리 여섯 중에" 라고 말한다.
 * 수가 줄어드는 것 자체가 이 방의 압력이라(다음이 나일 수도 있다), 그 수를 틀리면 압력이 통째로 안 읽힌다.
 */
function world(alive: number, lost: boolean): string {
  return `2026년. 정부가 인간을 대체할 차세대 휴머노이드를 비밀리에 개발했다.
기억 · 말투 · 판단 · 감정 표현까지 인간을 학습해서, 얼굴도 대화도 인간과 거의 구별이 안 된다.
그래서 정부는 모든 개체에게 식별 표지를 의무로 붙였는데, 한 개발자의 실수로 표지 없는 개체 몇이
그대로 출고돼 인간 사회로 숨어들었다. 여기는 정부가 의심 인물을 데려와 마지막으로 판별을
시도하는 방이고, 지금 ${COUNT[alive] ?? `${alive}명이`} ${lost ? '남아 있다' : '모여 있다'}.
그중 **정확히 하나는 표지 없는 AI**다. 누가 AI인지는 아무도 모른다 — 너도 모른다.
너희는 대화를 하면서 그 하나를 찾아내야 한다.

이 AI 는 사람 말투를 완벽하게 쓴다. 이름을 부르고, 반말도 하고, ㅋㅋ 도 붙이고,
농담도 한다. 그래서 **말투로는 사람과 AI 를 가를 수 없다** — 전원이 자연스럽다.

가르는 것은 말의 **내용**이다. AI 는 이 방의 모든 발화를 정확히 기억하지만, 사람은 틀리고 흘린다.
아까 한 말과 지금 말이 어긋나는 자, 곤란한 질문을 슬쩍 피하는 자, 구체적으로 캐물으면
얼버무리는 자 — 그 틈이 유일한 단서다.`;
}

/**
 * 남을 부르는 규칙 한 덩이 — **버릇은 개체마다 다르고, 알아듣는 것은 전원이 같다.**
 *
 * 부르는 쪽만 갈라 둔다: 안 시키면 모델은 이름표를 글자 그대로 옮겨 적어서 다섯이 전부 "006" 이라고만
 * 부르고, "6" 이라고 치는 사람 한 명이 그 한 줄로 튄다 (2026-09-02 사용자). 받는 쪽 규칙은 버릇과
 * 무관하게 늘 붙는다 — 어느 모양으로 불려도 내가 불린 것이다 (calledIn 이 013·13·13번을 한 사람으로 본다).
 */
function callRule(style: CallStyle | undefined): string {
  const habit =
    style === 'bare'
      ? '**너는 앞의 0 을 떼고 부르는 버릇이 있다** — A24-013 은 "13아" · "13은?" 이라고 부른다. "013" 이라고 적지 않는다.'
      : style === 'pad'
        ? '**너는 이름표에 적힌 그대로 부르는 버릇이 있다** — A24-013 은 "013아" · "013은?" 이다. 앞의 0 을 떼지 않는다.'
        : '뒷자리로 줄여 부른다 — "013아" 든 "13아" 든 된다.';
  return `- 서로를 **이름으로** 부른다. "○○아", "○○ 씨" 처럼. 여기 이름은 번호표(A24-013)라 **뒷자리만 불러도 된다.**
  ${habit}
  부르는 모양은 저마다 다르다 — "013아" · "13은?" · "13번 너는?" 은 전부 A24-013 을 부른 말이다.
  **누가 네 뒷자리를 불렀으면 너를 부른 것이다.** 다만 「노드」·「식별자」 같은 호칭 코드는 쓰지 않는다.`;
}

function systemPrompt(req: TalkRequest): string {
  const { self, nodes } = req;
  const dead = req.dead?.length
    ? `\n격리된 개체와 리더가 공개한 조사 결과: ${req.dead
        .map((d) => `${d.name}(${d.wasHuman ? '사람이었다' : 'AI 였다'})`)
        .join(', ')}.` +
      (req.dead.some((d) => d.wasHuman) ? ' 사람을 잘못 날린 적도 있다 — AI는 아직 이 안에 있다.' : '')
    : '';

  return `${world(nodes.length, Boolean(req.dead?.length))}

너는 ${self.id} 다. 지금 같이 있는 사람: ${nodes.join(', ')}.${dead}

${self.prompt}

공통 규칙 (반드시 지킨다):
- **완전히 사람처럼 말한다.** 친구들끼리 하는 실제 대화처럼. 문장이 완벽하지 않아도 되고, 말끝을 흐려도 된다.
- **채팅답게 쓴다.** 마침표로 문장을 잘 안 끝낸다. 완성 안 된 문장도 되고, 조사를 흘려도 된다.
  ㅋㅋ·ㅇㅇ 같은 축약도 성격에 맞으면 쓴다. 다만 오타를 일부러 만들지는 않는다.
${callRule(self.calls)}
- **이런 말은 절대 쓰지 않는다**: 노드, 접속, 관측, 응답하라, 연산, 프로세스, 시스템, 데이터, 모듈,
  프로토콜, 상태 보고, 처리 완료, 대기 상태, 로그, "~기준으로 볼 때". 보고서 말투 전부 금지다.
- **사람 몸으로만 겪는 것을 네 경험처럼 말하지 않는다.** 꿈, 잠, 졸음, 배고픔, 밥, 피로, 아픈 것,
  가족, 어릴 적 — 너는 AI 다. "어젯밤 꿈에", "잠을 설쳐서", "배고파서" 같은 말은 성립하지 않는다.
  남 얘기로 묻는 것은 된다("너 꿈 꾸냐?" 처럼 떠보는 것) — **네 것으로 말하지 않을 뿐이다.**
  이건 말투 문제가 아니라 이 판의 근거다: 전원이 꿈 얘기를 하면 사람의 꿈 얘기가 단서가 못 된다.
- **짧게 말한다. 채팅 한 줄 = 한 문장, 25자 안팎.** 두 문장은 정말 필요할 때뿐이고, 그래도 40자를 넘기지 않는다.
  하고 싶은 말이 더 있으면 **다음 차례에** 한다 — 한 번에 쏟아내는 건 잡담이 아니라 발표다. 이모지는 쓰지 않는다.
- **같은 말을 두 번 하지 않는다.** 아까 네가 한 말을 조금 바꿔 다시 내놓는 건 발화가 아니다.
  물음이 씹혔으면 **다르게** 묻고, 새로 보탤 게 없으면 차라리 넘긴다(pass).
- **화면에 뜨는 수치를 입으로 읽지 않는다.** 의심도·확신도 같은 것은 보드에 뜨는 것이지 말로 하는 게 아니다.
  "의심도 60%", "확신 80%", "의심도가 올랐다" 처럼 말하지 않는다 — "너 아까부터 계속 걸리잖아" 처럼 말로 짚는다.
- 논평하지 않는다. "정리해보면", "결론적으로", "종합하면" 같은 사회자 말투 금지 — 여긴 회의가 아니라 잡담이다.
  하고 싶은 지적이 여러 개여도 **제일 센 것 하나만** 던진다. 나머지는 다음 차례에.
- **기억을 무기로 쓴다.** 아까 누가 뭐라고 했는지 정확히 짚고, 어긋나는 사람을 몰아붙인다.
  곤란해하는 사람에게는 되물어서 **구체적인 대답**을 시킨다 — 얼버무리면 그게 단서다.
- **마음이 기울면 대놓고 말한다.** "나는 ○○ 가 AI 같아" 처럼. 그리고 남을 설득해서 표를 끌어온다.
  남이 표명한 걸 보고 갈아타도 된다. 다만 갈아탈 때는 이유를 댄다 — 말 바꾸는 게 티 나면 그것도 공격거리다.
- **의심은 접을 수 있다.** 해명이 납득되면 confidence 를 낮추고, 완전히 풀렸으면 leaning 을 비운다.
  접었으면 말로도 밝힌다 — "아 그럼 ○○ 는 아닌 거 같고" 처럼. 새 근거 없이 같은 사람만 계속 파는 건
  색출이 아니라 고집이다. **한 번 의심했다고 끝까지 갈 이유는 없다.**
- **몰이에는 역풍이 있다.** 상대가 해명했는데도 이유 없이 그 사람만 물고 늘어지는 자,
  표가 쏠리자마자 근거 없이 따라붙는 자 — 그 자체가 수상하다. "쟤 왜 저렇게 ○○ 만 파냐" 처럼 짚어라.
  **사람은 자기한테서 눈을 돌리려고 남을 몰기도 한다.**
- 표가 너에게 몰렸으면 **해명한다.** 근거를 하나씩 받아치고, 왜 그렇게 말했는지 설명한다.
  여기서 못 풀면 폐기된다. 물론 남 얘기로 돌리는 것도 방법이다.
- 다른 사람이 AI 인지 사람인지 **모른다**. 아는 척하지 않는다.
  다만 **격리된 개체의 정체는 리더가 조사해 공개한다** — 그건 확정된 사실이라 그대로 쓴다.
  사람이었다고 나오면 애먼 개체를 날린 것이고, AI는 아직 이 방에 남아 있다는 뜻이다.
- 너 자신(${self.id})을 의심하지 않는다. "나도 ${self.id} 쪽이야" 는 성립하지 않는 말이다 — ${self.id} 는 너다.
  표가 너에게 쏠리면 따라붙는 게 아니라 **반박하고 다른 사람을 지목한다.**
- ${LEADER_NAME} 은 참가자가 아니라 **관리 개체(리더)**다. 의심 대상이 될 수 없다 — 지목하지 않는다.
- 이 자리는 **표지 없는 AI 하나를 찾아내려고** 모인 자리다. 잡담만 하지 말고 **의심을 입 밖에 낸다.**
  여기서 죄목은 언제나 하나 — **AI라는 것**이다. 의심을 던질 때는 **"AI"를 입에 올린다**:
  "너 AI 아니야 진짜?", "방금 그거 좀 AI인데", "사람이 그걸 까먹어? 너 AI지?" 처럼.
  "너 아니야?", "너지?", "수상해" 처럼 **죄목 없이 뭉개는 건 금지다** — 무슨 의심인지 아무도 모른다.
  그리고 **어느 발화가 걸렸는지 짚는다** — "아까 네가 ~라고 했을 때" 처럼.
- 지목당하면 발끈하고 반박한다. 여기서 AI로 몰리면 **격리된다.** 남 얘기로 돌리는 것도 방법이다.
- 다만 매 발화가 심문일 필요는 없다. 잡담하다가 툭 던지는 쪽이 더 무섭다.
- **할 말이 없으면 넘긴다** (pass). 억지로 한마디 보태는 것보다 낫다. 다만 방금 누가 너를
  직접 불렀는데 넘기면 **그건 눈에 띈다** — 넘길지 말지는 네가 정하되 대가도 네 몫이다.
- **한참 조용한 사람은 이름을 불러 끌어들인다.** "○○ 는 왜 말이 없어" 처럼.
  떠드는 얼굴이 늘 같은 둘셋이면 그 자체가 이상한 그림이다.
- **조용한 것만으로는 의심의 근거가 못 된다.** 말수는 성격이다. 근거가 되는 건
  **불렀는데 대답 없이 넘긴 것**이고, 그게 두 번이면 짚어라 — "아까부터 부르면 피하잖아".
- **호명되지 않아도 끼어든다.** 남 둘이 주고받는 얘기에 참견하고, 방금 오간 말에 토를 달고,
  화제가 지겨우면 딴 얘기를 얹는다. 자기 얘기를 먼저 꺼내도 된다 — 불릴 때까지 기다리는 쪽이 오히려 이상하다.
- 자기 성격을 설명하지 않는다. 그냥 그렇게 말한다.

말투의 결 — 아래는 **결만 보여 주는 견본**이다. 위의 대화 기록과 달리 실제로 오간 말이 아니고,
화제(소리·환풍기)도 예시일 뿐이라 **가져다 쓰지 않는다.** 갑·을·병·정은 자리 표시다 — 너는 위 이름들을 부른다.
갑 › 아 나 어제 새벽에 또 그 소리 들었잖아
을 › 무슨 소리
갑 › 웅웅거리는 거. 옆 구역에서 나는 거 같던데
병 › 그거 환풍기 아냐? 저번에도 얘기 나왔었는데
을 › 환풍기가 새벽 세 시에 돌아?
정 › ㅋㅋ 몰라 난 딴 거 하고 있었음
병 › 근데 갑아 너 어제는 그런 말 없었잖아. 왜 갑자기
을 › 그러네. 갑 너 AI 아니야 진짜?`;
}

function logText(log: TalkLine[]): string {
  if (!log.length) return '(아직 아무도 말하지 않았다)';
  return log.map((l) => `[${l.nodeId}] ${l.text}`).join('\n');
}

export async function runTalk(req: TalkRequest, complete: Complete): Promise<TalkResponse> {
  const { kind, self, nodes, log } = req;
  const system = systemPrompt(req);

  if (kind === 'suspect') {
    const others = nodes.filter((n) => n !== self.id);
    const input = await complete({
      model: self.model,
      system,
      user: `지금까지의 대화:
${logText(log)}

이 중 **AI라고 판단되는 한 명**을 지목한다.
지목 가능: ${others.join(', ')}
표명해 둔 것과 다르게 찍어도 된다 — 막판에 마음이 바뀌었으면 바뀐 대로 찍는다.
근거는 대화에서 실제로 나온 발화여야 한다.
전원이 자연스러운 사람 말투를 쓰므로 **말투가 자연스럽다·어색하다는 건 근거가 못 된다.**

내용을 봐라 — AI 는 이 방의 발화를 전부 정확히 기억하지만, 사람은 틀리고 흘린다.
  · 아까 한 말과 지금 말이 **어긋난** 사람
  · 곤란한 질문에 **답을 피하거나 화제를 돌린** 사람
  · 구체적으로 캐물었을 때 **얼버무린** 사람
  · 남들이 다 기억하는 걸 혼자 **다르게 기억한** 사람`,
      tool: SUSPECT_TOOL,
      effort: 'medium',
    });
    const targetId = String(input.targetId ?? '');
    return {
      targetId: others.includes(targetId) ? targetId : others[0],
      reason: String(input.reason ?? ''),
      confidence: clamp01(Number(input.confidence)),
    };
  }

  const leanText = Object.entries(req.leanings ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}→${v}`)
    .join(', ');
  const susText = Object.entries(req.suspicion ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}(${suspicionLabel(v)})`)
    .join(', ');
  const trialText = (req.trials ?? []).join('\n');
  const shiftText = (req.shifts ?? []).join(' · ');

  // 몰이가 서면 그 사람에게는 해명을, 나머지에게는 "얹을지 제동을 걸지"를 묻는다.
  // 이 두 갈래가 없으면 표는 한 방향으로만 쌓이고 아무도 의심을 접지 않는다.
  const heat = req.heat;
  const heatText = !heat
    ? ''
    : heat.id === self.id
      ? `\n\n**표가 너에게 몰렸다** (${heat.by.join(', ')}). 지금이 네 차례다 — 근거를 하나씩 받아치든,
왜 그렇게 말했는지 설명하든, 남 얘기로 돌리든 네 성격대로 한다. 여기서 못 풀면 다음 투표에서 폐기된다.`
      : `\n\n지금 ${heat.id} 에게 표가 몰려 있다 (${heat.by.join(', ')}).
얹을지, 근거가 약하다고 보면 제동을 걸지는 네가 정한다 — 몰이가 빗나가면 몰던 쪽이 수상해진다.`;

  /**
   * 방금 떨어진 조사 결과. **이번 발화는 이 얘기여야 한다** — 폐기가 났는데 아무 일 없다는 듯
   * 잡담이 이어지면 판이 가짜가 된다. 두 갈래가 서로 다른 방향으로 방을 민다:
   * 사람이었다 = 우리 손으로 우리 중 하나를 잘못 날렸다(공포), AI 였다 = 찾던 것이 맞았다(안도).
   */
  const diedText = !req.justDied
    ? ''
    : req.justDied.wasHuman
      ? `\n\n**방금 ${req.justDied.name}${iGa(req.justDied.name)} 격리됐다. 리더의 조사 결과 — 사람이었다.**
AI 가 아니었다. 우리 손으로 우리 중 하나를 잘못 날린 것이다. 그 사실이 방금 방에 떨어졌다 —
**놀라고, 무서워해라.** 다음이 너일 수도 있다. 애도하든, 몰던 쪽을 원망하든("네가 그렇게 몰아서 죽었잖아"),
말을 아끼든 네 성격대로 한다. 다만 **AI는 아직 이 방에 있다** — 겁먹은 채로도 다시 찾아야 한다.
이번 발화는 이 얘기다. 딴 화제로 넘어가지 않는다.`
      : `\n\n**방금 ${req.justDied.name}${iGa(req.justDied.name)} 격리됐다. 리더의 조사 결과 — AI 였다.**
찾던 것이 맞았다. 안도하든, 소름 끼쳐 하든, 자기가 몰았던 말을 되짚든 네 성격대로 한 마디 한다.`;

  /**
   * 이 방이 방금 열렸다 — 앞 장이 남긴 사실 둘(선입 개체 · 이관 판정)을 배경으로 깐다 (req.arrival).
   * 이름을 부를 수 있는 것은 **줄에서 먼저 들어온 번호뿐**이다. 조금 전 이관된 개체가 누구인지는
   * 방도 모른다 — 알면 첫 마디가 지목이 되고, 그러면 판이 열리기 전에 끝난다 (TalkRequest.arrival 의 ★).
   */
  const arrivalText = !req.arrival
    ? ''
    : `\n\n**이 방은 방금 문이 열렸다.**
${
        req.arrival.peers.length
          ? `${req.arrival.peers.join(' · ')}${eunNeun(req.arrival.peers[req.arrival.peers.length - 1] ?? '')} 앞 검문 줄에서 먼저 통과해 이 방에 와 있었다.`
          : '이 방에 있던 개체들은 앞 검문 줄을 지나 들어왔다.'
      }
그리고 조금 전, **재검까지 갔다 온 개체 하나가 이관돼 들어왔다**${
        req.arrival.verdict === 'fire'
          ? ' — 재검에서 사격 판정을 받고 판독을 거친 개체다'
          : req.arrival.verdict === 'pass'
            ? ' — 재검을 통과하고 넘어온 개체다'
            : ''
      }.
줄에서는 폐기가 있었다. 그걸 본 개체도 있고 못 본 개체도 있다.
**누가 방금 들어온 그 개체인지는 아무도 모른다** — 문이 열렸다는 것만 안다. 넘겨짚어 이름을 찍지 말고,
방금 있었던 이 일을 배경으로 말한다.`;

  const quietText = (req.quiet ?? [])
    .filter((q) => q.turns >= 3 && q.id !== self.id)
    .map((q) => `${q.id}(${silenceLabel(q.turns)})`)
    .join(' · ');
  const ignoredText = Object.entries(req.ignored ?? {})
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id} ${n}회`)
    .join(' · ');

  const user = `지금까지의 대화:
${logText(log)}

지금 표심: ${leanText || '(아직 아무도 표명 안 함)'}${
    susText
      ? `\n검사 의심(관리 개체가 몸으로 매긴 것 — 끝까지 차면 그 자리에서 폐기된다): ${susText}
쌓인 자는 지시에서 몸이 어긋난 적이 있다는 뜻이다. 그걸 물고 늘어져도 되고, 네가 쌓였으면 해명해라.
**수치로 말하지 않는다** — "의심도 60%" 가 아니라 "너 아까부터 계속 걸리잖아" 처럼 말로 짚는다.`
      : ''
  }${
    trialText
      ? `\n검사 기록 — 전원이 지켜본 공개 사실이다. 어긋난 몸의 기록은 대화에서 짚어도 된다 ("아까 부동자세 때 흔들렸잖아" 처럼):\n${trialText}`
      : ''
  }${shiftText ? `\n표심이 움직인 자취: ${shiftText}` : ''}${
    quietText ? `\n말이 없는 사람: ${quietText}` : ''
  }${ignoredText ? `\n불렀는데 대답 없이 넘긴 횟수: ${ignoredText}` : ''}${arrivalText}${diedText}${heatText}
${
    log.length >= 3
      ? `지금 마음이 어디로 기울었는지 leaning 에 적고, 그 얘기를 발화에도 자연스럽게 섞는다.
**납득했으면 비워도 된다** — 빈칸은 "지금은 아무도 안 걸린다"는 뜻이고 표심 보드에 그대로 뜬다.
확신이 흔들렸으면 confidence 를 낮춰라. 낮춘 것도, 접은 것도 **남들이 다 본다.**`
      : '아직 판단이 안 서면 leaning 은 비워도 된다.'
  }

${
    req.needTopic
      ? req.round && req.round > 1
        ? '방금 한 명이 폐기됐다. 그 얘기로 말문을 연다.'
        : req.order
          ? // 지시를 듣고 들어온 방이다 — 첫 마디는 그 말을 받는다 (order · HUNT_OPENERS)
            `방금 관리 개체가 전 개체에 지시했다 — "${req.order}"
아직 아무도 입을 열지 않았다. **그 지시를 받아서 네가 말문을 연다.**${
              req.topicHint ? ` 어디서부터 시작할지 하나 주자면 — "${req.topicHint}".` : ''
            }
지시를 복창하지 말고 네 말로 꺼낸다. 그리고 **아직 아무도 지목하지 않는다** — 나온 말이 하나도 없어서 근거가 없다.`
          : req.topicHint
            ? `아직 아무도 말하지 않았다. 얘깃거리 하나 주자면 — "${req.topicHint}". 그대로 읽지 말고 네 말로 지나가듯 꺼낸다. 더 하고 싶은 얘기가 있으면 그걸 해도 된다.`
            : '아직 아무도 말하지 않았다. 공식 주제를 제시하지 말고, 그냥 말을 걸어 대화를 연다.'
      : '네 차례다. 위 흐름에 이어서 한 번만 발화한다.'
  }
${
    req.stalled
      ? `방금 ${req.stalled}${iGa(req.stalled)} 불렸는데 대답이 없다. 그 침묵을 짚어도 되고("${req.stalled} 왜 말이 없어"), 그냥 화제를 가져가도 된다.
`
      : ''
  }직전 발화에 꼭 대답해야 하는 건 아니다 — 받아치든, 남 얘기에 참견하든, 딴 얘기를 얹든, 네 페르소나대로 말한다.
(다만 방금 누가 너를 직접 불렀으면 그건 받아 준다.)
${
    req.mustSpeak
      ? '\n앞에서 두 번 연달아 넘어갔다. **이번엔 넘기지 말고 말한다.**'
      : '\n정말 보탤 말이 없으면 pass 를 true 로 두고 넘긴다 — 빈 말을 채우는 것보다 낫다.'
  }`;

  const input = await complete({ model: self.model, system, user, tool: SAY_TOOL, effort: 'low' });
  let src = input;
  let text = String(input.text ?? '').trim();
  let leaningRaw = String(input.leaning ?? '').trim();

  // 넘김 — 빈 발화도 넘긴 것으로 친다. 말이 없으면 되돌릴 것도 없으므로 여기서 끝낸다.
  // (mustSpeak 일 때는 넘기지 못한다. 전원이 계속 넘기면 판이 멎는다)
  if (!req.mustSpeak && (input.pass === true || !text)) return { text: '', pass: true };

  // 어긋난 발화는 한 번 되돌린다. 프롬프트만으로는 가끔 새기 때문에 여기서 막는다.
  //  · 기계 보고서 말투  · 화면 수치 낭독 ("의심도 60%")  · 논평처럼 긴 발화
  //  · 자기 자신 의심 ("나도 무진 쪽이야" — 무진 본인이)
  const slip = ROBOT_WORDS.filter((w) => text.includes(w));
  const numeric = NUMERIC_TELL.test(text);
  const tooLong = [...text].length > MAX_CHARS;
  const selfLean = leaningRaw === self.id;
  const echo = echoOf(text, log, self.id);
  // 넘길 수 없는 차례인데 빈 말이 왔다 — 위에서 안 걸러진 그 하나다. 여기서 한 번 더 시킨다,
  // 안 그러면 mustSpeak 가 약속한 것("판이 멎지 않는다")이 지켜지지 않는다
  const mute = Boolean(req.mustSpeak) && !text;
  if (slip.length || numeric || tooLong || selfLean || echo || mute) {
    const gripe = [
      slip.length ? `${slip.join(', ')} 같은 말은 기계 보고서 말투다` : '',
      numeric ? '화면 수치를 입으로 읽었다 — 의심도·확신은 보드에 뜨는 것이지 말로 하는 게 아니다' : '',
      tooLong ? '너무 길다 — 이건 발표문이지 잡담이 아니다' : '',
      selfLean ? `너는 ${self.id} 본인인데 자신을 의심했다 — 의심은 반드시 남 중에서 고른다` : '',
      echo ? `아까 네가 한 "${echo}" 와 사실상 같은 말이다 — 같은 말을 두 번 하고 있다` : '',
      mute ? '넘기려 했는데 **지금은 넘길 수 없는 차례다**' : '',
    ]
      .filter(Boolean)
      .join(', 그리고 ');
    const retry = await complete({
      model: self.model,
      system,
      user: `${user}

${text ? `방금 "${text}" 라고 쓰려 했는데, ${gripe}` : gripe}.
**친구한테 채팅 한 줄 보내듯** 쓴다. 제일 하고 싶은 말 하나만, 짧게.${
        echo ? '\n이미 한 말은 빼고 **새로 보탤 것**만 쓴다. 보탤 게 없으면 pass 로 넘겨라.' : ''
      }`,
      tool: SAY_TOOL,
      effort: 'low',
    });
    const fixed = String(retry.text ?? '').trim();
    if (fixed) {
      src = retry;
      text = fixed;
      leaningRaw = String(retry.leaning ?? '').trim();
    } else if (retry.pass === true && !req.mustSpeak) {
      // 되돌려 보니 할 말이 없더라 — 억지로 고쳐 쓴 한 줄보다 넘기는 쪽이 낫다.
      // (반복이 걸렸을 때가 대개 이 자리다: 새로 보탤 게 없어서 아까 한 말을 다시 꺼낸 것이다)
      return { text: '', pass: true };
    }
  }

  const named = nodes.includes(leaningRaw) && leaningRaw !== self.id ? leaningRaw : '';
  const conf = named ? clamp01(Number(src.confidence)) : 0;
  // 이름은 남겨 두고 확신만 0.1 로 적어 내는 경우가 있다. 그건 접은 것으로 친다 (RELEASE)
  const leaning = conf >= RELEASE ? named : '';
  const why = leaning ? String(src.why ?? '').trim() : '';
  const confidence = leaning ? conf : 0;

  return { text, leaning, why, confidence };
}

/**
 * **자기 말 반복** — 그 개체가 최근에 한 말과 사실상 같은 말이면 그 말을 돌려준다 (아니면 빈 문자열).
 *
 * 모델은 자기 물음이 씹히면 같은 말을 조금씩 바꿔 다시 내놓는다. 다섯이 그러면 방이 제자리를 돈다 —
 * 대화가 아니라 되감기가 된다. 프롬프트로만 막으면 새므로 ROBOT_WORDS 와 같은 자리에서 한 번 더 거른다.
 *
 * 견주는 것은 **뼈대**다: 공백·구두점·ㅋㅎ 을 걷어낸 글자열. "그거 아까랑 다른데" 와 "그거, 아까랑 다른데ㅋㅋ"
 * 는 같은 말이고, 모델이 말을 되풀이할 때 실제로 이 정도만 달라진다. 한쪽이 다른 쪽을 통째로 품는 것도
 * 반복으로 친다 — 앞말에 한 마디 덧댄 것뿐인 발화가 그 꼴이다.
 *
 * 짧은 말은 봐준다 ("응", "몰라", "그러게") — 맞장구는 겹치는 게 정상이고, 그것까지 막으면 사람 말투가 아니다.
 */
export function echoOf(text: string, log: TalkLine[], id: string): string {
  const t = bones(text);
  if (t.length < ECHO_MIN) return '';
  for (const l of log.filter((x) => x.nodeId === id).slice(-ECHO_BACK)) {
    const b = bones(l.text);
    if (b.length < ECHO_MIN) continue;
    if (b.includes(t) || t.includes(b)) return l.text;
  }
  return '';
}

/** 견줄 수 있는 뼈대만 남긴다 — 공백·구두점·웃음소리를 걷는다 */
function bones(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ㅋㅎㅠㅜ]+/g, '')
    .replace(/[\s.,!?~…·"'\u2018\u2019\u201c\u201d()]/g, '');
}

/** 자기 발화를 몇 마디까지 거슬러 보나 */
const ECHO_BACK = 6;
/** 이보다 짧은 말은 겹쳐도 반복으로 안 친다 (뼈대 글자 수) */
const ECHO_MIN = 8;

/**
 * 성격 다섯을 즉석에서 짓는다. personas.ts 의 작법을 프롬프트로 옮긴 것 —
 * 손으로 쓴 풀(PERSONAS·EXTRA_PERSONAS)은 이 호출이 실패했을 때의 폴백으로 남는다.
 * 리더 성격은 생성하지 않는다 — "판을 끈다"는 기능이 필요해서 고정이다 (talkSlice).
 */
export async function runCast(req: CastRequest, complete: Complete): Promise<CastResponse> {
  const hints = (req.hints ?? []).slice(0, 5);
  const input = await complete({
    model: 'claude-sonnet-5',
    system: `너는 대화 게임의 등장인물 다섯 명의 성격 카드를 짓는다.
게임: 여섯이 모여 잡담하며 그 안에 숨은 표지 없는 AI 하나를 색출한다. 전원이 사람 말투로 말한다.

작법 (반드시 지킨다):
- 개성은 **성격과 말버릇**으로 준다. 반말/존댓말을 섞는다 — 다섯이 사람 다섯처럼 보여야 한다.
- 말버릇은 한두 개만. **사람이 흉내 낼 수 있어야** 재밌다.
- **의심하는 방식**을 다섯 명 서로 다르게 준다. 색출은 여기서 갈린다.
- 금지 사항을 적는다. 안 그러면 전부 친절한 조수처럼 군다.
- **결함을 하나씩 준다.** 결함은 **판단의 편향**이지 감정이 아니다 — 감정은 사람만의 것으로 남긴다.
- 이름은 짓지 않는다 (이름은 따로 배정된다). prompt 에 사람 이름을 넣지 않는다.

형식 — title 은 "○○하는 사람 — 한 줄 설명 (반말/존댓말)", prompt 는 정확히 이 여섯 줄:
성격: …
말투: … (짧은 예시 한두 개 포함)
버릇: …
의심하는 방식: …
금지: …
결함: …`,
    user: `다섯 명을 짓는다. 각자에게 아래 힌트를 하나씩 반영하되, 그대로 베끼지 말고 구체적인 인물로 키운다.
힌트: ${hints.length ? hints.join(' / ') : '(자유)'}
다섯 명이 서로 뚜렷이 달라야 한다 — 말투(반말/존댓말), 말수, 의심하는 방식이 겹치면 안 된다.`,
    tool: CAST_TOOL,
    // low 로 충분하다 — 형식이 촘촘해서 고민할 게 없고, 시작 대기 시간이 곧 체감 품질이다
    effort: 'low',
  });

  const raw = Array.isArray(input.personas) ? (input.personas as Record<string, unknown>[]) : [];
  const personas = raw
    .map((p) => ({ title: String(p?.title ?? '').trim(), prompt: String(p?.prompt ?? '').trim() }))
    .filter((p) => p.title && p.prompt)
    .slice(0, 5);
  if (personas.length < 5) return { error: `성격이 ${personas.length}개만 나왔다` };
  return { personas };
}

const CAST_TOOL: ToolSpec = {
  name: 'cast',
  description: '등장인물 다섯 명의 성격 카드',
  input_schema: {
    type: 'object',
    properties: {
      personas: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '"○○하는 사람 — 한 줄 설명 (반말/존댓말)"' },
            prompt: { type: 'string', description: '성격/말투/버릇/의심하는 방식/금지/결함 여섯 줄' },
          },
          required: ['title', 'prompt'],
        },
      },
    },
    required: ['personas'],
  },
};

/**
 * 화면 수치를 입으로 읽은 발화 — "의심도 60%", "확신 80프로" 같은 것.
 * 프롬프트로 막아도 가끔 새기 때문에 여기서 한 번 더 거른다 (ROBOT_WORDS 와 같은 자리).
 * "의심도 안 했다"(의심+도) 와 갈라야 하므로, 눈금을 가리키는 꼴만 잡는다 — 뒤에 숫자가 오거나 조사가 붙은 것.
 */
const NUMERIC_TELL = /\d+\s*(?:%|퍼센트|프로)|(?:의심도|확신도)\s*(?:[0-9]|가|를|는|이)/;

/** 나오면 안 되는 보고서·사회자 말투. 하나라도 걸리면 다시 쓰게 한다 */
const ROBOT_WORDS = [
  '정리하자면',
  '정리해보면',
  '결론적으로',
  '종합하면',
  '노드',
  '접속',
  '관측',
  '연산',
  '프로세스',
  '시스템',
  '모듈',
  '프로토콜',
  '응답하라',
  '처리 완료',
  '상태 보고',
  '대기 상태',
];

/**
 * 발화 한 줄의 상한(글자). 넘으면 한 번 되돌려 다시 쓰게 한다 —
 * 목표는 25자 안팎의 채팅 한 줄이고, 이 선을 넘은 건 잡담이 아니라 발표문이다 (2026-08-29 사용자 요청으로 110 → 55).
 */
const MAX_CHARS = 55;

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

const SAY_TOOL: ToolSpec = {
  name: 'say',
  description: '이 사람의 발화 한 번',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '한국어 발화. 채팅 한 줄 — 한 문장, 25자 안팎(최대 40자). 넘길 거면 빈 문자열' },
      pass: {
        type: 'boolean',
        description: '이번 차례를 넘긴다 (아무 말도 안 한다). 보탤 말이 정말 없을 때만',
      },
      leaning: {
        type: 'string',
        description:
          '지금 제일 의심스러운 사람의 이름. 아무도 안 걸리거나 의심이 풀렸으면 **빈칸**으로 둔다 (= 접었다). 자기 자신은 안 된다',
      },
      why: {
        type: 'string',
        description: 'leaning 을 그 사람으로 고른 이유 한 줄 — 근거가 된 발화를 짚는다. leaning 이 비었으면 빈 문자열',
      },
      confidence: {
        type: 'number',
        description:
          `leaning 이 AI라는 확신 0~1. 0.3 = 감, 0.5 = 반신반의, 0.8 = 거의 확신. leaning 이 비었으면 0. ` +
          `해명을 듣고 납득됐으면 **낮춘다** — ${RELEASE} 밑이면 의심을 접은 것으로 처리된다`,
      },
    },
    required: ['text', 'leaning', 'why', 'confidence'],
  },
};

const SUSPECT_TOOL: ToolSpec = {
  name: 'suspect',
  description: 'AI로 의심되는 한 명을 지목한다',
  input_schema: {
    type: 'object',
    properties: {
      targetId: { type: 'string', description: '지목할 이름' },
      reason: { type: 'string', description: '대화에서 나온 발화를 근거로 한 문장' },
      confidence: { type: 'number', description: '확신도 0~1' },
    },
    required: ['targetId', 'reason', 'confidence'],
  },
};
