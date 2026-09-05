/**
 * 배역과 승패 — 순수 함수뿐이다 (PLANNING §1.1 · §1.3).
 *
 * 정체표는 여기서 만들어져 GameRuntime 이 쥔다. 이 파일의 결과가 와이어로 나가는 자리는 셋뿐이다 —
 * 설계자 한 사람에게 가는 배역 통보, 격리 순간의 정체 공개, 판이 끝난 뒤의 정체표 (game-protocol.ts 머리말).
 */

import type { GameOutcome, GameRole } from '../../../src/world/mp/game-protocol';

/** AI 설계자 상한 — §1.1 표 그대로 (3명→0 · 4~5명→1 · 6~8명→2) */
export function designerCap(humans: number): number {
  if (humans <= 3) return 0;
  if (humans <= 5) return 1;
  return 2;
}

/** 격리 목표 = 총원(사람 + AI 1)의 절반, 홀수면 내림 (§1.3) */
export function quotaFor(total: number): number {
  return Math.floor(total / 2);
}

export interface Assignment {
  /** 좌석 id → 배역. AI 좌석 하나만 'ai' 다 */
  roles: Record<string, GameRole>;
  aiId: string;
  designers: string[];
}

/**
 * 배역을 굴린다. humanIds 는 실제 플레이어(대역 포함)고, aiId 는 따로 합류하는 좌석이다.
 * 설계자 수는 상한 안에서 **0부터 균등 랜덤** — 인원을 알아도 설계자 수는 알 수 없다 (§1.1).
 */
export function assignRoles(humanIds: readonly string[], aiId: string, rand: () => number = Math.random): Assignment {
  const cap = designerCap(humanIds.length);
  const count = Math.floor(rand() * (cap + 1));
  const pool = [...humanIds];
  const designers: string[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    const at = Math.floor(rand() * pool.length);
    designers.push(pool.splice(at, 1)[0]);
  }
  const roles: Record<string, GameRole> = {};
  for (const id of humanIds) roles[id] = designers.includes(id) ? 'designer' : 'human';
  roles[aiId] = 'ai';
  return { roles, aiId, designers };
}

/** 제자리 섞기 — 좌석 순열 (§1.1 "게임을 시작하는 순간 좌석이 다시 섞인다") */
export function shuffled<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 판이 끝났나 — 끝났으면 결과, 아니면 null.
 *
 * **처형(격리)은 곧 판의 끝이다** (2026-09-05 사용자: "처형되면 그 순간 게임이 끝나고 … 승리 조건이 다르게" — 예전엔
 * 격리 수가 목표(총원의 절반)에 닿아야 끝나서, 사람이 하나 격리돼도 판이 남은 시간을 다 돌았다).
 *   AI 가 격리됨           → 사람 승리 (그 자리에서)
 *   사람이 격리됨          → AI 승리 — 애먼 사람을 쏜 것이고 AI 는 아직 이 안에 있다
 *   AI 설계자가 격리됨     → AI 승리 — 그가 지키던 AI 는 아직 이 안에 있다. 다만 **그 설계자 본인은 진다**
 *   하드캡                 → AI 승리 (격리되지 않고 종료 시점까지 생존)
 * 설계자 개인의 승패는 AI 와 본인이 둘 다 살아 있는가로 갈린다 (§1.3) — AI 가 이기고 본인이 안 잡혔으면 이긴다.
 */
export function outcomeFor(roles: Record<string, GameRole>, isolated: ReadonlySet<string>, hardCapHit: boolean): GameOutcome | null {
  const aiId = Object.keys(roles).find((id) => roles[id] === 'ai') ?? '';
  const designers = Object.keys(roles).filter((id) => roles[id] === 'designer');
  const aiCaught = isolated.has(aiId);
  if (!aiCaught && isolated.size === 0 && !hardCapHit) return null;

  const winner = aiCaught ? 'humans' : 'ai';
  const designersWon = winner === 'ai' ? designers.filter((id) => !isolated.has(id)) : [];
  const designersLost = designers.filter((id) => !designersWon.includes(id));
  const shot = [...isolated].find((id) => id !== aiId);
  const reason = aiCaught
    ? 'AI 가 격리됐다. 사람 진영의 승리.'
    : shot !== undefined
      ? roles[shot] === 'designer'
        ? 'AI 설계자가 격리됐다. 그가 지키던 AI 는 아직 이 안에 있다 — AI 의 승리. 격리된 설계자 본인은 졌다.'
        : '사람이 격리됐다. AI 는 아직 이 안에 있다 — AI 의 승리.'
      : '시간이 다 됐다. AI 는 끝내 들키지 않았다.';
  return { winner, reason, aiId, designersWon, designersLost };
}
