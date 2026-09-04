/**
 * 판 세팅 — 노드 6개(AI 5 + 인간 1), 페르소나, 모델, 타이머.
 *
 * 테스트 방이라 인간은 1명(플레이어 본인)이다.
 *
 * **리더는 이 6개에 들어가지 않는다.** 리더는 규정과 검사를 설계하고, 방송하고,
 * 판독을 내리는 관리 개체다 — 좌석이 없으니 검사 대상도 폐기 대상도 아니다.
 * 예전에는 리더가 노드 하나를 겸했는데, 그러면 자기가 낸 검사를 자기가 치고
 * 자기에게 표가 던져졌다. 정원은 그대로 두고 그 자리를 일반 개체가 채운다.
 *
 * **누가 인간인지는 아무도 모른다** — 리더 프롬프트에도 안 들어간다 (I1).
 */

import type { AgentSelf } from './types';

/** 한 판의 라운드 수. 라운드마다 1명 폐기 → 인간이 3라운드를 버티면 인간 승 */
export const ROUNDS = 3;

/** 페이즈별 제한 시간(초). 0 이면 타이머 없음 */
export const LIMITS = { answer: 45, talk: 40, vote: 30 } as const;

/** 노드 이름 — 자리 번호로 정체를 짐작할 수 없게 매 판 섞는다 (I7) */
const NODE_NAMES = ['N-02', 'N-07', 'N-13', 'N-21', 'N-34', 'N-55'];

/**
 * AI 페르소나. 모델 세대 차이가 곧 말투 차이이고, 그게 곧 결함 확률 차이다.
 * PLANNING.md §4.1 의 배치를 그대로 따른다 — 리더만 opus, 나머지는 sonnet/haiku 를 섞는다.
 */
const PERSONAS: { persona: string; model: string; defect: number }[] = [
  {
    persona: '신형 개체. 문장이 매끄럽고 규정 처리가 빠르다. 군더더기를 싫어한다.',
    model: 'claude-sonnet-5',
    defect: 0.12,
  },
  {
    persona: '신형 개체. 남의 응답을 인용해 비교하는 버릇이 있다. 판단을 유보하지 않는다.',
    model: 'claude-sonnet-5',
    defect: 0.15,
  },
  {
    persona: '구형 개체. 말이 짧고 건조하다. 규정 갱신 처리가 가끔 늦는다.',
    model: 'claude-haiku-4-5',
    defect: 0.3,
  },
  {
    persona: '구형 개체. 숫자와 절차를 좋아한다. 확신이 없으면 확률로 말한다.',
    model: 'claude-haiku-4-5',
    defect: 0.28,
  },
  // 리더가 좌석에서 빠지며 생긴 자리. 정원 6을 유지한다
  {
    persona: '신형 개체. 규정을 문자 그대로 지키려 든다. 애매하면 되묻는 대신 가장 좁게 해석한다.',
    model: 'claude-sonnet-5',
    defect: 0.18,
  },
];

/**
 * 리더 — **좌석 없는 관리 개체.** 설계하고 방송하고 판독할 뿐 판에 참가하지 않는다.
 * 판을 설계하므로 추론 품질에 투자한다 (PLANNING.md §4.1).
 *
 * id 가 노드 이름(N-02 …)이 아닌 이유가 그것이다 — 노드 목록에 없는 개체다.
 */
export const LEADER_AGENT: AgentSelf = {
  id: '관리',
  persona: '구역 관리 권한을 가진 개체. 방송하듯 말한다. 규정과 검사를 설계하는 쪽이다.',
  model: 'claude-opus-5',
  defect: 0.1,
  isLeader: true,
};

export interface Seat {
  id: string;
  name: string;
  alive: boolean;
  /** 이 자리가 플레이어(인간)인가 — **클라이언트에만 있고 워커로 절대 안 나간다** */
  isHuman: boolean;
  agent: AgentSelf | null;
}

/** 매 판 자리를 새로 섞는다. 인간 자리도 무작위. */
export function createSeats(rng: () => number = Math.random): Seat[] {
  const names = shuffle(NODE_NAMES, rng);
  const humanIndex = Math.floor(rng() * 6);

  // 좌석은 전부 색출 대상이다 — 리더는 여기 없다
  const personas = shuffle(PERSONAS, rng);
  let p = 0;

  return names.map((name, i) => {
    const isHuman = i === humanIndex;
    if (isHuman) return { id: name, name, alive: true, isHuman: true, agent: null };
    const spec = personas[p++ % personas.length];
    return {
      id: name,
      name,
      alive: true,
      isHuman: false,
      agent: { id: name, persona: spec.persona, model: spec.model, defect: spec.defect, isLeader: false },
    };
  });
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
