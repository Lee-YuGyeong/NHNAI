/**
 * 뒷걸음 판정 — 통행자가 **뒤로 물러선 한 장면**이 의심스러운가를 AI 가 본다 (2026-08-30 사용자 설계).
 *
 * 여태는 규칙이 고정이었다: 나를 보는 개체가 4.5m 안에 있는데 뒤로 걸으면 무조건 초당 +5.
 * 그래서 경비가 다가와 길을 비켜 준 것도, 굉음을 피한 것도, 줄이 밀린 것도 전부 "공포로 물러섬"이 됐다.
 * 사용자: "어떤 상황에 올리고 어떤 상황에 안 올릴지 AI 판단에 맡기면 좋겠다."
 *
 * 순수 함수: 프롬프트·도구·폴백만 여기 있고, 실행은 개발 서버(tools/vite-lab.ts, 구독)나
 * 워커(worker/src/lab/index.ts, API 키)가 한다. 화면(features/world/backstep.ts)이
 * POST /api/world/backstep 으로 부르고, LLM 이 없으면 아래 judgeBackstep 폴백으로 판정한다.
 *
 * 모델은 형제 격인 추궁 판정(interrogate.ts)과 같이 sonnet-5 · effort low 다 —
 * 걷는 도중에 끼어드는 판정이라 늦으면 판이 어색해진다 (한 장면당 한 번, 입력 한 줌).
 */

import type { Complete, ToolSpec } from './agent';

/** 물러설 때 나를 보고 있던 개체 하나 */
export interface BackstepWatcher {
  /** 감시 AI 인가, 같은 방의 다른 통행자인가 */
  kind: 'ai' | 'player';
  /** 물러서기 시작할 때 거리(m) */
  from: number;
  /** 물러선 뒤 거리(m) */
  to: number;
  /** 그 개체가 나에게 다가오고 있었나 — 다가오는데 물러서면 길을 비킨 것일 수도, 회피일 수도 있다 */
  approaching: boolean;
}

export interface BackstepRequest {
  kind: 'backstep';
  /** 물러선 시간(초) */
  seconds: number;
  /** 물러선 거리(m) */
  meters: number;
  /** 그때 나를 보고 있던 개체들 — 가까운 순 */
  watchers: BackstepWatcher[];
  /** 지금 의심도 0~100 */
  suspicion: number;
  /** 지금 동기화율 0~100 (낮으면 몸이 인간처럼 군다) */
  sync: number;
  /** 지금 무대 — 챕터 단계와 목표 한 줄 */
  scene: string;
  /** 방금 있었던 일들 (굉음·검문·질문·봉쇄 …). 없으면 빈 배열 */
  recent: string[];
}

export interface BackstepResponse {
  /** 의심도 변화 0~12 (0 이면 아무 일 없음) */
  delta: number;
  /** 판정 사유 한 줄 — 0 이어도 적는다 (개발자가 판정을 읽을 수 있게) */
  why: string;
}

const TOOL: ToolSpec = {
  name: 'verdict',
  description: '통행자가 뒤로 물러선 장면을 평가한다',
  input_schema: {
    type: 'object',
    properties: {
      delta: {
        type: 'integer',
        description: '의심도 변화 0~12. 상황이 물러섬을 설명하면 0, 회피로 보이면 4~8, 정지 명령·검문 중이면 9~12',
      },
      why: { type: 'string', description: '판정 사유, 12자 안팎 (예: "다가오는 경비 회피", "길을 비켰다", "정지 명령 중 이동")' },
    },
    required: ['delta', 'why'],
  },
};

const SYSTEM = `너는 AI 자치 구역의 감시 체계다. 통행자가 **뒤로 물러선 한 장면**만 보고 그것이 의심스러운지 판정한다.

배경: 인간 하나가 AI 로 위장해 이 구역에 들어와 있다. AI 개체는 갈 곳이 있으면 몸을 돌려 걷는다 —
상대를 마주 본 채 뒤로 걷는 것은 거리를 유지하려는 몸짓이고, 대개 두려움·회피에서 나온다.
다만 물러섬이 늘 이상한 것은 아니다. **상황이 그것을 설명하면 아무 일도 아니다.**

물러섬이 자연스럽다 (delta 0):
- 개체가 내 쪽으로 걸어와 길이 좁아졌다 — 비켜서는 것은 통행 규칙이다
- 줄·대기 위치가 뒤로 밀렸다, 문이 열려 통로가 났다, 좁은 곳에서 교행한다
- 굉음·작업 구역처럼 물리적 장애에서 거리를 둔다
- 아주 짧은 한 걸음 (1초 미만이거나 1미터 미만)

의심스럽다 (delta 4~12):
- 다가오는 경비를 마주 본 채 계속 물러선다 — 길을 비키는 것과 다르다. 비키는 것은 옆으로 한 걸음이고, 회피는 뒤로 길게다
- 검문·정지 명령 중이거나 질문을 받는 중에 물러선다 (가장 나쁘다 — 9~12)
- 아무 일도 없는데 상대를 보며 길게 물러선다
- 의심도가 이미 높은데 또 물러선다

판정은 자주 일어난다. 애매하면 낮게 준다 — 확실할 때만 크게.
delta 는 0~12 정수. why 는 12자 안팎 한 줄, delta 가 0 이어도 왜 괜찮은지 적는다.`;

export function validateBackstep(body: unknown): string | null {
  const b = body as Partial<BackstepRequest> | null;
  if (!b || b.kind !== 'backstep') return 'kind 가 backstep 이 아니다';
  if (typeof b.seconds !== 'number' || !(b.seconds > 0)) return 'seconds 가 없다';
  if (!Array.isArray(b.watchers)) return 'watchers 가 없다';
  return null;
}

/** 개체 한 줄 — "감시 AI: 3.2m → 4.8m (다가오는 중)" */
function watcherLine(w: BackstepWatcher): string {
  const who = w.kind === 'ai' ? '감시 AI' : '다른 통행자';
  return `- ${who}: ${w.from.toFixed(1)}m → ${w.to.toFixed(1)}m${w.approaching ? ' (나에게 다가오는 중)' : ''}`;
}

export async function runBackstep(req: BackstepRequest, complete: Complete): Promise<BackstepResponse> {
  const watchers = req.watchers.length ? req.watchers.map(watcherLine).join('\n') : '- (없음)';
  const recent = req.recent.length ? req.recent.map((r) => `- ${r}`).join('\n') : '- (없음)';
  const out = await complete({
    model: 'claude-sonnet-5',
    system: SYSTEM,
    user: `무대: ${req.scene}
의심도: ${Math.round(req.suspicion)} / 동기화율: ${Math.round(req.sync)}

물러섬: ${req.seconds.toFixed(1)}초 동안 ${req.meters.toFixed(1)}m

그때 나를 보고 있던 개체:
${watchers}

방금 있었던 일:
${recent}

이 물러섬을 평가한다.`,
    tool: TOOL,
    effort: 'low',
  });
  return {
    delta: Math.max(0, Math.min(12, Math.round(Number(out.delta) || 0))),
    why: String(out.why ?? '').slice(0, 24),
  };
}

/**
 * LLM 이 없을 때의 폴백 — 화면(오프라인·배포 전)과 센서(판정기가 안 붙었을 때)가 같이 쓴다.
 * 상황을 못 읽으니 거칠다: 짧은 한 걸음은 봐주고, 다가오는 개체 앞에서 길게 물러서면 더 준다.
 */
export function judgeBackstep(req: BackstepRequest): BackstepResponse {
  if (!req.watchers.length) return { delta: 0, why: '' };
  if (req.seconds < 0.8 || req.meters < 0.6) return { delta: 0, why: '한 걸음' };
  const near = req.watchers[0];
  if (near.approaching) return { delta: 6, why: '다가오는 개체에서 물러남' };
  return { delta: 4, why: '뒤로 물러남' };
}
