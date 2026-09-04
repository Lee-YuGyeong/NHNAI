/**
 * 원격 플레이어 보관소 — **좌표는 Redux 값이 아니다.**
 *
 * 좌표를 React state 나 스토어 값으로 넣으면 10Hz × N명마다 트리 전체가 리렌더된다.
 * 그래서 좌표는 이 가변 Map 안에만 산다. Redux(worldSlice)는 "누가 방에 있는가"(명부)만
 * 알고, "어디 있는가"는 useFrame 이 이 Map 을 직접 읽어 매 프레임 보간한다.
 *
 * (core/WorldState 와 같은 원칙이다 — 다만 여기는 보간 링버퍼가 필요해 따로 둔다.)
 */

import { INTERP_DELAY_MS } from '../mp/constants';
import { pushSample, sampleAt, type MoveSample, type Pose } from '../mp/interp';
import type { AnimState, BodyId, PlayerSnapshot } from '../mp/protocol';

export interface RemotePlayer {
  id: string;
  seat: number;
  nickname: string;
  /** 몸 (mp/bodies.ts). 없으면 로봇 */
  body?: BodyId;
  /** 애니메이션은 보간하지 않고 즉시 적용한다 */
  anim: AnimState;
  /** 좌표 링버퍼. 제자리에서 변형된다 */
  buffer: MoveSample[];
  /** 버퍼가 비었을 때 쓸 마지막 자세 */
  pose: Pose;
  /** 말풍선. 표시 여부는 렌더가 판단한다 */
  bubbleText: string;
  bubbleUntil: number;
}

/** 말풍선 수명 (ms). */
export const BUBBLE_MS = 3_000;

/** 캐릭터 몸 반지름(m) — 로봇·군인 어깨 폭의 절반쯤. 밀어내기는 양쪽 반지름을 더해 잰다 */
export const CHAR_BODY_R = 0.35;
/** 발 높이 차가 이보다 크면 다른 층(발판 위/아래)이다 — 서로 밀지 않는다 */
const PUSH_Y_GAP = 1.4;
/** pushOut 의 보간 그릇 — 프레임마다 재사용한다 */
const probe: Pose = { x: 0, z: 0, y: 0, heading: 0 };

const players = new Map<string, RemotePlayer>();

function createRemote(snap: PlayerSnapshot, now: number): RemotePlayer {
  return {
    id: snap.id,
    seat: snap.seat,
    nickname: snap.nickname,
    body: snap.body,
    anim: snap.anim,
    buffer: [{ t: now, x: snap.x, z: snap.z, y: snap.y ?? 0, heading: snap.heading }],
    pose: { x: snap.x, z: snap.z, y: snap.y ?? 0, heading: snap.heading },
    bubbleText: '',
    bubbleUntil: 0,
  };
}

export const remotePlayers = {
  get(id: string): RemotePlayer | undefined {
    return players.get(id);
  },
  add(snap: PlayerSnapshot, now: number): void {
    players.set(snap.id, createRemote(snap, now));
  },
  remove(id: string): boolean {
    return players.delete(id);
  },
  clear(): void {
    players.clear();
  },
  /** 전원 순회 — 의심도 감지(mp/sensor.ts)가 프레임마다 시선·거리를 잰다. 배열을 만들지 않는다 */
  each(fn: (p: RemotePlayer) => void): void {
    for (const p of players.values()) fn(p);
  },
  /** ★ 리렌더 없음. 10Hz × N명이라 여기서 상태를 건드리면 화면이 죽는다 */
  move(id: string, x: number, z: number, y: number, heading: number, anim: AnimState, now: number): void {
    const p = players.get(id);
    if (!p) return;
    p.anim = anim;
    pushSample(p.buffer, { t: now, x, z, y, heading });
  },
  /**
   * (x, z, 발 높이 y) 에 선 반지름 r 의 몸을 원격 캐릭터들 밖으로 민다 — 캐릭터끼리 뚫고 지나가지 않게
   * (각 리그의 useFrame — 미는 건 언제나 내 몸이다. 상대 화면에선 상대 리그가 상대 몸을 민다).
   * 기준 자세는 화면에 보이는 것과 같은 150ms 과거(sampleAt)다. 겹친 만큼 밀린 좌표를 돌려준다
   */
  pushOut(x: number, z: number, y: number, r: number, now: number): { x: number; z: number } {
    let ox = x;
    let oz = z;
    for (const p of players.values()) {
      const at = sampleAt(p.buffer, now - INTERP_DELAY_MS, probe) ? probe : p.pose;
      if (Math.abs(at.y - y) >= PUSH_Y_GAP) continue;
      const dx = ox - at.x;
      const dz = oz - at.z;
      const d = Math.hypot(dx, dz);
      const min = r + CHAR_BODY_R;
      if (d >= min) continue;
      if (d < 1e-4) {
        ox += min; // 정확히 겹쳐 있다(같은 자리 스폰) — 방향이 없으니 +x 로 벌린다
        continue;
      }
      const k = (min - d) / d;
      ox += dx * k;
      oz += dz * k;
    }
    return { x: ox, z: oz };
  },
  bubble(id: string, text: string, now: number): void {
    const p = players.get(id);
    if (!p) return;
    p.bubbleText = text;
    p.bubbleUntil = now + BUBBLE_MS;
  },
};
