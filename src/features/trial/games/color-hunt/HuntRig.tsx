/**
 * 색 사냥의 내 다리 — **1인칭.** 3인칭은 공 피하기(낙하 생존)뿐이다 (2026-09-04 사용자: "나는 원래
 * 1인칭으로 보이다가 물리 게임(공피하기) 할때만 잠깐 3인칭"). 그래서 이 게임엔 SelfAvatar 도 없다 —
 * 내 몸은 남의 화면에만 있다(move 송신).
 *
 * WASD 는 보는 방향 기준, Space 점프, 발은 마당(HUNT_ARENA)으로 막는다. 좌표는 바뀌었을 때만
 * 10Hz 로 방에 보낸다(LocalRig 규칙). selfPose 도 채운다 — E 줍기(PickKey)가 내 자리를 여기서 읽는다.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOK_SENSITIVITY, MAX_PITCH, attachKeyboard, input, resetInput } from '@/world/input/input';
import { EYE_HEIGHT, FALL_BODY_R, GRAVITY, HUNT_ARENA, JUMP_SPEED, MOVE_THROTTLE_MS, WALK_SPEED } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { selfPose } from '../common/selfPose';

/** 견본판(z 7.4) 앞 — 무대 쪽(-z)을 보고 선다. 첫 화면에서 구슬밭 전체가 눈에 들어온다 */
export const HUNT_SPAWN = { x: 0, z: 5.5 } as const;

const UP = new THREE.Vector3(0, 1, 0);

export function HuntRig({ sendMove }: { sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void }) {
  const { camera } = useThree();
  const pos = useRef<{ x: number; y: number; z: number }>({ x: HUNT_SPAWN.x, y: 0, z: HUNT_SPAWN.z });
  const vy = useRef(0);
  const grounded = useRef(true);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const lastSent = useRef({ at: 0, x: NaN, y: NaN, z: NaN, heading: NaN, anim: 'idle' as AnimState });

  useEffect(() => {
    pos.current = { x: HUNT_SPAWN.x, y: 0, z: HUNT_SPAWN.z };
    vy.current = 0;
    grounded.current = true;
    camera.position.set(HUNT_SPAWN.x, EYE_HEIGHT, HUNT_SPAWN.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, 0, 0); // 기본 시선 = -z (무대 쪽)
    selfPose.x = HUNT_SPAWN.x;
    selfPose.y = 0;
    selfPose.z = HUNT_SPAWN.z;
    selfPose.heading = Math.PI;
    selfPose.anim = 'idle';
  }, [camera]);

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
      pos.current.x += (forward.current.x * az + right.current.x * ax) * fit * speed;
      pos.current.z += (forward.current.z * az + right.current.z * ax) * fit * speed;
      anim = 'walk';
    }

    // 마당 밖으로는 못 나간다 — 구슬도 판정도 마당 안에만 있다
    pos.current.x = Math.min(Math.max(pos.current.x, HUNT_ARENA.minX + FALL_BODY_R), HUNT_ARENA.maxX - FALL_BODY_R);
    pos.current.z = Math.min(Math.max(pos.current.z, HUNT_ARENA.minZ + FALL_BODY_R), HUNT_ARENA.maxZ - FALL_BODY_R);

    if (input.jump && grounded.current) {
      vy.current = JUMP_SPEED;
      grounded.current = false;
    }
    if (!grounded.current) {
      const dt = Math.min(delta, 0.1);
      vy.current -= GRAVITY * dt;
      pos.current.y += vy.current * dt;
      if (vy.current <= 0 && pos.current.y <= 0) {
        pos.current.y = 0;
        vy.current = 0;
        grounded.current = true;
      }
    }

    camera.position.set(pos.current.x, pos.current.y + EYE_HEIGHT, pos.current.z);
    const heading = Math.atan2(forward.current.x, forward.current.z);

    selfPose.x = pos.current.x;
    selfPose.y = pos.current.y;
    selfPose.z = pos.current.z;
    selfPose.heading = heading;
    selfPose.anim = anim;

    const now = performance.now();
    const s = lastSent.current;
    const changed =
      s.anim !== anim ||
      Math.abs(s.x - pos.current.x) > 0.001 ||
      Math.abs(s.z - pos.current.z) > 0.001 ||
      Math.abs(s.y - pos.current.y) > 0.001 ||
      Math.abs(s.heading - heading) > 0.001 ||
      Number.isNaN(s.x);
    if (changed && now - s.at >= MOVE_THROTTLE_MS) {
      sendMove(pos.current.x, pos.current.z, pos.current.y, heading, anim);
      s.at = now;
      s.x = pos.current.x;
      s.y = pos.current.y;
      s.z = pos.current.z;
      s.heading = heading;
      s.anim = anim;
    }
  });

  return null;
}
