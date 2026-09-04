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
 * **공중에서는 이륙 속도를 넘지 못한다.** 발이 땅에 없으면 밀 것이 없다 — 그래서 뛰던 속도는 그대로 유지되고(관성),
 * 손을 떼면 줄일 수만 있다. 예전에는 이륙하는 순간 달리기가 끊겨 누구든 공중에서 걷기 속도(2.6)가 됐다: 점프 거리가
 * 1.94m(fit)·1.53m(비만)로 발판 간격 2m 에 못 미쳐, **몸이 곧 기록 편향**이었다 (mp/platform.ts 머리말).
 *
 * 움직이는 플랫폼에서는 **착지한 발이 밀린다** — 발판 윗면의 마찰은 숨은 조건이라(P8) 서버가 착지마다 곱셈을 끝낸
 * 미끄러짐만 `trial_slip` 으로 보내고, 여기서는 그 속도를 발판에 **대한** 이동분으로 더해 준다 (platformState.slipAt).
 *
 * 움직이는 플랫폼(platformState.active)에서는 셋이 더 있다 (2026-09-05 사용자): 발판은 **통과 못 하는** 기둥이라 옆에서 부딪히면
 * 테두리 밖으로 밀리고, 바닥에 떨어지면 잠깐 뒤 출발 발판의 내 자리로 돌아가며, 도착 발판에 내리면 완주 — 남은 시간은 거기서
 * 입력 없이 기다린다.
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
import { PAD_R, PAD_TOP, PLATFORM_RESPAWN_MS } from '@/world/mp/platform';
import type { AnimState } from '@/world/mp/protocol';
import { CHAR_BODY_R, remotePlayers } from '@/world/net/remote-players';
import { PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf, placeChaseCamera } from './chase';
import { fallState } from '@/features/trial/games/fall/fallState';
import { platformState } from './platformState';
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
  sendJump,
}: {
  spawn: { x: number; z: number };
  /** 내 몸 — 없으면(옛 워커) 기본 물리 */
  body: BodyId | null;
  teleport: Teleport | null;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  composing: boolean;
  paused: boolean;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
  /**
   * 낙하 생존 — 이게 오면 **높이는 서버 것**이다. Space 는 「눌렀다」만 올리고(이 함수), 발 높이는 스냅샷의 air 에서
   * 온다(fallState.selfY). 그 구간의 중력이 숨은 값이라 클라가 스스로 포물선을 그릴 수 없기 때문이다(P8)
   */
  sendJump?: () => void;
}) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(spawn.x, 0, spawn.z));
  const vy = useRef(0);
  const grounded = useRef(true);
  /** 이륙할 때의 수평 속도(m/s) — 공중에서는 이걸 넘지 못한다 (관성. 발이 없으면 더 못 민다) */
  const airSpeed = useRef(0);
  /** Space 의 눌린 **순간**만 잡는다 — 낙하 생존에서 trial_jump 를 한 번만 보내려고 */
  const jumpHeld = useRef(false);
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
    // 발판 위로 옮겨졌으면 윗면에 선다 (플랫폼 라운드의 출발 발판) — 바닥 높이로 두면 발판 안에 갇혀 밀려난다
    pos.current.set(teleport.x, platformState.groundAt(teleport.x, teleport.z, PAD_TOP), teleport.z);
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
    // 플랫폼에서 완주했거나 넘어져 돌아가는 중이면 입력을 안 받는다 — 서서 기다린다
    const held = platformState.active && (platformState.finished || platformState.fellAt !== null);
    const ax = active && !held ? input.moveX : 0;
    const az = active && !held ? input.moveZ : 0;

    const spec = body ? BODIES[body] : null;
    // Shift + 앞(W) 이면 달린다 — 속도는 몸이 정한다
    const running = active && input.run && az > 0;
    const want = running ? (spec?.run ?? WALK_SPEED * 2) : WALK_SPEED;
    let anim: AnimState = 'idle';
    if (ax !== 0 || az !== 0) {
      // 공중에서는 이륙 속도가 상한이다 — 더 빨라질 수는 없고(밀 바닥이 없다) 손을 떼 줄일 수만 있다
      const speed = (grounded.current ? want : Math.min(want, airSpeed.current)) * Math.min(delta, 0.1);
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      const mx = (f.x * az + rx * ax) * fit;
      const mz = (f.z * az + rz * ax) * fit;
      pos.current.x += mx * speed;
      pos.current.z += mz * speed;
      // 몸은 가는 쪽을 본다 — 급히 돌리면 튀어 보여서 한 프레임에 조금씩(≈ 0.15초에 다 돈다)
      const wantH = Math.atan2(mx, mz);
      let d = wantH - heading.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading.current += d * Math.min(1, delta / 0.15);
      anim = grounded.current && running ? 'run' : 'walk';
    }
    if (active && !held && input.jump && !jumpHeld.current && (grounded.current || sendJump)) {
      // 이륙 속도를 잠근다 — 달려 뛰면 그 속도로 날고, 서서 뛰면 공중에서 걷기만큼 몸을 뒤척일 수 있다
      if (grounded.current) airSpeed.current = ax !== 0 || az !== 0 ? Math.max(WALK_SPEED, want) : WALK_SPEED;
      if (sendJump) sendJump();
      else if (grounded.current) {
        vy.current = spec?.jump ?? JUMP_SPEED;
        grounded.current = false;
      }
    }
    jumpHeld.current = input.jump;

    /*
     * 움직이는 플랫폼 — 발판 위에 서 있으면 발판이 나를 실어 나른다 (platformState.carryX). 맵의 충돌 상자는 정지해 있어
     * 발판은 여기서 따로 본다: 바닥 높이는 맵과 발판 가운데 높은 쪽이다.
     */
    const nowMs = Date.now();
    if (platformState.active && grounded.current) {
      const pad = platformState.padUnder(pos.current.x, pos.current.z, nowMs);
      if (pad && pos.current.y >= platformState.PAD_TOP - 0.02) pos.current.x += platformState.carryX(pad.k, nowMs, Math.min(delta, 0.1) * 1000);
      // 착지하고 발이 밀린다 — 서버가 준 미끄러짐(속도·지속 시간)만큼. 마찰계수는 여기 없다(P8)
      const slip = platformState.slipAt(nowMs);
      if (slip) {
        pos.current.x += slip.x * Math.min(delta, 0.1);
        pos.current.z += slip.z * Math.min(delta, 0.1);
      }
    }

    map.resolveColliders(pos.current, pos.current.y);
    // 캐릭터끼리는 통과 못 한다 — 겹친 만큼 밀려난다. 밀린 자리가 벽 안이면 벽이 다시 민다 (환경이 이긴다)
    const among = remotePlayers.pushOut(pos.current.x, pos.current.z, pos.current.y, CHAR_BODY_R, performance.now(), body);
    pos.current.x = among.x;
    pos.current.z = among.z;
    map.resolveColliders(pos.current, pos.current.y);
    // 발판은 통과 못 한다 — 윗면보다 낮은 높이로 발판 안에 들어왔으면(옆에서 부딪힘 · 밑으로 지나감) 테두리 밖으로 민다
    if (platformState.active && pos.current.y < PAD_TOP - 0.02) {
      const pad = platformState.padUnder(pos.current.x, pos.current.z, nowMs);
      if (pad) {
        const d = pad.dist > 1e-4 ? pad.dist : 1e-4;
        const push = PAD_R + 0.05;
        pos.current.x = pad.x + (pad.dist > 1e-4 ? pad.dx / d : 0) * push;
        pos.current.z = pad.z + (pad.dist > 1e-4 ? pad.dz / d : 1) * push;
      }
    }
    const b = bounds ?? map.bounds ?? WORLD;
    pos.current.x = Math.min(Math.max(pos.current.x, b.minX + 0.4), b.maxX - 0.4);
    pos.current.z = Math.min(Math.max(pos.current.z, b.minZ + 0.4), b.maxZ - 0.4);

    const ground = Math.max(map.groundHeightAt(pos.current.x, pos.current.z, pos.current.y), platformState.groundAt(pos.current.x, pos.current.z, pos.current.y, nowMs));
    if (sendJump) {
      // 낙하 생존 — 뜨는 것도 내려오는 것도 서버가 그 구간의 숨은 중력으로 적분한다. 마당은 평평해 바닥이 0 이다
      pos.current.y = Math.max(ground, fallState.selfY(nowMs));
      vy.current = 0;
      grounded.current = pos.current.y <= ground + 0.001;
    } else if (grounded.current && pos.current.y > ground + 0.02) grounded.current = false;
    if (sendJump) {
      /* 위에서 이미 정했다 */
    } else if (grounded.current) pos.current.y = ground;
    else {
      vy.current -= GRAVITY * Math.min(delta, 0.1);
      pos.current.y += vy.current * Math.min(delta, 0.1);
      if (vy.current <= 0 && pos.current.y <= ground) {
        pos.current.y = ground;
        vy.current = 0;
        grounded.current = true;
      }
    }

    // 플랫폼 — 바닥에 닿았으면 넘어진 것: 잠깐 뒤 출발 발판의 내 자리로. 도착 발판에 섰으면 완주
    if (platformState.active && grounded.current) {
      if (pos.current.y < 0.02) {
        platformState.fell(nowMs);
        if (nowMs - (platformState.fellAt ?? nowMs) >= PLATFORM_RESPAWN_MS) {
          const home = platformState.home;
          pos.current.set(home.x, PAD_TOP, home.z);
          vy.current = 0;
          platformState.respawned();
          lastSent.current.x = NaN;
        }
      } else if (!platformState.finished) {
        const pad = platformState.padUnder(pos.current.x, pos.current.z, nowMs);
        if (pad && platformState.isFinish(pad.k)) platformState.finish();
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
