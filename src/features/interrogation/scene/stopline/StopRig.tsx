/**
 * 정지선 동안의 내 몸 — **레일 위를 달리는 1인칭** (features/trial 의 TrialRig 과 같은 다리). W 로 출발, S 로 브레이크.
 * 위치는 runnerState 가 공개 가속 모델(runModel)과 서버가 준 정지 지점으로 정한다. 시야는 MouseLook → input.look.
 * 내 좌표는 FreeRig 과 같은 규칙으로 방에 보낸다(바뀌었을 때만 10Hz) — 남의 화면에 내 몸이 서게 하는 것뿐, 판정과 무관하다.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOK_SENSITIVITY, MAX_PITCH, input } from '@/world/input/input';
import { EYE_HEIGHT, MOVE_THROTTLE_MS } from '@/world/mp/constants';
import type { AnimState } from '@/world/mp/protocol';
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
  const forward = useRef(new THREE.Vector3());
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, heading: NaN, anim: 'idle' as AnimState });

  // 내 레인의 출발선에서 무대(-z)를 보고 선다
  useEffect(() => {
    runnerState.setLane(myId, lane);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, 0, 0);
    camera.position.set(laneX(lane), EYE_HEIGHT, START_Z);
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
        camera.rotation.y -= input.lookX * LOOK_SENSITIVITY;
        camera.rotation.x = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, camera.rotation.x - input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }
    const { x: dist, anim } = runnerState.frameAt(myId, Date.now());
    const x = laneX(lane);
    const z = zAt(dist);
    camera.position.set(x, EYE_HEIGHT, z);

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    const heading = Math.atan2(forward.current.x, forward.current.z);

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
