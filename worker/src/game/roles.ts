/**
 * 배역과 승패 — 순수 함수뿐이다 (PLANNING §1.1 · §1.3).
 *
 * 정체표는 여기서 만들어져 GameRuntime 이 쥔다. 이 파일의 결과가 와이어로 나가는 자리는 셋뿐이다 —
 * 설계자 한 사람에게 가는 배역 통보, 격리 순간의 정체 공개, 판이 끝난 뒤의 정체표 (game-protocol.ts 머리말).
 */

import type { GameOutcome, GameRole } from '../../../src/world/mp/game-protocol';

/**
 * AI 설계자 **수** — 사람 수가 정한다 (2026-09-05 사용자: "AI 설계자 1명 사람 2명 AI 1명 이렇게야").
 *
 * 예전엔 **상한**이었다 (§1.1 표: 3명→0 · 4~5명→1 · 6~8명→2). 그 안에서 0부터 균등 랜덤으로 뽑았고,
 * 표의 첫 줄이 0이라 지금 기본 판(사람 3 + AI 1 — InterrogationFeature 의 AUTO_SEATS)에서는 설계자가
 * **한 번도** 나오지 않았다. 홀에 선 넷은 늘 「그냥 사람 셋 + AI 하나」였다.
 * 이제 3명이면 하나다. 뽑히는 **수**는 고정이고, 굴리는 것은 **누가**인지뿐이다.
 */
export function designerCount(humans: number): number {
  if (humans <= 2) return 0;
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
 * 설계자 수는 designerCount 가 정한 그 수 그대로다 — 누가 설계자인지만 굴린다.
 */
export function assignRoles(humanIds: readonly string[], aiId: string, rand: () => number = Math.random): Assignment {
  const count = Math.min(designerCount(humanIds.length), humanIds.length);
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
 *   AI 가 격리됨            → 사람 승리 (그 자리에서)
 *   격리 수가 목표에 닿음   → AI 승리 (목표 인원이 격리됐는데 AI 가 없다)
 *   하드캡                  → AI 승리 (격리되지 않고 종료 시점까지 생존)
 * 설계자 개인의 승패는 AI 와 본인이 둘 다 살아 있는가로 갈린다 (§1.3).
 */
export function outcomeFor(
  roles: Record<string, GameRole>,
  isolated: ReadonlySet<string>,
  quota: number,
  hardCapHit: boolean,
): GameOutcome | null {
  const aiId = Object.keys(roles).find((id) => roles[id] === 'ai') ?? '';
  const designers = Object.keys(roles).filter((id) => roles[id] === 'designer');
  const aiCaught = isolated.has(aiId);
  const quotaHit = isolated.size >= quota;
  if (!aiCaught && !quotaHit && !hardCapHit) return null;

  const winner = aiCaught ? 'humans' : 'ai';
  const designersWon = winner === 'ai' ? designers.filter((id) => !isolated.has(id)) : [];
  const designersLost = designers.filter((id) => !designersWon.includes(id));
  const reason = aiCaught
    ? 'AI 가 격리됐다. 사람 진영의 승리.'
    : quotaHit
      ? `격리 인원이 ${quota}명에 닿았지만 그 안에 AI 는 없었다. AI 의 승리.`
      : '시간이 다 됐다. AI 는 끝내 들키지 않았다.';
  return { winner, reason, aiId, designersWon, designersLost };
}
