/**
 * 자유 보행 1인칭 — world/scene/WorldScene 의 LocalRig 에서 이 판에 필요한 것만 남긴 다리다
 * (WASD · Shift+W 달리기 · Space 점프 · 시야 · 벽/가구 충돌 · 10Hz 송신). 이모트 · 의심도 감지 · 경비 밀기는 없다.
 *
 * 달리기와 점프는 **몸(body)에 따라 다르다** (mp/bodies.ts, 2026-09-04 사용자): 비만인 둘은 달리기가 느리고 점프가 낮다.
 * 걷기는 넷이 같다. 달리기는 앞(W)으로 갈 때만 — 옆·뒤로는 Shift 를 눌러도 걷는다.
 *
 * 토론과 낙하 생존 · 색 사냥에서 쓴다. 낙하 생존 동안은 마당(bounds)이 좁아진다 — 서버가 그 범위 안에서만
 * 떨어뜨리고 판정하므로 밖으로 나가면 기록이 안 남는다.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOK_SENSITIVITY, MAX_PITCH, attachKeyboard, input, resetInput } from '@/world/input/input';
import { MAPS, type MapDef } from '@/world/map';
import { BODIES, type BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT, GRAVITY, JUMP_SPEED, MOVE_THROTTLE_MS, WALK_SPEED, WORLD } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';

const UP = new THREE.Vector3(0, 1, 0);
/** 막는 벽은 **보이는 벽과 같은 맵**의 것이어야 한다 — 배경을 갈아끼운 자리는 HallScene 의 def (머리말) */
const map: MapDef = MAPS.govcenter;

export interface Teleport {
  x: number;
  z: number;
  /** 바뀔 때만 옮긴다 — 같은 자리를 다시 줘도 안 움직인다 */
  key: string;
}

export function FreeRig({
  spawn,
  body,
  teleport,
  bounds,
  composing,
  paused,
  sendMove,
}: {
  spawn: { x: number; z: number };
  /** 내 몸 — 없으면(옛 워커) 기본 물리 */
  body: BodyId | null;
  teleport: Teleport | null;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  composing: boolean;
  paused: boolean;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(spawn.x, 0, spawn.z));
  const vy = useRef(0);
  const grounded = useRef(true);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, y: NaN, heading: NaN, anim: 'idle' as AnimState });
  const lastTeleport = useRef<string | null>(null);

  useEffect(() => {
    camera.position.set(spawn.x, EYE_HEIGHT, spawn.z);
    const dx = map.focus.x - spawn.x;
    const dz = map.focus.z - spawn.z;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, Math.atan2(-dx, -dz), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    if (!teleport || teleport.key === lastTeleport.current) return;
    lastTeleport.current = teleport.key;
    pos.current.set(teleport.x, 0, teleport.z);
    vy.current = 0;
    grounded.current = true;
    const dx = map.focus.x - teleport.x;
    const dz = map.focus.z - teleport.z;
    camera.rotation.set(0, Math.atan2(-dx, -dz), 0);
    lastSent.current.x = NaN; // 다음 프레임에 무조건 한 번 보낸다
  }, [teleport, camera]);

  useEffect(() => attachKeyboard(), []);
  useEffect(() => {
    if (composing) resetInput();
  }, [composing]);

  useFrame((_, delta) => {
    const active = !composing && !paused && document.pointerLockElement !== null;
    const lookActive = !paused && document.pointerLockElement !== null;
    const now = performance.now();

    if (input.lookX !== 0 || input.lookY !== 0) {
      if (lookActive) {
        camera.rotation.y -= input.lookX * LOOK_SENSITIVITY;
        camera.rotation.x = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, camera.rotation.x - input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }

    const ax = active ? input.moveX : 0;
    const az = active ? input.moveZ : 0;
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, UP).normalize();

    const spec = body ? BODIES[body] : null;
    let anim: AnimState = 'idle';
    if (ax !== 0 || az !== 0) {
      // Shift + 앞(W) 이면 달린다 — 속도는 몸이 정한다. 공중에서는 달리기로 안 바뀐다 (뛰던 속도 유지가 아니라 그냥 걷는 속도)
      const running = active && input.run && az > 0 && grounded.current;
      const speed = (running ? (spec?.run ?? WALK_SPEED * 2) : WALK_SPEED) * Math.min(delta, 0.1);
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      pos.current.addScaledVector(forward.current, az * fit * speed);
      pos.current.addScaledVector(right.current, ax * fit * speed);
      anim = running ? 'run' : 'walk';
    }
    if (active && input.jump && grounded.current) {
      vy.current = spec?.jump ?? JUMP_SPEED;
      grounded.current = false;
    }

    map.resolveColliders(pos.current, pos.current.y);
    const b = bounds ?? map.bounds ?? WORLD;
    pos.current.x = Math.min(Math.max(pos.current.x, b.minX + 0.4), b.maxX - 0.4);
    pos.current.z = Math.min(Math.max(pos.current.z, b.minZ + 0.4), b.maxZ - 0.4);

    const ground = map.groundHeightAt(pos.current.x, pos.current.z, pos.current.y);
    if (grounded.current && pos.current.y > ground + 0.02) grounded.current = false;
    if (grounded.current) pos.current.y = ground;
    else {
      vy.current -= GRAVITY * Math.min(delta, 0.1);
      pos.current.y += vy.current * Math.min(delta, 0.1);
      if (vy.current <= 0 && pos.current.y <= ground) {
        pos.current.y = ground;
        vy.current = 0;
        grounded.current = true;
      }
    }

    camera.position.set(pos.current.x, pos.current.y + EYE_HEIGHT, pos.current.z);
    const heading = Math.atan2(forward.current.x, forward.current.z);

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
      s.z = pos.current.z;
      s.y = pos.current.y;
      s.heading = heading;
      s.anim = anim;
    }
  });

  return null;
}
