/**
 * 시작 위치 — **순수 함수.**
 *
 * 서버(워커의 입장 처리)와 클라이언트(내 카메라)가 **같은 함수**를 써야 한다.
 * 한쪽만 다르면 내가 보는 내 자리와 남이 보는 내 자리가 어긋난다.
 */

import { WORLD } from './constants';

/** 좌석 원의 중심. */
export const SPAWN_CENTER = {
  x: (WORLD.minX + WORLD.maxX) / 2,
  z: (WORLD.minZ + WORLD.maxZ) / 2 + 1.5,
} as const;

/** 좌석 원의 반지름 (m). */
export const SPAWN_RADIUS = 3.4;

/** 좌석을 방 가운데 원 위에 고르게 배치한다. */
export function spawnFor(seat: number, capacity: number): { x: number; z: number } {
  const n = Math.max(capacity, 1);
  const angle = ((seat - 1) / n) * Math.PI * 2;
  return {
    x: SPAWN_CENTER.x + Math.cos(angle) * SPAWN_RADIUS,
    z: SPAWN_CENTER.z + Math.sin(angle) * SPAWN_RADIUS,
  };
}
