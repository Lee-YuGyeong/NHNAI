/**
 * 추격 카메라 — 몸 뒤·위에서 몸의 어깨 너머를 본다. yaw 는 카메라가 몸을 도는 각(0 = 정면 -z 를 보는 뒤),
 * pitch 는 위에서 내려다보는 각. 둘 다 마우스(MouseLook → input.look) 로 돈다.
 */
import type * as THREE from 'three';

/** 몸에서 카메라까지의 거리(m) · 카메라가 보는 점의 높이(가슴) */
export const CHASE_DIST = 4.2;
export const CHASE_LOOK_Y = 1.3;
/** 내려다보는 각의 범위(rad). 아래로는 조금만, 위로는 꽤 */
export const PITCH_MIN = -0.15;
export const PITCH_MAX = 1.1;
/** 기본은 꽤 내려다본다 — 내 주변 바닥(공 그림자)이 넓게 보여야 피할 수 있다 */
export const PITCH_DEFAULT = 0.55;

/** 카메라 yaw 로부터 몸이 나아가는 앞 방향 (카메라 로컬 정면 -z 를 yaw 로 돌린 것) */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** 앞 방향의 heading(아바타 rotation.y) — 앞면이 로컬 +z 라 atan2(fx, fz) */
export function headingOf(yaw: number): number {
  const f = forwardOf(yaw);
  return Math.atan2(f.x, f.z);
}

export function placeChaseCamera(camera: THREE.Camera, x: number, z: number, yaw: number, pitch: number): void {
  const f = forwardOf(yaw);
  const back = CHASE_DIST * Math.cos(pitch);
  const up = CHASE_LOOK_Y + CHASE_DIST * Math.sin(pitch);
  camera.position.set(x - f.x * back, up, z - f.z * back);
  camera.lookAt(x + f.x * 0.6, CHASE_LOOK_Y, z + f.z * 0.6);
}
