/**
 * E — 줍기. 내 자리에서 HUNT_PICK_R 안의 가장 가까운 구슬을 서버에 청한다(trial_pick).
 * 판정(거리 · 쿨다운 · 정오)은 전부 서버다 — 여기는 어느 구슬을 가리켰는지만 보낸다 (P8).
 * 구슬이 사라지는 것도 서버의 trial_picked 를 받고 나서다 — 낙관적으로 지우지 않는다.
 *
 * getPos 를 받는 이유: /trial 은 3인칭이라 몸(selfPose)이 기준이고, /interrogation 은 1인칭이라
 * 카메라가 기준이다 — 두 화면이 같은 키를 다른 자리에서 잰다.
 */
import { useEffect, useRef } from 'react';
import { HUNT_PICK_COOLDOWN_MS, HUNT_PICK_R } from '@/world/mp/constants';
import { huntState } from './huntState';

export function PickKey({ getPos, onPick }: { getPos: () => { x: number; z: number }; onPick: (objectId: number) => void }) {
  const ref = useRef({ getPos, onPick });
  ref.current = { getPos, onPick };

  useEffect(() => {
    let lastAt = 0;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true) return; // 입력창에 치는 중이다
      const now = performance.now();
      if (now - lastAt < HUNT_PICK_COOLDOWN_MS) return; // 서버 쿨다운을 클라에서도 지킨다 — 거절당할 걸 안 보낸다
      const p = ref.current.getPos();
      const id = huntState.nearest(p.x, p.z, HUNT_PICK_R);
      if (id === null) return;
      lastAt = now;
      ref.current.onPick(id);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  return null;
}
