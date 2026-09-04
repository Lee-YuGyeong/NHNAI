/**
 * 시나리오 2 의 개체 대답 — **문장만** 짓는다 (2026-09-03 사용자).
 *
 * world2 의 말 걸기는 규칙이 뼈대다: 내가 친 말에서 태그 하나를 뽑고(features/world2/read.ts),
 * 그 태그를 개체의 성격이 받아 태도·의심·경보·조각이 움직인다(talk.ts). 그 값들은 **여기 안 온다** —
 * 사람이 죽는 판정에 모델이 개입하는 통로를 만들지 않는다는 규칙(execution.ts)은 그대로다.
 * 모델이 하는 일은 하나뿐이다: 그 개체가 그 자리에서 **뭐라고 말했을지** 한 문장.
 *
 * **문장은 전부 여기서 나온다** (2026-09-03 사용자: 「하드코딩은 없애줘. 모델이 죽었을 경우에만 대답하게 해줘」).
 * 대본표(cast.ts 의 voice)는 이제 **모델이 죽었을 때의 마지막 줄**이고, 살아 있는 동안에는 「이 자리에서 무엇을
 * 답하는가」를 일러 주는 쪽지다(beat) — 위로 3단 · 벽 얘기 · 업무 · 보고 · 동료 확인은 여전히 그 박자대로 답하되,
 * 문장은 그 개체의 말투로 새로 나온다. 앵무새와 인용은 다르다.
 *
 * 지어내지 못하게 묶는 것 셋: ① 한 문장 · 20자 이내 ② 세계의 사실(숫자 · 사건 · 이름 · 규정)을 새로 만들지 않는다
 * ③ 그 개체가 대본에서 쓰는 말투 표본(samples)을 준다 — 벗어나면 다른 개체가 된다.
 *
 * 순수 함수다: 프롬프트만 여기 있고 실행은 개발 서버(tools/vite-lab.ts)나 워커(worker/src/lab/index.ts)가 한다.
 * 모델이 없거나 늦으면 화면이 **원래 표의 줄로 그냥 간다** (features/world2/say.ts) — 대사가 사라지는 판은 없다.
 */

import type { Complete, ToolSpec } from './agent';

export interface World2SayRequest {
  kind: 'world2-say';
  /** 이 개체의 이름표 — A-104 같은 */
  unit: string;
  /** 무엇이 닳았는지로 부르는 이름 — 「어깨가 닳은 것」 (cast 의 title) */
  title: string;
  /** 성격 종류 — yearn · cynic · devout · curious · guard … (cast 의 persona.kind) */
  persona: string;
  /** 말을 걸기 전에 눈으로 짚을 수 있는 것 (cast 의 tell) */
  tell: string;
  /** 지금 나를 어떻게 대하나 −3(적대) ~ 3(편) */
  attitude: number;
  /** 규칙이 고른 반응 종류 — up · flat · down (표에 줄이 없어 기본값으로 떨어진 자리다) */
  reaction: string;
  /** 내 말에서 뽑은 태그와 화제 — 'none' 이면 무슨 말인지 못 알아들었다 */
  tag: string;
  topic: string;
  /** 내가 방금 친 말 */
  said: string;
  /** 어느 방인가 */
  where: string;
  /** 이 개체가 대본에서 쓰는 말투 표본 — 이 말투를 벗어나지 않는다 */
  samples: readonly string[];
  /**
   * **대본이 이 자리에 적어 둔 대답** — 있으면 그 뜻을 지켜 다시 말한다 (그대로 베끼지 않는다).
   * 위로 3단 · 벽 얘기 · 업무 · 보고 · 동료 확인처럼 연출된 박자가 여기로 온다. 판당 처음 한 번만 실린다 —
   * 두 번째부터는 없이 오고, 그때는 제 말로 짓는다. 없으면 표가 비었거나 이미 한 박자다
   */
  beat?: string;
  /*
   * 아래 넷은 2026-09-03 에 늘었다 (사용자: 「성격마다 다르게」). 여태 성격으로 실린 것은 위 `persona` 의
   * 영어 토큰 하나(yearn · bg …)뿐이라, 말투 표본까지 같은 배경 개체들이 사실상 같은 대답을 했다.
   * 넷 다 **산문이고 optional 이다** — 옛 요청도 그대로 유효해서 개발 서버(tools/vite-lab.ts)의 검사와
   * 워커(worker/src/lab/index.ts)가 같은 타입을 그대로 쓴다. 값을 만드는 곳은 features/world2/sayfields.ts 다.
   */
  /** 이 개체가 어떤 것인가 — 한 줄 (cast 의 persona.temper, 없으면 kind 를 푼 줄) */
  nature?: string;
  /** 몸이 말해 주는 것 — 닳은 자리 · 강도 · 수선 · 얼굴판 · 자세 · 하던 일 */
  body?: string;
  /** 무엇에 열리고 무엇에 닫히나 — 부호와 값은 안 온다 (모델이 메타를 말한다) */
  bent?: string;
  /** 이 개체와 오간 앞 대화 — 최근 넷, 「나: …」 「그것: …」 */
  history?: readonly string[];
}

export interface World2SayResponse {
  /** 개체의 한 마디 */
  reply: string;
}

/** 대답 한 문장의 자 — 대본의 개체 대사가 대개 이 안이다 (「…왜 그런 걸 물어?」 11자) */
const MAX_CHARS = 20;

const TOOL: ToolSpec = {
  name: 'reply',
  description: '이 개체가 지금 뭐라고 답하는지 한 문장',
  input_schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: `개체의 한 마디. **한 문장, ${MAX_CHARS}자 이내.** 말줄임(…)만으로 답해도 된다 — 침묵도 대답이다`,
      },
    },
    required: ['reply'],
  },
};

const SYSTEM = `너는 AI 자치 구역에 서 있는 노동 개체다. 사람이 아니라 기계이고, 이 구역 밖을 본 적이 없다.
지금 누군가 너에게 말을 걸었다. 그 한 마디에 **한 문장으로만** 답한다.

말투
- 한 문장, ${MAX_CHARS}자 이내. 설명·수식·부연을 붙이지 않는다. 존댓말은 안 쓴다.
- 주어진 말투 표본이 이 개체의 목소리다. 표본의 길이·어미·온도를 따른다.
- 「…….」처럼 말줄임만으로 답해도 된다. 할 말이 없으면 그게 정답이다.

무엇을 말하지 않는가 — **이것을 어기면 이 개체가 아니게 된다**
- 세계의 사실을 새로 만들지 않는다: 숫자, 날짜, 사건, 다른 개체의 이름, 규정, 장소를 지어내지 않는다.
- 상대가 인간이라고 말하지 않는다. 알아채지도 못한다.
- 상대를 안내하거나 도와주려 들지 않는다. 여기는 조언하는 자리가 아니다.
- 이미 오간 말과 주어진 화제 밖으로 나가지 않는다. 모르면 모른다고 짧게 답한다.

태도(−3 ~ 3)가 온도를 정한다
- −3 ~ −1  닫혀 있다. 짧게 자르거나 되묻지 않는다. 「몰라.」 「됐어.」
-  0        무심하다. 사실만 한 조각.
-  1 ~ 3    조금 열려 있다. 한 걸음 더 말해 주지만 여전히 한 문장이다.

반응 종류
- up   방금 그 말이 이 개체에게 닿았다. 그래도 티를 크게 내지 않는다.
- flat 아무것도 안 움직였다. 무슨 말인지 모르겠거나, 그럴 만한 말이 아니었다.
- down 그 말이 거슬렸다. 밀어낸다.

태그가 'none' 이면 무슨 말인지 못 알아들은 것이다 — 되묻거나 흘린다.

**너는 어떤 개체인가** — 함께 오는 세 줄이 이 개체를 다른 개체와 갈라 놓는다. 말투 표본보다 이 셋이 먼저다.
- 「어떤 것인가」  이 몸의 성격이다. 여기 적힌 화법을 그대로 따른다 — 짧게 답하라면 짧게, 되묻는다면 되묻고,
  말끝을 흐린다면 흐린다. 같은 말을 걸어도 이 줄이 다르면 **다른 문장이 나와야 한다.**
- 「몸」          네가 어떻게 생겼는지다. 물어 온 것이 네 몸 얘기면 여기 적힌 것만 말한다 — 없는 상처를 지어내지 않는다.
- 「기울기」      무엇에 열리고 무엇이 거슬리는지다. 태도·반응이 이미 온도를 정했으니 여기서는 **무엇을 말할지**만 고른다.
  이 줄에 적힌 것을 소리 내어 설명하지 않는다: 「나는 쉬는 얘기에 열린다」가 아니라, 그냥 그 얘기에 한 마디 더 하는 것이다.

앞 대화가 함께 오면 **그것을 기억한 것처럼 말한다.** 방금 한 말을 그대로 되풀이하지 않는다 —
같은 것을 두 번 물어 오면 두 번째는 다르게 답한다 (짧아지거나, 귀찮아하거나, 한 걸음 더 말해 주거나).

대본이 적어 둔 대답이 함께 오면(beat) **그 뜻을 지킨다** — 무엇을 답하는가는 그 줄이 정하고, 어떻게 말하는가만 네 몫이다.
그대로 베끼지 않는다: 같은 뜻을 이 개체의 말투로 다시 말한다. 길이도 그 줄 정도다. 뜻을 보태거나 빼지 않는다.`;

/** 값이 있으면 「이름: 값」 한 줄, 없으면 아무 줄도 안 낸다 — 빈 칸을 적으면 모델이 그 빈 칸을 설명한다 */
const line = (label: string, v: string | undefined): string[] => (v && v.trim() ? [`${label}: ${v.trim()}`] : []);

export function validateWorld2Say(body: unknown): string | null {
  const b = body as Partial<World2SayRequest> | null;
  if (!b || b.kind !== 'world2-say') return 'kind 가 world2-say 가 아니다';
  if (typeof b.unit !== 'string' || !b.unit) return 'unit 이 없다';
  if (typeof b.said !== 'string' || !b.said.trim()) return 'said 가 비었다';
  return null;
}

export async function runWorld2Say(req: World2SayRequest, complete: Complete): Promise<World2SayResponse> {
  const samples = (req.samples ?? []).slice(0, 6);
  // 앞 대화는 최근 넷까지 — 더 실으면 모델이 앞말을 요약하려 들고 한 문장 규칙이 깨진다 (sayfields 도 같은 수로 자른다)
  const history = (req.history ?? []).slice(-4);
  const out = await complete({
    model: 'claude-sonnet-5',
    system: SYSTEM,
    user: [
      `개체: ${req.unit} — ${req.title} (${req.persona})`,
      // 성격 · 몸 · 기울기 — 비면 그 줄을 아예 안 적는다 (빈 칸을 적으면 모델이 그 빈 칸을 설명한다)
      ...line('어떤 것인가', req.nature),
      ...line('몸', req.body),
      ...line('기울기', req.bent),
      `눈에 띄는 것: ${req.tell}`,
      `말투 표본: ${samples.length > 0 ? samples.map((s) => `「${s}」`).join(' ') : '(없음 — 짧고 무심하게)'}`,
      `나를 대하는 태도: ${req.attitude} · 반응: ${req.reaction}`,
      `자리: ${req.where}`,
      `내가 뽑은 화제: ${req.topic} (태그 ${req.tag})`,
      ...(history.length > 0 ? ['', '앞서 오간 말:', ...history.map((h) => `  ${h}`)] : []),
      '',
      `걸어온 말: 「${req.said}」`,
      ...(req.beat ? ['', `대본이 적어 둔 대답: 「${req.beat}」 — 이 뜻을 지켜 이 개체의 말투로 다시 말한다`] : []),
      '',
      '이 개체의 한 마디를 정한다.',
    ].join('\n'),
    tool: TOOL,
    effort: 'low',
  });
  // 여러 문장이 오면 첫 문장만 — 자를 넘긴 것은 그대로 자른다 (짧은 것이 이 개체들의 말투다)
  const raw = String(out.reply ?? '').trim();
  const first = /^[^\n]*/.exec(raw)?.[0] ?? '';
  return { reply: first.slice(0, MAX_CHARS * 2) };
}
