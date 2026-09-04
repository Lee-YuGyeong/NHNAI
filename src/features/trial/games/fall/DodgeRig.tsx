/**
 * 내 몸 — 마당 안 자유 보행, **3인칭 추격 시점**. 카메라는 몸 뒤·위에서 따라오고(common/chase.ts), 마우스는
 * 카메라가 몸을 도는 각(yaw · pitch)을 바꾼다. WASD 는 카메라가 보는 방향 기준이고, 몸은 **움직이는 쪽을 본다** —
 * 옆으로 가면 옆모습, 물러서면 앞모습이 보인다 (2026-09-04 사용자: "계속 뒷모습만 보이는데 움직임에 따라 다르게").
 * 멈추면 마지막으로 향하던 쪽을 그대로 본다.
 * 점프(Space)는 복도와 같은 값(JUMP_SPEED · GRAVITY)이다. 이모트 · 가구 충돌 · 의심도 감지가 없고, 발은 FALL_ARENA 로만 막는다.
 *
 * 내 좌표는 LocalRig 과 같은 규칙으로 방에 보낸다(바뀌었을 때만 10Hz). 서버는 이 좌표로 위협·피격을 잰다
 * (worker/src/trial/fall/engine.ts onMove) — 그래서 여기서 순간이동하면 서버가 버린다(걷기 속도의 2배 상한).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import type { BodyId } from '@/world/mp/bodies';
import { FALL_ARENA, FALL_BODY_R, GRAVITY, JUMP_SPEED, MOVE_THROTTLE_MS, WALK_SPEED } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { remotePlayers } from '@/world/net/remote-players';
import { PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf, headingOf, placeChaseCamera } from '../common/chase';
import { selfPose } from '../common/selfPose';

/** 마당 가운데 조금 뒤 — 무대(-z)를 보고 선다 */
export const DODGE_SPAWN = { x: 0, z: 2 } as const;

export function DodgeRig({ body = null, sendMove }: { body?: BodyId | null; sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void }) {
  const { camera } = useThree();
  const pos = useRef<{ x: number; y: number; z: number }>({ x: DODGE_SPAWN.x, y: 0, z: DODGE_SPAWN.z });
  const vy = useRef(0);
  const grounded = useRef(true);
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  /** 몸이 보는 방향 — 움직일 때 그쪽으로 돈다 */
  const heading = useRef(headingOf(0));
  const lastSent = useRef({ at: 0, x: NaN, y: NaN, z: NaN, heading: NaN, anim: 'idle' as AnimState });

  useEffect(() => {
    pos.current = { x: DODGE_SPAWN.x, y: 0, z: DODGE_SPAWN.z };
    vy.current = 0;
    grounded.current = true;
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    heading.current = headingOf(0);
    selfPose.x = DODGE_SPAWN.x;
    selfPose.y = 0;
    selfPose.z = DODGE_SPAWN.z;
    selfPose.heading = headingOf(0);
    selfPose.anim = 'idle';
    placeChaseCamera(camera, DODGE_SPAWN.x, DODGE_SPAWN.z, 0, PITCH_DEFAULT);
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
        yaw.current -= input.lookX * LOOK_SENSITIVITY;
        pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current + input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }

    const f = forwardOf(yaw.current);
    const rx = -f.z; // 오른쪽 = 앞을 y 축으로 -90° 돌린 것
    const rz = f.x;
    const ax = input.moveX;
    const az = input.moveZ;
    let anim: AnimState = 'idle';
    if (ax !== 0 || az !== 0) {
      const speed = WALK_SPEED * Math.min(delta, 0.1);
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
      anim = 'walk';
    }

    // 캐릭터끼리는 통과 못 한다 — 겹친 만큼 밀려난다. 마당 클램프가 뒤라 밖으로 밀려 나가진 않는다
    const among = remotePlayers.pushOut(pos.current.x, pos.current.z, pos.current.y, FALL_BODY_R, performance.now(), body);
    pos.current.x = among.x;
    pos.current.z = among.z;

    // 마당 밖으로는 못 나간다 — 공은 마당 안에만 떨어지고, 판정도 마당 안에서만 뜻이 있다
    pos.current.x = Math.min(Math.max(pos.current.x, FALL_ARENA.minX + FALL_BODY_R), FALL_ARENA.maxX - FALL_BODY_R);
    pos.current.z = Math.min(Math.max(pos.current.z, FALL_ARENA.minZ + FALL_BODY_R), FALL_ARENA.maxZ - FALL_BODY_R);

    // 점프 — 땅에 있을 때만. 복도(LocalRig)와 같은 값이라 높이 ≈ 1.05m
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

    selfPose.x = pos.current.x;
    selfPose.y = pos.current.y;
    selfPose.z = pos.current.z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;
    placeChaseCamera(camera, pos.current.x, pos.current.z, yaw.current, pitch.current);

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
      s.y = pos.current.y;
      s.z = pos.current.z;
      s.heading = h;
      s.anim = anim;
    }
  });

  return null;
}
