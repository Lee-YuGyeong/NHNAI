/**
 * 회전 원판 생존의 그리기용 상태 — 서버 스냅샷(trial_disc, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고
 * useFrame 이 읽는다 (fall/fallState 와 같은 규칙).
 *
 * 원판 자체는 보간이 아니라 **외삽**한다 — 마지막 스냅샷의 θ 에 ω·경과시간을 더한다. 각속도가 틱마다 조금씩 바뀌어도 100ms 안의
 * 오차는 눈에 안 띄고, 다음 스냅샷이 오면 θ 의 차이를 0.15초에 걸쳐 스르르 맞춘다(딱 튀지 않게). 마찰계수는 여기 없다(P8) —
 * 미끄러진 결과(자리 · s)만 온다.
 */
import { SELF_WARP } from '@/features/interrogation/scene/warp';
import { DISC_RESPAWN_MS, DISC_SNAPSHOT_MS } from '@/world/mp/constants';
import type { S2CMessage } from '@/world/mp/protocol';
import { makeFallWarp } from '../common/fallWarp';

type Snapshot = Extract<S2CMessage, { t: 'trial_disc' }>;
export type DiscPlayerWire = Snapshot['players'][number];

/** 스냅샷 하나 늦게 그린다 — 남의 몸 · AI 몸 */
const DELAY_MS = DISC_SNAPSHOT_MS + 30;
/** 스냅샷이 올 때 원판 각도의 어긋남을 이 시간(ms)에 걸쳐 맞춘다 */
const THETA_BLEND_MS = 150;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
let clockOffset = 0;
/** 외삽 중인 원판 각도와 그 기준 시각(로컬) — 스냅샷이 오면 여기서 서버 값으로 스르르 */
let thetaShown = 0;
let thetaShownAt = 0;
let thetaFix = 0;
let thetaFixAt = 0;
/** 내 좌석 — 리그가 warpSelf 로 알려 준다. 스냅샷 쪽은 이 좌석을 건너뛴다 (push 안의 주석) */
let selfSeat: string | null = null;

/**
 * 떨어져 다시 서는 2초를 순간이동으로 보여 준다 (common/fallWarp.ts). 남의 몸은 한 박자 늦게 그려지므로
 * (DELAY_MS) 기둥도 그만큼 늦게 세운다 — 내 몸은 예측이라 지연이 없다
 */
const othersWarp = makeFallWarp(DISC_RESPAWN_MS, DELAY_MS);
const selfWarp = makeFallWarp(DISC_RESPAWN_MS);

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export interface DiscPlayerFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** 0 서 있음 · 1 걷기 · 2 달리기 */
  moving: number;
  fallen: boolean;
}

export const discState = {
  push(s: Snapshot): void {
    const nowLocal = Date.now();
    if (!prev && !next) {
      clockOffset = s.at - nowLocal;
      thetaShown = s.theta;
      thetaShownAt = nowLocal;
      thetaFix = 0;
    } else {
      // 지금 보이고 있는 각도와 서버 각도의 차이 — 다음 THETA_BLEND_MS 동안 녹여 없앤다
      const shown = discState.thetaAt(nowLocal);
      const serverNow = s.theta + s.omega * ((nowLocal + clockOffset - s.at) / 1000);
      thetaFix = wrap(shown - serverNow);
      thetaFixAt = nowLocal;
    }
    prev = next;
    next = s;
    /*
     * 순간이동 — 떨어져 원판에 다시 서는 그 2초 (common/fallWarp.ts). 내 몸은 리그가 SELF_WARP 로 걸므로
     * 여기서 건너뛴다: 두 번 걸면 같은 자리에 기둥이 둘 선다
     */
    for (const b of s.players) {
      if (b.id === selfSeat) continue;
      othersWarp.seen(b.id, b.f === 1, b.x, b.y, b.z, nowLocal);
    }
  },
  /**
   * 내 몸의 순간이동 — DiscRig 가 프레임마다 부른다. 내 좌석을 여기서 기억해 두고, 스냅샷 쪽(push)은 그 좌석을 건너뛴다.
   * @param fallen 떨어져 누워 있나 (서버 f=1 — DiscRig 의 fallen)
   */
  warpSelf(id: string | null, fallen: boolean, x: number, y: number, z: number, now = Date.now()): void {
    selfSeat = id;
    selfWarp.seen(SELF_WARP, fallen, x, y, z, now);
  },
  clear(): void {
    prev = null;
    next = null;
    thetaFix = 0;
    othersWarp.clear();
    selfWarp.clear();
  },
  /** 서버 시각 → 로컬 시각 차 */
  get offset(): number {
    return clockOffset;
  },
  has(): boolean {
    return next !== null;
  },
  omega(): number {
    return next?.omega ?? 0;
  },
  /** 지금 원판 각도 — 마지막 스냅샷에서 외삽 + 보정 잔여 */
  thetaAt(nowLocal: number): number {
    if (!next) return thetaShown;
    const dt = (nowLocal + clockOffset - next.at) / 1000;
    const base = next.theta + next.omega * dt;
    const k = Math.max(0, 1 - (nowLocal - thetaFixAt) / THETA_BLEND_MS);
    thetaShown = base + thetaFix * k;
    thetaShownAt = nowLocal;
    return thetaShown;
  },
  /** 내 몸의 서버 자리 — 예측 보정용(DiscRig). 마지막 스냅샷 그대로(지연 없이) */
  latest(id: string): DiscPlayerWire | null {
    return next?.players.find((p) => p.id === id) ?? null;
  },
  latestAt(): number {
    return next ? next.at - clockOffset : 0;
  },
  /** 남의 몸 · AI 몸 — 한 스냅샷 늦게 보간 */
  playerAt(id: string, nowLocal: number): DiscPlayerFrame | null {
    if (!next) return null;
    const b = next.players.find((p) => p.id === id);
    if (!b) return null;
    const a = prev?.players.find((p) => p.id === id);
    const t = nowLocal + clockOffset - DELAY_MS;
    if (!a || !prev || t >= next.at) return frameOf(b);
    if (t <= prev.at) return frameOf(a);
    const u = (t - prev.at) / Math.max(1, next.at - prev.at);
    return {
      id,
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      z: lerp(a.z, b.z, u),
      heading: b.h,
      moving: b.m,
      fallen: b.f === 1,
    };
  },
  /** 스냅샷에 있는 모든 id */
  ids(): string[] {
    return next ? next.players.map((p) => p.id) : [];
  },
};

function frameOf(p: DiscPlayerWire): DiscPlayerFrame {
  return { id: p.id, x: p.x, y: p.y, z: p.z, heading: p.h, moving: p.m, fallen: p.f === 1 };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// thetaShownAt 는 디버그용으로만 남긴다 — 외삽 기준은 스냅샷 시각이다
void thetaShownAt;
