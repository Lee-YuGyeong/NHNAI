/**
 * 배역을 **미리 데운다** — 판이 시작되는 순간에 성격 다섯을 짓기 시작하고, 검문소가 열릴 때
 * 그 결과를 받아 간다 (2026-08-31 사용자: "페르소나 만드는건 게임 시작하면 바로 만들게 해줘").
 *
 * ┌─ 왜 미리 짓나 ───────────────────────────────────────────────────────────┐
 * │ 성격 생성은 이 게임에서 **제일 긴 한 번의 기다림**이다 (LLM 한 번, 몇 초  │
 * │ ~수십 초). 그런데 그동안 사람은 이미 판 안에 있다 — 이야기로 오면 복도를  │
 * │ 걷고 중앙 시설을 지나 검문소 문 앞까지 왔는데, 거기서 「여섯을 모으는      │
 * │ 중…」을 다시 본다. 대기방에서 「게임 시작」을 누른 시각과 그 화면이 열리는 │
 * │ 시각 사이에는 **몇 분이 비어 있다.** 그 사이에 지어 두면 기다림이 사라진다.│
 * │                                                                          │
 * │ 배역은 방·사람과 무관한 값이라(성격 다섯뿐) 미리 지어도 어긋날 것이 없다. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 여기 있는 것은 **약속(Promise) 한 개**다. 결과를 기다리지 않는다 — 데우는 쪽은
 *   걸어만 두고 떠나고, 받는 쪽이 그때 await 한다. 아직 안 끝났으면 그 자리에서 기다리는데,
 *   이미 몇 분 돌고 있었으므로 남은 시간은 그만큼 짧다.
 * ★ **실패해도 조용하다.** 못 지으면 null 이고, 받는 쪽이 손으로 쓴 풀로 폴백한다
 *   (personas.ts 의 fiveFrom). 미리 데우다 실패한 것 때문에 판이 안 열리면 안 된다.
 */

import { SPICE, type CastPersona, type CastResponse } from './talk';

/**
 * 데워 둔 배역이 상하는 시간. 대기방에서 시작해 복도·중앙 시설을 지나 검문소까지 오는 데
 * 걸리는 시간보다 넉넉해야 하고, 브라우저를 열어 둔 채 자리를 뜬 사람의 어제 배역이
 * 오늘 판에 앉을 만큼 길면 안 된다.
 */
export const WARM_TTL_MS = 15 * 60_000;

let warm: { at: number; run: Promise<CastPersona[] | null> } | null = null;

/**
 * 지금 성격 다섯을 짓는다. **거절하지 않는다** — 실패는 null 이다.
 *
 * 힌트를 매판 새로 뽑는 이유는 talk.ts 의 SPICE 주석에 있다: 같은 요청에는 비슷한 답이 와서,
 * 씨앗이 없으면 「즉석 생성」도 매판 비슷해진다.
 */
export function makeCastNow(): Promise<CastPersona[] | null> {
  const hints = [...SPICE].sort(() => Math.random() - 0.5).slice(0, 5);
  return fetch('/api/lab/cast', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'cast', hints }),
  })
    .then((res) => res.json() as Promise<CastResponse>)
    .then((r) => (r.personas?.length === 5 ? r.personas : null))
    .catch(() => null);
}

/**
 * 판이 시작됐다 — 배역을 짓기 시작한다. **결과를 여기서 기다리지 않는다.**
 *
 * 이미 데우는 중이면 아무 일도 하지 않는다: 대기방에서 한 번, 복도로 넘어가며 한 번 부르는
 * 식으로 길목마다 걸어 둬도 LLM 은 한 번만 불린다 (크레딧이 나가는 호출이다).
 */
export function warmCast(): void {
  if (warm && Date.now() - warm.at < WARM_TTL_MS) return;
  warm = { at: Date.now(), run: makeCastNow() };
}

/**
 * 데워 둔 배역을 받아 간다. 없으면 null — 그때는 받는 쪽이 지금 짓는다 (makeCastNow).
 *
 * ★ **한 번만 준다.** 판마다 새 성격이어야 하므로, 받아 간 뒤에는 자리를 비워 다음 판이
 *   다시 데우게 한다. 같은 배역이 두 판에 앉으면 「이 이름 = 이 성격」이 학습된다.
 */
export function takeWarmCast(): Promise<CastPersona[] | null> | null {
  if (!warm) return null;
  const { at, run } = warm;
  warm = null;
  return Date.now() - at > WARM_TTL_MS ? null : run;
}

/** 시험이 자리를 비우는 곳. 실제 코드에서는 부르지 않는다 */
export function resetWarmCast(): void {
  warm = null;
}
