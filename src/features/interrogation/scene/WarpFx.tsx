/**
 * 순간이동 빛기둥 — warp.ts 가 건 것을 그린다. 회수(out)는 떨어진 자리에서 위로 솟고, 도착(in)은 발판 위로
 * 내려꽂힌다. 바닥에는 둘 다 고리가 퍼진다.
 *
 * 색은 발판의 색이다 (PlatformCourse 의 RIM_MAT 청록) — 이 연출을 하는 것은 이 홀의 기계지 다른 무엇이 아니다.
 * 광원은 안 쓴다: 발광 재질뿐이다 (warp.ts 머리말 — 광원 수가 바뀌면 셰이더가 다 다시 링크된다).
 *
 * 자리는 **여섯 벌을 미리 세워 두고** 프레임마다 켜고 끈다. 사람 하나 + AI 좌석 넷이 한꺼번에 떨어져도 모자라지
 * 않고, React 가 판을 다시 그리는 일도 없다 — 켜고 끄는 것은 useFrame 안에서 visible 로만 한다.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WARP_IN_MS, WARP_OUT_MS, warp } from './warp';

const SLOTS = 6;
/** 기둥 높이(m) — 홀 천장보다 낮게, 사람 키의 한 배 반쯤 */
const COL_H = 2.8;
const COL_R = 0.42;
/**
 * 기둥은 **옅어야 한다.** 추격 카메라가 몸 1.9m 뒤에 붙어 있어서(chase.ts CHASE_DIST) 몸을 감싼 기둥이
 * 화면의 한복판을 그대로 덮는다 — 진하게 두면 정작 보여 주려는 것(몸이 가늘어져 빨려 올라가는 것)이 안 보이고
 * 흰 벽만 남는다. 겉면은 속심보다 더 옅게 둔다
 */
const SHELL_A = 0.26;
const CORE_A = 0.62;
const TINT = '#8fe6ff';

/** 원기둥은 한 벌만 만들어 여섯이 나눠 쓴다 — 배율로 높이를 준다 (높이 1 로 세워 둔다) */
const COL_GEO = new THREE.CylinderGeometry(COL_R, COL_R, 1, 18, 1, true);
const CORE_GEO = new THREE.CylinderGeometry(0.075, 0.075, 1, 8, 1, true);
/** 바닥 고리 — 반지름 1 로 만들어 배율로 넓힌다 */
const RING_GEO = new THREE.RingGeometry(0.86, 1, 30);

function newMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(TINT),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** 그 시각의 기둥·고리 모양. k 는 0(시작)~1(끝) */
function shapeOf(kind: 'out' | 'in', k: number) {
  if (kind === 'out') {
    // 솟아오르며 가늘어진다 — 몸이 위로 빨려 나가는 쪽
    const rise = Math.min(1, k * 3);
    return {
      colH: COL_H * (1 - Math.pow(1 - rise, 2)),
      colFromTop: false,
      colR: 1 - 0.55 * k,
      colA: 0.85 * Math.min(1, k * 6) * Math.pow(1 - k, 0.7),
      ringR: 0.45 + 1.5 * (1 - Math.pow(1 - Math.min(1, k * 1.8), 2)),
      ringA: 0.9 * Math.pow(Math.max(0, 1 - k * 1.8), 1.5),
    };
  }
  // 도착 — 위에서 내려꽂히고 바닥에 고리가 퍼진다
  const drop = Math.min(1, k * 2.4);
  return {
    colH: COL_H * (1 - 0.82 * (1 - Math.pow(1 - drop, 2))),
    colFromTop: true,
    colR: 0.55 + 0.45 * k,
    colA: 0.9 * Math.min(1, k * 8) * Math.pow(1 - k, 0.9),
    ringR: 0.35 + 1.35 * (1 - Math.pow(1 - k, 2)),
    ringA: 0.95 * Math.pow(1 - k, 1.2),
  };
}

export function WarpFx() {
  const slots = useRef<(THREE.Group | null)[]>([]);
  const cols = useRef<(THREE.Mesh | null)[]>([]);
  const cores = useRef<(THREE.Mesh | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  // 재질은 자리마다 따로다 — 투명도가 저마다 다르게 잦아든다
  const mats = useMemo(() => Array.from({ length: SLOTS }, () => ({ col: newMat(), core: newMat(), ring: newMat() })), []);

  useFrame(() => {
    const now = Date.now();
    const beams = warp.beams(now);
    for (let i = 0; i < SLOTS; i += 1) {
      const g = slots.current[i];
      if (!g) continue;
      const b = beams[i];
      if (!b) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(b.x, b.y, b.z);
      const k = Math.min(1, Math.max(0, (now - b.at) / (b.kind === 'out' ? WARP_OUT_MS : WARP_IN_MS)));
      const s = shapeOf(b.kind, k);
      const col = cols.current[i];
      const core = cores.current[i];
      const ring = rings.current[i];
      if (col) {
        col.scale.set(s.colR, Math.max(0.001, s.colH), s.colR);
        // 회수는 발밑에서 자라고, 도착은 천장 쪽에서 내려온다 — 기준을 반대로 잡는다
        col.position.y = s.colFromTop ? COL_H - s.colH / 2 : s.colH / 2;
      }
      if (core) {
        core.scale.set(1, Math.max(0.001, s.colH), 1);
        core.position.y = col ? col.position.y : s.colH / 2;
      }
      if (ring) ring.scale.set(s.ringR, s.ringR, 1);
      mats[i].col.opacity = s.colA * SHELL_A;
      mats[i].core.opacity = s.colA * CORE_A;
      mats[i].ring.opacity = s.ringA;
    }
  });

  return (
    <group name="순간이동">
      {mats.map((m, i) => (
        <group
          key={i}
          visible={false}
          ref={(g) => {
            slots.current[i] = g;
          }}
        >
          <mesh
            geometry={COL_GEO}
            material={m.col}
            ref={(o) => {
              cols.current[i] = o;
            }}
          />
          <mesh
            geometry={CORE_GEO}
            material={m.core}
            ref={(o) => {
              cores.current[i] = o;
            }}
          />
          {/* 고리는 바닥에 눕는다 — 발판 위면 발판 윗면, 홀 바닥이면 바닥 (기둥의 y 가 그 높이다) */}
          <mesh
            geometry={RING_GEO}
            material={m.ring}
            rotation-x={-Math.PI / 2}
            position={[0, 0.03, 0]}
            ref={(o) => {
              rings.current[i] = o;
            }}
          />
        </group>
      ))}
    </group>
  );
}
