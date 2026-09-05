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

/** 따라가기의 시정수(초) — 몸이 튀어도 카메라는 이 시간에 걸쳐 따라붙는다. 짧으면 떨림이 남고 길면 몸이 화면에서 밀린다 */
export const CHASE_TAU = 0.08;
/** 이보다 멀리 옮겨졌으면 따라가지 않고 그 자리로 붙는다 — 순간이동 · 돌아가기 */
export const CHASE_SNAP_M = 3;

/**
 * 부드러운 추격 — placeChaseCamera 를 **몸의 자리를 평활한 뒤** 부른다.
 *
 * 몸의 자리는 프레임마다 조금씩 튄다: 발판이 실어 나르는 x, 착지의 y 스냅, 서버 자리로 당기는 보정(회전 원판).
 * 카메라가 그 자리를 그대로 베끼면 그 튐이 화면 전체의 흔들림이 된다 (2026-09-05 사용자: "화면 흔들리는 거").
 * 자리만 지수 평활한다 — 마우스(yaw · pitch)는 그대로다, 시선까지 늦으면 조작이 미끄러진다.
 */
export function createChaseFollow() {
  let sx = Number.NaN;
  let sy = 0;
  let sz = 0;
  return {
    /** 다음 프레임은 따라가지 않고 그 자리로 붙는다 */
    snap(): void {
      sx = Number.NaN;
    },
    update(camera: THREE.Camera, x: number, y: number, z: number, yaw: number, pitch: number, dt: number): void {
      if (Number.isNaN(sx) || Math.hypot(x - sx, y - sy, z - sz) > CHASE_SNAP_M) {
        sx = x;
        sy = y;
        sz = z;
      } else {
        const k = 1 - Math.exp(-Math.min(dt, 0.1) / CHASE_TAU);
        sx += (x - sx) * k;
        sy += (y - sy) * k;
        sz += (z - sz) * k;
      }
      placeChaseCamera(camera, sx, sy, sz, yaw, pitch);
    },
  };
}
