/**
 * 내 몸 — **레일 위를 달리는 3인칭**. 몸은 늘 무대(-z)를 보고 레인을 달리고, 카메라는 그 뒤·위에서 따라온다
 * (common/chase.ts). 마우스는 카메라가 몸을 도는 각만 바꾼다. 다리는 자유 보행이 아니라 W 로 출발해 S 로
 * 브레이크를 밟는 두 이벤트뿐이고, 위치는 runnerState 가 공개 가속 모델(runModel)과 서버가 준 정지 지점으로 결정한다.
 *
 * 내 좌표는 LocalRig 과 같은 규칙으로 방에 보낸다(바뀌었을 때만 10Hz) — 다른 사람 화면의 Remotes 가 그걸로
 * 내 로봇을 그린다. 판정과는 무관하다(서버는 accel/brake 시각만 본다).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, input } from '@/world/input/input';
import { MOVE_THROTTLE_MS, STOPLINE_MAX_ATTEMPTS } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, placeChaseCamera } from '../common/chase';
import { selfPose } from '../common/selfPose';
import { runnerState } from './runnerState';
import { START_Z, laneX, zAt } from './track';

export function TrialRig({
  myId,
  gameKey,
  myAttempts,
  onAccel,
  onBrake,
  sendMove,
}: {
  myId: string | null;
  /** 판이 바뀌면 자세를 처음으로 — 판 시작 시각이면 된다 */
  gameKey: number;
  myAttempts: number;
  onAccel: () => void;
  onBrake: () => void;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}) {
  const { camera } = useThree();
  const phase = useRef<'idle' | 'running' | 'waiting'>('idle');
  const lastAttempts = useRef(myAttempts);
  const yaw = useRef(0);
  const pitch = useRef(PITCH_DEFAULT);
  // NaN 으로 시작해 첫 프레임에 무조건 한 번 보낸다 (내 자리를 남에게 알린다)
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, heading: NaN, anim: 'idle' as AnimState });

  // 내 레인의 출발선에서 무대(-z)를 보고 선다. 카메라는 뒤(+z)에서 어깨 너머를 본다
  useEffect(() => {
    const lane = myId ? runnerState.laneOf(myId) : 0;
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    selfPose.x = laneX(lane);
    selfPose.z = START_Z;
    selfPose.heading = Math.PI; // 아바타 앞면(+z)을 -z 로
    selfPose.anim = 'idle';
    placeChaseCamera(camera, laneX(lane), START_Z, 0, PITCH_DEFAULT);
  }, [camera, myId]);

  useEffect(() => {
    phase.current = 'idle';
  }, [gameKey]);

  useEffect(() => {
    if (myAttempts === lastAttempts.current) return;
    lastAttempts.current = myAttempts;
    phase.current = 'idle'; // 방금 시행 하나가 판정됐다 — 출발선으로 돌아오면 다음 시행이 가능하다
  }, [myAttempts]);

  useEffect(() => {
    function keydown(e: KeyboardEvent): void {
      if (e.repeat || !myId || myAttempts >= STOPLINE_MAX_ATTEMPTS) return;
      if (e.code === 'KeyW' && phase.current === 'idle' && runnerState.atStart(myId, Date.now())) {
        phase.current = 'running';
        runnerState.running(myId, Date.now()); // 서버 알림(trial_running)을 기다리지 않고 바로 달린다 — 남의 화면은 서버 시각으로 맞춘다
        onAccel();
      } else if (e.code === 'KeyS' && phase.current === 'running') {
        phase.current = 'waiting';
        onBrake();
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [myId, myAttempts, onAccel, onBrake]);

  useFrame(() => {
    // 카메라가 몸을 도는 각. 잠금이 걸린 동안만 돈다. 막힌 동안 쌓인 값은 버린다 (LocalRig 과 같다)
    if (input.lookX !== 0 || input.lookY !== 0) {
      if (document.pointerLockElement !== null) {
        yaw.current -= input.lookX * LOOK_SENSITIVITY;
        pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current + input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }
    if (!myId) return;

    const { x: dist, anim } = runnerState.frameAt(myId, Date.now());
    const x = laneX(runnerState.laneOf(myId));
    const z = zAt(dist);
    const heading = Math.PI; // 몸은 늘 무대 쪽(-z)을 본다 — 레일 위다
    selfPose.x = x;
    selfPose.z = z;
    selfPose.heading = heading;
    selfPose.anim = anim;
    placeChaseCamera(camera, x, z, yaw.current, pitch.current);

    const now = performance.now();
    const s = lastSent.current;
    const changed =
      s.anim !== anim || Math.abs(s.x - x) > 0.001 || Math.abs(s.z - z) > 0.001 || Math.abs(s.heading - heading) > 0.001 || Number.isNaN(s.x);
    if (changed && now - s.at >= MOVE_THROTTLE_MS) {
      sendMove(x, z, 0, heading, anim);
      s.at = now;
      s.x = x;
      s.z = z;
      s.heading = heading;
      s.anim = anim;
    }
  });

  return null;
}
