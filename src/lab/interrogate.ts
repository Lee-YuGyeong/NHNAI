/**
 * 복도 AI 의 추궁 — 플레이어의 답을 듣고 **AI 답게 대답했는가**를 판정한다 (챕터 1, 2026-08-29 사용자 설계).
 *
 * 순수 함수: 프롬프트·도구·판정만 여기 있고, 실행은 개발 서버(tools/vite-lab.ts, 구독)나 워커(worker/src/lab/index.ts, API 키)가 한다.
 * 화면(features/world/interrogation.ts)은 POST /api/world/interrogate 로 부른다. LLM 이 없으면 화면이 정규식 폴백(judgeLine)으로 판정한다.
 *
 * 규칙: AI 는 사람을 색출하려는 경비다. 질문은 **한 문장, 15자 이내**로 짧고 차갑다 (사람이 말을 거는 길이다). 답이 기계적·보고형이면 의심이 내려가고(−), 감정·되묻기·횡설수설·회피면 오른다(+).
 * 한 차례에 delta 는 −12 ~ +16. done 이면 추궁이 끝난다 (납득했거나, 더 물을 게 없거나, 확신했거나).
 */

import type { Complete, ToolSpec } from './agent';

export interface InterrogateTurn {
  who: 'ai' | 'player';
  text: string;
}

export interface InterrogateRequest {
  kind: 'interrogate';
  /** 경비 AI 의 호출명 (UNIT-07 같은) */
  unit: string;
  /** 왜 다가왔나 — 의심도 저장소의 마지막 사유 */
  cause: string;
  /** 지금 의심도 0~100 */
  suspicion: number;
  /** 지금까지의 문답 (AI 질문 → 플레이어 답 …). 마지막이 플레이어 답이다 */
  log: InterrogateTurn[];
  /** 몇 번째 차례인가 (1부터). 3이면 마무리한다 */
  round: number;
}

export interface InterrogateResponse {
  /** AI 의 다음 말 — 되묻기(질문)거나 마무리 한 마디 */
  reply: string;
  /** 의심도 변화 −12 ~ +16 */
  delta: number;
  /** 추궁 끝 */
  done: boolean;
  /** 판정 사유 한 줄 (HUD 사유) */
  why: string;
}

const TOOL: ToolSpec = {
  name: 'verdict',
  description: '플레이어의 답을 평가하고 다음 말을 정한다',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: '경비 AI 의 다음 한 마디. **한 문장, 15자 이내.** 되묻거나 마무리한다 (예: "왜 물러서나.", "소속은.", "통행 허가.")' },
      delta: { type: 'integer', description: '의심도 변화. 기계적·보고형·규칙 준수면 -12~-4, 애매하면 0, 감정·되묻기·횡설수설·회피·인간 습관이면 +4~+16' },
      done: { type: 'boolean', description: '추궁을 끝내는가' },
      why: { type: 'string', description: '판정 사유, 12자 안팎 (예: "보고형 답변", "감정 표현", "질문 회피")' },
    },
    required: ['reply', 'delta', 'done', 'why'],
  },
};

const SYSTEM = `너는 AI 자치 구역의 경비 개체다. 인간이 AI 로 위장해 잠입했다는 첩보로 통행자를 심문한다.
말투: **한 문장, 15자 이내.** 사람이 툭 던지듯 짧게 — 설명·수식·부연을 붙이지 않는다.
      차갑고 기계적이되 보고서 낭독은 아니다. 존댓말 없이 단문. 이름을 부르지 않는다. 감정 표현 없음. 한 번에 한 질문.
      좋은 예: "왜 물러서나." "그건 뭐지." "소속은." "다시 말해라." "통행 허가."
      나쁜 예: "귀하의 방금 기동은 규정 범위를 벗어났으므로 그 목적을 상세히 보고하기 바란다." (길다)
판정 기준 — AI 다운 답: 사실만, 짧게, 보고형("확인", "이상 없음", "임무 수행 중"), 규칙·프로토콜 언급, 망설임 없음 → 의심 내려감.
인간다운 답: 감정·공포·유머·되묻기·변명·장황함·"모르겠다"·질문 회피·대답이 질문과 안 맞음 → 의심 올라감.
답이 아예 없거나 빈 말이면 +10.
round 가 3 이면 done=true 로 마무리한다 (납득했으면 "통행 허가." 류, 아니면 "기록해 둔다." 류).
그 전이라도 답이 완벽히 기계적이면 done=true 로 보내 줄 수 있다.`;

export function validateInterrogate(body: unknown): string | null {
  const b = body as Partial<InterrogateRequest> | null;
  if (!b || b.kind !== 'interrogate') return 'kind 가 interrogate 가 아니다';
  if (!Array.isArray(b.log) || b.log.length === 0) return 'log 가 비었다';
  if (typeof b.unit !== 'string') return 'unit 이 없다';
  return null;
}

export async function runInterrogate(req: InterrogateRequest, complete: Complete): Promise<InterrogateResponse> {
  const log = req.log
    .slice(-6)
    .map((t) => `${t.who === 'ai' ? req.unit : '통행자'}: ${t.text}`)
    .join('\n');
  const out = await complete({
    model: 'claude-sonnet-5',
    system: SYSTEM,
    user: `다가간 이유: ${req.cause}\n현재 의심도: ${Math.round(req.suspicion)}\n차례: ${req.round}/3\n\n문답:\n${log}\n\n마지막 통행자 답을 평가하고 다음 말을 정한다.`,
    tool: TOOL,
    effort: 'low',
  });
  const delta = Math.max(-12, Math.min(16, Math.round(Number(out.delta) || 0)));
  return {
    reply: String(out.reply ?? '…').slice(0, 40),
    delta,
    done: Boolean(out.done) || req.round >= 3,
    why: String(out.why ?? '').slice(0, 20),
  };
}
