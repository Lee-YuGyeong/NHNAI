/**
 * 검사문 — **보이는 문틈과 재는 문틈이 같아야 한다.**
 *
 * 이 판은 「문 사이로 지났나」를 기록으로 센다 (lab/quick 의 gateCrossings). 세는 폭은 GATE_HALF
 * 하나로 정해져 있는데, 화면에 서는 문은 뽑아 온 GLB 다. 둘이 어긋나면 **눈으로는 기둥 사이로
 * 지났는데 기록에는 「옆으로 돌았다」가 남는다** — 이 판에서 제일 억울한 자리고, 자리가 정체를
 * 말하게 되는 자리이기도 하다.
 *
 * 그래서 markers 는 GLB 를 「대충 이만하다」로 키우지 않고 파일에서 문틈을 재서(measureGate) 그
 * 폭이 판정 폭이 되게 배율을 잡는다. 여기서 잠그는 것이 그 재는 자다.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GATE_ASPECT, measureGate } from '@/arena3d/map/markers';

/** 판때기 하나 — 가운데·크기로 놓는다 (문을 손으로 지어 재는 자에 물린다) */
function slab(cx: number, cy: number, cz: number, w: number, h: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  m.position.set(cx, cy, cz);
  return m;
}

/**
 * 진짜 파일(public/world/arena/gate_frame.glb)의 치수를 그대로 지어 놓은 문 —
 * 바깥폭 0.999 · 키 0.7075 · 두께 0.312 · 문틈 0.602 · 바닥 문턱판 0.0155.
 * **가로가 z 로 누워 있다** (파일이 그렇다). 재는 자가 그걸 알아봐야 한다.
 */
function gateLikeFile(): THREE.Object3D {
  const W = 0.999;
  const H = 0.7075;
  const D = 0.312;
  const OPEN = 0.602;
  const SILL = 0.0155;
  const post = (W - OPEN) / 2; // 기둥 하나의 폭
  const g = new THREE.Group();
  for (const sgn of [-1, 1]) {
    g.add(slab(0, H / 2, sgn * (OPEN / 2 + post / 2), D, H, post));
  }
  // 상인방 — 위쪽을 가로로 잇는다
  g.add(slab(0, H - 0.08, 0, D, 0.16, W));
  // 문턱판 — 바닥에 깔려 가로를 통째로 막는다. 그냥 세우면 발이 이 안에 잠긴다
  g.add(slab(0, SILL / 2, 0, D, SILL, W));
  return g;
}

describe('measureGate — 문틈을 파일에서 잰다', () => {
  it('기둥 사이의 빈 폭을 문틈으로 읽는다', () => {
    const m = measureGate(gateLikeFile());
    expect(m.wide).toBe('z');
    expect(m.open).toBeCloseTo(0.602, 2);
  });

  it('바닥에 깔린 문턱판의 높이를 따로 집어낸다', () => {
    const m = measureGate(gateLikeFile());
    // 훑는 간격(키의 1/96)만큼의 어긋남은 있다 — 문턱을 넘겨 짚지만 않으면 된다
    expect(m.sill).toBeGreaterThan(0);
    expect(m.sill).toBeLessThanOrEqual(0.0155 + (0.7075 / 24) * 0.25);
  });

  it('가로가 x 로 선 문도 알아본다 — 어느 쪽을 보고 뽑혀 나오든', () => {
    const g = gateLikeFile();
    g.rotation.y = Math.PI / 2;
    expect(measureGate(g).wide).toBe('x');
    expect(measureGate(g).open).toBeCloseTo(0.602, 2);
  });

  it('문턱판이 없는 문은 문턱도 0 이다', () => {
    const g = new THREE.Group();
    for (const sgn of [-1, 1]) g.add(slab(0, 0.35, sgn * 0.4, 0.3, 0.7, 0.2));
    g.add(slab(0, 0.66, 0, 0.3, 0.08, 1));
    expect(measureGate(g).sill).toBe(0);
  });
});

describe('배율 — 문틈이 판정 폭이 된다', () => {
  /** markers 의 GateFrame 이 잡는 배율 그대로 */
  const fit = (scene: THREE.Object3D, half: number) => {
    const m = measureGate(scene);
    const s = (half * 2) / m.open;
    return { open: m.open * s, height: m.size.y * s, sink: m.sill * s };
  };

  it('반너비 1.3m(lab/quick 의 GATE_HALF)이면 문틈이 2.6m 가 된다', () => {
    const f = fit(gateLikeFile(), 1.3);
    expect(f.open).toBeCloseTo(2.6, 6);
  });

  it('문틈이 달라져도 문틈은 늘 판정 폭이다 — 키가 따라 움직인다', () => {
    for (const half of [0.9, 1.3, 2]) {
      const f = fit(gateLikeFile(), half);
      expect(f.open).toBeCloseTo(half * 2, 6);
      // 문에 얹히는 것들(훑는 빛·이름표·대신 서는 뼈대)이 보는 키 — 이 비율이 GATE_ASPECT 다
      expect(f.height / half).toBeCloseTo(GATE_ASPECT, 1);
    }
  });

  it('문턱판은 바닥에 묻힌다 — 발이 잠기지 않게', () => {
    const f = fit(gateLikeFile(), 1.3);
    // 파일의 7cm 짜리 계근판. 이만큼 내려야 판 윗면이 바닥이 된다
    expect(f.sink).toBeGreaterThan(0.05);
    expect(f.sink).toBeLessThan(0.12);
  });
});
