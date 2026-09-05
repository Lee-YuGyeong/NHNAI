/**
 * 낙하 생존의 그리기용 상태 — 서버 스냅샷(~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고
 * useFrame 이 읽는다 (src/world/core/WorldState.ts 와 같은 규칙).
 *
 * mp/interp.ts 와 같은 생각이다 — 최신 값을 바로 그리지 않고 한 스냅샷(100ms)만큼 과거를 그려서,
 * 패킷이 하나 늦어도 튀지 않게 한다. 외삽하지 않는다. 물체는 서버가 떨어뜨린 대로만 보인다(중력값은 여기 없다).
 */
import { FALL_SNAPSHOT_MS } from '@/world/mp/constants';
import type { S2CMessage } from '@/world/mp/protocol';

type Snapshot = Extract<S2CMessage, { t: 'trial_snapshot' }>;

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** 스냅샷 하나 늦게 그린다 */
const DELAY_MS = FALL_SNAPSHOT_MS + 30;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
/** 내 좌석 id — 스냅샷의 air 에서 내 높이를 골라내는 데 쓴다 */
let selfId: string | null = null;
/** 서버 시각 - 내 시각. 첫 스냅샷에서 잰다 — 시계가 어긋나도 보간 창이 맞게 */
let clockOffset = 0;

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export interface PodFrame extends Point3 {
  id: number;
  /** 공 종류 — FALL_BALLS 의 인덱스 */
  k: number;
}

export const fallState = {
  push(s: Snapshot): void {
    if (!prev && !next) clockOffset = s.at - Date.now();
    prev = next;
    next = s;
  },
  clear(): void {
    prev = null;
    next = null;
  },
  /** 내 좌석 id — 서버가 적분한 내 높이를 골라낸다 */
  setSelf(id: string | null): void {
    selfId = id;
  },
  /**
   * 내 발 높이(m) — **서버가 적분한 값**이다. 높이가 피격 판정 대상이라 클라가 스스로 포물선을 그리지 않는다
   * (fall/engine.ts 머리말). 물체와 달리 여기서는 지연을 두지 않고 마지막 두 표본으로 외삽한다 — 내 몸이 100ms 늦게
   * 뜨면 손이 그걸 바로 느낀다. 땅에 있으면 스냅샷에 안 실리므로 0 이다
   */
  selfY(nowLocal: number): number {
    if (!next || !selfId) return 0;
    const b = next.air?.find((a) => a.id === selfId);
    if (!b) return 0;
    const a = prev?.air?.find((x) => x.id === selfId);
    if (!a || !prev) return b.y;
    const span = Math.max(1, next.at - prev.at);
    const u = Math.min(2, (nowLocal + clockOffset - prev.at) / span);
    return Math.max(0, a.y + (b.y - a.y) * u);
  },
  /** 지금 그릴 낙하물들 */
  podsAt(nowLocal: number): PodFrame[] {
    if (!next) return [];
    const t = nowLocal + clockOffset - DELAY_MS;
    if (!prev || t >= next.at) return next.objects;
    if (t <= prev.at) return prev.objects;
    const u = (t - prev.at) / Math.max(1, next.at - prev.at);
    const out: PodFrame[] = [];
    for (const b of next.objects) {
      const a = prev.objects.find((o) => o.id === b.id);
      out.push(a ? { id: b.id, k: b.k, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) } : b);
    }
    return out;
  },
  /** AI 좌석의 지금 자리와 "움직이는 중인가" */
  aiAt(id: string, nowLocal: number): { x: number; z: number; moving: boolean } | null {
    if (!next) return null;
    const b = next.ai.find((p) => p.id === id);
    if (!b) return null;
    const a = prev?.ai.find((p) => p.id === id);
    if (!a) return { x: b.x, z: b.z, moving: false };
    const t = nowLocal + clockOffset - DELAY_MS;
    const u = Math.min(1, Math.max(0, (t - prev!.at) / Math.max(1, next.at - prev!.at)));
    return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), moving: Math.hypot(b.x - a.x, b.z - a.z) > 0.03 };
  },
};
