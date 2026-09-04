/**
 * 추격 카메라 — 몸 뒤·위에서 어깨 너머를 본다. 처음엔 features/trial 의 common/chase.ts 값을 그대로 옮겼는데
 * (다른 세션 소유라 따로 둔 이유는 아래), 2026-09-04 사용자: "3인칭 배틀그라운드 만큼 해줘. 지금 너무
 * 먼거같아" — 거리를 바짝 좁히고 기본 각도도 배틀그라운드처럼 거의 수평에 가깝게 낮췄다(내려다보는 각은
 * 아직 마우스로 끝까지 쓸 수 있다).
 *
 * 이 파일을 features/trial 것 그대로 쓰지 않고 옮긴 건 물리게임 쪽(features/trial)이 다른 세션 소유라서다 —
 * StopRig 가 TrialRig 를 그대로 안 쓰고 따로 옮겨 둔 것과 같은 이유.
 *
 * y 는 몸의 발 높이 — 트라이얼의 마당은 평지라 없던 값인데, 이 홀은 지형에 따라 바닥 높이가 다르다
 * (map.groundHeightAt). 그래서 x·z 외에 y 를 하나 더 받는다.
 */
import type * as THREE from 'three';

export const CHASE_DIST = 1.9;
export const CHASE_LOOK_Y = 1.55;
export const PITCH_MIN = -0.2;
export const PITCH_MAX = 1.1;
export const PITCH_DEFAULT = 0.1;

/** 카메라 yaw 로부터 몸이 나아가는 앞 방향 (카메라 로컬 정면 -z 를 yaw 로 돌린 것) */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** 앞 방향의 heading(아바타 rotation.y) — 앞면이 로컬 +z 라 atan2(fx, fz) */
export function headingOf(yaw: number): number {
  const f = forwardOf(yaw);
  return Math.atan2(f.x, f.z);
}

export function placeChaseCamera(camera: THREE.Camera, x: number, y: number, z: number, yaw: number, pitch: number): void {
  const f = forwardOf(yaw);
  const back = CHASE_DIST * Math.cos(pitch);
  const up = y + CHASE_LOOK_Y + CHASE_DIST * Math.sin(pitch);
  camera.position.set(x - f.x * back, up, z - f.z * back);
  camera.lookAt(x + f.x * 0.6, y + CHASE_LOOK_Y, z + f.z * 0.6);
}
