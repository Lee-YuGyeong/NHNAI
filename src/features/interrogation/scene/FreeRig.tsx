/**
 * 자유 보행 3인칭 — world/scene/WorldScene 의 LocalRig 에서 이 판에 필요한 것만 남긴 다리에, 시점은 물리게임
 * (features/trial 의 DodgeRig)에서 그대로 옮겼다 — 추격 카메라(chase.ts), 몸은 움직이는 쪽을 본다
 * (2026-09-04 사용자: "그냥 검문소 들어가면 3인칭으로 나오게 해줘" — 토론 · 낙하 생존 · 색 사냥 전부 3인칭이다).
 * 몸은 로봇이 아니라 서버가 배정한 군인(SelfAvatar → SoldierAvatar, 2026-09-04 사용자: "사람 모양 노원상이
 * 해준거 그대로 쓰라고").
 *
 * WASD 는 카메라가 보는 방향 기준, 몸은 움직이는 쪽을 본다 — 옆으로 가면 옆모습이 보인다. Shift+W 달리기 ·
 * Space 점프 · 시야(마우스) · 벽/가구 충돌 · 10Hz 송신. 이모트 · 의심도 감지 · 경비 밀기는 없다.
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
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import { MAPS, type MapDef } from '@/world/map';
import { BODIES, type BodyId } from '@/world/mp/bodies';
import { GRAVITY, JUMP_SPEED, MOVE_THROTTLE_MS, WALK_SPEED, WORLD } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf, placeChaseCamera } from './chase';
import { selfPose } from './selfPose';

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
  /** 카메라가 몸을 도는 각 — 마우스로 돈다 */
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  /** 몸이 보는 방향 — 움직일 때 그쪽으로 돈다 (chase.ts DodgeRig 와 같다) */
  const heading = useRef(0);
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, y: NaN, heading: NaN, anim: 'idle' as AnimState });
  const lastTeleport = useRef<string | null>(null);

  /** 무대(map.focus)를 보고 서는 초기 yaw — 옛 1인칭이 카메라를 이렇게 돌리던 것과 같은 셈 */
  const yawToFocus = (x: number, z: number): number => {
    const dx = map.focus.x - x;
    const dz = map.focus.z - z;
    return Math.atan2(-dx, -dz);
  };

  useEffect(() => {
    yaw.current = yawToFocus(spawn.x, spawn.z);
    heading.current = yaw.current;
    selfPose.x = spawn.x;
    selfPose.y = 0;
    selfPose.z = spawn.z;
    selfPose.heading = heading.current;
    selfPose.anim = 'idle';
    placeChaseCamera(camera, spawn.x, 0, spawn.z, yaw.current, pitch.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    if (!teleport || teleport.key === lastTeleport.current) return;
    lastTeleport.current = teleport.key;
    pos.current.set(teleport.x, 0, teleport.z);
    vy.current = 0;
    grounded.current = true;
    yaw.current = yawToFocus(teleport.x, teleport.z);
    heading.current = yaw.current;
    lastSent.current.x = NaN; // 다음 프레임에 무조건 한 번 보낸다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleport]);

  useEffect(() => attachKeyboard(), []);
  useEffect(() => {
    if (composing) resetInput();
  }, [composing]);

  useFrame((_, delta) => {
    const active = !composing && !paused && document.pointerLockElement !== null;
    const lookActive = !paused && document.pointerLockElement !== null;

    if (input.lookX !== 0 || input.lookY !== 0) {
      if (lookActive) {
        yaw.current -= input.lookX * LOOK_SENSITIVITY;
        pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current + input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }

    const f = forwardOf(yaw.current);
    const rx = -f.z; // 오른쪽 = 앞을 y 축으로 -90° 돌린 것
    const rz = f.x;
    const ax = active ? input.moveX : 0;
    const az = active ? input.moveZ : 0;

    const spec = body ? BODIES[body] : null;
    let anim: AnimState = 'idle';
    if (ax !== 0 || az !== 0) {
      // Shift + 앞(W) 이면 달린다 — 속도는 몸이 정한다. 공중에서는 달리기로 안 바뀐다 (뛰던 속도 유지가 아니라 그냥 걷는 속도)
      const running = active && input.run && az > 0 && grounded.current;
      const speed = (running ? (spec?.run ?? WALK_SPEED * 2) : WALK_SPEED) * Math.min(delta, 0.1);
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      const mx = (f.x * az + rx * ax) * fit;
      const mz = (f.z * az + rz * ax) * fit;
      pos.current.x += mx * speed;
      pos.current.z += mz * speed;
      // 몸은 가는 쪽을 본다 — 급히 돌리면 튀어 보여서 한 프레임에 조금씩(≈ 0.15초에 다 돈다)
      const want = Math.atan2(mx, mz);
      let d = want - heading.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading.current += d * Math.min(1, delta / 0.15);
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

    selfPose.x = pos.current.x;
    selfPose.y = pos.current.y;
    selfPose.z = pos.current.z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;
    placeChaseCamera(camera, pos.current.x, pos.current.y, pos.current.z, yaw.current, pitch.current);

    const now = performance.now();
    const s = lastSent.current;
    const h = heading.current;
    const changed =
      s.anim !== anim ||
      Math.abs(s.x - pos.current.x) > 0.001 ||
      Math.abs(s.z - pos.current.z) > 0.001 ||
      Math.abs(s.y - pos.current.y) > 0.001 ||
      Math.abs(s.heading - h) > 0.001 ||
      Number.isNaN(s.x);
    if (changed && now - s.at >= MOVE_THROTTLE_MS) {
      sendMove(pos.current.x, pos.current.z, pos.current.y, h, anim);
      s.at = now;
      s.x = pos.current.x;
      s.z = pos.current.z;
      s.y = pos.current.y;
      s.heading = h;
      s.anim = anim;
    }
  });

  return null;
}
