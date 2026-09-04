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
  /**
   * **어느 쪽으로 넘어지는가** (rad) — 이 몸의 로컬 기준, atan2(x, z) 규약이다 (0 = 정면).
   *
   * anim 이 'down' 일 때만 뜻이 있다. 총알이 민 쪽으로 넘어가야 쏘는 자와 쓰러지는 몸이
   * 이어지는데, 그것은 무대의 사정이라(리더가 어디 서 있나) 3D 쪽에서는 알 수 없다.
   * 그래서 쏘는 쪽이 넣어 주고(features/arena 의 처형 행진), 아바타가 읽는다.
   */
  fall?: number;
}

/** 말풍선 수명 (ms) — 길이를 안 주면 이 값이다 */
export const BUBBLE_MS = 3_000;

/**
 * 몸 하나의 반지름(m) — 아바타 발밑 그림자(0.34)보다 조금 넉넉한 어깨 폭의 절반.
 *
 * 두 몸의 중심은 BODY_GAP 보다 가까워지지 않는다. **로봇끼리도, 나와 로봇 사이도 같은 값이다** —
 * 한쪽만 크게 잡으면 서로를 번갈아 밀어내며 몸이 떤다. 개체들끼리 떼어 놓는 쪽은
 * features/arena/ArenaFeature 의 separateBots 가, 나를 밀어내는 쪽은 아래 pushOut 이 맡는다.
 */
export const BODY_R = 0.43;
export const BODY_GAP = BODY_R * 2;

/** 발 높이가 이만큼 차이 나면 서로 없는 셈 친다 — 무대에 오른 몸·뛰어넘는 몸 밑을 지나갈 수 있게 */
const OVER_HEAD = 1.4;

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
  /** ★ 리렌더 없음. 10Hz × N명이라 여기서 상태를 건드리면 화면이 죽는다 */
  /** 넘어질 방향을 넣는다 — 쓰러지기 직전 한 번 (RemotePlayer.fall 머리말) */
  setFall(id: string, dir: number): void {
    const p = players.get(id);
    if (p) p.fall = dir;
  },
  move(id: string, x: number, z: number, y: number, heading: number, anim: AnimState, now: number): void {
    const p = players.get(id);
    if (!p) return;
    p.anim = anim;
    pushSample(p.buffer, { t: now, x, z, y, heading });
  },
  /**
   * 말풍선을 띄운다. `ms` 를 주면 그만큼 머문다 — 한 줄이 길면 오래 남아야 다 읽힌다.
   * (고정 3초는 긴 말을 중간에 자르고 짧은 말을 쓸데없이 붙들고 있었다)
   */
  bubble(id: string, text: string, now: number, ms: number = BUBBLE_MS): void {
    const p = players.get(id);
    if (!p) return;
    p.bubbleText = text;
    p.bubbleUntil = now + ms;
  },
  /**
   * (x, z, feetY) 에 선 반지름 r 의 몸을 로봇들 밖으로 민다 — 내가 남의 몸을 뚫고 지나가지 않게
   * (scene/WorldScene 의 LocalRig). 겹친 만큼만 밀어낸 좌표를 돌려준다.
   *
   * ★ 재는 것은 **그려지는 자리(pose)** 다. 링버퍼의 최신 샘플은 INTERP_DELAY_MS 만큼 앞서 있어서,
   *   그걸로 막으면 눈에 보이는 몸보다 한 뼘 앞의 허공에서 막힌다.
   */
  pushOut(x: number, z: number, feetY: number, r: number, except?: string): { x: number; z: number } {
    let ox = x;
    let oz = z;
    players.forEach((p, id) => {
      if (id === except) return;
      if (Math.abs(p.pose.y - feetY) > OVER_HEAD) return;
      const dx = ox - p.pose.x;
      const dz = oz - p.pose.z;
      const d = Math.hypot(dx, dz);
      const min = r + BODY_R;
      if (d >= min) return;
      // 완전히 겹친 순간(거리 0)에는 0 으로 나누지 않게 정해진 쪽으로 뺀다
      if (d < 1e-4) {
        ox += min;
        return;
      }
      const k = (min - d) / d;
      ox += dx * k;
      oz += dz * k;
    });
    return { x: ox, z: oz };
  },
  /**
   * 떠 있는 말풍선을 한꺼번에 걷는다 — 시행이 서는 순간에 쓴다.
   *
   * 말풍선은 그 줄을 읽을 만큼(2.6~9초) 머무는데, 시행은 그보다 빨리 시작된다. 걷지 않으면
   * 대화를 멈춘 뒤에도 **직전 한마디가 로봇 머리 위에 남아** 미니게임 내내 떠 있다.
   */
  hush(): void {
    for (const p of players.values()) {
      p.bubbleText = '';
      p.bubbleUntil = 0;
    }
  },
};
