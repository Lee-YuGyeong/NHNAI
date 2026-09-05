/**
 * 내 몸 — 회전 봉 무대 위, 3인칭 추격 시점(common/chase.ts). 자리는 서버 것이다(DiscRig 과 같은 이유 — 발밑 마찰이
 * 숨은 값이라 미끄러짐을 여기서 계산할 수 없다):
 *   - 걷기 명령(WASD, 카메라 기준 → 월드 기준 속도)만 trial_walk 로 올린다 (바뀔 때만 10Hz, 손을 떼면 0)
 *   - 다음 스냅샷까지는 걷기 명령 + 서버가 준 「명령과 다른 몫」(s)으로 **예측**해 그리고, 스냅샷이 오면 서버
 *     자리로 스르르 당긴다(CORRECT_TAU — 회전 원판에서 화면 떨림을 잡은 그 방식 그대로)
 *   - 누웠으면(f=1: 봉에 맞았거나 떨어졌다) 예측을 멈추고 서버가 준 자리에 눕는다
 *
 * **점프의 렌더만 로컬이다.** 이 판의 수직축에는 숨은 값이 없다(중력 BAR_GRAVITY · 이륙 속도 전부 공개 상수) —
 * 그래서 Space 순간 로컬로 포물선을 그려 몸이 즉시 뜬다. 판정은 여전히 서버다(trial_jump 수신 시각으로 적분한다,
 * bar/engine.ts) — 여기 포물선은 화면용이지 스침 판정과 무관하다. 타이밍 게임에서 100ms 늦게 뜨는 몸은 리듬을 죽인다.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, attachKeyboard, input, resetInput } from '@/world/input/input';
import { jumpOf, runCapOf, type BodyId } from '@/world/mp/bodies';
import { BAR_CENTER, BAR_GRAVITY, BAR_JUMP_K, BAR_JUMP_SCALE, BAR_RUN_SPEED, BAR_STAND_R, BAR_TOP, BAR_WALK_SPEED, JUMP_SPEED, MOVE_THROTTLE_MS } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { CHASE_DIST, CHASE_LOOK_Y, PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, forwardOf } from '../common/chase';
import { selfPose } from '../common/selfPose';
import { barState } from './barState';

/** 서버 자리로 당기는 시정수(초) — DiscRig 과 같다: 스냅샷마다 한 번에 당기면 그 계단이 10Hz 로 화면에 찍힌다 */
const CORRECT_TAU = 0.2;
/** 카메라가 몸을 따라붙는 시정수(초) */
const CAM_TAU = 0.08;

export function BarRig({ selfId, body = null, sendWalk, sendJump }: { selfId: string | null; body?: BodyId | null; sendWalk: (x: number, z: number) => void; sendJump: () => void }) {
  const { camera } = useThree();
  const runSpeed = runCapOf(body, BAR_RUN_SPEED);
  /** 이륙 속도 — 이 몸의 것(공개)을 이 판의 눈금으로. 서버도 같은 값으로 적분한다 */
  const jumpV0 = jumpOf(body, JUMP_SPEED) * BAR_JUMP_SCALE * BAR_JUMP_K;
  /** 예측 자리(월드) — BAR_CENTER 가 as const 라 리터럴로 좁혀지지 않게 타입을 편다 */
  const p = useRef<{ x: number; z: number }>({ x: BAR_CENTER.x, z: BAR_CENTER.z + BAR_STAND_R });
  /** 명령과 다른 몫(서버가 준 것, 월드) */
  const slide = useRef({ x: 0, z: 0 });
  /** 서버 자리와의 남은 차이 — 프레임마다 CORRECT_TAU 로 녹인다 */
  const corr = useRef({ x: 0, z: 0 });
  const cam = useRef({ x: Number.NaN, y: 0, z: 0 });
  /** 지난 프레임에 **그린** 자리 — 걷기 클립의 배속을 여기서 잰 속도에 맞춘다 (barState.selfSpeed) */
  const drawn = useRef({ x: Number.NaN, z: 0 });
  /** 로컬 점프 — 렌더 전용 포물선 (머리말) */
  const air = useRef({ y: 0, vy: 0 });
  const jumpHeld = useRef(false);
  const fallen = useRef(false);
  const fallAt = useRef({ x: 0, z: 0, y: 0 });
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
    drawn.current = { x: Number.NaN, z: 0 };
    barState.selfFallen = false;
    barState.selfSpeed = 0;
    selfPose.x = BAR_CENTER.x;
    selfPose.y = BAR_TOP;
    selfPose.z = BAR_CENTER.z + BAR_STAND_R;
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
    const dt = Math.min(delta, 0.1);

    // 서버 자리 — 새 스냅샷이면 예측을 그쪽으로 당긴다
    const srv = selfId ? barState.latest(selfId) : null;
    const snapAt = barState.latestAt();
    if (srv && snapAt !== seenSnapshotAt.current) {
      seenSnapshotAt.current = snapAt;
      if (srv.f === 1) {
        fallen.current = true;
        fallAt.current = { x: srv.x, z: srv.z, y: srv.y };
        air.current = { y: 0, vy: 0 };
      } else {
        if (fallen.current || Math.hypot(srv.x - p.current.x, srv.z - p.current.z) > 2.5) {
          p.current = { x: srv.x, z: srv.z }; // 다시 섰거나 너무 멀다 — 그냥 서버 자리
          corr.current = { x: 0, z: 0 };
          cam.current.x = Number.NaN;
        } else {
          corr.current = { x: srv.x - p.current.x, z: srv.z - p.current.z };
        }
        slide.current = { x: srv.sx, z: srv.sz };
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
      const speed = input.run ? runSpeed : BAR_WALK_SPEED;
      wx = (f.x * az + rx * ax) * fit * speed;
      wz = (f.z * az + rz * ax) * fit * speed;
      const want = Math.atan2(wx, wz);
      let dh = want - heading.current;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading.current += dh * Math.min(1, delta / 0.15);
      anim = input.run ? 'run' : 'walk';
    }

    // 점프 — 눌린 순간만. 서버에 「뛰었다」를 올리고, 화면은 로컬 포물선으로 즉시 뜬다 (머리말)
    if (input.jump && !jumpHeld.current && !fallen.current && air.current.y <= 0.001 && air.current.vy <= 0) {
      sendJump();
      air.current.vy = jumpV0;
    }
    jumpHeld.current = input.jump;
    if (air.current.y > 0 || air.current.vy > 0) {
      air.current.vy -= BAR_GRAVITY * dt;
      air.current.y = Math.max(0, air.current.y + air.current.vy * dt);
      if (air.current.y === 0 && air.current.vy < 0) air.current.vy = 0;
    }

    // 예측 — 걷기 명령 + 서버가 준 몫. 서버와의 남은 차이는 조금씩 녹인다
    if (!fallen.current) {
      const k = 1 - Math.exp(-dt / CORRECT_TAU);
      p.current.x += (wx + slide.current.x) * dt + corr.current.x * k;
      p.current.z += (wz + slide.current.z) * dt + corr.current.z * k;
      corr.current.x *= 1 - k;
      corr.current.z *= 1 - k;
    }

    let x: number;
    let z: number;
    let y: number;
    if (fallen.current) {
      x = fallAt.current.x;
      z = fallAt.current.z;
      y = fallAt.current.y;
    } else {
      x = p.current.x;
      z = p.current.z;
      y = BAR_TOP + air.current.y;
    }
    selfPose.x = x;
    selfPose.y = y;
    selfPose.z = z;
    selfPose.heading = heading.current;
    selfPose.anim = anim;
    barState.selfFallen = fallen.current;

    /*
     * 몸이 화면에서 실제로 낸 속도 — **명령이 아니라 그린 자리로** 잰다. 미끄러운 구간에는 명령보다 느리게 나가는데
     * (BAR_GRIP) 그때 클립을 1배속으로 틀면 발이 바닥을 긁는다. 다시 설 때의 순간이동은 상한으로 잘라 한 프레임짜리
     * 헛스퍼트를 막고, 남은 떨림은 0.08초로 눅인다
     */
    const d = drawn.current;
    const v = Number.isNaN(d.x) || dt <= 0 ? 0 : Math.min(Math.hypot(x - d.x, z - d.z) / dt, runSpeed * 1.5);
    barState.selfSpeed += (v - barState.selfSpeed) * Math.min(1, dt / 0.08);
    d.x = x;
    d.z = z;

    // 추격 카메라 — 자리는 평활해서 따라간다 (점프의 오르내림은 그대로 — 뛴 것이 몸으로 보여야 한다)
    const c = cam.current;
    if (Number.isNaN(c.x) || Math.hypot(x - c.x, z - c.z) > 3) {
      c.x = x;
      c.y = BAR_TOP;
      c.z = z;
    } else {
      const kc = 1 - Math.exp(-dt / CAM_TAU);
      c.x += (x - c.x) * kc;
      c.y += (BAR_TOP - c.y) * kc;
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
