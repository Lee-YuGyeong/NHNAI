/**
 * 내 몸 — 탑 위, 3인칭 추격 시점(common/chase.ts). 회전 원판 · 다리와 같은 규칙: **자리는 서버 것이다.** 기울어진 발판 위에서 미끄러지는
 * 양과 밀린 뒤 서는 거리가 숨은 마찰에서 나오므로(P8) 여기서 계산할 수 없다. 그래서
 *   - 걷기 명령(WASD → 월드 속도)은 trial_walk 로, 점프(Space)는 trial_jump 로, 밀치기(E)는 카메라가 보는 방향과 함께 trial_push 로 올린다
 *   - 점프의 포물선은 서버가 적분한다(착지가 발판에 충격을 주는 판정이라) — 클라는 f=1 이 오면 서버 자리 + 속도로 잇는다
 *   - 서 있을 때는 걷기 + 서버가 준 미끄러짐(s)으로 로컬 예측해 그리고 서버 자리로 조금씩 녹인다. 발 높이는 발밑 발판의 기울기로 푼다
 *   - 떨어지는 중(f=1) · 누운 중(f=2)에는 예측을 버리고 서버 자리를 잇는다
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import { runCapOf, type BodyId } from '@/world/mp/bodies';
import { GRAVITY, MOVE_THROTTLE_MS } from '@/world/mp/constants';
import { TOWER_PUSH_COOLDOWN_MS, TOWER_RUN_SPEED, TOWER_TOP, TOWER_WALK_SPEED, slabIndexAt } from '@/world/mp/tower';
import type { AnimState } from '@/world/mp/protocol';
import { CHASE_DIST, CHASE_LOOK_Y, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf } from '../common/chase';
import { selfPose } from '../common/selfPose';
import { towerState } from './towerState';

const CORRECT_TAU = 0.2;
const CAM_TAU = 0.08;

/** 마지막으로 밀친 로컬 시각 — HUD 가 쿨다운을 그린다 (TrialFeature) */
export const pushClock = { at: 0 };

export function TowerRig({
  selfId,
  body = null,
  sendWalk,
  sendPush,
  sendJump,
}: {
  selfId: string | null;
  body?: BodyId | null;
  sendWalk: (x: number, z: number) => void;
  sendPush: (hx: number, hz: number) => void;
  sendJump: () => void;
}) {
  const { camera } = useThree();
  const runSpeed = runCapOf(body, TOWER_RUN_SPEED);
  const p = useRef({ x: 0, z: 0 });
  const slide = useRef({ x: 0, z: 0 });
  const corr = useRef({ x: 0, z: 0 });
  const cam = useRef({ x: Number.NaN, y: 0, z: 0 });
  const seenSnapshotAt = useRef(0);
  const srvRef = useRef<{ x: number; y: number; z: number; f: number; at: number; vx: number; vy: number; vz: number } | null>(null);
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  const heading = useRef(0);
  const lastSent = useRef({ at: 0, x: 0, z: 0, sent: false });
  const pushHeld = useRef(false);
  const jumpHeld = useRef(false);
  const pushKey = useRef(false);

  useEffect(() => {
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    heading.current = 0;
    seenSnapshotAt.current = 0;
    pushClock.at = 0;
    selfPose.x = 0;
    selfPose.y = TOWER_TOP;
    selfPose.z = 0;
    selfPose.heading = 0;
    selfPose.anim = 'idle';
  }, []);

  useEffect(() => {
    const detach = attachKeyboard();
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') pushKey.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') pushKey.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      detach();
      resetInput();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
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
    const now = Date.now();
    const dt = Math.min(delta, 0.1);
    const f = forwardOf(yaw.current);

    // 서버 자리
    const srv = selfId ? towerState.latest(selfId) : null;
    const snapAt = towerState.latestAt();
    if (srv && snapAt !== seenSnapshotAt.current) {
      seenSnapshotAt.current = snapAt;
      const wasGrounded = (srvRef.current?.f ?? 0) === 0;
      srvRef.current = { x: srv.x, y: srv.y, z: srv.z, f: srv.f, at: snapAt, vx: srv.vx, vy: srv.vy, vz: srv.vz };
      towerState.selfStance = srv.f;
      if (srv.f === 0) {
        if (!wasGrounded || Math.hypot(srv.x - p.current.x, srv.z - p.current.z) > 2.5) {
          p.current = { x: srv.x, z: srv.z };
          corr.current = { x: 0, z: 0 };
          if (!wasGrounded) cam.current.x = Number.NaN;
        } else corr.current = { x: srv.x - p.current.x, z: srv.z - p.current.z };
        slide.current = { x: srv.sx, z: srv.sz };
      }
    }
    const s = srvRef.current;
    const grounded = (s?.f ?? 0) === 0;

    // 밀치기 — E. 눌린 순간 한 번, 쿨다운은 로컬에서도 지킨다(서버가 다시 본다)
    if (pushKey.current && !pushHeld.current) {
      pushHeld.current = true;
      if (grounded && now - pushClock.at >= TOWER_PUSH_COOLDOWN_MS) {
        pushClock.at = now;
        sendPush(f.x, f.z);
        heading.current = Math.atan2(f.x, f.z);
      }
    } else if (!pushKey.current) pushHeld.current = false;
    // 점프 — Space. 눌린 순간 한 번. 포물선은 서버가 적분한다
    if (input.jump && !jumpHeld.current) {
      jumpHeld.current = true;
      if (grounded) sendJump();
    } else if (!input.jump) jumpHeld.current = false;

    // 걷기 명령 — 카메라 기준 WASD → 월드 속도
    const rx = -f.z;
    const rz = f.x;
    const ax = input.moveX;
    const az = input.moveZ;
    let wx = 0;
    let wz = 0;
    let anim: AnimState = 'idle';
    if (grounded && (ax !== 0 || az !== 0)) {
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      const speed = input.run ? runSpeed : TOWER_WALK_SPEED;
      wx = (f.x * az + rx * ax) * fit * speed;
      wz = (f.z * az + rz * ax) * fit * speed;
      const want = Math.atan2(wx, wz);
      let dh = want - heading.current;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading.current += dh * Math.min(1, delta / 0.15);
      anim = input.run ? 'run' : 'walk';
    }

    let x: number;
    let y: number;
    let z: number;
    if (grounded || !s) {
      const k = 1 - Math.exp(-dt / CORRECT_TAU);
      p.current.x += (wx + slide.current.x) * dt + corr.current.x * k;
      p.current.z += (wz + slide.current.z) * dt + corr.current.z * k;
      corr.current.x *= 1 - k;
      corr.current.z *= 1 - k;
      x = p.current.x;
      z = p.current.z;
      const idx = slabIndexAt(x, z);
      y = (idx >= 0 ? towerState.surfaceAt(idx, x, z, now) : null) ?? s?.y ?? TOWER_TOP;
    } else {
      // 떨어지는 중 · 누움 — 서버 자리 + 속도로 잇는다(포물선). 스냅샷마다 자리가 튀지 않게
      const t = Math.min(0.6, Math.max(0, (now - s.at) / 1000));
      x = s.f === 1 ? s.x + s.vx * t : s.x;
      z = s.f === 1 ? s.z + s.vz * t : s.z;
      y = s.f === 1 ? Math.max(0, s.y + s.vy * t - 0.5 * GRAVITY * t * t) : 0;
      p.current = { x, z };
    }
    selfPose.x = x;
    selfPose.y = y;
    selfPose.z = z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;

    const c = cam.current;
    if (Number.isNaN(c.x) || Math.hypot(x - c.x, z - c.z) > 4) {
      c.x = x;
      c.y = y;
      c.z = z;
    } else {
      const kc = 1 - Math.exp(-dt / CAM_TAU);
      c.x += (x - c.x) * kc;
      c.y += (y - c.y) * kc;
      c.z += (z - c.z) * kc;
    }
    // 진동 — 카메라가 같이 흔들린다 (towerState.quakeAmp)
    const q = towerState.quakeAmp(now);
    const jx = q * 0.22 * Math.sin(now * 0.07);
    const jy = q * 0.16 * Math.cos(now * 0.09);
    const back = CHASE_DIST * Math.cos(pitch.current);
    const up = CHASE_LOOK_Y + CHASE_DIST * Math.sin(pitch.current);
    camera.position.set(c.x - f.x * back + jx, c.y + up + jy, c.z - f.z * back);
    camera.lookAt(c.x + f.x * 0.6 + jx, c.y + CHASE_LOOK_Y + jy, c.z + f.z * 0.6);

    const ls = lastSent.current;
    const nowP = performance.now();
    const changed = !ls.sent || Math.abs(ls.x - wx) > 0.05 || Math.abs(ls.z - wz) > 0.05;
    if (changed && nowP - ls.at >= MOVE_THROTTLE_MS) {
      sendWalk(wx, wz);
      ls.at = nowP;
      ls.x = wx;
      ls.z = wz;
      ls.sent = true;
    }
  });

  return null;
}
