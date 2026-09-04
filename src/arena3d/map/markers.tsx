/**
 * 시행 마커 — 리더가 만든 좌표를 바닥에 그린다.
 *
 * 이 파일만 원본 복사본에 없던 것이다. 나머지는 3D 월드 담당자 작업분을 그대로 옮겨 왔다.
 * 마커는 데이터(JSON 좌표)로만 만들어진다 — 판이 시작되기 전엔 존재하지 않던 배치다.
 *
 * ★ 표식은 **살아 있다** (2026-09-02 사용자: 「미니게임 할 때 매끄럽게」).
 *   여태 바닥 원은 판이 끝날 때까지 같은 파란 원이었다. 1인칭이라 그게 두 가지를 통째로 지웠다 —
 *   ① **어디 있나**: 어두운 홀 바닥에 납작하게 그려진 원은 다섯 걸음만 떨어져도 안 보인다.
 *   ② **밟았나**: 순서 판(ㄱ→ㄴ)에서 ㄱ 을 밟았는지, 지금 원 안인지가 화면 어디에도 없었다.
 *   그래서 원마다 **빛기둥**을 세우고(멀리서도 보인다), 색으로 **상태**를 말한다.
 *   색은 프레임마다 재질을 직접 고친다 — 값으로 넘기면 React 가 판마다 다시 그린다
 *   (아바타 의심도 막대와 같은 약속: WorldScene 의 getSuspicion).
 */

import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { ASSETS } from '../assets/manifest';

export interface MarkerSpec {
  name: string;
  x: number;
  z: number;
  /** 내 지점인가 — 이것만 밝게 */
  mine?: boolean;
  /** 이미 도착했는가 */
  done?: boolean;
  /** 가구 위라면 그 높이 */
  y?: number;
}

/**
 * 표식 하나의 지금 상태. **글자로 주고받는다** — 이 폴더(arena3d)는 판의 규칙(lab/quick)을 모른다.
 * 값을 정하는 쪽은 lab/quick 의 zoneStates 이고, 여기는 그 말을 색으로 옮기기만 한다.
 */
export type ZoneState = 'idle' | 'next' | 'inside' | 'done' | 'danger' | 'burn';

/** 상태마다의 색과 밝기. beam 은 빛기둥, ring 은 테, fill 은 바닥 */
const LOOK: Record<ZoneState, { c: string; ring: number; fill: number; beam: number; pulse: number }> = {
  /** 아직 볼 일 없는 자리 — 있는 줄만 안다 */
  idle: { c: '#5f7086', ring: 0.5, fill: 0.06, beam: 0.05, pulse: 0 },
  /** 지금 가야 할 자리 — 숨을 쉰다 */
  next: { c: '#4a9de0', ring: 0.95, fill: 0.14, beam: 0.15, pulse: 0.25 },
  /** 지금 이 안에 서 있다 */
  inside: { c: '#4fd08a', ring: 1, fill: 0.26, beam: 0.2, pulse: 0 },
  /** 볼일이 끝난 자리 — 밟았다 */
  done: { c: '#3e7f5f', ring: 0.45, fill: 0.08, beam: 0.05, pulse: 0 },
  /** 밟으면 안 되는 자리 */
  danger: { c: '#e0564a', ring: 0.9, fill: 0.22, beam: 0.16, pulse: 0.12 },
  /** 그 자리를 밟았다 — 처형판이면 여기서 끝이다 */
  burn: { c: '#ff3b2f', ring: 1, fill: 0.45, beam: 0.42, pulse: 0.4 },
};

/** 빛기둥 높이(m) — 눈높이(1.6)를 넘겨야 방 건너에서도 보인다. 천장(6m 남짓)은 안 뚫는다 */
const BEAM_H = 4.2;

/**
 * ── 금지 말뚝 ──
 * 원 **가장자리**에 셋을 둘러 세운다 — 둘러막은 것이 곧 「들어오지 마라」다. 한가운데는 안 쓴다:
 * 표식에는 충돌이 없어서 거기 물건을 두면 몸이 그걸 뚫고 선다.
 * 몸이 서는 자리(lab/quick 의 slotIn 은 반지름의 0.55 안쪽)와 겹치지 않는다.
 *
 * ★ **가야 하는 원에는 아무것도 안 세운다** (아래 렌더의 zone.danger). 거기 서 있던 등은 뺐다 —
 *   까닭은 그 자리 머리말에.
 *
 * 키는 **허리께**다 — 원 가장자리에 서는 물건이라 더 키우면 판을 가리고, 멀리서 보이는 몫은
 * 어차피 빛기둥이 맡는다.
 */
const HAZARD_H = 1.15;
/** 원 밖으로 이만큼 물려 세운다(m) — 받침 반지름까지 빼고도 테를 안 밟는 자리 */
const BEACON_OUT = 0.7;

useGLTF.preload(ASSETS.hazard_beacon.url);
useGLTF.preload(ASSETS.gate_frame.url);

/**
 * GLB 등 하나 — 발밑을 y=0 에 맞추고 목표 높이로 키운다 (원본은 가운데가 원점이고 최대 변이 1 언저리다).
 * 재질은 **밖에서 준다**: 표식 색이 곧 상태라, 등도 같이 물들어야 한 몸으로 읽힌다.
 *
 * 이걸로 서는 것은 **금지 말뚝뿐이다** — 가야 하는 원에는 아무것도 안 선다 (아래 렌더).
 */
function Beacon({ url, height, material }: { url: string; height: number; material: THREE.Material }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = height / Math.max(1e-6, size.y);
    c.scale.setScalar(s);
    // x·z 는 가운데로, y 는 발밑이 바닥에 닿게
    c.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    return c;
  }, [scene, height]);
  useEffect(() => {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = material;
    });
  }, [obj, material]);
  return <primitive object={obj} />;
}

/**
 * ── 문을 **파일에서 재 본다** ──
 *
 * 검사문은 지나갔는지를 기록으로 세는 판이라(lab/quick 의 gateCrossings) **보이는 문틈과 재는 문틈이
 * 같아야 한다.** 어긋나면 눈으로는 기둥 사이로 지났는데 기록에는 「옆으로 돌았다」가 남는다 —
 * 이 판에서 제일 억울한 자리다. 그래서 GLB 를 「대충 이만하다」로 키우지 않고, 파일을 열어
 * **기둥 사이의 빈 폭을 직접 재서** 그 폭이 판정 폭(2r)이 되게 배율을 잡는다. 다시 뽑아 비율이
 * 달라져도 문틈은 그대로다.
 *
 * 재는 법: 삼각형을 (높이 구간 · 가로 구간)으로 눌러 놓고, 중간 높이를 지나는 것들을 가로축에
 * 칠한 뒤 **제일 넓게 빈 구간**을 찾는다. 문턱판(sill)은 같은 방법을 바닥께에서 훑어, 가로가
 * 통째로 막힌 데까지의 높이다 — 이 문에는 7cm 짜리 계근판이 깔려 있어서 그냥 세우면 발이 그 안에
 * 잠긴다 (표식에는 충돌이 없다). 그만큼 바닥에 묻으면 판이 바닥과 맞물린다.
 */
export function measureGate(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  // 가로축은 **수평 두 축 중 긴 쪽**이다 — 뽑아 온 문이 어느 쪽을 보고 있든 여기서 맞춘다
  const wide: 'x' | 'z' = size.x >= size.z ? 'x' : 'z';
  const span = Math.max(1e-6, size[wide]);
  /** 삼각형마다 넷씩: 높이 아래·위, 가로 왼쪽·오른쪽 */
  const tri: number[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k += 1) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
      tri.push(
        Math.min(v[0].y, v[1].y, v[2].y),
        Math.max(v[0].y, v[1].y, v[2].y),
        Math.min(v[0][wide], v[1][wide], v[2][wide]),
        Math.max(v[0][wide], v[1][wide], v[2][wide]),
      );
    }
  });
  const CELLS = 256;
  const hit = new Uint8Array(CELLS);
  /** 그 높이에서 가로로 제일 넓게 빈 구간 */
  const gapAt = (y: number) => {
    hit.fill(0);
    for (let t = 0; t < tri.length; t += 4) {
      if (y < tri[t] || y > tri[t + 1]) continue;
      const a = Math.max(0, Math.floor(((tri[t + 2] - box.min[wide]) / span) * CELLS));
      const b = Math.min(CELLS - 1, Math.ceil(((tri[t + 3] - box.min[wide]) / span) * CELLS));
      for (let k = a; k <= b; k += 1) hit[k] = 1;
    }
    let best = 0;
    let run = 0;
    for (let k = 0; k < CELLS; k += 1) {
      if (hit[k]) run = 0;
      else if ((run += 1) > best) best = run;
    }
    return (best / CELLS) * span;
  };
  const open = gapAt(box.min.y + size.y * 0.5);
  // 문턱판 — 바닥에서 4분의 1 높이까지만 본다. 그보다 위가 막혔으면 그건 문턱이 아니라 문이 아니다
  let sill = 0;
  for (let i = 1; i <= 24; i += 1) {
    const f = (i / 24) * 0.25;
    if (gapAt(box.min.y + size.y * f) < open * 0.5) sill = size.y * f;
  }
  return { box, size, wide, open, sill };
}

/**
 * 검사문의 몸 — public/world/arena/gate_frame.glb.
 *
 * 배율은 **문틈을 판정 폭(2·half)에 맞춰** 잡는다 (measureGate). 키는 거기 딸려 온다 —
 * 문틈이 판정과 어긋나는 것이 키가 조금 높은 것보다 훨씬 나쁘다.
 * 재질은 등과 마찬가지로 밖에서 준다: 문도 표식이라 상태 색으로 같이 물들어야 한다.
 */
function GateFrame({ url, half, material }: { url: string; half: number; material: THREE.Material }) {
  const { scene } = useGLTF(url);
  const { obj, yaw } = useMemo(() => {
    const c = scene.clone(true);
    const { box, wide, open, sill } = measureGate(c);
    const s = (half * 2) / Math.max(1e-6, open);
    c.scale.setScalar(s);
    // 가로·앞뒤는 문 자리에 맞추고, 높이는 **문턱판 윗면이 바닥이 되게** 내린다
    c.position.set(
      -((box.min.x + box.max.x) / 2) * s,
      -(box.min.y + sill) * s,
      -((box.min.z + box.max.z) / 2) * s,
    );
    // 문의 가로가 로컬 +x 가 되게 — 파일이 z 로 누워 있으면 90° 돌린다
    return { obj: c, yaw: wide === 'z' ? Math.PI / 2 : 0 };
  }, [scene, half]);
  useEffect(() => {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = material;
    });
  }, [obj, material]);
  return (
    <group rotation-y={yaw}>
      <primitive object={obj} />
    </group>
  );
}

/**
 * GLB 가 아직 안 왔을 때 대신 서는 뼈대 — 원기둥 둘과 상인방 하나.
 * **문은 늦게 와도 판은 이미 돌고 있다.** 지나가야 할 것이 안 보이는 채로 시행이 시작되면
 * 그 몇 초는 아무도 지시를 따를 수가 없다. 그래서 빈자리로 두지 않고 뼈대를 세운다.
 */
function GateBones({ half, height, material }: { half: number; height: number; material: THREE.Material }) {
  return (
    <>
      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[sgn * half, height / 2, 0]} material={material}>
          <cylinderGeometry args={[0.1, 0.13, height, 10]} />
        </mesh>
      ))}
      <mesh position={[0, height + GATE_BAR / 2 - 0.02, 0]} material={material}>
        <boxGeometry args={[half * 2 + 0.36, GATE_BAR, 0.3]} />
      </mesh>
    </>
  );
}

export interface ZoneSpec {
  label: string;
  x: number;
  z: number;
  r: number;
  danger?: boolean;
  /**
   * 원이 아니라 **검사문**이다 (lab/free 의 Prop.gate). 이 칸이 있으면 `r` 은 반지름이 아니라
   * 기둥 사이의 반너비이고, nx·nz 는 문이 바라보는 쪽이다 — 바닥 원도 빛기둥도 안 그린다.
   */
  gate?: { nx: number; nz: number };
  /**
   * 원도 문도 아니라 **홀을 가로질러 지나가는 빛의 벽**이다 (lab/free 의 Prop.sweep). 이 칸이 있으면
   * `x·z` 는 벽이 출발하는 원점, `r` 은 반두께, nx·nz 는 나아가는 쪽, len 은 벽의 길이다.
   * **지금 어디까지 왔는지는 밖에서 준다** (Zones 의 getOffset) — 자리를 정하는 것은 판의 규칙이고
   * (lab/quick 의 sweepAt), 이 폴더는 그 규칙을 모른다. 보이는 벽과 판정하는 벽이 갈리면 안 되므로
   * 자를 두 벌 두지 않는다.
   */
  sweep?: { nx: number; nz: number; len: number };
}

/**
 * ── 빛의 벽의 키(m) ──
 * 천장(6m 남짓)에 닿지 않으면서 눈높이(1.6)를 한참 넘긴다 — **벽이라야 한다.**
 * 낮으면 바닥에 그은 띠로 보이고, 띠는 1인칭에서 두 걸음만 떨어져도 몸에 가려 안 보인다.
 */
const SWEEP_H = 5;

/* ── 검사문 치수 ── **lab/quick 의 GATE_HALF 와 같은 문이다**: 저쪽이 판정을 하고 여기가 그 문을 세운다 */
/**
 * 문의 키 ÷ 문틈 반너비 — **GLB 에서 잰 값이다** (파일의 키 0.7075 : 문틈 0.602 → 키 = 반너비 × 2.35).
 * 배율은 문틈에 맞춰 잡으므로(GateFrame) 키는 따라 정해진다. 반너비 1.3m 이면 3.05m 다.
 * 이 수를 쓰는 것은 문 자체가 아니라 **문에 얹히는 것들**이다 — 훑는 빛이 오르내리는 폭, 이름표 높이,
 * GLB 가 아직 안 왔을 때 대신 서는 뼈대. 문을 다시 뽑으면 여기도 다시 잰다.
 */
export const GATE_ASPECT = 2.35;
/** 뼈대의 상인방 두께(m) */
const GATE_BAR = 0.22;

/**
 * zone 원자가 쓰는 구역 — 바닥에 큰 원 · 그 위로 서는 빛기둥 · 보기 문구.
 * `getState` 를 주면 프레임마다 물어보고 색만 바꾼다 (안 주면 파란 원 그대로다).
 */
export function Zones({
  zones,
  getState,
  getOffset,
}: {
  zones: ZoneSpec[];
  getState?: (i: number) => ZoneState;
  /** 빛의 벽이 지금 원점에서 얼마나 나갔나(m) — 프레임마다 물어본다 (판이 답한다: lab/quick 의 sweepAt) */
  getOffset?: (i: number) => number;
}) {
  return (
    <>
      {zones.map((z, i) => (
        <Zone
          key={`${z.label}-${i}`}
          zone={z}
          state={getState ? () => getState(i) : undefined}
          offset={getOffset ? () => getOffset(i) : undefined}
        />
      ))}
    </>
  );
}

function Zone({ zone, state, offset }: { zone: ZoneSpec; state?: () => ZoneState; offset?: () => number }) {
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const label = useRef<HTMLDivElement>(null);
  /** 검사문의 훑는 빛 — 이것만 프레임마다 자리가 바뀐다 (색은 아래 한 곳에서 같이 간다) */
  const sweep = useRef<THREE.Mesh>(null);
  /** 지나가는 빛의 벽 — 나아가는 쪽(로컬 +z)으로 프레임마다 옮긴다 */
  const wall = useRef<THREE.Group>(null);
  /** 지난 프레임의 상태 — 색은 바뀔 때만 새로 쓴다 (Color.set 은 문자열을 파싱한다) */
  const was = useRef<ZoneState | null>(null);

  // 빛의 벽은 처음부터 붉다 — 밟으면 안 되는 자리와 같은 결이다 (금지 원과 같은 base)
  const base: ZoneState = zone.danger || zone.sweep ? 'danger' : 'next';
  /** 문의 키(m) — 문틈(2r)이 정한다. 문에 얹히는 것들이 이 수를 본다 (GATE_ASPECT) */
  const gateH = zone.r * GATE_ASPECT;

  /**
   * 등의 몸통 — 어두운 쇠에 상태 색으로 불이 든다. 이 표식의 등 전부가 이 하나를 나눠 쓴다.
   *
   * ★ metalness 가 낮은 것은 **이 방에 환경맵이 없기 때문이다.** 금속은 비추는 것을 되비춰
   *   형태를 보이는데, 비출 것이 없으면(env 가 null) 되비출 것도 없어서 — 확산광은 metalness
   *   만큼 깎이므로 — 물건이 통째로 검은 덩어리로 선다. 이 방의 빛은 창고 등 몇 개가 전부다
   *   (map/warehouse 의 Lights). 쇠처럼 보이는 몫은 roughness 가 맡는다.
   */
  const lamp = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3a4757',
        roughness: 0.5,
        metalness: 0.2,
        emissive: new THREE.Color(LOOK[base].c),
        // 낮게 문다 — 세게 물리면 형태가 통째로 지워지고 색칠한 덩어리가 된다. 이건 **쇠에 불이 든 것**이다
        emissiveIntensity: 0.35,
      }),
    [base],
  );
  /** 빛 띠 — 등에서 스스로 켜진 유일한 곳. 바닥 원·빛기둥과 같은 색을 같은 방식(MeshBasic)으로 낸다 */
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(LOOK[base].c) }), [base]);
  useEffect(() => () => {
    lamp.dispose();
    glow.dispose();
  }, [lamp, glow]);

  /** 말뚝을 세울 자리 — 원 가장자리 바깥에 셋이 둘러선다. **금지 원에만 선다** (아래 렌더) */
  const posts = useMemo(() => {
    const R = zone.r + BEACON_OUT;
    return Array.from({ length: 3 }, (_, i) => {
      const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
      return [Math.cos(a) * R, Math.sin(a) * R] as const;
    });
  }, [zone.r]);

  useFrame(({ clock }) => {
    const now = state ? state() : base;
    const look = LOOK[now];
    if (was.current !== now) {
      was.current = now;
      ring.current?.color.set(look.c);
      fill.current?.color.set(look.c);
      beam.current?.color.set(look.c);
      lamp.emissive.set(look.c);
      glow.color.set(look.c);
      if (label.current) label.current.style.color = look.c;
    }
    // 숨 — 지금 가야 할 자리와 밟아 버린 금지 원만 뛴다. 나머지는 가만히 있는다
    const k = look.pulse ? 1 + look.pulse * Math.sin(clock.elapsedTime * 4.2) : 1;
    // 빛의 벽 — 자리는 판이 정한다 (offset). 여기서는 옮겨 놓기만 한다
    if (wall.current && offset) wall.current.position.z = offset();
    // 문을 훑는 빛 — 지나기 전에는 오르내리고, 지나고 나면(done) 문턱께에 내려앉아 멎는다
    if (sweep.current) {
      const swing = now === 'done' ? 0 : (Math.sin(clock.elapsedTime * 1.5) * 0.5 + 0.5);
      sweep.current.position.y = 0.25 + swing * (gateH - 0.8);
    }
    if (ring.current) ring.current.opacity = Math.min(1, look.ring * k);
    if (fill.current) fill.current.opacity = look.fill * k;
    if (beam.current) beam.current.opacity = look.beam * k;
    lamp.emissiveIntensity = 0.35 * k;
  });

  const look = LOOK[base];

  /*
   * ── 빛의 벽 ── 홀을 가로질러 지나가는 **빛의 벽** 하나.
   *
   * 이 판의 신호는 화면 위 글자가 아니라 **방 안을 걸어오는 물건**이다 (lab/quick 의 sweep 판).
   * 그래서 셋을 같이 세운다 — 멀리서 오는 것을 알리는 **벽**, 발밑이 그 안인지 말해 주는
   * **바닥 띠**, 그리고 판정의 폭을 그대로 그은 **앞뒤 선 두 줄**. 판정은 이 띠의 폭(zone.r 이
   * 반두께다)으로 하므로, 선 안에 발이 있으면 덮인 것이고 밖이면 아니다 — 눈대중이 안 끼게
   * 보이는 것과 재는 것을 같은 수로 맞춘다.
   *
   * 자리는 매 프레임 밖에서 온다 (offset) — 판이 정하는 자리를 그대로 옮겨 놓는다.
   * 몸은 이 벽을 그냥 지나간다: 표식에는 충돌이 없다. 막는 물건이 아니라 **재는 빛**이다.
   */
  if (zone.sweep) {
    // 나아가는 쪽이 로컬 +z 가 되게 돌린다 (검사문과 같은 약속) — 벽은 로컬 x 로 길다
    const yaw = Math.atan2(zone.sweep.nx, zone.sweep.nz);
    const len = zone.sweep.len;
    return (
      <group position={[zone.x, 0, zone.z]} rotation-y={yaw}>
        <group ref={wall}>
          {/* 빛의 벽 — 양면이라 지나간 뒤에도 보이고, 더해지는 빛이라 어두운 홀에서 멀리서도 선다 */}
          <mesh position={[0, SWEEP_H / 2, 0]} renderOrder={9}>
            <planeGeometry args={[len, SWEEP_H]} />
            <meshBasicMaterial
              ref={beam}
              color={look.c}
              transparent
              opacity={look.beam}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* 바닥 띠 — 벽은 눈높이에 있어서 **발밑이 안 보인다**. 덮였는지는 이걸로 본다 */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} renderOrder={8}>
            <planeGeometry args={[len, zone.r * 2]} />
            <meshBasicMaterial ref={fill} color={look.c} transparent opacity={look.fill} depthWrite={false} />
          </mesh>
          {/* 앞뒤 선 — 판정의 폭 그대로다. 넘어오는 선이 보여야 「언제 멈춰야 하나」가 눈에 든다 */}
          {[-1, 1].map((sgn) => (
            <mesh key={sgn} rotation-x={-Math.PI / 2} position={[0, 0.05, sgn * zone.r]} material={glow}>
              <planeGeometry args={[len, 0.16]} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }

  /*
   * ── 검사문 ── 갠트리 문 하나 · 문턱 선 · 그 사이를 오르내리는 빛.
   *
   * 이 방은 검문소인데 판이 서면 바닥에 원만 그려졌다 — **지나가야 하는 것**이 하나도 없었다.
   * 문은 **뽑아 온 물건이다** (2026-09-03): public/world/arena/gate_frame.glb. 처음엔 원기둥 둘과
   * 판때기 하나로 지어 세웠는데, 그건 문이라기보다 문 자리를 가리키는 표시였다 — 검문소에서
   * 지나가야 하는 물건이라면 코앞에서 실루엣이 읽혀야 한다. 지금 그 뼈대는 GLB 가 늦게 올 때만 선다.
   *
   * 문은 **가구가 아니다** — 몸이 기둥을 뚫고 지나갈 수 있다(표식에는 충돌이 없다). 지나갔는지는
   * 기록으로 센다 (lab/quick 의 gateCrossings). 그래서 문턱에 선을 하나 긋는다: 넘어야 하는
   * 자리가 눈에 보여야 「옆으로 돌았다」가 억울하지 않다.
   * 세로로 세운 문이라 바닥 원·빛기둥·등은 여기서 안 그린다.
   */
  if (zone.gate) {
    // 문의 가로가 로컬 +x, 바라보는 쪽이 로컬 +z 가 되게 돌린다
    const yaw = Math.atan2(zone.gate.nx, zone.gate.nz);
    return (
      <group position={[zone.x, 0, zone.z]} rotation-y={yaw}>
        <Suspense fallback={<GateBones half={zone.r} height={gateH} material={lamp} />}>
          <GateFrame url={ASSETS.gate_frame.url} half={zone.r} material={lamp} />
        </Suspense>
        {/* 문턱 — 넘어야 하는 선. 바닥에 붙여 눕힌다 (문턱판은 GateFrame 이 바닥에 묻었다) */}
        <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} material={glow}>
          <planeGeometry args={[zone.r * 2, 0.14]} />
        </mesh>
        {/* 훑는 빛 — 문이 살아서 검사하고 있다는 표시. 위아래로 천천히 오간다 (useFrame 의 sweep) */}
        <mesh ref={sweep} position={[0, 1, 0]} rotation-x={-Math.PI / 2} renderOrder={9}>
          <planeGeometry args={[zone.r * 2 - 0.06, 0.42]} />
          <meshBasicMaterial
            ref={beam}
            color={look.c}
            transparent
            opacity={look.beam}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <Html position={[0, gateH + 0.55, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
          <div
            ref={label}
            style={{
              pointerEvents: 'none',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 26,
              fontWeight: 700,
              color: look.c,
              whiteSpace: 'nowrap',
              textShadow: '0 2px 6px #000, 0 0 2px #000',
            }}
          >
            {zone.label}
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group position={[zone.x, 0.02, zone.z]}>
      {/*
        ── 물건은 **금지 원에만 세운다** ── (2026-09-03 사용자: "표식원 안으로 집합 게임때
        이상한 GLB 있어 빼줘")

        가야 하는 원 옆에는 아무것도 안 둔다. 여기 한동안 등이 하나 서 있었는데(GLB → 손으로
        지은 기둥), 둘 다 같은 소리를 들었다 — **원 옆에 정체 모를 물건이 하나 생긴다.**
        생각해 보면 그 등이 할 일이 애초에 없었다: 「어디로 가나」는 빛기둥이 방 건너에서도
        말해 주고(BEAM_H 4.2m), 「지금 안인가」는 원 색이 말한다 (LOOK 의 inside).
        등은 그 위에 얹힌 세 번째 설명이라, 빼면 판이 더 잘 읽힌다.

        금지 원은 반대다. 거기 선 말뚝 셋은 설명이 아니라 **막아선 것**이고, 둘러막은 모양
        자체가 「들어오지 마라」다. 그래서 그쪽만 남는다.

        GLB 는 늦게 와도 판은 이미 돌고 있어야 한다 — 못 받으면 원과 빛기둥만 선다.
      */}
      {zone.danger && (
        <Suspense fallback={null}>
          {posts.map(([px, pz], i) => (
            <group key={i} position={[px, -0.02, pz]}>
              <Beacon url={ASSETS.hazard_beacon.url} height={HAZARD_H} material={lamp} />
            </group>
          ))}
        </Suspense>
      )}
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[zone.r - 0.12, zone.r, 64]} />
        <meshBasicMaterial ref={ring} color={look.c} transparent opacity={look.ring} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[zone.r, 64]} />
        <meshBasicMaterial ref={fill} color={look.c} transparent opacity={look.fill} depthWrite={false} />
      </mesh>
      {/*
        빛기둥 — 이 판에서 **원을 찾는 일**을 없앤다. 옆이 뚫린 원기둥이라 안에 들어가도 시야를
        막지 않고(양면), 빛을 더하는 식이라(AdditiveBlending) 어두운 홀에서 멀리서도 선다.
        깊이를 안 쓰므로 몸이 이 안에 서도 아바타가 잘리지 않는다.
      */}
      <mesh position={[0, BEAM_H / 2, 0]} renderOrder={9}>
        <cylinderGeometry args={[zone.r * 0.82, zone.r * 0.94, BEAM_H, 28, 1, true]} />
        <meshBasicMaterial
          ref={beam}
          color={look.c}
          transparent
          opacity={look.beam}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <Html position={[0, 1.6, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div
          ref={label}
          style={{
            pointerEvents: 'none',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 26,
            fontWeight: 700,
            color: look.c,
            whiteSpace: 'nowrap',
            textShadow: '0 2px 6px #000, 0 0 2px #000',
          }}
        >
          {zone.label}
        </div>
      </Html>
    </group>
  );
}

export function Markers({ points, radius }: { points: MarkerSpec[]; radius: number }) {
  return (
    <>
      {points.map((p) => {
        const color = p.done ? '#4fa06a' : p.mine ? '#4a9de0' : '#5a6472';
        return (
          <group key={p.name} position={[p.x, 0.02, p.z]}>
            {/* 바닥 원 */}
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[radius - 0.08, radius, 48]} />
              <meshBasicMaterial color={color} transparent opacity={p.mine ? 0.95 : 0.5} depthWrite={false} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[radius, 48]} />
              <meshBasicMaterial color={color} transparent opacity={p.mine ? 0.18 : 0.07} depthWrite={false} />
            </mesh>
            {/* 기둥 — 멀리서도 보이게 */}
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
              <meshBasicMaterial color={color} transparent opacity={p.mine ? 0.8 : 0.3} depthWrite={false} />
            </mesh>
            {/* 라벨은 drei Text(troika) 가 아니라 Html 로 그린다 —
                Text 는 폰트를 네트워크에서 받아 오고, 못 받으면 글자가 조용히 사라진다.
                원본 3D 도 말풍선·이름표에 Html 을 쓴다. 같은 방식을 따른다. */}
            <Html position={[0, 2.45, 0]} center distanceFactor={10} zIndexRange={[10, 0]}>
              <div
                style={{
                  pointerEvents: 'none',
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 30,
                  fontWeight: 700,
                  color,
                  textShadow: '0 2px 6px #000, 0 0 2px #000',
                  opacity: p.mine ? 1 : 0.75,
                }}
              >
                {p.name}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
