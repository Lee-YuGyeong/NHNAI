/**
 * 내 몸 — 판자 위, 3인칭 추격 시점(common/chase.ts). 회전 원판의 DiscRig 과 같은 규칙: **자리는 서버 것이다.**
 * 판이 기울면 발이 미끄러지는데 그 미끄러짐은 숨은 마찰계수에서 나오므로(P8) 여기서 계산할 수 없다. 그래서
 *   - 걷기 명령(WASD, 카메라 기준 → 월드 기준 속도)만 trial_walk 로 올린다 (바뀔 때만 10Hz, 손을 떼면 0)
 *   - 다음 스냅샷까지는 마지막 스냅샷의 자리(u · v) · 미끄러짐(s) 으로 **예측**해 그린다 — 걷기는 즉시 반응하고, 스냅샷이 오면
 *     서버 자리로 프레임마다 조금씩 녹인다(CORRECT_TAU). 판의 기울기는 seesawState 가 외삽한다
 *   - 떨어졌으면(f=1) 예측을 멈추고 서버가 준 자리(판 끝 밑 바닥)에 눕는다. 2.5초 뒤 서버가 다시 세워 준다
 * 길이 방향은 월드 z, 폭 방향은 월드 x 다 — 걷기 명령의 z 성분이 판을 따라 오르내리는 걸음이다. 폭은 난간이 막는다.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import { runCapOf, type BodyId } from '@/world/mp/bodies';
import { MOVE_THROTTLE_MS, SEESAW_HALF_W, SEESAW_RUN_SPEED, SEESAW_WALK_SPEED } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { CHASE_DIST, CHASE_LOOK_Y, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf } from '../common/chase';
import { selfPose } from '../common/selfPose';
import { seesawState, worldOf } from './seesawState';

const CORRECT_TAU = 0.2;
const CAM_TAU = 0.08;
const BODY_R = 0.35;

export function SeesawRig({ selfId, body = null, sendWalk }: { selfId: string | null; body?: BodyId | null; sendWalk: (x: number, z: number) => void }) {
  const { camera } = useThree();
  const runSpeed = runCapOf(body, SEESAW_RUN_SPEED);
  /** 판자 좌표의 예측 자리 */
  const p = useRef({ u: 0.8, v: 0 });
  /** 길이 방향 미끄러짐(서버가 준 것) */
  const slide = useRef(0);
  const corr = useRef({ u: 0, v: 0 });
  const cam = useRef({ x: Number.NaN, y: 0, z: 0 });
  const fallen = useRef(false);
  const fallAt = useRef({ u: 0, v: 0 });
  const seenSnapshotAt = useRef(0);
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  const heading = useRef(0);
  const lastSent = useRef({ at: 0, x: 0, z: 0, sent: false });

  useEffect(() => {
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    heading.current = 0;
    seenSnapshotAt.current = 0;
    const w = worldOf(0.8, 0, 0);
    selfPose.x = w.x;
    selfPose.y = w.y;
    selfPose.z = w.z;
    selfPose.heading = 0;
    selfPose.anim = 'idle';
  }, []);

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
    const now = Date.now();
    const dt = Math.min(delta, 0.1);
    const phi = seesawState.phiAt(now);

    // 서버 자리 — 새 스냅샷이면 예측을 그쪽으로 당긴다
    const srv = selfId ? seesawState.latest(selfId) : null;
    const snapAt = seesawState.latestAt();
    if (srv && snapAt !== seenSnapshotAt.current) {
      seenSnapshotAt.current = snapAt;
      if (srv.f === 1) {
        fallen.current = true;
        fallAt.current = { u: srv.u, v: srv.v };
      } else {
        if (fallen.current || Math.hypot(srv.u - p.current.u, srv.v - p.current.v) > 2.5) {
          p.current = { u: srv.u, v: srv.v };
          corr.current = { u: 0, v: 0 };
          cam.current.x = Number.NaN;
        } else {
          corr.current = { u: srv.u - p.current.u, v: srv.v - p.current.v };
        }
        slide.current = srv.s;
        fallen.current = false;
      }
    }

    // 걷기 명령 — 카메라 기준 WASD → 월드 속도. Shift 는 달리기
    const f = forwardOf(yaw.current);
    const rx = -f.z;
    const rz = f.x;
    const ax = input.moveX;
    const az = input.moveZ;
    let wx = 0;
    let wz = 0;
    let anim: AnimState = 'idle';
    if (!fallen.current && (ax !== 0 || az !== 0)) {
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      const speed = input.run ? runSpeed : SEESAW_WALK_SPEED;
      wx = (f.x * az + rx * ax) * fit * speed;
      wz = (f.z * az + rz * ax) * fit * speed;
      const want = Math.atan2(wx, wz);
      let dh = want - heading.current;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading.current += dh * Math.min(1, delta / 0.15);
      anim = input.run ? 'run' : 'walk';
    }

    // 예측 — 길이(z) 방향 걷기 + 미끄러짐, 폭(x) 방향 걷기. 난간은 여기서도 막는다. 서버와의 남은 차이는 조금씩 녹인다
    if (!fallen.current) {
      const k = 1 - Math.exp(-dt / CORRECT_TAU);
      p.current.u += (wz + slide.current) * dt + corr.current.u * k;
      p.current.v += wx * dt + corr.current.v * k;
      const vMax = SEESAW_HALF_W - BODY_R;
      p.current.v = Math.min(vMax, Math.max(-vMax, p.current.v));
      corr.current.u *= 1 - k;
      corr.current.v *= 1 - k;
    }

    const w = fallen.current ? worldOf(fallAt.current.u, fallAt.current.v, phi, true) : worldOf(p.current.u, p.current.v, phi);
    selfPose.x = w.x;
    selfPose.y = w.y;
    selfPose.z = w.z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;

    // 추격 카메라 — 자리는 평활해서 따라간다 (판이 오르내리는 것이 화면 떨림이 안 되게)
    const c = cam.current;
    if (Number.isNaN(c.x) || Math.hypot(w.x - c.x, w.z - c.z) > 3) {
      c.x = w.x;
      c.y = w.y;
      c.z = w.z;
    } else {
      const kc = 1 - Math.exp(-dt / CAM_TAU);
      c.x += (w.x - c.x) * kc;
      c.y += (w.y - c.y) * kc;
      c.z += (w.z - c.z) * kc;
    }
    const back = CHASE_DIST * Math.cos(pitch.current);
    const up = CHASE_LOOK_Y + CHASE_DIST * Math.sin(pitch.current);
    camera.position.set(c.x - f.x * back, c.y + up, c.z - f.z * back);
    camera.lookAt(c.x + f.x * 0.6, c.y + CHASE_LOOK_Y, c.z + f.z * 0.6);

    // 걷기 명령 송신 — 바뀌었을 때만 10Hz. 손을 떼는 것(0,0)도 한 번 보낸다
    const s = lastSent.current;
    const nowP = performance.now();
    const changed = !s.sent || Math.abs(s.x - wx) > 0.05 || Math.abs(s.z - wz) > 0.05;
    if (changed && nowP - s.at >= MOVE_THROTTLE_MS) {
      sendWalk(wx, wz);
      s.at = nowP;
      s.x = wx;
      s.z = wz;
      s.sent = true;
    }
  });

  return null;
}
