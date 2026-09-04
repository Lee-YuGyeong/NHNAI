/**
 * 정지선 동안의 내 몸 — **레일 위를 달리는 3인칭** (features/trial 의 TrialRig 그대로 가져왔다 — chase.ts
 * 머리말, 2026-09-04 사용자: "그냥 검문소 들어가면 3인칭으로 나오게 해줘"). W 로 출발, S 로 브레이크.
 * 위치는 runnerState 가 공개 가속 모델(runModel)과 서버가 준 정지 지점으로 정한다. 카메라는 몸 뒤·위에서
 * 따라오고 마우스는 그 각(yaw·pitch)만 돈다.
 * 내 좌표는 FreeRig 과 같은 규칙으로 방에 보낸다(바뀌었을 때만 10Hz) — 남의 화면에 내 몸이 서게 하는 것뿐, 판정과 무관하다.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LOOK_SENSITIVITY, input } from '@/world/input/input';
import { MOVE_THROTTLE_MS } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
import { PITCH_DEFAULT, PITCH_MAX, PITCH_MIN, placeChaseCamera } from '../chase';
import { selfPose } from '../selfPose';
import { runnerState } from './runnerState';
import { MAX_ATTEMPTS, START_Z, laneX, zAt } from './track';

export function StopRig({
  myId,
  lane,
  myAttempts,
  onAccel,
  onBrake,
  sendMove,
}: {
  myId: string;
  lane: number;
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
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, heading: NaN, anim: 'idle' as AnimState });

  // 내 레인의 출발선에서 무대(-z)를 보고 선다. 카메라는 뒤에서 어깨 너머를 본다
  useEffect(() => {
    runnerState.setLane(myId, lane);
    yaw.current = 0;
    pitch.current = PITCH_DEFAULT;
    selfPose.x = laneX(lane);
    selfPose.y = 0;
    selfPose.z = START_Z;
    selfPose.heading = Math.PI; // 아바타 앞면(+z)을 -z 로
    selfPose.anim = 'idle';
    placeChaseCamera(camera, laneX(lane), 0, START_Z, 0, PITCH_DEFAULT);
    phase.current = 'idle';
  }, [camera, myId, lane]);

  useEffect(() => {
    if (myAttempts === lastAttempts.current) return;
    lastAttempts.current = myAttempts;
    phase.current = 'idle';
  }, [myAttempts]);

  useEffect(() => {
    function keydown(e: KeyboardEvent): void {
      if (e.repeat || myAttempts >= MAX_ATTEMPTS) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyW' && phase.current === 'idle' && runnerState.atStart(myId, Date.now())) {
        phase.current = 'running';
        runnerState.running(myId, Date.now());
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
    if (input.lookX !== 0 || input.lookY !== 0) {
      if (document.pointerLockElement !== null) {
        yaw.current -= input.lookX * LOOK_SENSITIVITY;
        pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current + input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }
    const { x: dist, anim } = runnerState.frameAt(myId, Date.now());
    const x = laneX(lane);
    const z = zAt(dist);
    const heading = Math.PI; // 몸은 늘 무대 쪽(-z)을 본다 — 레일 위다
    selfPose.x = x;
    selfPose.z = z;
    selfPose.heading = heading;
    selfPose.anim = anim;
    placeChaseCamera(camera, x, 0, z, yaw.current, pitch.current);

    const now = performance.now();
    const s = lastSent.current;
    const changed = s.anim !== anim || Math.abs(s.x - x) > 0.001 || Math.abs(s.z - z) > 0.001 || Math.abs(s.heading - heading) > 0.001 || Number.isNaN(s.x);
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
