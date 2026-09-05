/**
 * 무게 중심 다리의 그리기용 상태 — 서버 스냅샷(trial_seesaw, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고
 * useFrame 이 읽는다 (disc/discState 와 같은 규칙).
 *
 * 판자 자체는 보간이 아니라 **외삽**한다 — 마지막 스냅샷의 φ 에 ω·경과시간을 더한다. 다음 스냅샷이 오면 φ 의 차이를 0.15초에 걸쳐
 * 스르르 맞춘다(딱 튀지 않게). 마찰계수는 여기 없다(P8) — 미끄러진 결과(자리 · s)만 온다.
 * 자리는 전부 **판자 좌표(u · v)** 다 — 월드 자리는 worldOf 가 φ 로 푼다.
 */
import { SELF_WARP } from '@/features/interrogation/scene/warp';
import { SEESAW_CENTER, SEESAW_RESPAWN_MS, SEESAW_SNAPSHOT_MS, SEESAW_TOP } from '@/world/mp/constants';
import type { S2CMessage } from '@/world/mp/protocol';
import { makeFallWarp } from '../common/fallWarp';

type Snapshot = Extract<S2CMessage, { t: 'trial_seesaw' }>;
export type SeesawPlayerWire = Snapshot['players'][number];
export type SeesawCrateWire = Snapshot['crates'][number];

/** 스냅샷 하나 늦게 그린다 — 남의 몸 · AI 몸 */
const DELAY_MS = SEESAW_SNAPSHOT_MS + 30;
const PHI_BLEND_MS = 150;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
let clockOffset = 0;
let phiShown = 0;
let phiFix = 0;
let phiFixAt = 0;
/** 내 좌석 — 리그가 warpSelf 로 알려 준다. 스냅샷 쪽은 이 좌석을 건너뛴다 (push 안의 주석) */
let selfSeat: string | null = null;

/**
 * 판 끝에서 떨어져 축 옆에 다시 서는 2.5초를 순간이동으로 보여 준다 (common/fallWarp.ts).
 * 남의 몸은 한 박자 늦게 그려지므로(DELAY_MS) 기둥도 그만큼 늦게 세운다 — 내 몸은 예측이라 지연이 없다
 */
const othersWarp = makeFallWarp(SEESAW_RESPAWN_MS, DELAY_MS);
const selfWarp = makeFallWarp(SEESAW_RESPAWN_MS);

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export interface SeesawPlayerFrame {
  id: string;
  u: number;
  v: number;
  heading: number;
  /** 0 서 있음 · 1 걷기 · 2 달리기 */
  moving: number;
  fallen: boolean;
}

/** 판자 좌표 → 월드. 떨어졌으면 판 끝 밑 바닥 (worker/src/trial/seesaw/sim.ts worldOf 와 같은 식) */
export function worldOf(u: number, v: number, phi: number, fallen = false): { x: number; y: number; z: number } {
  if (fallen) return { x: SEESAW_CENTER.x + v, y: 0, z: SEESAW_CENTER.z + u };
  return { x: SEESAW_CENTER.x + v, y: SEESAW_TOP + u * Math.sin(phi), z: SEESAW_CENTER.z + u * Math.cos(phi) };
}

export const seesawState = {
  push(s: Snapshot): void {
    const nowLocal = Date.now();
    if (!prev && !next) {
      clockOffset = s.at - nowLocal;
      phiShown = s.phi;
      phiFix = 0;
    } else {
      const shown = seesawState.phiAt(nowLocal);
      const serverNow = s.phi + s.omega * ((nowLocal + clockOffset - s.at) / 1000);
      phiFix = shown - serverNow;
      phiFixAt = nowLocal;
    }
    prev = next;
    next = s;
    /*
     * 순간이동 — 떨어져 판 위에 다시 서는 그 2.5초 (common/fallWarp.ts). 내 몸은 리그가 SELF_WARP 로 걸므로
     * 여기서 건너뛴다: 두 번 걸면 같은 자리에 기둥이 둘 선다. 자리는 판자 좌표라 기울기로 풀어서 준다
     */
    for (const b of s.players) {
      if (b.id === selfSeat) continue;
      const w = worldOf(b.u, b.v, s.phi, b.f === 1);
      othersWarp.seen(b.id, b.f === 1, w.x, w.y, w.z, nowLocal);
    }
  },
  /**
   * 내 몸의 순간이동 — SeesawRig 가 프레임마다 부른다. 내 좌석을 여기서 기억해 두고, 스냅샷 쪽(push)은 그 좌석을 건너뛴다.
   * @param fallen 판에서 떨어져 누워 있나 (서버 f=1 — SeesawRig 의 fallen)
   */
  warpSelf(id: string | null, fallen: boolean, x: number, y: number, z: number, now = Date.now()): void {
    selfSeat = id;
    selfWarp.seen(SELF_WARP, fallen, x, y, z, now);
  },
  clear(): void {
    prev = null;
    next = null;
    phiFix = 0;
    othersWarp.clear();
    selfWarp.clear();
  },
  get offset(): number {
    return clockOffset;
  },
  has(): boolean {
    return next !== null;
  },
  omega(): number {
    return next?.omega ?? 0;
  },
  /** 지금 판자 기울기 — 마지막 스냅샷에서 외삽 + 보정 잔여 */
  phiAt(nowLocal: number): number {
    if (!next) return phiShown;
    const dt = (nowLocal + clockOffset - next.at) / 1000;
    const base = next.phi + next.omega * dt;
    const k = Math.max(0, 1 - (nowLocal - phiFixAt) / PHI_BLEND_MS);
    phiShown = base + phiFix * k;
    return phiShown;
  },
  /** 내 몸의 서버 자리 — 예측 보정용(SeesawRig). 마지막 스냅샷 그대로 */
  latest(id: string): SeesawPlayerWire | null {
    return next?.players.find((p) => p.id === id) ?? null;
  },
  latestAt(): number {
    return next ? next.at - clockOffset : 0;
  },
  /** 남의 몸 · AI 몸 — 한 스냅샷 늦게 보간 */
  playerAt(id: string, nowLocal: number): SeesawPlayerFrame | null {
    if (!next) return null;
    const b = next.players.find((p) => p.id === id);
    if (!b) return null;
    const a = prev?.players.find((p) => p.id === id);
    const t = nowLocal + clockOffset - DELAY_MS;
    if (!a || !prev || t >= next.at || a.f !== b.f) return frameOf(b);
    if (t <= prev.at) return frameOf(a);
    const k = (t - prev.at) / Math.max(1, next.at - prev.at);
    return { id, u: lerp(a.u, b.u, k), v: lerp(a.v, b.v, k), heading: b.h, moving: b.m, fallen: b.f === 1 };
  },
  /** 판 위 상자 — 마지막 스냅샷 그대로 (미끄러지는 상자는 한 스냅샷 늦게 보간) */
  crates(nowLocal: number): { id: number; u: number; v: number; landAtLocal: number }[] {
    if (!next) return [];
    const t = nowLocal + clockOffset - DELAY_MS;
    return next.crates.map((c) => {
      const a = prev?.crates.find((p) => p.id === c.id);
      let u = c.u;
      if (a && prev && t > prev.at && t < next!.at) u = lerp(a.u, c.u, (t - prev.at) / Math.max(1, next!.at - prev.at));
      return { id: c.id, u, v: c.v, landAtLocal: c.at - clockOffset };
    });
  },
  ids(): string[] {
    return next ? next.players.map((p) => p.id) : [];
  },
};

function frameOf(p: SeesawPlayerWire): SeesawPlayerFrame {
  return { id: p.id, u: p.u, v: p.v, heading: p.h, moving: p.m, fallen: p.f === 1 };
}
