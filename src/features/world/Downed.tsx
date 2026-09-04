/**
 * 피격·쓰러짐의 카메라 — 캔버스 안.
 *   맞으면: 시야가 한 번 튄다(임팩트 — 아래로 꺾였다가 돌아온다, 옆으로 살짝 흔들린다).
 *   쓰러지면(health.dead): 눈높이가 바닥까지 내려가고 고개가 옆으로 기울어 눕는다. 다시 시작 전까지 그대로.
 * LocalRig(WorldScene)가 먼저 카메라를 놓고, 이 컴포넌트는 그 뒤에 도니 그 위에 얹는다 — SyncTremor 처럼 지난 프레임에 얹은 회전은 이번 프레임에 되돌린다.
 * 쓰러진 뒤의 위치·기울기는 매 프레임 덮어쓴다 (LocalRig 는 paused 라 시야 입력을 안 받는다).
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { EYE_HEIGHT } from '@/world/mp/constants';
import { health } from '@/world/mp/health';

/**
 * 임팩트 길이(초)·세기(rad) — 한 발 맞을 때 시야가 튀는 크기.
 * 2026-08-31 사용자("두려움을 느낄 정도로"): 0.09·0.05 → 0.15·0.08 로 키웠다. 이보다 크면 조준이 아니라 멀미가 된다
 */
const KICK_S = 0.45;
const KICK_PITCH = 0.15;
const KICK_YAW = 0.08;
/** 쓰러지는 데 걸리는 시간(초), 누운 눈높이(m), 기운 각(rad) */
const FALL_S = 1.1;
const FLOOR_EYE = 0.32;
const FALL_ROLL = 0.62;
const FALL_PITCH = -0.18;
/**
 * 누울 때 머리가 옆으로 나가는 거리(m) — 벽에 기대 쓰러지면 이 머리가 벽 **안으로** 들어가 벽 너머가 보인다
 * (2026-09-01 사용자: "총 맞아 쓰러졌을 때 벽을 뚫고 쓰러진다"). 기우는 쪽을 미리 짚어 보고, 벽에 닿으면 그만큼 몸을 민다.
 */
const HEAD_LEAN = 0.5;

/**
 * @param resolve 맵의 충돌 해소 (map/index 의 MapDef.resolveColliders). 주면 쓰러진 머리를 벽 밖으로 민다 —
 *                눈높이를 feetY 로 넘기므로 **머리보다 높은 것**(벽·기둥)만 민다. 발밑의 단·장비함은 밀지 않는다.
 */
export function Downed({ resolve }: { resolve?: (p: THREE.Vector3, feetY: number) => void }) {
  const camera = useThree((s) => s.camera);
  const probe = useMemo(() => new THREE.Vector3(), []);
  const cue = useRef<[number, number, number]>([0, 0, 0]);
  const seenHit = useRef(0);
  const kickFrom = useRef(-Infinity);
  const kickSign = useRef(1);

  useFrame(() => {
    const now = performance.now();
    const h = health.get();
    if (h.last && h.last.at !== seenHit.current) {
      seenHit.current = h.last.at;
      kickFrom.current = now;
      kickSign.current = Math.random() < 0.5 ? -1 : 1;
    }

    // 지난 프레임 것을 되돌린다
    camera.rotation.x -= cue.current[0];
    camera.rotation.y -= cue.current[1];
    camera.rotation.z -= cue.current[2];
    cue.current = [0, 0, 0];

    if (h.dead) {
      // 눕는다 — 처음 FALL_S 초 동안 부드럽게, 그 뒤엔 숨 쉬듯 아주 조금만
      const t = Math.min(1, (now - h.diedAt) / (FALL_S * 1000));
      const k = 1 - (1 - t) ** 3;
      const breathe = t >= 1 ? Math.sin(now / 900) * 0.006 : 0;
      camera.position.y -= (EYE_HEIGHT - FLOOR_EYE) * k;
      cue.current = [FALL_PITCH * k + breathe, 0, FALL_ROLL * k];
      /*
       * 벽에 기대 쓰러지면 옆으로 기운 머리가 벽을 뚫는다. 기우는 양쪽으로 머리 자리를 짚어 보고,
       * 벽이 밀어내는 만큼 몸을 반대로 민다 (살아 있을 때 LocalRig 이 하던 일을 여기서 대신한다 — 죽으면 그쪽이 멈춘다).
       */
      if (resolve && k > 0.01) {
        const lean = HEAD_LEAN * k;
        const rx = Math.cos(camera.rotation.y);
        const rz = -Math.sin(camera.rotation.y);
        let px = 0;
        let pz = 0;
        for (const sgn of [1, -1]) {
          probe.set(camera.position.x + rx * sgn * lean, 0, camera.position.z + rz * sgn * lean);
          const bx = probe.x;
          const bz = probe.z;
          resolve(probe, camera.position.y);
          if (Math.hypot(probe.x - bx, probe.z - bz) > Math.hypot(px, pz)) {
            px = probe.x - bx;
            pz = probe.z - bz;
          }
        }
        camera.position.x += px;
        camera.position.z += pz;
      }
    } else {
      const age = (now - kickFrom.current) / 1000;
      if (age < KICK_S) {
        // 꺾였다가 돌아온다 — 앞 15% 는 급히, 나머지는 천천히
        const env = age < KICK_S * 0.15 ? age / (KICK_S * 0.15) : 1 - (age - KICK_S * 0.15) / (KICK_S * 0.85);
        cue.current = [-KICK_PITCH * env, KICK_YAW * env * kickSign.current, 0.035 * env * kickSign.current];
      }
    }
    camera.rotation.x += cue.current[0];
    camera.rotation.y += cue.current[1];
    camera.rotation.z += cue.current[2];
  });
  return null;
}
