/**
 * 회전 봉 넘기의 그리기용 상태 — 서버 스냅샷(trial_bar, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고
 * useFrame 이 읽는다 (disc/discState 와 같은 규칙 — 봉의 각도는 보간이 아니라 **외삽**하고, 스냅샷이 오면 어긋남을
 * 0.15초에 걸쳐 스르르 맞춘다). 마찰계수는 여기 없다(P8) — 명령과 다르게 움직인 몫(s)만 온다.
 */
import { BAR_SNAPSHOT_MS } from '@/world/mp/constants';
import type { S2CMessage } from '@/world/mp/protocol';

type Snapshot = Extract<S2CMessage, { t: 'trial_bar' }>;
export type BarPlayerWire = Snapshot['players'][number];

/** 스냅샷 하나 늦게 그린다 — 남의 몸 · AI 몸 */
const DELAY_MS = BAR_SNAPSHOT_MS + 30;
/** 스냅샷이 올 때 봉 각도의 어긋남을 이 시간(ms)에 걸쳐 맞춘다 */
const THETA_BLEND_MS = 150;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
let clockOffset = 0;
let thetaShown = 0;
let thetaFix = 0;
let thetaFixAt = 0;

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export interface BarPlayerFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** 0 서 있음 · 1 걷기 · 2 달리기 */
  moving: number;
  /** 누워 있다 — 봉에 맞았거나 떨어졌다 */
  fallen: boolean;
}

export const barState = {
  /**
   * 내 몸이 누웠나(서버 f=1 — 봉에 맞았거나 무대 밖으로 떨어졌다). BarRig 가 프레임마다 적고 BarScene 의 SelfAvatar 가
   * 눕는 데 쓴다 (towerState.selfStance 와 같은 규칙 — 내 몸의 상태는 예측이라 스냅샷 보간을 거치지 않는다)
   */
  selfFallen: false,
  /**
   * 내 몸이 **화면에서 실제로** 내는 속도(m/s) — 걷기·달리기 클립의 배속을 여기에 맞춘다. 발밑이 미끄러운 구간에는
   * 명령보다 느리게 나가므로(BAR_GRIP) 명령 속도로 클립을 틀면 발이 바닥을 긁는다. 남의 몸은 BarAvatar 가 따로 잰다
   */
  selfSpeed: 0,
  push(s: Snapshot): void {
    const nowLocal = Date.now();
    if (!prev && !next) {
      clockOffset = s.at - nowLocal;
      thetaShown = s.theta;
      thetaFix = 0;
    } else {
      // 지금 보이고 있는 각도와 서버 각도의 차이 — 다음 THETA_BLEND_MS 동안 녹여 없앤다
      const shown = barState.thetaAt(nowLocal);
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
    barState.selfFallen = false;
    barState.selfSpeed = 0;
  },
  has(): boolean {
    return next !== null;
  },
  omega(): number {
    return next?.omega ?? 0;
  },
  /** 지금 봉의 각도 — 마지막 스냅샷에서 외삽 + 보정 잔여 */
  thetaAt(nowLocal: number): number {
    if (!next) return thetaShown;
    const dt = (nowLocal + clockOffset - next.at) / 1000;
    const base = next.theta + next.omega * dt;
    const k = Math.max(0, 1 - (nowLocal - thetaFixAt) / THETA_BLEND_MS);
    thetaShown = base + thetaFix * k;
    return thetaShown;
  },
  /** 내 몸의 서버 자리 — 예측 보정용(BarRig). 마지막 스냅샷 그대로(지연 없이) */
  latest(id: string): BarPlayerWire | null {
    return next?.players.find((p) => p.id === id) ?? null;
  },
  latestAt(): number {
    return next ? next.at - clockOffset : 0;
  },
  /** 남의 몸 · AI 몸 — 한 스냅샷 늦게 보간 */
  playerAt(id: string, nowLocal: number): BarPlayerFrame | null {
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

function frameOf(p: BarPlayerWire): BarPlayerFrame {
  return { id: p.id, x: p.x, y: p.y, z: p.z, heading: p.h, moving: p.m, fallen: p.f === 1 };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
