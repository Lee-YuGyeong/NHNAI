/**
 * 무너지는 타워의 그리기용 상태 — 서버 스냅샷(trial_tower, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고 useFrame 이 읽는다
 * (disc/discState 와 같은 규칙). 발판의 기울기는 두 스냅샷 사이를 보간하고, 상태(경고 · 떨어지는 중)는 시각과 함께 그대로 든다.
 * 마찰계수는 여기 없다(P8) — 미끄러진 결과(자리 · s)만 온다.
 */
import { SELF_WARP } from '@/features/interrogation/scene/warp';
import type { S2CMessage } from '@/world/mp/protocol';
import { TOWER_N, TOWER_RESPAWN_MS, TOWER_SNAPSHOT_MS, slabSurfaceY } from '@/world/mp/tower';
import { makeFallWarp } from '../common/fallWarp';

type Snapshot = Extract<S2CMessage, { t: 'trial_tower' }>;
export type TowerPlayerWire = Snapshot['players'][number];
export type TowerSlabWire = Snapshot['slabs'][number];

const DELAY_MS = TOWER_SNAPSHOT_MS + 30;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
let clockOffset = 0;
/** 발판 번호 → 스냅샷의 발판 — 프레임마다 25 × find 를 돌지 않게 push 때 한 번 색인한다 (2026-09-05 최적화) */
let prevSlabs: (TowerSlabWire | undefined)[] = [];
let nextSlabs: (TowerSlabWire | undefined)[] = [];

function indexSlabs(s: Snapshot): (TowerSlabWire | undefined)[] {
  const out = new Array<TowerSlabWire | undefined>(TOWER_N * TOWER_N);
  for (const sl of s.slabs) out[sl.i] = sl;
  return out;
}

/** 내 좌석 — 리그가 warpSelf 로 알려 준다. 스냅샷 쪽은 이 좌석을 건너뛴다 (push 안의 주석) */
let selfSeat: string | null = null;

/**
 * 바닥에 떨어져 성한 발판에 다시 서는 3초를 순간이동으로 보여 준다 (common/fallWarp.ts).
 * 남의 몸은 한 박자 늦게 그려지므로(DELAY_MS) 기둥도 그만큼 늦게 세운다 — 내 몸은 예측이라 지연이 없다
 */
const othersWarp = makeFallWarp(TOWER_RESPAWN_MS, DELAY_MS);
const selfWarp = makeFallWarp(TOWER_RESPAWN_MS);

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
  /** 마모 0~1 */
  wear: number;
}

export const towerState = {
  /** 내 몸의 상태(서버 f) — SelfAvatar 가 눕는 데 쓴다 */
  selfStance: 0,
  push(s: Snapshot): void {
    const nowLocal = Date.now();
    if (!prev && !next) clockOffset = s.at - nowLocal;
    prev = next;
    prevSlabs = nextSlabs;
    next = s;
    nextSlabs = indexSlabs(s);
    /*
     * 순간이동 — 바닥에 떨어져 발판에 다시 서는 그 3초 (common/fallWarp.ts). **떨어지는 중(f=1)은 아직 아니다** —
     * 서버의 다시서기 시계는 바닥에 닿은 그 순간(f=2)부터 돈다 (worker/src/trial/tower/sim.ts 의 upAt).
     * 내 몸은 리그가 SELF_WARP 로 걸므로 여기서 건너뛴다: 두 번 걸면 같은 자리에 기둥이 둘 선다
     */
    for (const b of s.players) {
      if (b.id === selfSeat) continue;
      othersWarp.seen(b.id, b.f === 2, b.x, b.y, b.z, nowLocal);
    }
  },
  /**
   * 내 몸의 순간이동 — TowerRig 가 프레임마다 부른다. 내 좌석을 여기서 기억해 두고, 스냅샷 쪽(push)은 그 좌석을 건너뛴다.
   * @param down 바닥에 누워 있나 (서버 f=2 — 떨어지는 중 f=1 은 아직 아니다)
   */
  warpSelf(id: string | null, down: boolean, x: number, y: number, z: number, now = Date.now()): void {
    selfSeat = id;
    selfWarp.seen(SELF_WARP, down, x, y, z, now);
  },
  clear(): void {
    prev = null;
    next = null;
    prevSlabs = [];
    nextSlabs = [];
    towerState.selfStance = 0;
    othersWarp.clear();
    selfWarp.clear();
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
    const b = nextSlabs[idx];
    if (!next || !b) return { idx, tx: 0, tz: 0, state: 3, atLocal: 0, wear: 0 };
    const a = prevSlabs[idx];
    const t = nowLocal + clockOffset - DELAY_MS;
    let tx = b.tx;
    let tz = b.tz;
    if (a && prev && t > prev.at && t < next.at) {
      const u = (t - prev.at) / Math.max(1, next.at - prev.at);
      tx = lerp(a.tx, b.tx, u);
      tz = lerp(a.tz, b.tz, u);
    }
    return { idx, tx, tz, state: b.s, atLocal: b.at - clockOffset, wear: b.w };
  },
  /** 다음(또는 방금) 진동의 로컬 시각 — 없으면 0 */
  quakeAtLocal(): number {
    return next ? next.quakeAt - clockOffset : 0;
  },
  /**
   * 진동의 세기(0~1) — 1초 전부터 커지며 떨고, 그 순간 1, 0.7초에 걸쳐 잦아든다. 발판의 잔떨림과 카메라 흔들림이 같은 값을 본다
   */
  quakeAmp(nowLocal: number): number {
    if (!next) return 0;
    const dt = nowLocal - (next.quakeAt - clockOffset);
    if (dt < -1000 || dt > 700) return 0;
    if (dt < 0) return 0.35 * (1 + dt / 1000);
    return 1 - dt / 700;
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
    return slabSurfaceY(idx, s.tx, s.tz, x, z, s.wear);
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
