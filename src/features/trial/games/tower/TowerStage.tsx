/**
 * 무너지는 타워 — 홀 가운데 마당에 선 탑. 격자 기둥(Pylon — 코드 기하)이 가운데를 받치고, 그 위에 발판 25장이 **떠 있다** —
 * 발판마다 밑에 청록 부양광이 있어 기둥 없이도 붙어 있는 것으로 읽힌다(이 홀의 움직이는 발판과 같은 어법). 처음엔 발판마다 H 기둥을
 * 세웠는데 스물다섯 개의 흰 기둥 숲이 화면을 어지럽혔다 (2026-09-05 사용자: "디자인도 이상하고").
 * 윗면 텍스처(힉스필드, slab_top.webp)는 UV 를 당겨 가운데(강판 + 청록 십자)만 쓴다. 경고가 뜬 발판은 갈라진 텍스처(slab_warn.webp)로 바뀌어
 * 천천히 처지며 붉게 숨 쉬고, 떨어지는 발판은 **낮은 쪽 가장자리로 기우뚱 넘어가다 떨어진다**(hinge → 자유 낙하).
 * 고리마다 높이가 계단으로 다르고(ringBaseY), 닳은 발판은 가라앉으며 붉게 물든다(wear — 인스턴스 색), 진동 1초 전부터 전 발판이 떨린다(quakeAmp).
 * 기둥은 처음 Tripo Studio 로 뽑았는데(tower_pylon) 베이크 텍스처가 줄이며 번져 크롬처럼 얼룩지고 밑판이 접시처럼 튀어나와 「탁자」로 읽혔다
 * (2026-09-05 사용자: "이거 디자인 좀 이상한데"). 그래서 네 모서리 빔 · 가로 띠 · X 가새를 무광 강재로 코드에서 짠다.
 *
 * ★ 드로우콜 (2026-09-05 최적화, 사용자: "타워 최적화"): 발판 25장 × 메시 셋 + 장마다 재질 + 기둥 빔 50여 개가 각각 드로우콜이라 130개쯤이었다.
 *   이제 발판은 **인스턴스 메시 넷**(성한 윗면 · 경고 윗면 · 몸통 · 부양광)이고 기둥은 **인스턴스 메시 하나**(단위 상자 × 빔 수) — 다섯이다.
 *   장마다 다른 것(자리 · 기울기 · 마모 색)은 인스턴스 행렬과 인스턴스 색으로 프레임마다 쓴다. 안 보이는 장은 크기 0.
 * 마찰계수는 여기 없다 — 발판은 어느 구간에도 같아 보인다(P8).
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { WarpFx } from '@/features/interrogation/scene/WarpFx';
import { GRAVITY } from '@/world/mp/constants';
import { TOWER_CENTER, TOWER_FALL_KEEP_MS, TOWER_GAP, TOWER_N, TOWER_SLAB, TOWER_SLAB_H, TOWER_TOP, TOWER_WEAR_SINK, ringBaseY, slabCenter } from '@/world/mp/tower';
import { towerState } from './towerState';

const TOP_URL = '/textures/tower/slab_top.webp';
const WARN_URL = '/textures/tower/slab_warn.webp';
const COUNT = TOWER_N * TOWER_N;
const SIDE_MAT = new THREE.MeshStandardMaterial({ color: '#4a525c', metalness: 0.7, roughness: 0.4 });
/** 부양광 — 밑에서만 보이고(BackSide 는 아래를 향한 면), 옅게. 0.35 양면이었더니 밑에서 청록 판이 하늘을 덮었다 */
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#5ff0ff', transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false });
const PIT_MAT = new THREE.MeshStandardMaterial({ color: '#0b0f14', metalness: 0.4, roughness: 0.9 });
const BEAM_MAT = new THREE.MeshStandardMaterial({ color: '#2a2f37', metalness: 0.75, roughness: 0.45 });
/** 기우뚱 — 낮은 쪽 가장자리를 축으로 넘어가는 시간(s)과 그때 도는 각(rad). 그 뒤는 자유 낙하 + 회전 */
const TIP_S = 0.45;
const TIP_RAD = 1.1;

/** 프레임마다 재사용하는 임시값 — 할당을 안 만든다 */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _o = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qTop = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
/** 윗면 평면은 XY 에 놓여 있다 — 발판 위에 눕히는 회전 */
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function zoom(t: THREE.Texture): THREE.Texture {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // 황흑 띠는 아예 자른다 — 가운데(강판 + 청록 십자)만 쓴다 (2026-09-05 사용자: "노란색 줄무늬 없애줘")
  t.repeat.set(0.7, 0.7);
  t.offset.set(0.15, 0.15);
  return t;
}

/** 발판 위 (x, y, z) 에서 로컬 오프셋 off 만큼(기울기 회전 q 를 따라) 옮긴 자리를 _p 에 */
function placed(x: number, y: number, z: number, q: THREE.Quaternion, offY: number): THREE.Vector3 {
  _o.set(0, offY, 0).applyQuaternion(q);
  return _p.set(x + _o.x, y + _o.y, z + _o.z);
}

function Slabs() {
  const topTex = useTexture(TOP_URL);
  const warnTex = useTexture(WARN_URL);
  const mats = useMemo(
    () => ({
      top: new THREE.MeshStandardMaterial({ map: zoom(topTex), metalness: 0.55, roughness: 0.5 }),
      warn: new THREE.MeshStandardMaterial({ map: zoom(warnTex), metalness: 0.55, roughness: 0.5, emissive: new THREE.Color('#ff3a1a'), emissiveIntensity: 0 }),
    }),
    [topTex, warnTex],
  );
  const size = TOWER_SLAB - TOWER_GAP;
  const half = TOWER_SLAB / 2;
  const tops = useRef<THREE.InstancedMesh>(null);
  const warns = useRef<THREE.InstancedMesh>(null);
  const sides = useRef<THREE.InstancedMesh>(null);
  const glows = useRef<THREE.InstancedMesh>(null);

  // 처음엔 전부 흰색(무늬 그대로) — instanceColor 버퍼를 만들어 둔다
  useLayoutEffect(() => {
    const t = tops.current;
    if (!t) return;
    for (let i = 0; i < COUNT; i += 1) t.setColorAt(i, _c.setRGB(1, 1, 1));
    if (t.instanceColor) t.instanceColor.needsUpdate = true;
  }, []);

  useFrame(() => {
    const t = tops.current;
    const w = warns.current;
    const sd = sides.current;
    const gl = glows.current;
    if (!t || !w || !sd || !gl) return;
    const now = Date.now();
    const quake = towerState.quakeAmp(now);
    let anyWarn = false;

    for (let idx = 0; idx < COUNT; idx += 1) {
      const s = towerState.slabAt(idx, now);
      if (s.state >= 3) {
        hide(idx, t, w, sd, gl);
        continue;
      }
      const c = slabCenter(idx);
      // 기울기 t(낮은 쪽, tan) → 회전: x 축 둘레 atan(tz), z 축 둘레 −atan(tx) (mp/tower.ts slabSurfaceY 와 같은 부호)
      const base = ringBaseY(idx);
      let x = c.x;
      let y = base - s.wear * TOWER_WEAR_SINK;
      let z = c.z;
      if (quake > 0) {
        y += Math.sin(now * 0.06 + idx) * 0.02 * quake;
        x += Math.sin(now * 0.05 + idx * 1.3) * 0.012 * quake;
        z += Math.cos(now * 0.053 + idx * 0.7) * 0.012 * quake;
      }
      let rx = Math.atan(s.tz);
      let rz = -Math.atan(s.tx);
      let glow = true;
      let warn = false;
      if (s.state === 2) {
        const tau = Math.max(0, now - s.atLocal) / 1000;
        y = base;
        glow = false;
        // 넘어가는 방향 — 기울어 있던 낮은 쪽. 수평이었으면 탑 바깥쪽
        const tl = Math.hypot(s.tx, s.tz);
        const ox = c.x - TOWER_CENTER.x;
        const oz = c.z - TOWER_CENTER.z;
        const ol = Math.hypot(ox, oz) || 1;
        const dx = tl > 0.02 ? s.tx / tl : ox / ol;
        const dz = tl > 0.02 ? s.tz / tl : oz / ol;
        const tip = Math.min(1, tau / TIP_S);
        const theta = TIP_RAD * tip * tip;
        // 가장자리 힌지: 중심은 half·sinθ 내려가고 half·(1−cosθ) 만큼 낮은 쪽으로 옮겨 간다
        x += dx * half * (1 - Math.cos(theta));
        z += dz * half * (1 - Math.cos(theta));
        y -= half * Math.sin(theta);
        let spin = theta;
        if (tau > TIP_S) {
          const t2 = tau - TIP_S;
          const vy = (half * Math.cos(TIP_RAD) * 2 * TIP_RAD) / TIP_S; // 힌지 끝의 내려가는 속도를 이어 간다
          y -= vy * t2 + 0.5 * GRAVITY * t2 * t2;
          x += dx * 1.2 * t2;
          z += dz * 1.2 * t2;
          spin += 2.2 * t2;
        }
        rx += spin * dz;
        rz -= spin * dx;
        if (!(now - s.atLocal < TOWER_FALL_KEEP_MS && y > -4)) {
          hide(idx, t, w, sd, gl);
          continue;
        }
      } else if (s.state === 1) {
        // 경고 — 천천히 처지며(축이 삭는다) 붉게 숨 쉬고, 갈수록 떤다
        const age = Math.max(0, now - s.atLocal) / 1000;
        const shake = Math.min(1, age / 1.6) * 0.02;
        y -= Math.min(0.12, age * 0.07);
        rx += Math.sin(now * 0.021) * shake;
        rz += Math.cos(now * 0.019) * shake;
        warn = true;
        anyWarn = true;
      }

      _q.setFromEuler(_e.set(rx, 0, rz));
      _qTop.copy(_q).multiply(FLAT);
      // 몸통 — 윗면 밑에 두께만큼
      _s.set(size, TOWER_SLAB_H, size);
      sd.setMatrixAt(idx, _m.compose(placed(x, y, z, _q, -TOWER_SLAB_H / 2), _q, _s));
      // 윗면 — 성한 것과 경고 중 하나만. 다른 쪽은 크기 0
      _s.set(size, size, 1);
      _m.compose(placed(x, y, z, _q, 0.002), _qTop, _s);
      if (warn) {
        w.setMatrixAt(idx, _m);
        t.setMatrixAt(idx, ZERO);
      } else {
        t.setMatrixAt(idx, _m);
        w.setMatrixAt(idx, ZERO);
        // 닳을수록 붉게 물든다 — 색이 무늬에 곱해진다. 눈에 보이는 값이다. 봇도 이걸 보고 옮긴다
        const k = s.wear * s.wear;
        t.setColorAt(idx, _c.setRGB(1, 1 - 0.55 * k, 1 - 0.75 * k));
      }
      // 부양광 — 밑에. 떨어지는 순간 꺼진다
      if (glow) {
        _s.set(size * 0.62, size * 0.62, 1);
        gl.setMatrixAt(idx, _m.compose(placed(x, y, z, _q, -TOWER_SLAB_H - 0.04), _qTop, _s));
      } else gl.setMatrixAt(idx, ZERO);
    }
    mats.warn.emissiveIntensity = anyWarn ? 0.2 + 0.7 * ((Math.sin(now * 0.0126) + 1) / 2) : 0; // 500ms 주기
    t.instanceMatrix.needsUpdate = true;
    w.instanceMatrix.needsUpdate = true;
    sd.instanceMatrix.needsUpdate = true;
    gl.instanceMatrix.needsUpdate = true;
    if (t.instanceColor) t.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={sides} args={[undefined, undefined, COUNT]} material={SIDE_MAT} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, COUNT]} material={mats.top} receiveShadow frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={warns} args={[undefined, undefined, COUNT]} material={mats.warn} receiveShadow frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={glows} args={[undefined, undefined, COUNT]} material={GLOW_MAT} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
    </group>
  );
}

/** 안 보이는 장 — 넷 다 크기 0 */
function hide(idx: number, ...meshes: THREE.InstancedMesh[]): void {
  for (const im of meshes) im.setMatrixAt(idx, ZERO);
}

/**
 * 격자 기둥 — 네 모서리 빔, 층마다 가로 띠, 면마다 X 가새. 가운데 발판 밑면까지. 단위 상자 하나를 빔 수만큼 인스턴스로 — 드로우콜 하나.
 * 폭은 가운데 발판 폭 안(0.88장) — 발판 밖으로 나오면 그 둘레에 틀이 생긴다. 갓판은 없다 — 가운데 발판이 떨어지면 회색 판이 드러나
 * 설 수 있는 발판으로 오해됐다 (2026-09-05 사용자: "가운데 회색 안 보이게"). 띠도 같은 강재 — 황색으로 두었더니 발판 둘레에 노란 틀로 보였다.
 * 바닥 발치판만 얇게, 구덩이 색으로
 */
function Pylon() {
  const parts = useMemo(() => {
    const w = TOWER_SLAB * 0.88;
    const h = TOWER_TOP - TOWER_SLAB_H - 0.06;
    const beam = 0.14;
    const levels = 4;
    const lh = h / levels;
    const out: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number, number] }[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ pos: [(sx * w) / 2, h / 2, (sz * w) / 2], rot: [0, 0, 0], size: [beam, h, beam] });
    for (let l = 0; l <= levels; l += 1) {
      const y = l * lh;
      out.push({ pos: [0, y, w / 2], rot: [0, 0, 0], size: [w, beam * 0.8, beam * 0.8] });
      out.push({ pos: [0, y, -w / 2], rot: [0, 0, 0], size: [w, beam * 0.8, beam * 0.8] });
      out.push({ pos: [w / 2, y, 0], rot: [0, 0, 0], size: [beam * 0.8, beam * 0.8, w] });
      out.push({ pos: [-w / 2, y, 0], rot: [0, 0, 0], size: [beam * 0.8, beam * 0.8, w] });
      if (l === levels) continue;
      const len = Math.hypot(w, lh);
      const a = Math.atan2(lh, w);
      for (const s of [-1, 1]) {
        out.push({ pos: [0, y + lh / 2, w / 2], rot: [0, 0, s * a], size: [len, beam * 0.55, beam * 0.55] });
        out.push({ pos: [0, y + lh / 2, -w / 2], rot: [0, 0, s * a], size: [len, beam * 0.55, beam * 0.55] });
        out.push({ pos: [w / 2, y + lh / 2, 0], rot: [-s * a, 0, 0], size: [beam * 0.55, beam * 0.55, len] });
        out.push({ pos: [-w / 2, y + lh / 2, 0], rot: [-s * a, 0, 0], size: [beam * 0.55, beam * 0.55, len] });
      }
    }
    return { beams: out, w };
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    parts.beams.forEach((b, i) => {
      _p.set(b.pos[0], b.pos[1], b.pos[2]);
      _q.setFromEuler(_e.set(b.rot[0], b.rot[1], b.rot[2]));
      _s.set(b.size[0], b.size[1], b.size[2]);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    im.instanceMatrix.needsUpdate = true;
  }, [parts]);
  return (
    <group position={[TOWER_CENTER.x, 0, TOWER_CENTER.z]}>
      <instancedMesh ref={ref} args={[undefined, undefined, parts.beams.length]} material={BEAM_MAT} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <mesh position={[0, 0.03, 0]} material={PIT_MAT}>
        <boxGeometry args={[parts.w + 0.3, 0.06, parts.w + 0.3]} />
      </mesh>
    </group>
  );
}

/** @param lights 탑 위 작업등을 여기서 켤지 — /trial 은 켠다(기본) */
export function TowerStage({ lights = true }: { lights?: boolean } = {}) {
  const half = (TOWER_N * TOWER_SLAB) / 2;
  return (
    <group>
      {/* 탑 밑의 어둠 — 떨어진 발판과 몸이 닿는 자리 */}
      <mesh rotation-x={-Math.PI / 2} position={[TOWER_CENTER.x, 0.015, TOWER_CENTER.z]} material={PIT_MAT}>
        <planeGeometry args={[half * 2 + 2.4, half * 2 + 2.4]} />
      </mesh>
      <Pylon />
      <Suspense fallback={null}>
        <Slabs />
      </Suspense>
      {lights ? (
        <>
          <pointLight position={[TOWER_CENTER.x, TOWER_TOP + 4.5, TOWER_CENTER.z]} color="#dfe9ff" intensity={60} distance={22} decay={2} />
          {/* 발판 밑에서 올라오는 청록 — 부양광이 바닥과 기둥에 비친다 */}
          <pointLight position={[TOWER_CENTER.x, TOWER_TOP - 1.2, TOWER_CENTER.z]} color="#5ff0ff" intensity={18} distance={12} decay={2} />
        </>
      ) : null}
      {/*
       * 바닥에 떨어져 발판에 다시 서는 순간이동의 빛기둥 (interrogation/scene/warp.ts). 무대에 붙여 둔다 —
       * 이 게임을 그리는 화면은 이 무대를 쓰는 화면과 같다. 걸린 것이 없으면 여덟 자리가 다 꺼져 있다
       */}
      <WarpFx dim={0.45} />
    </group>
  );
}
