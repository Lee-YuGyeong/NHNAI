/**
 * 폭발 충격파 피하기의 그리기용 상태 — 서버 스냅샷(trial_blast, ~10Hz)을 받아 두 스냅샷 사이를 보간한다. Redux 밖(가변)이고 useFrame 이 읽는다
 * (disc/discState · seesaw/seesawState 와 같은 규칙). 세기는 여기 없다(P8) — 몸에 붙은 속도와 자리, 폭발의 자리·시각만 온다.
 * 내 자세(낮춤)와 내 몸의 상태(공중 · 쓰러짐)도 여기 든다 — SelfAvatar 가 프레임마다 읽는다.
 */
import { BLAST_SNAPSHOT_MS } from '@/world/mp/blast';
import type { S2CMessage } from '@/world/mp/protocol';

type Snapshot = Extract<S2CMessage, { t: 'trial_blast' }>;
export type BlastPlayerWire = Snapshot['players'][number];

const DELAY_MS = BLAST_SNAPSHOT_MS + 30;

let prev: Snapshot | null = null;
let next: Snapshot | null = null;
let clockOffset = 0;

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export interface BlastPlayerFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  moving: number;
  /** 0 서 있음 · 1 공중 · 2 쓰러짐 */
  stance: number;
  crouch: boolean;
}

export const blastState = {
  /** 내 자세 — C 를 누르고 있나 (SeesawRig 이 쓰고 SelfAvatar 가 읽는다) */
  selfCrouch: false,
  /** 내 몸의 상태 — 서버가 준 f */
  selfStance: 0,
  push(s: Snapshot): void {
    if (!prev && !next) clockOffset = s.at - Date.now();
    prev = next;
    next = s;
  },
  clear(): void {
    prev = null;
    next = null;
    blastState.selfCrouch = false;
    blastState.selfStance = 0;
  },
  get offset(): number {
    return clockOffset;
  },
  has(): boolean {
    return next !== null;
  },
  latest(id: string): BlastPlayerWire | null {
    return next?.players.find((p) => p.id === id) ?? null;
  },
  latestAt(): number {
    return next ? next.at - clockOffset : 0;
  },
  /** 남의 몸 · AI 몸 — 한 스냅샷 늦게 보간. 상태가 바뀐 사이(섰다 → 날았다)는 보간 없이 새 것 */
  playerAt(id: string, nowLocal: number): BlastPlayerFrame | null {
    if (!next) return null;
    const b = next.players.find((p) => p.id === id);
    if (!b) return null;
    const a = prev?.players.find((p) => p.id === id);
    const t = nowLocal + clockOffset - DELAY_MS;
    if (!a || !prev || t >= next.at || a.f !== b.f) return frameOf(b);
    if (t <= prev.at) return frameOf(a);
    const u = (t - prev.at) / Math.max(1, next.at - prev.at);
    return { id, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), heading: b.h, moving: b.m, stance: b.f, crouch: b.c === 1 };
  },
  /** 놓인 폭약 — 로컬 시각으로 */
  charges(): { id: number; x: number; z: number; atLocal: number; boomAtLocal: number }[] {
    if (!next) return [];
    return next.charges.map((c) => ({ id: c.id, x: c.x, z: c.z, atLocal: c.at - clockOffset, boomAtLocal: c.boomAt - clockOffset }));
  },
  /** 최근 폭발 — 로컬 시각으로 */
  booms(): { id: number; x: number; z: number; atLocal: number }[] {
    if (!next) return [];
    return next.booms.map((b) => ({ id: b.id, x: b.x, z: b.z, atLocal: b.at - clockOffset }));
  },
  ids(): string[] {
    return next ? next.players.map((p) => p.id) : [];
  },
};

function frameOf(p: BlastPlayerWire): BlastPlayerFrame {
  return { id: p.id, x: p.x, y: p.y, z: p.z, heading: p.h, moving: p.m, stance: p.f, crouch: p.c === 1 };
}
