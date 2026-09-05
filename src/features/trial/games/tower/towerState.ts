/**
 * 무너지는 타워의 그리기용 상태 — 서버 스냅샷(trial_tower, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고 useFrame 이 읽는다
 * (disc/discState 와 같은 규칙). 발판의 기울기는 두 스냅샷 사이를 보간하고, 상태(경고 · 떨어지는 중)는 시각과 함께 그대로 든다.
 * 마찰계수는 여기 없다(P8) — 미끄러진 결과(자리 · s)만 온다.
 */
import type { S2CMessage } from '@/world/mp/protocol';
import { TOWER_N, TOWER_SNAPSHOT_MS, slabSurfaceY } from '@/world/mp/tower';

type Snapshot = Extract<S2CMessage, { t: 'trial_tower' }>;
export type TowerPlayerWire = Snapshot['players'][number];
export type TowerSlabWire = Snapshot['slabs'][number];

const DELAY_MS = TOWER_SNAPSHOT_MS + 30;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
let clockOffset = 0;

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export interface TowerPlayerFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  moving: number;
  /** 0 서 있음 · 1 떨어지는 중 · 2 바닥에 누움 */
  stance: number;
}

export interface SlabFrame {
  idx: number;
  tx: number;
  tz: number;
  /** 0 성함 · 1 경고 · 2 떨어지는 중 · 3 없다 */
  state: number;
  /** 상태가 된 로컬 시각 */
  atLocal: number;
}

export const towerState = {
  /** 내 몸의 상태(서버 f) — SelfAvatar 가 눕는 데 쓴다 */
  selfStance: 0,
  push(s: Snapshot): void {
    if (!prev && !next) clockOffset = s.at - Date.now();
    prev = next;
    next = s;
  },
  clear(): void {
    prev = null;
    next = null;
    towerState.selfStance = 0;
  },
  get offset(): number {
    return clockOffset;
  },
  has(): boolean {
    return next !== null;
  },
  latest(id: string): TowerPlayerWire | null {
    return next?.players.find((p) => p.id === id) ?? null;
  },
  latestAt(): number {
    return next ? next.at - clockOffset : 0;
  },
  /** 발판 하나 — 기울기는 한 스냅샷 늦게 보간. 스냅샷에 없으면 「없다」 */
  slabAt(idx: number, nowLocal: number): SlabFrame {
    const b = next?.slabs.find((s) => s.i === idx);
    if (!next || !b) return { idx, tx: 0, tz: 0, state: 3, atLocal: 0 };
    const a = prev?.slabs.find((s) => s.i === idx);
    const t = nowLocal + clockOffset - DELAY_MS;
    let tx = b.tx;
    let tz = b.tz;
    if (a && prev && t > prev.at && t < next.at) {
      const u = (t - prev.at) / Math.max(1, next.at - prev.at);
      tx = lerp(a.tx, b.tx, u);
      tz = lerp(a.tz, b.tz, u);
    }
    return { idx, tx, tz, state: b.s, atLocal: b.at - clockOffset };
  },
  /** 모든 발판 상태 — HUD 지도용 (0~3) */
  slabStates(): number[] {
    const out = new Array<number>(TOWER_N * TOWER_N).fill(3);
    if (!next) return out;
    for (const s of next.slabs) out[s.i] = s.s;
    return out;
  },
  /** (x, z) 발밑의 발판 윗면 높이 — 발판이 없으면 null */
  surfaceAt(idx: number, x: number, z: number, nowLocal: number): number | null {
    const s = towerState.slabAt(idx, nowLocal);
    if (s.state >= 2) return null;
    return slabSurfaceY(idx, s.tx, s.tz, x, z);
  },
  /** 남의 몸 · AI 몸 — 한 스냅샷 늦게 보간. 상태가 바뀐 사이는 보간 없이 새 것 */
  playerAt(id: string, nowLocal: number): TowerPlayerFrame | null {
    if (!next) return null;
    const b = next.players.find((p) => p.id === id);
    if (!b) return null;
    const a = prev?.players.find((p) => p.id === id);
    const t = nowLocal + clockOffset - DELAY_MS;
    if (!a || !prev || t >= next.at || a.f !== b.f) return frameOf(b);
    if (t <= prev.at) return frameOf(a);
    const u = (t - prev.at) / Math.max(1, next.at - prev.at);
    return { id, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), heading: b.h, moving: b.m, stance: b.f };
  },
  ids(): string[] {
    return next ? next.players.map((p) => p.id) : [];
  },
};

function frameOf(p: TowerPlayerWire): TowerPlayerFrame {
  return { id: p.id, x: p.x, y: p.y, z: p.z, heading: p.h, moving: p.m, stance: p.f };
}
