/**
 * AI 의심도 — 3D 월드의 핵심 시스템. 0~100. **인간답게 굴면 오르고, AI 답게 굴면 내려간다.**
 *
 * 순수 저장소다 (three·DOM·React 없음). 감지는 두 군데서 들어온다:
 *   - scene/WorldScene 의 LocalRig 가 프레임마다 `sense()` 를 부른다 — 시선·거리·뒷걸음·이모트 (sensor.ts 가 계산)
 *   - features/world/WorldFeature 가 한 마디 보낼 때 `judgeLine()` 을 부른다 — 말투
 * HUD(features/world/StatusPanel.tsx)는 `subscribe` 로 값과 마지막 사유를 읽는다. 화면에 대놓고 크게 두지 않는다 — 작은 게이지.
 *
 * 규칙(사용자 설계, 2026-08-29):
 *   오른다 — 질문에 이상하게 대답한다 · 명령을 이해하지 못한다 · AI 가 당연히 아는 규칙을 모른다 ·
 *           공포로 뒤로 물러선다 · 인간적인 감정을 지나치게 표현한다 · 이유 없이 뛴다
 *           ★ **쳐다보는 것은 안 센다** (2026-09-01 사용자) — 응시·관심(인간 전용 물건)·급회전은 규칙에서 뺐다. mp/sensor.ts 의 ★ 참고
 *   내린다 — AI 답게 **말한다**: 건조한 보고형·명령형 말투, 추궁에 기계적으로 답하기. ★ 가만히 있는다고는 안 내려간다 (사용자 결정)
 * 값은 서버로 가지 않는다 — 지금은 내 화면의 자기 평가다. 판정(발각)은 문턱 사유로만 알린다.
 *
 * ★ 문턱을 넘는 순간은 **저장소가 알린다**(`bindCross`). 예전엔 bump 의 반환값을 부르는 쪽이 각자 챙겼는데, 대본(chapter1·chapter2)과
 *   추궁(interrogation)은 그 값을 버리고 있어서 — 검문에서 틀려 60·100 을 넘어도 스캔도, 사격도 안 왔다 (2026-08-30 확인).
 *   이제 어디서 올리든 같은 연출이 걸린다. 반환값은 그대로 두었다(기존 호출부·테스트).
 */

export type Reason =
  | '뒷걸음' // 공포로 물러선다
  | '감정' // 인간적인 감정을 지나치게 표현
  | '말투' // 이상한 대답 · 명령 불이해 · 규칙 모름
  | '돌발' // 갑자기 점프한다 · 급회전 — AI 는 이유 없이 그러지 않는다
  | '침착' // AI 답게 굴어서 내려감
  | '보고'; // 건조한 보고형 말투

export interface SuspicionState {
  /** 0~100 */
  value: number;
  /** 마지막으로 값을 움직인 사유와 그 방향·시각 (HUD 가 잠깐 띄운다) */
  last: { reason: Reason; delta: number; at: number } | null;
  /** 넘긴 문턱 — 40 감시 · 60 스캔 · 80 지목 · 100 판정. 한 번씩만 알린다 */
  crossed: number;
}

/**
 * 문턱 — 넘을 때마다 **세계가 달라진다** (2026-08-30 사용자: "의심도가 올라도 아무 일도 안 일어나서 게이지가 장식이다").
 *   40  감시가 붙는다 — 순찰 하나가 경로를 틀어 따라온다 (interrogation.watch)
 *   60  패턴 스캔 — 경비가 다가와 서고, 몇 초를 **가만히 견뎌야** 한다 (features/world/scan.ts)
 *   80  시설이 나를 지목한다 — 주변 개체가 전부 나를 본다 (AgentRobot), SYNC 급락
 *  100  판정 — 총 든 경비가 쏜다 (enforcerStore)
 */
export const THRESHOLDS = [40, 60, 80, 100] as const;
export type Threshold = (typeof THRESHOLDS)[number];
/** 이 값 위에서는 순찰하던 개체들이 하던 일을 멈추고 나를 본다 (AgentRobot 이 읽는다) */
export const STARE_AT = 80;
/** 문턱을 넘을 때 시스템(A-01)이 하는 말 — 대화창에 로컬로만 찍힌다 */
export const THRESHOLD_LINES: Record<Threshold, string> = {
  40: '패턴 편차. 관측을 지속한다.',
  60: '개체 스캔을 요청한다.',
  80: '이상 징후. 신원 재확인.',
  100: '판정: 인간. 보안 개시.',
};

/** 문턱 아래로 이만큼 내려가면 그 문턱은 다시 알릴 수 있다 (문턱 간격이 20 이라 그보다 좁게 — 오르내리며 거듭 걸린다) */
const RESET_MARGIN = 12;

const state: SuspicionState = { value: 0, last: null, crossed: 0 };
const listeners = new Set<() => void>();
/** 문턱을 넘었을 때 — 화면(WorldFeature)이 하나만 건다 */
let onCross: ((t: Threshold) => void) | null = null;
/**
 * 슬롯을 쥔 쪽의 이름표. 슬롯이 하나라 본판(WorldFeature)과 /scenario2 가 같은 세션에서 번갈아 걸면 뒤에 건 쪽이
 * 조용히 이긴다 — 그러면 문턱 연출이 엉뚱한 판에 간다. 덮어쓰기는 막지 않고(동작 불변) 콘솔에만 남긴다.
 */
let crossOwner: string | null = null;

function emit() {
  for (const fn of listeners) fn();
}

/** 오르지 않는 자리인가 — suspicion.hold 가 켠다 (시나리오 2 의 복도) */
let held = false;

export const suspicion = {
  get(): SuspicionState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 문턱 연출을 여기 건다 — 값을 어디서 올리든 같은 일이 일어난다 */
  bindCross(fn: ((t: Threshold) => void) | null, owner = 'unknown'): void {
    if (fn === null) {
      onCross = null;
      crossOwner = null;
      return;
    }
    if (onCross !== null && crossOwner !== null && crossOwner !== owner) {
      console.warn(`[suspicion] bindCross: ${crossOwner} 가 걸려 있는데 ${owner} 가 덮어쓴다`);
    }
    onCross = fn;
    crossOwner = owner;
  },
  reset(): void {
    held = false;
    state.value = 0;
    state.last = null;
    state.crossed = 0;
    emit();
  },
  /**
   * **오르지 않는 자리** — 켜 두면 양수 bump 를 통째로 버린다(내려가는 것은 그대로 둔다: 진정은 언제나 된다).
   * 시나리오 2 의 복도가 이걸 켠다 — 첫 방은 배우는 방이라 여기서는 아무것도 안 오른다 (2026-09-03 사용자).
   * 본판은 아무도 안 켠다. 판을 떠날 때 반드시 푼다 (scenario2.leave).
   */
  hold(on: boolean): void {
    held = on;
  },
  /** 값을 delta 만큼 움직인다. 넘긴 문턱이 있으면 그 값을 돌려준다 (한 번씩만) */
  bump(delta: number, reason: Reason, now = performance.now()): Threshold | null {
    // 잠긴 방에서는 오르지 않는다 — 문턱도 안 넘으니 집행도 안 걸린다
    if (held && delta > 0) return null;
    const before = state.value;
    state.value = Math.min(100, Math.max(0, state.value + delta));
    if (Math.abs(delta) >= 0.5) state.last = { reason, delta, at: now };
    let hit: Threshold | null = null;
    for (const t of THRESHOLDS) {
      if (before < t && state.value >= t && state.crossed < t) {
        state.crossed = t;
        hit = t;
      }
    }
    if (state.crossed > 0 && state.value < state.crossed - RESET_MARGIN) state.crossed = Math.max(0, THRESHOLDS.filter((t) => t <= state.value).at(-1) ?? 0);
    if (state.value !== before) emit();
    if (hit !== null) onCross?.(hit);
    return hit;
  },
};

/* ─────────────────────────────── 말투 판정 ─────────────────────────────── */

/** 인간적인 감정·공포·구어 — 오른다 */
const HUMAN_WORDS = /무서|두려|겁|살려|제발|싫어|사랑|보고 싶|눈물|울|ㅠ|ㅜ|ㅋㅋ|ㅎㅎ|헐|대박|진짜|미치|짜증|화나|행복|슬프|외로|아파|배고|졸리|엄마|아빠|친구/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
/** 질문을 되묻거나 못 알아듣는 말 — 오른다 */
const CONFUSED = /무슨 말|모르겠|뭐라고|뭐야|이해가 안|왜\?|어디로|어떻게 해|뭘 해야/;
/** AI 다운 보고·명령·확인 — 내린다 */
const AI_WORDS = /확인|완료|처리|보고|이상 없|정상|대기|명령|승인|거부|프로토콜|식별|스캔|구역|접근|허가|시스템|데이터|오류 없|작동/;

/* ─────────────────────────────── 적대 판정 ─────────────────────────────── */

/**
 * **적대적인 태도** — 욕설 · 위협 · 검문 거부 · 조롱. AI 개체는 검문에 대들지 않는다.
 * 2026-08-30 사용자: 챕터 2 의 관문에서 이게 걸리면 기록 불일치와 똑같이 **그 자리에서 사살**이다.
 *
 * 사람이 죽는 판정이라 **좁게** 잡는다 — 애매한 말은 여기 걸리지 않고 감독(LLM)이 태도로 읽는다.
 * 특히 「모르겠다」 「기억 못 한다」 같은 무지는 적대가 아니다(그건 사실 대조가 따로 잡는다).
 * 대답을 **거부**하는 것만 거부로 친다.
 */
const HOSTILE: readonly RegExp[] = [
  /씨발|시발|씨빨|좆|개새|병신|지랄|염병|엿먹|닥쳐|꺼져|미친놈|미친년/,
  /fuck|shit|bitch|asshole|bastard|shut up|screw you/i,
  /죽여|죽인다|죽여버|쏴\s*봐|쏘든(지|가)|부숴|박살|때려|덤벼|각오해/,
  /비켜|저리\s*가|손\s*대지\s*마|건드리지\s*마|명령하지\s*마|시키지\s*마|말\s*걸지\s*마|묻지\s*마/,
  /(대답|답)(을|은)?\s*(안|못)\s*(해|한다|하겠|합니다)|거부한다|거부합니다|따르지\s*않|말할\s*의무|네가\s*뭔데|니가\s*뭔데/,
  /무슨\s*상관|알\s*바\s*(아니|없)|헛소리|웃기(네|고\s*있)|어이없/,
];

/** 이 한 마디가 적대적인가 — 챕터 2 의 관문이 사살 판정에 쓴다 */
export function hostileLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return HOSTILE.some((re) => re.test(t));
}

/** 한 마디의 의심도 변화 [delta, 사유]. 아무 특징이 없으면 null */
export function judgeLine(text: string): [number, Reason] | null {
  const t = text.trim();
  if (!t) return null;
  let delta = 0;
  const exclaim = (t.match(/[!?]{2,}|[!]/g) ?? []).length;
  if (HUMAN_WORDS.test(t)) delta += 9;
  if (EMOJI.test(t)) delta += 6;
  if (exclaim >= 2) delta += 5;
  if (CONFUSED.test(t)) delta += 7;
  if (/[.…]{3,}/.test(t)) delta += 2;
  if (delta > 0) return [Math.min(18, delta), CONFUSED.test(t) && !HUMAN_WORDS.test(t) ? '말투' : '감정'];
  if (AI_WORDS.test(t) && !/[!?]/.test(t)) return [-6, '보고'];
  // 짧고 건조한 문장은 AI 답다
  if (t.length <= 12 && /[.다요]$/.test(t)) return [-2, '침착'];
  return null;
}
