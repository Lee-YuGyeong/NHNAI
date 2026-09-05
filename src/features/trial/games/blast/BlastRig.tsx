/**
 * 내 몸 — 폭발 마당, 3인칭 추격 시점(common/chase.ts). 회전 원판 · 무게 중심 다리와 같은 규칙: **자리는 서버 것이다.**
 * 충격파가 몸에 주는 속도는 숨은 세기에서 나오므로(P8) 여기서 계산할 수 없다. 그래서
 *   - 걷기 명령(WASD → 월드 속도)은 trial_walk 로, 자세(C)는 trial_crouch 로 올린다
 *   - 서 있을 때는 걷기를 로컬로 예측해 그리고(장애물 · 마당 밖은 mp/blast.ts pushOut 으로 같은 규칙으로 막는다) 서버 자리로 조금씩 녹인다
 *   - 날아가는 중(f=1) · 쓰러진 중(f=2)에는 예측을 버리고 서버가 준 자리 + 속도로 다음 스냅샷까지 포물선을 잇는다 — 뜬 몸은 조작이 없다
 *   - 가까운 폭발은 카메라를 흔든다 — 거리 감쇠(mp/blast.ts falloff)만큼. 세기는 모르니 늘 같은 흔들림이다
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import { runCapOf, type BodyId } from '@/world/mp/bodies';
import { BLAST_CROUCH_SPEED, BLAST_RUN_SPEED, BLAST_WALK_SPEED, falloff, pushOut } from '@/world/mp/blast';
import { GRAVITY, MOVE_THROTTLE_MS } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { CHASE_DIST, CHASE_LOOK_Y, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf } from '../common/chase';
import { selfPose } from '../common/selfPose';
import { blastState } from './blastState';

const CORRECT_TAU = 0.2;
const CAM_TAU = 0.08;
const SHAKE_MS = 700;

export function BlastRig({
  selfId,
  body = null,
  sendWalk,
  sendCrouch,
}: {
  selfId: string | null;
  body?: BodyId | null;
  sendWalk: (x: number, z: number) => void;
  sendCrouch: (on: boolean) => void;
}) {
  const { camera } = useThree();
  const runSpeed = runCapOf(body, BLAST_RUN_SPEED);
  const p = useRef({ x: 0, z: 0 });
  const corr = useRef({ x: 0, z: 0 });
  const cam = useRef({ x: Number.NaN, y: 0, z: 0 });
  const seenSnapshotAt = useRef(0);
  /** 서버가 준 마지막 몸 — 공중 · 쓰러짐일 때 이걸로 잇는다 */
  const srvRef = useRef<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; f: number; at: number } | null>(null);
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  const heading = useRef(0);
  const lastSent = useRef({ at: 0, x: 0, z: 0, sent: false });
  const crouch = useRef(false);
  const crouchSent = useRef(false);

  useEffect(() => {
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    heading.current = 0;
    seenSnapshotAt.current = 0;
    selfPose.x = 0;
    selfPose.y = 0;
    selfPose.z = 0;
    selfPose.heading = 0;
    selfPose.anim = 'idle';
  }, []);

  useEffect(() => {
    const detach = attachKeyboard();
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' || e.code === 'ControlLeft') crouch.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' || e.code === 'ControlLeft') crouch.current = false;
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

    // 자세 — 바뀌면 보낸다
    if (crouch.current !== crouchSent.current) {
      sendCrouch(crouch.current);
      crouchSent.current = crouch.current;
    }
    blastState.selfCrouch = crouch.current;

    // 서버 자리
    const srv = selfId ? blastState.latest(selfId) : null;
    const snapAt = blastState.latestAt();
    if (srv && snapAt !== seenSnapshotAt.current) {
      seenSnapshotAt.current = snapAt;
      const wasGrounded = (srvRef.current?.f ?? 0) === 0;
      srvRef.current = { x: srv.x, y: srv.y, z: srv.z, vx: srv.vx, vy: srv.vy, vz: srv.vz, f: srv.f, at: snapAt };
      blastState.selfStance = srv.f;
      if (srv.f === 0) {
        if (!wasGrounded || Math.hypot(srv.x - p.current.x, srv.z - p.current.z) > 2.5) {
          p.current = { x: srv.x, z: srv.z };
          corr.current = { x: 0, z: 0 };
          if (!wasGrounded) cam.current.x = Number.NaN;
        } else {
          corr.current = { x: srv.x - p.current.x, z: srv.z - p.current.z };
        }
      }
    }
    const s = srvRef.current;
    const grounded = (s?.f ?? 0) === 0;

    // 걷기 명령 — 카메라 기준 WASD → 월드 속도. Shift 달리기, C 낮은 자세(느리다)
    const f = forwardOf(yaw.current);
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
      const speed = crouch.current ? BLAST_CROUCH_SPEED : input.run ? runSpeed : BLAST_WALK_SPEED;
      wx = (f.x * az + rx * ax) * fit * speed;
      wz = (f.z * az + rz * ax) * fit * speed;
      const want = Math.atan2(wx, wz);
      let dh = want - heading.current;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading.current += dh * Math.min(1, delta / 0.15);
      anim = input.run && !crouch.current ? 'run' : 'walk';
    }

    let x: number;
    let y: number;
    let z: number;
    if (grounded || !s) {
      const k = 1 - Math.exp(-dt / CORRECT_TAU);
      p.current.x += wx * dt + corr.current.x * k;
      p.current.z += wz * dt + corr.current.z * k;
      pushOut(p.current);
      corr.current.x *= 1 - k;
      corr.current.z *= 1 - k;
      x = p.current.x;
      z = p.current.z;
      y = 0;
    } else {
      // 공중 · 쓰러짐 — 서버 자리 + 속도로 잇는다. 공중이면 포물선
      const t = Math.min(0.5, Math.max(0, (now - s.at) / 1000));
      x = s.x + s.vx * t;
      z = s.z + s.vz * t;
      y = s.f === 1 ? Math.max(0, s.y + s.vy * t - 0.5 * GRAVITY * t * t) : 0;
      const q = { x, z };
      pushOut(q);
      x = q.x;
      z = q.z;
      p.current = { x, z };
    }
    selfPose.x = x;
    selfPose.y = y;
    selfPose.z = z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;

    // 추격 카메라 — 평활 + 가까운 폭발의 흔들림
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
    let shake = 0;
    for (const bm of blastState.booms()) {
      const age = now - bm.atLocal;
      if (age < 0 || age > SHAKE_MS) continue;
      shake = Math.max(shake, falloff(Math.hypot(bm.x - x, bm.z - z)) * (1 - age / SHAKE_MS));
    }
    const jx = shake * 0.35 * Math.sin(now * 0.07);
    const jy = shake * 0.25 * Math.cos(now * 0.09);
    const back = CHASE_DIST * Math.cos(pitch.current);
    const up = CHASE_LOOK_Y + CHASE_DIST * Math.sin(pitch.current);
    camera.position.set(c.x - f.x * back + jx, c.y + up + jy, c.z - f.z * back);
    camera.lookAt(c.x + f.x * 0.6 + jx, c.y + CHASE_LOOK_Y + jy, c.z + f.z * 0.6);

    // 걷기 명령 송신 — 바뀌었을 때만 10Hz
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
