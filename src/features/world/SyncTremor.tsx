/**
 * SYNC 의 몸 쪽 — 캔버스 안에서 프레임마다 저장소를 돌리고(회복·글리치 판정), 글리치가 나면 카메라를 떨게 한다 (손 떨림).
 * 카메라가 제자리에 있었는지로 "가만히 서 있나"를 잰다 — 시야를 돌리는 것은 움직임으로 치지 않는다 (억제 = 걷지 않기).
 * WorldScene 의 LocalRig 처럼 지난 프레임에 얹은 값을 이번 프레임에 되돌리고 새로 얹는다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

import { sync } from '@/world/mp/sync';

/** 떨림 길이(초)·세기(rad) */
const TREMOR_S = 0.55;
const TREMOR_RAD = 0.012;

export function SyncTremor() {
  const camera = useThree((s) => s.camera);
  const last = useRef({ x: NaN, z: NaN });
  const cue = useRef<[number, number]>([0, 0]);
  const tremorFrom = useRef(-Infinity);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const { x, z } = camera.position;
    const moved = Number.isNaN(last.current.x) ? false : Math.hypot(x - last.current.x, z - last.current.z) > 0.002;
    last.current.x = x;
    last.current.z = z;

    const t = clock.getElapsedTime();
    if (sync.tick(dt, !moved, x, z)) tremorFrom.current = t;

    camera.rotation.x -= cue.current[0];
    camera.rotation.y -= cue.current[1];
    cue.current = [0, 0];
    const age = t - tremorFrom.current;
    if (age < TREMOR_S) {
      const env = (1 - age / TREMOR_S) ** 2;
      cue.current = [Math.sin(t * 61) * TREMOR_RAD * env, Math.sin(t * 47 + 1.3) * TREMOR_RAD * 0.8 * env];
      camera.rotation.x += cue.current[0];
      camera.rotation.y += cue.current[1];
    }
  });
  return null;
}
