/**
 * 테스트 방(2D) 의 공용 타입 — 클라이언트(src/features/lab)와 워커(worker/src/lab)가 같이 읽는다.
 *
 * 이 파일은 의존성이 없어야 한다. 워커에서도 그대로 번들되므로 react/DOM 타입을 끌어오면 빌드가 깨진다.
 *
 * ★ 설계 원칙(PLANNING.md §3 I1): **워커로 나가는 상태에는 정체가 들어가지 않는다.**
 *   에이전트가 보는 것은 이 파일의 PublicState 뿐이고, 여기에는 "누가 인간인가"가 없다.
 *   폐기된 노드의 정체만 공개된다 — 그건 규칙상 전원이 아는 정보다.
 */

export type RuleKind = 'maxLen' | 'banChars' | 'prefix' | 'banWords' | 'endPeriod' | 'noFirstPerson';

/** 리더가 매 라운드 하나씩 추가하는 규정. param 은 종류마다 다르다. */
export interface Rule {
  kind: RuleKind;
  /** maxLen 의 글자 수 */
  n?: number;
  /** prefix 의 접두어 */
  token?: string;
  /** banWords 의 금지어 */
  words?: string[];
  /** 화면에 뜨는 문구 (리더가 쓴다) */
  label: string;
}

export type TestTemplate = 'FORMAT' | 'ECHO' | 'SYNC' | 'LEAK';

/** 리더가 설계한 이번 라운드 검사 */
export interface TestSpec {
  template: TestTemplate;
  /** 전원에게 보이는 검사 지시문 */
  prompt: string;
  /** FORMAT 이 다시 쓰라고 주는 문장 */
  sentence?: string;
  /** SYNC 의 보기 */
  options?: string[];
}

export type Grade = 'normal' | 'warn' | 'alert';

export interface AnswerRecord {
  nodeId: string;
  text: string;
  /** 위반한 규정 문구 */
  violations: string[];
  score: number;
  grade: Grade;
}

export interface TalkRecord {
  nodeId: string;
  text: string;
}

export interface EjectRecord {
  nodeId: string;
  /** 폐기 시 정체는 즉시 공개된다 (규칙) */
  wasHuman: boolean;
}

export interface RoundPublic {
  round: number;
  /** 이 라운드 시점의 누적 규정 문구 */
  ruleLabels: string[];
  test: TestSpec | null;
  /** 리더 방송문 */
  announce: string;
  answers: AnswerRecord[];
  talks: TalkRecord[];
  ejected: EjectRecord | null;
  /** 누가 누구를 찍었는지 — 공개 투표다 */
  votes: { voterId: string; targetId: string }[];
}

export interface PublicNode {
  id: string;
  name: string;
  alive: boolean;
}

/** 워커로 나가는 전부. 정체 필드는 없다. */
export interface PublicState {
  nodes: PublicNode[];
  rounds: RoundPublic[];
  currentRound: number;
  /** 지금까지 누적된 규정 — 전원이 화면으로 보는 공개 정보다 */
  rules: Rule[];
}

/** 에이전트 한 개체가 자기에 대해 아는 것 (자기가 AI 라는 것과 말투뿐) */
export interface AgentSelf {
  id: string;
  persona: string;
  model: string;
  /** 규정 위반 확률 — 구형 모델일수록 높다. 화면에 노출하지 않는다 (I5) */
  defect: number;
  isLeader: boolean;
}

export type ActKind = 'design' | 'answer' | 'talk' | 'vote';

export interface ActRequest {
  kind: ActKind;
  self: AgentSelf;
  state: PublicState;
  /** design 재요청일 때: 직전 설계가 기각된 사유 — 리더가 보고 고치게 한다 (§1.4 ③ 재생성 루프) */
  note?: string;
}

export interface DesignResult {
  rule: Rule;
  test: TestSpec;
  announce: string;
}

export interface ActResponse {
  design?: DesignResult;
  /** answer / talk */
  text?: string;
  /** vote */
  targetId?: string;
  reason?: string;
  /** 호출이 실패했을 때 (화면에 그대로 띄운다 — 조용히 삼키지 않는다) */
  error?: string;
}
