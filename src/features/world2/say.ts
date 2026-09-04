/**
 * 개체의 한 마디를 **모델에게 짓게 한다** — 표가 비어 있던 자리만 (2026-09-03 사용자).
 *
 * 뼈대는 그대로다. 내가 친 말에서 태그를 뽑고(read.ts) 그 태그로 태도·의심·경보·조각이 움직이는 것은
 * 전부 규칙이고(talk.ts), 그 값들은 이 파일을 거치지 않는다 — 사람이 죽는 판정에 모델이 개입하는 통로를
 * 만들지 않는다는 규칙(execution.ts)은 그대로 산다. 모델이 하는 일은 **그 자리에서 뭐라고 말했을지** 한 문장뿐이다.
 *
 * 부르는 자리도 하나뿐이다 — `TalkResult.generic`, 즉 대본표(cast.ts 의 voice)에 그 개체·그 반응의 줄이 없어
 * 기본값(voice.flat, 대개 「…….」)으로 떨어지던 자리다. 기획서에 적힌 대답(위로 3단 · 벽 얘기 · 업무 · 보고 ·
 * 동료 확인)은 연출된 박자라 표가 이긴다. 열둘 중 여덟 개체가 up 줄조차 없어서, 친밀도는 올라갔는데
 * 화면에는 「…….」만 나오고 있었다 — 그 구멍이 이 파일이 메우는 자리다.
 *
 * **모델이 없어도 판은 돈다.** 키가 없거나(로컬에서 워커를 안 띄웠거나) 느리거나 실패하면 null 을 돌려주고
 * 화면은 원래 표의 줄로 간다. 세 번 연속 실패하면 그 판에서는 다시 안 부른다 — 안 그러면 한 마디마다
 * 타임아웃만큼 대답이 늦는다.
 *
 * ★ 모델이 지은 문장에는 **보이스 클립이 없다** (클립 열쇠가 문장 그대로라서). 소리 없이 자막만 흐른다 —
 *   본판에서 LLM 이 지은 경비 대답이 무음인 것과 같다 (features/world/voice.ts).
 */

import type { World2SayRequest, World2SayResponse } from '@/lab/world2say';

/**
 * 이만큼 안에 안 오면 표의 줄로 간다.
 *
 * 3.5 초는 **너무 짧았다** — 헤드리스로 여덟 마디를 걸어 보니 그중 하나가 시간을 넘겨 「…….」로 떨어졌다
 * (2026-09-03 사용자: 「똑같은 말만 하고 … 하는 건 왜 그런 거야」). 왕복이 2~5 초라 3.5 는 절반쯤에서 자른다.
 * 늦는 것은 여기서 안 아프다: 대화창은 이 약속이 풀릴 때까지 머무름을 늘리고(DialogueBox), 그 사이 화면은
 * 대답을 기다리는 그림이다. 정말 죽었을 때만 표로 떨어지면 된다.
 */
const TIMEOUT_MS = 15_000;
/** 이만큼 연속으로 놓치면 잠시 안 부른다 */
const GIVE_UP_AFTER = 3;
/**
 * **포기는 잠깐이다** (2026-09-04 사용자: 「지금 다 ...이나 똑같은 말 반복하는데」).
 *
 * 앞 판까지는 세 번 연속 놓치면 그 판이 끝날 때까지 모델을 다시 안 불렀다. 그런데 왕복이 4~6 초라
 * 제한 8 초와의 여유가 2 초뿐이었고, 회선이 잠깐 흔들려 세 마디만 놓치면 **그 뒤로 판 전체가 표의 줄**이 됐다 —
 * 열둘 중 여덟의 flat 이 「…….」이라 화면에는 말줄임만 남는다. 한 번 미끄러진 판이 영영 안 돌아오는 것이 문제였지,
 * 표로 떨어지는 것 자체가 문제가 아니다.
 *
 * 그래서 둘을 고쳤다: 제한을 15 초로 늘리고(늦는 것은 안 아프다 — 대화창이 그만큼 머무른다),
 * 포기에 **시효**를 준다. 이 시간이 지나면 다시 한 번 부른다: 살아 있으면 그 한 번으로 실패 수가 0 으로 돌아가고,
 * 여전히 죽었으면(키가 없는 판) 다시 조용해진다. 키가 없는 판이 치르는 값은 이 간격마다 한 번의 헛걸음뿐이다.
 */
const RETRY_AFTER_MS = 45_000;

let failures = 0;
/** 포기한 시각 — 이때부터 RETRY_AFTER_MS 가 지나면 한 번 더 두드린다 */
let gaveUpAt = 0;

/** 판이 새로 서면 다시 부른다 — 앞 판에서 자격이 없었다고 이 판까지 포기하지 않는다 */
export function resetSay(): void {
  failures = 0;
  gaveUpAt = 0;
}

/** 지금 모델을 부를 수 있나 — 시험·SSR 과 「방금 포기한 판」을 거른다 (시효가 지나면 다시 연다) */
export function sayAvailable(now = Date.now()): boolean {
  if (typeof fetch !== 'function') return false;
  if (failures < GIVE_UP_AFTER) return true;
  // 시효가 지났다 — 실패 수를 한 칸 내려 **한 번만** 다시 두드린다. 그 한 번이 또 실패하면 다시 잠긴다
  if (now - gaveUpAt >= RETRY_AFTER_MS) {
    failures = GIVE_UP_AFTER - 1;
    gaveUpAt = now;
    return true;
  }
  return false;
}

/**
 * 이 개체의 한 마디. 못 받으면 null — 부르는 쪽이 표의 줄로 간다.
 * 숫자는 아무것도 안 오간다: 요청에도 응답에도 태도·의심·경보가 없다.
 */
export async function world2Say(req: Omit<World2SayRequest, 'kind'>): Promise<string | null> {
  if (!sayAvailable()) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('/api/world2/say', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'world2-say', ...req } satisfies World2SayRequest),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(String(r.status));
    const out = (await r.json()) as World2SayResponse;
    const line = String(out?.reply ?? '').trim();
    if (!line) throw new Error('빈 줄');
    failures = 0;
    return line;
  } catch {
    failures += 1;
    if (failures >= GIVE_UP_AFTER) gaveUpAt = Date.now();
    return null;
  } finally {
    clearTimeout(timer);
  }
}
