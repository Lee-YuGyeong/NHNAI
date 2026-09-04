/**
 * 에이전트 호출 — 워커의 /api/lab/act 를 두드린다.
 *
 * 개체별로 **따로** 부른다. 한 번에 몰아서 부르면 개체들이 서로의 답을 보게 되고,
 * "AI 끼리도 서로를 모른다"는 규칙이 깨진다 (PLANNING.md §1.1).
 */

import type { ActRequest, ActResponse, AgentSelf, PublicState } from '@/lab/types';

export async function act(
  kind: ActRequest['kind'],
  self: AgentSelf,
  state: PublicState,
  note?: string,
): Promise<ActResponse> {
  const res = await fetch('/api/lab/act', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, self, state, note } satisfies ActRequest),
  });
  const data = (await res.json().catch(() => ({}))) as ActResponse;
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data;
}

/** 여러 개체를 동시에. 하나가 실패해도 나머지는 진행한다 — 실패한 개체는 무응답으로 남는다. */
export async function actAll<T>(
  agents: AgentSelf[],
  kind: ActRequest['kind'],
  state: PublicState,
  pick: (r: ActResponse, self: AgentSelf) => T,
): Promise<{ results: T[]; errors: string[] }> {
  const settled = await Promise.allSettled(agents.map((a) => act(kind, a, state)));
  const results: T[] = [];
  const errors: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(pick(r.value, agents[i]));
    else errors.push(`${agents[i].id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  return { results, errors };
}
