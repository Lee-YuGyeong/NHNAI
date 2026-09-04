/**
 * 회전 원판 생존의 그리기용 상태 — 서버 스냅샷(trial_disc, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고
 * useFrame 이 읽는다 (fall/fallState 와 같은 규칙).
 *
 * 원판 자체는 보간이 아니라 **외삽**한다 — 마지막 스냅샷의 θ 에 ω·경과시간을 더한다. 각속도가 틱마다 조금씩 바뀌어도 100ms 안의
 * 오차는 눈에 안 띄고, 다음 스냅샷이 오면 θ 의 차이를 0.15초에 걸쳐 스르르 맞춘다(딱 튀지 않게). 마찰계수는 여기 없다(P8) —
 * 미끄러진 결과(자리 · s)만 온다.
 */
import { DISC_SNAPSHOT_MS } from '@/world/mp/constants';
import type { S2CMessage } from '@/world/mp/protocol';

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
  },
  clear(): void {
    prev = null;
    next = null;
    thetaFix = 0;
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
