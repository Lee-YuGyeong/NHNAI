/**
 * 원격 플레이어 보관소 — **좌표는 Redux 값이 아니다.**
 *
 * 좌표를 React state 나 스토어 값으로 넣으면 10Hz × N명마다 트리 전체가 리렌더된다.
 * 그래서 좌표는 이 가변 Map 안에만 산다. Redux(worldSlice)는 "누가 방에 있는가"(명부)만
 * 알고, "어디 있는가"는 useFrame 이 이 Map 을 직접 읽어 매 프레임 보간한다.
 *
 * (core/WorldState 와 같은 원칙이다 — 다만 여기는 보간 링버퍼가 필요해 따로 둔다.)
 */

import { massOf } from '../mp/bodies';
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
  /** 마지막 샘플이 **도착한** 시각(performance.now) — 도착 간격의 흔들림(jitter)을 재는 기준 */
  arrivedAt: number;
  /**
   * 도착 간격의 흔들림(ms, 지수 평활). 보간 지연을 이만큼 더 둔다 (delayOf) — 배포본은 서버가 멀어 10Hz 샘플이
   * 몰려 오고 벌어져 온다. 지연이 고정(150ms)이면 늦은 샘플마다 몸이 **멈췄다 튄다** (2026-09-05 사용자: "배포 버전은 왜 끊기나")
   */
  jitter: number;
  /** 말풍선. 표시 여부는 렌더가 판단한다 */
  bubbleText: string;
  bubbleUntil: number;
}

/** 말풍선 수명 (ms). */
export const BUBBLE_MS = 3_000;

/** 샘플이 오는 박자(ms) — 클라이언트 10Hz(MOVE_THROTTLE_MS) · 봇 스냅샷 100ms. 흔들림은 이 박자에서 벗어난 만큼이다 */
const SAMPLE_GAP_MS = 100;
/** 흔들림의 평활 계수 — 샘플 열 개쯤에 걸쳐 따라간다 */
const JITTER_EMA = 0.1;
/** 보간 지연의 상한(ms) — 이보다 늦은 망은 그냥 늦게 보이는 것이 맞다. 더 미루면 남의 몸이 반 초 전 자리에 선다 */
const INTERP_DELAY_MAX_MS = 450;

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
    arrivedAt: now,
    jitter: 0,
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
    // 도착 간격이 박자(100ms)에서 벗어난 만큼이 흔들림이다 — 한참 안 오다(멈춰 서 있었다) 온 첫 샘플은 흔들림이 아니다
    const gap = now - p.arrivedAt;
    if (gap < SAMPLE_GAP_MS * 5) p.jitter += (Math.abs(gap - SAMPLE_GAP_MS) - p.jitter) * JITTER_EMA;
    p.arrivedAt = now;
    pushSample(p.buffer, { t: now, x, z, y, heading });
  },
  /**
   * 이 몸을 얼마나 과거로 그릴까(ms) — 기본 150 에 흔들림의 두 배를 얹는다 (상한 450).
   * 망이 고르면 150 그대로고, 배포본처럼 샘플이 몰려 오면 그만큼 뒤에서 그려 「멈췄다 튀는」 것을 없앤다.
   */
  delayOf(p: RemotePlayer): number {
    return Math.min(INTERP_DELAY_MAX_MS, INTERP_DELAY_MS + p.jitter * 2);
  },
  /**
   * (x, z, 발 높이 y) 에 선 반지름 r 의 몸을 원격 캐릭터들 밖으로 민다 — 캐릭터끼리 뚫고 지나가지 않게
   * (각 리그의 useFrame — 미는 건 언제나 내 몸이다. 상대 화면에선 상대 리그가 상대 몸을 민다).
   * 기준 자세는 화면에 보이는 것과 같은 150ms 과거(sampleAt)다. 겹친 만큼 밀린 좌표를 돌려준다.
   *
   * 겹침은 질량 반비례로 나눈다(mp/bodies.mass) — 내 몫 = 상대 질량 / (내 질량 + 상대 질량). 무거운 몸이
   * 가벼운 몸을 밀면 가벼운 쪽 화면에서 큰 몫이 밀려나 무거운 쪽이 뚫고 나아간다. 양쪽 몫의 합이 1이라
   * 겹침은 두 화면에 걸쳐 전부 풀리고, 상대가 리그 없이 서버로만 움직여도(AI 좌석) 프레임마다 남은
   * 겹침에 다시 적용돼 몇 프레임 안에 다 풀린다
   */
  pushOut(x: number, z: number, y: number, r: number, now: number, body?: BodyId | null): { x: number; z: number } {
    let ox = x;
    let oz = z;
    const myMass = massOf(body);
    for (const p of players.values()) {
      const at = sampleAt(p.buffer, now - remotePlayers.delayOf(p), probe) ? probe : p.pose;
      if (Math.abs(at.y - y) >= PUSH_Y_GAP) continue;
      const dx = ox - at.x;
      const dz = oz - at.z;
      const d = Math.hypot(dx, dz);
      const min = r + CHAR_BODY_R;
      if (d >= min) continue;
      const theirMass = massOf(p.body);
      const share = theirMass / (myMass + theirMass);
      if (d < 1e-4) {
        ox += min * share; // 정확히 겹쳐 있다(같은 자리 스폰) — 방향이 없으니 +x 로 벌린다
        continue;
      }
      const k = ((min - d) / d) * share;
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
  /**
   * 전원을 바닥(y 0)에 내려놓는다 — 시험이 끝나 **무대가 사라졌을 때** (회전 원판 0.75m · 움직이는 발판 0.5m).
   *
   * 남의 몸 높이는 서버가 주는 것뿐이라(원판 스냅샷 · 봇 스냅샷), 무대가 걷힌 뒤 새 샘플이 안 오면 마지막 높이에
   * 그대로 떠 있다 — 봇은 토론이 열려 움직일 때까지, 격리된 좌석은 영영 (2026-09-05 사용자: 「공중 날아다니는 건 왜」).
   * 자리는 마지막 샘플 그대로 두고 높이만 0 인 샘플을 하나 더 넣는다 — 보간이 그 사이를 내려 준다.
   */
  settle(now: number): void {
    for (const p of players.values()) {
      const last = p.buffer.length ? p.buffer[p.buffer.length - 1] : p.pose;
      if (last.y === 0 && p.pose.y === 0) continue;
      pushSample(p.buffer, { t: now, x: last.x, z: last.z, y: 0, heading: last.heading });
      p.pose.y = 0;
      p.anim = 'idle';
    }
  },
};
