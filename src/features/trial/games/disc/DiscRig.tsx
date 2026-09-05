/**
 * 내 몸 — 회전 원판 위, 3인칭 추격 시점(common/chase.ts). 낙하 생존의 DodgeRig 과 다른 점 하나: **자리는 서버 것이다.**
 * 원판이 나를 실어 나르고 미끄러뜨리는데 미끄러짐은 숨은 마찰계수에서 나오므로(P8) 여기서 계산할 수 없다. 그래서
 *   - 걷기 명령(WASD, 카메라 기준 → 월드 기준 속도)만 trial_walk 로 올린다 (바뀔 때만 10Hz, 손을 떼면 0)
 *   - 다음 스냅샷까지는 마지막 스냅샷의 자리 · 미끄러짐(s) · 원판 각속도로 **예측**해 그린다 — 걷기는 즉시 반응하고,
 *     스냅샷이 오면 서버 자리로 스르르 당긴다(한 번에 25%). 100ms 지연이 몸으로 느껴지지 않게 하는 것이 이 파일의 전부다
 *   - 떨어졌으면(f=1) 예측을 멈추고 서버가 준 자리(원판 밖 바닥)에 눕는다. 2초 뒤 서버가 다시 세워 준다
 *
 * 몸은 걷는 쪽을 보고, 멈추면 마지막 방향 그대로. 점프는 없다 — 원판 위에서 뛰면 발이 떨어진 사이 원판이 돌아 나가는 것까지
 * 재야 해서 이 판의 물리 밖이다(회전 좌표계 적분은 발이 붙어 있을 때만 성립).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import { runCapOf, type BodyId } from '@/world/mp/bodies';
import { DISC_CENTER, DISC_RESPAWN_R, DISC_RUN_SPEED, DISC_TOP, DISC_WALK_SPEED, MOVE_THROTTLE_MS } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { CHASE_DIST, CHASE_LOOK_Y, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf } from '../common/chase';
import { selfPose } from '../common/selfPose';
import { discState } from './discState';

/** 스냅샷이 올 때 예측 자리를 서버 자리로 당기는 비율 */
/**
 * 서버 자리로 당기는 시정수(초). 예전엔 스냅샷마다(10Hz) 차이의 25% 를 **한 번에** 당겼다 — 그 계단이 몸과 카메라에 10Hz 로
 * 찍혀 화면이 떨렸다 (2026-09-05 사용자: "회전 원판 화면 흔들리는 거"). 이제 남은 차이(corr)를 프레임마다 조금씩 녹인다
 */
const CORRECT_TAU = 0.2;
/** 카메라가 몸을 따라붙는 시정수(초) — 자리만 평활, 마우스는 그대로 */
const CAM_TAU = 0.08;

function rot(theta: number, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export function DiscRig({ selfId, body = null, sendWalk }: { selfId: string | null; body?: BodyId | null; sendWalk: (x: number, z: number) => void }) {
  const { camera } = useThree();
  /** 달리기 상한 — 무거운 몸은 느리다 (mp/bodies.ts). 서버도 같은 상한으로 자른다 */
  const runSpeed = runCapOf(body, DISC_RUN_SPEED);
  /** 원판 좌표의 예측 자리 */
  const p = useRef({ x: DISC_RESPAWN_R, z: 0 });
  /** 원판 좌표의 미끄러짐(서버가 준 것) */
  const slide = useRef({ x: 0, z: 0 });
  /** 서버 자리와의 남은 차이(원판 좌표) — 프레임마다 CORRECT_TAU 로 녹인다 */
  const corr = useRef({ x: 0, z: 0 });
  /** 카메라가 따라가는 평활한 몸 자리 — NaN 이면 다음 프레임에 그 자리로 붙는다 */
  const cam = useRef({ x: Number.NaN, y: 0, z: 0 });
  const fallen = useRef(false);
  const fallAt = useRef({ x: 0, z: 0 });
  const seenSnapshotAt = useRef(0);
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  const heading = useRef(Math.PI);
  const lastSent = useRef({ at: 0, x: 0, z: 0, sent: false });

  useEffect(() => {
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    heading.current = Math.PI;
    seenSnapshotAt.current = 0;
    selfPose.x = DISC_CENTER.x + DISC_RESPAWN_R;
    selfPose.y = DISC_TOP;
    selfPose.z = DISC_CENTER.z;
    selfPose.heading = Math.PI;
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
    const theta = discState.thetaAt(now);

    // 서버 자리 — 새 스냅샷이면 예측을 그쪽으로 당긴다
    const srv = selfId ? discState.latest(selfId) : null;
    const snapAt = discState.latestAt();
    if (srv && snapAt !== seenSnapshotAt.current) {
      seenSnapshotAt.current = snapAt;
      if (srv.f === 1) {
        fallen.current = true;
        fallAt.current = { x: srv.x, z: srv.z };
      } else {
        // 스냅샷 시각의 원판 각도로 원판 좌표를 되찾는다 — 그 뒤로 돈 만큼은 예측이 이어 간다
        const thetaSnap = theta - discState.omega() * ((now - snapAt) / 1000);
        const d = rot(-thetaSnap, srv.x - DISC_CENTER.x, srv.z - DISC_CENTER.z);
        const s = rot(-thetaSnap, srv.sx, srv.sz);
        if (fallen.current || Math.hypot(d.x - p.current.x, d.z - p.current.z) > 2.5) {
          p.current = d; // 다시 섰거나 너무 멀다 — 그냥 서버 자리
          corr.current = { x: 0, z: 0 };
          cam.current.x = Number.NaN;
        } else {
          corr.current = { x: d.x - p.current.x, z: d.z - p.current.z }; // 한 번에 안 당기고 아래서 녹인다 (CORRECT_TAU)
        }
        slide.current = s;
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
      const speed = input.run ? runSpeed : DISC_WALK_SPEED;
      wx = (f.x * az + rx * ax) * fit * speed;
      wz = (f.z * az + rz * ax) * fit * speed;
      const want = Math.atan2(wx, wz);
      let dh = want - heading.current;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading.current += dh * Math.min(1, delta / 0.15);
      anim = input.run ? 'run' : 'walk';
    }

    // 예측 — 원판 좌표에서 걷기 + 미끄러짐. 실려 가는 것은 theta 가 맡는다. 서버와의 남은 차이는 조금씩 녹인다
    if (!fallen.current) {
      const wd = rot(-theta, wx, wz);
      const k = 1 - Math.exp(-dt / CORRECT_TAU);
      p.current.x += (wd.x + slide.current.x) * dt + corr.current.x * k;
      p.current.z += (wd.z + slide.current.z) * dt + corr.current.z * k;
      corr.current.x *= 1 - k;
      corr.current.z *= 1 - k;
    }

    let x: number;
    let z: number;
    let y: number;
    if (fallen.current) {
      x = fallAt.current.x;
      z = fallAt.current.z;
      y = 0;
    } else {
      const w = rot(theta, p.current.x, p.current.z);
      x = DISC_CENTER.x + w.x;
      z = DISC_CENTER.z + w.z;
      y = DISC_TOP;
    }
    selfPose.x = x;
    selfPose.y = y;
    selfPose.z = z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;
    /*
     * 떨어져 원판에 다시 서는 2초 — 순간이동으로 보여 준다 (games/common/fallWarp.ts). 여기서 하는 일은
     * 「지금 누워 있나 · 어디에」를 알려 주는 것뿐이다: 몸을 줄이는 것은 SelfAvatar, 빛기둥은 DiscStage 의 WarpFx 다
     */
    discState.warpSelf(selfId, fallen.current, x, y, z, now);

    // 추격 카메라 — 발 높이(원판 위 0.75)를 더한다. 자리는 평활해서 따라간다 — 보정과 원판의 실어 나름이 화면 떨림이 안 되게
    const c = cam.current;
    if (Number.isNaN(c.x) || Math.hypot(x - c.x, z - c.z) > 3) {
      c.x = x;
      c.y = y;
      c.z = z;
    } else {
      const kc = 1 - Math.exp(-dt / CAM_TAU);
      c.x += (x - c.x) * kc;
      c.y += (y - c.y) * kc;
      c.z += (z - c.z) * kc;
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
