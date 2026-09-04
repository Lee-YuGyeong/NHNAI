/**
 * 코어 조명이 집행을 따라간다 — **판에 한 번뿐인 빛** (world2 게임 개정 1 · 레벨 설계 중앙 시설 08).
 *
 * UNSLING 이 게임에 한 번만 나오는 동작이듯, 코어가 **이 밝기**가 되는 것도 판에 한 번뿐이다. 의심도 100 → 락다운 →
 * 코어 출력이 올라가며 붉은 빛이 집행자와 나를 비춘다. 문턱 예고(60 문가 · 80 시선)의 공간 버전이라, 대사 없이도
 * 플레이어는 무슨 일인지 안다. 다른 어떤 연출도 이 밝기를 못 쓴다 — 그래서 둘째 접근은 같은 색의 **흐린 판**이다.
 *
 *   깨어남   approach · unsling · aim · blocked, 어둠 아님 — 코어 꼭대기 맥동 + 집행자와 나 사이를 따라오는 빛
 *   테두리   락다운인데 집행이 없다 — 문 넷이 닫혔다는 것만 붉게, 세기 3
 *   없음     어둠 · 콘솔 하강 — 방의 Lights 가 central2.light() 로 알아서 내려간다. 여기서 더 얹지 않는다
 *
 * ★ 본판(CentralChapterScene 의 Lockdown)은 scifi 전역 재질(TUBE_MAT 들)을 붉게 **덮어쓴다.** 여기서는 안 한다 —
 *   같은 재질 인스턴스가 마운트된 모든 방을 함께 물들이고, world2 는 그 방들을 모른다. 광원만 얹는다 (제약 9).
 * ★ 카메라를 안 뺏는다. 락온 · 컷신 없음. 빛이 따라올 뿐 시선은 플레이어 것이다.
 * ★ 프레임마다 setState 를 안 한다 — 세기 · 자리는 ref 로 광원 객체에 직접 쓴다.
 * ★ 집행자 자리는 Executioner 가 bystanders 에 올린 값을 읽는다(그것이 이미 EASE 로 다듬은 실제 자리) — 아직 안 올라왔으면 진입점.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { bystanders } from '@/world/mp/bystanders';

import { central2 } from './central2';
import { CORE_CENTER } from './corefield';
import { execution, type Phase } from './execution';
import { EXEC_ROOM } from './scenario2';

/** 코어 꼭대기 광원 — 본판 락다운 광원과 같은 자리 · 색 · 감쇠. 다른 것은 한 번뿐이라는 규칙이다 */
const CORE_TOP_Y = 7;
const WAKE = { color: '#ff5a4a', distance: 26, decay: 1.6, base: 14, swing: 8, hz: 1.6 } as const;
/** 꼭대기 광원이 닿는 최대치 — coreLightLevel 의 1 */
const WAKE_MAX = WAKE.base + WAKE.swing;
/** 둘째 깨어남(relax · blocked 뒤 다시 걸어올 때)의 배율 — 「이 밝기」는 한 번뿐이니 흐리게 */
const REWAKE = 0.45;
/** 락다운 · 집행 없음 — 문이 닫혔다는 것만 */
const RIM = 3;

/** 따라오는 빛 — 집행자와 나 사이. 집행자 쪽에 붙여서 그것이 나를 향해 오는 것이 바닥에 그려진다 */
const FOLLOW = { y: 2.6, toward: 0.35, distance: 9, decay: 1.8, intensity: 9, color: '#ff7a66' } as const;
/** 세기가 튀지 않게 — 초당 */
const EASE = 3;

/** 집행이 코어를 깨우는 국면 */
const WAKE_PHASES: ReadonlySet<Phase> = new Set<Phase>(['approach', 'unsling', 'aim', 'blocked']);

/**
 * 한 번뿐 — 판의 장부. central2.enter 가 찍는 enteredAt 이 곧 판의 이름이라 따로 reset 이 필요 없다:
 * 다음 판은 enteredAt 이 다르고, 같은 판에서 깨어남이 **끊겼다가**(relax 로 watch 로 · blocked 뒤 watch 로) 다시 오면 흐린 판이다.
 * 모듈 값인 이유 — 컴포넌트가 몇 번 다시 떠도(HMR · key 재마운트) 「이미 썼다」는 답이 하나여야 한다
 */
const book = { run: -1, fired: false, awake: false, rewoke: false };

function pulse(now: number): number {
  return 0.5 + 0.5 * Math.sin((now / 1000) * WAKE.hz);
}

/** 지금 집행이 코어를 깨우는 조건인가 — 어둠 · 콘솔 하강에서는 방이 이미 어둡다, 위에 안 얹는다 */
function wakeOn(now: number): boolean {
  const c = central2.get();
  return WAKE_PHASES.has(execution.get().phase) && c.phase !== 'dark' && !central2.isDimmed(now);
}

/**
 * 코어 꼭대기 광원의 목표 세기 0~1 (WAKE_MAX 기준) — 훅 없음 · 부작용 없음. HUD · 소리가 「코어가 깨어 있나」를 물을 때
 * 같은 답을 준다. 깨어남 1 · 둘째 깨어남 REWAKE · 락다운 테두리 RIM/WAKE_MAX · 그 외 0
 */
export function coreLightLevel(now: number): number {
  const c = central2.get();
  // 어둠 · 콘솔 하강 — 방이 이미 내려가 있다. 테두리조차 안 얹는다 (「아까 왜 껐어」가 서려면 콘솔의 어둠이 온전해야 한다)
  if (c.phase === 'dark' || central2.isDimmed(now)) return 0;
  if (wakeOn(now)) return ((WAKE.base + WAKE.swing * pulse(now)) / WAKE_MAX) * (book.rewoke ? REWAKE : 1);
  return c.phase === 'lockdown' ? RIM / WAKE_MAX : 0;
}

/**
 * 프레임마다 한 번 — 켜지는 순간을 세어 둘째 깨어남을 가리고 그 프레임의 세기를 돌려준다. 부작용은 이 함수에만 있다.
 * 훅이 없어서 컴포넌트 없이도 판 하나를 걸어 볼 수 있다 (조명엔 단위 시험이 없으니 이게 확인 손잡이다)
 */
export function coreLightTick(now: number): number {
  const run = central2.get().enteredAt;
  if (book.run !== run) Object.assign(book, { run, fired: false, awake: false, rewoke: false });
  const on = wakeOn(now);
  if (on && !book.awake) {
    book.rewoke = book.fired;
    book.fired = true;
  }
  book.awake = on;
  return coreLightLevel(now);
}

const _me = new THREE.Vector3();

export function CoreLight() {
  const camera = useThree((s) => s.camera);
  const top = useRef<THREE.PointLight>(null);
  const follow = useRef<THREE.PointLight>(null);
  const spot = EXEC_ROOM.central2;

  useFrame((_, delta) => {
    const t = top.current;
    const f = follow.current;
    if (!t || !f) return;
    const dt = Math.min(delta, 0.1);
    const now = performance.now();
    const k = Math.min(1, dt * EASE);

    const level = coreLightTick(now);
    // 맥동은 그대로 살리고(목표가 프레임마다 흔들린다) 켜지고 꺼지는 순간만 다듬는다
    t.intensity += (level * WAKE_MAX - t.intensity) * k;

    // 따라오는 빛은 집행이 깨어 있을 때만 — 락다운 테두리에는 없다
    const want = book.awake ? FOLLOW.intensity * (book.rewoke ? REWAKE : 1) : 0;
    f.intensity += (want - f.intensity) * k;
    if (f.intensity < 0.05) {
      f.intensity = 0;
      f.visible = false;
      return;
    }
    f.visible = true;

    camera.getWorldPosition(_me);
    const exec = bystanders.at('exec');
    const ex = exec?.x ?? spot?.at.x ?? CORE_CENTER.x;
    const ez = exec?.z ?? spot?.at.z ?? CORE_CENTER.z;
    // 집행자에서 나를 향해 FOLLOW.toward 만큼 — 그것이 걸어오면 빛도 같이 온다
    f.position.set(ex + (_me.x - ex) * FOLLOW.toward, FOLLOW.y, ez + (_me.z - ez) * FOLLOW.toward);
  });

  return (
    <>
      <pointLight
        ref={top}
        position={[CORE_CENTER.x, CORE_TOP_Y, CORE_CENTER.z]}
        color={WAKE.color}
        distance={WAKE.distance}
        decay={WAKE.decay}
        intensity={0}
      />
      <pointLight
        ref={follow}
        visible={false}
        position={[CORE_CENTER.x, FOLLOW.y, CORE_CENTER.z]}
        color={FOLLOW.color}
        distance={FOLLOW.distance}
        decay={FOLLOW.decay}
        intensity={0}
      />
    </>
  );
}
