/**
 * 원격 플레이어 보관소 — **좌표는 Redux 값이 아니다.**
 *
 * 좌표를 React state 나 스토어 값으로 넣으면 10Hz × N명마다 트리 전체가 리렌더된다.
 * 그래서 좌표는 이 가변 Map 안에만 산다. Redux(worldSlice)는 "누가 방에 있는가"(명부)만
 * 알고, "어디 있는가"는 useFrame 이 이 Map 을 직접 읽어 매 프레임 보간한다.
 *
 * (core/WorldState 와 같은 원칙이다 — 다만 여기는 보간 링버퍼가 필요해 따로 둔다.)
 */

import { pushSample, type MoveSample, type Pose } from '../mp/interp';
import type { AnimState, PlayerSnapshot } from '../mp/protocol';

export interface RemotePlayer {
  id: string;
  seat: number;
  nickname: string;
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

const players = new Map<string, RemotePlayer>();

function createRemote(snap: PlayerSnapshot, now: number): RemotePlayer {
  return {
    id: snap.id,
    seat: snap.seat,
    nickname: snap.nickname,
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
  bubble(id: string, text: string, now: number): void {
    const p = players.get(id);
    if (!p) return;
    p.bubbleText = text;
    p.bubbleUntil = now + BUBBLE_MS;
  },
};
