/**
 * 내 몸 — 마당 안 자유 보행 1인칭. WorldScene 의 LocalRig 과 같은 조작(input.ts 의 WASD · 마우스 시야)이지만
 * 점프 · 이모트 · 가구 충돌 · 의심도 감지가 없고, 발은 FALL_ARENA 로만 막는다 — 마당은 빈 바닥이다.
 *
 * 내 좌표는 LocalRig 과 같은 규칙으로 방에 보낸다(바뀌었을 때만 10Hz). 서버는 이 좌표로 위협·피격을 잰다
 * (worker/src/trial/fall/engine.ts onMove) — 그래서 여기서 순간이동하면 서버가 버린다(걷기 속도의 2배 상한).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOK_SENSITIVITY, MAX_PITCH, attachKeyboard, input, resetInput } from '@/world/input/input';
import { EYE_HEIGHT, FALL_ARENA, FALL_BODY_R, MOVE_THROTTLE_MS, WALK_SPEED } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';

const UP = new THREE.Vector3(0, 1, 0);
/** 마당 가운데 조금 뒤 — 무대(-z)를 보고 선다 */
export const DODGE_SPAWN = { x: 0, z: 2 } as const;

export function DodgeRig({ sendMove }: { sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void }) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(DODGE_SPAWN.x, 0, DODGE_SPAWN.z));
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, heading: NaN, anim: 'idle' as AnimState });

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, 0, 0);
    camera.position.set(DODGE_SPAWN.x, EYE_HEIGHT, DODGE_SPAWN.z);
    pos.current.set(DODGE_SPAWN.x, 0, DODGE_SPAWN.z);
  }, [camera]);

  // 키보드는 input.ts 를 거친다 — 이 컴포넌트는 입력이 어디서 왔는지 모른다 (LocalRig 과 같다)
  useEffect(() => {
    const detach = attachKeyboard();
    return () => {
      detach();
      resetInput();
    };
  }, []);

  useFrame((_, delta) => {
    const locked = document.pointerLockElement !== null;
    if (input.lookX !== 0 || input.lookY !== 0) {
      if (locked) {
        camera.rotation.y -= input.lookX * LOOK_SENSITIVITY;
        camera.rotation.x = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, camera.rotation.x - input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, UP).normalize();

    const ax = input.moveX;
    const az = input.moveZ;
    let anim: AnimState = 'idle';
    if (ax !== 0 || az !== 0) {
      const speed = WALK_SPEED * Math.min(delta, 0.1);
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      pos.current.addScaledVector(forward.current, az * fit * speed);
      pos.current.addScaledVector(right.current, ax * fit * speed);
      anim = 'walk';
    }

    // 마당 밖으로는 못 나간다 — 물체는 마당 안에만 떨어지고, 판정도 마당 안에서만 뜻이 있다
    pos.current.x = Math.min(Math.max(pos.current.x, FALL_ARENA.minX + FALL_BODY_R), FALL_ARENA.maxX - FALL_BODY_R);
    pos.current.z = Math.min(Math.max(pos.current.z, FALL_ARENA.minZ + FALL_BODY_R), FALL_ARENA.maxZ - FALL_BODY_R);
    camera.position.set(pos.current.x, EYE_HEIGHT, pos.current.z);

    const heading = Math.atan2(forward.current.x, forward.current.z);
    const now = performance.now();
    const s = lastSent.current;
    const changed =
      s.anim !== anim || Math.abs(s.x - pos.current.x) > 0.001 || Math.abs(s.z - pos.current.z) > 0.001 || Math.abs(s.heading - heading) > 0.001 || Number.isNaN(s.x);
    if (changed && now - s.at >= MOVE_THROTTLE_MS) {
      sendMove(pos.current.x, pos.current.z, 0, heading, anim);
      s.at = now;
      s.x = pos.current.x;
      s.z = pos.current.z;
      s.heading = heading;
      s.anim = anim;
    }
  });

  return null;
}
