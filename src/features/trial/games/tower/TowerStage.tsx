/**
 * 무너지는 타워 — 홀 가운데 마당에 선 탑. 격자 기둥(Pylon — 코드 기하)이 가운데를 받치고, 그 위에 발판 25장이 **떠 있다** —
 * 발판마다 밑에 청록 부양광이 있어 기둥 없이도 붙어 있는 것으로 읽힌다(이 홀의 움직이는 발판과 같은 어법). 처음엔 발판마다 H 기둥을
 * 세웠는데 스물다섯 개의 흰 기둥 숲이 화면을 어지럽혔다 (2026-09-05 사용자: "디자인도 이상하고").
 * 윗면 텍스처(힉스필드, slab_top.webp — 황흑 띠 · 가운데 청록 십자)는 UV 를 조금 당겨 띠를 얇게 쓴다. 경고가 뜬 발판은 갈라진 텍스처
 * (slab_warn.webp)로 바뀌어 천천히 처지며 붉게 숨 쉬고, 떨어지는 발판은 **낮은 쪽 가장자리로 기우뚱 넘어가다 떨어진다**(hinge → 자유 낙하).
 * 고리마다 높이가 계단으로 다르고(ringBaseY), 닳은 발판은 가라앉으며 주황으로 달아오른다(wear), 진동 1초 전부터 전 발판이 떨린다(quakeAmp).
 * 기둥은 처음 Tripo Studio 로 뽑았는데(tower_pylon) 베이크 텍스처가 줄이며 번져 크롬처럼 얼룩지고 밑판이 접시처럼 튀어나와 「탁자」로 읽혔다
 * (2026-09-05 사용자: "이거 디자인 좀 이상한데"). 그래서 네 모서리 빔 · 가로 띠 · X 가새를 무광 강재로 코드에서 짠다 — 얼룩도 밑판도 없다.
 * 마찰계수는 여기 없다 — 발판은 어느 구간에도 같아 보인다(P8).
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GRAVITY } from '@/world/mp/constants';
import { TOWER_CENTER, TOWER_FALL_KEEP_MS, TOWER_GAP, TOWER_N, TOWER_SLAB, TOWER_SLAB_H, TOWER_TOP, TOWER_WEAR_SINK, ringBaseY, slabCenter } from '@/world/mp/tower';
import { towerState } from './towerState';

const TOP_URL = '/textures/tower/slab_top.webp';
const WARN_URL = '/textures/tower/slab_warn.webp';
const SIDE_MAT = new THREE.MeshStandardMaterial({ color: '#4a525c', metalness: 0.7, roughness: 0.4 });
/** 부양광 — 밑에서만 보이고(BackSide 는 아래를 향한 면), 옅게. 0.35 양면이었더니 밑에서 청록 판이 하늘을 덮었다 */
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#5ff0ff', transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false });
const PIT_MAT = new THREE.MeshStandardMaterial({ color: '#0b0f14', metalness: 0.4, roughness: 0.9 });
const BEAM_MAT = new THREE.MeshStandardMaterial({ color: '#2a2f37', metalness: 0.75, roughness: 0.45 });
const BEAM_STRIPE = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.5, roughness: 0.5 });
/** 기우뚱 — 낮은 쪽 가장자리를 축으로 넘어가는 시간(s)과 그때 도는 각(rad). 그 뒤는 자유 낙하 + 회전 */
const TIP_S = 0.45;
const TIP_RAD = 1.1;

function zoom(t: THREE.Texture): THREE.Texture {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // 띠가 굵어 스물다섯 장이 노란 격자로 읽혔다 — 가운데를 당겨 띠를 절반으로
  t.repeat.set(0.86, 0.86);
  t.offset.set(0.07, 0.07);
  return t;
}

function Slabs() {
  const topTex = useTexture(TOP_URL);
  const warnTex = useTexture(WARN_URL);
  const mats = useMemo(() => {
    const top = zoom(topTex);
    const warn = zoom(warnTex);
    return {
      // 발판마다 재질 하나 — 마모(주황)가 장마다 다르다. 스물다섯이면 셰이더는 하나, 유니폼만 다르다
      tops: Array.from({ length: TOWER_N * TOWER_N }, () => new THREE.MeshStandardMaterial({ map: top, metalness: 0.55, roughness: 0.5, emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 })),
      warn: new THREE.MeshStandardMaterial({ map: warn, metalness: 0.55, roughness: 0.5, emissive: new THREE.Color('#ff3a1a'), emissiveIntensity: 0 }),
    };
  }, [topTex, warnTex]);
  const group = useRef<THREE.Group>(null);
  const size = TOWER_SLAB - TOWER_GAP;
  const half = TOWER_SLAB / 2;

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const quake = towerState.quakeAmp(now);
    g.children.forEach((child, idx) => {
      const s = towerState.slabAt(idx, now);
      const c = slabCenter(idx);
      const top = child.children[1] as THREE.Mesh | undefined;
      const glow = child.children[2] as THREE.Mesh | undefined;
      if (s.state >= 3) {
        child.visible = false;
        return;
      }
      child.visible = true;
      // 기울기 t(낮은 쪽, tan) → 회전: x 축 둘레 atan(tz), z 축 둘레 −atan(tx) (mp/tower.ts slabSurfaceY 와 같은 부호)
      const base = ringBaseY(idx);
      let x = c.x;
      let y = base - s.wear * TOWER_WEAR_SINK;
      let z = c.z;
      // 진동 — 전 발판이 잔떨림. 장마다 위상이 다르다
      if (quake > 0) {
        y += Math.sin(now * 0.06 + idx) * 0.02 * quake;
        x += Math.sin(now * 0.05 + idx * 1.3) * 0.012 * quake;
        z += Math.cos(now * 0.053 + idx * 0.7) * 0.012 * quake;
      }
      let rx = Math.atan(s.tz);
      let rz = -Math.atan(s.tx);
      if (glow) glow.visible = s.state < 2;
      if (s.state === 2) {
        const tau = Math.max(0, now - s.atLocal) / 1000;
        y = base;
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
        child.visible = now - s.atLocal < TOWER_FALL_KEEP_MS && y > -4;
      } else if (s.state === 1) {
        // 경고 — 천천히 처지며(축이 삭는다) 붉게 숨 쉬고, 갈수록 떤다
        const age = Math.max(0, now - s.atLocal) / 1000;
        const k = (Math.sin(now * 0.0126) + 1) / 2; // 500ms 주기
        const shake = Math.min(1, age / 1.6) * 0.02;
        y -= Math.min(0.12, age * 0.07);
        rx += Math.sin(now * 0.021) * shake;
        rz += Math.cos(now * 0.019) * shake;
        if (top) {
          top.material = mats.warn;
          mats.warn.emissiveIntensity = 0.2 + 0.7 * k;
        }
      } else if (top) {
        // 닳을수록 주황으로 달아오른다 — 눈에 보이는 값이다. 봇도 이걸 보고 옮긴다
        const m = mats.tops[idx];
        top.material = m;
        m.emissiveIntensity = s.wear * s.wear * 0.9;
      }
      child.position.set(x, y, z);
      child.rotation.set(rx, 0, rz);
    });
  });

  return (
    <group ref={group}>
      {Array.from({ length: TOWER_N * TOWER_N }, (_, idx) => (
        <group key={idx}>
          {/* 몸통 — 얇은 강판. 두껍게 했더니 밑에서 검은 덩어리로 보이고 기둥을 가렸다 (2026-09-05 사용자 스크린샷) */}
          <mesh position={[0, -TOWER_SLAB_H / 2, 0]} material={SIDE_MAT} castShadow receiveShadow>
            <boxGeometry args={[size, TOWER_SLAB_H, size]} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} material={mats.tops[idx]} receiveShadow>
            <planeGeometry args={[size, size]} />
          </mesh>
          {/* 부양광 — 발판 밑 청록 판. 떨어지는 순간 꺼진다 */}
          <mesh rotation-x={-Math.PI / 2} position={[0, -TOWER_SLAB_H - 0.04, 0]} material={GLOW_MAT}>
            <planeGeometry args={[size * 0.62, size * 0.62]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * 격자 기둥 — 네 모서리 빔, 층마다 가로 띠, 면마다 X 가새. 가운데 발판 밑면까지 서고 위에 얇은 갓판 하나.
 * 폭은 발판 1.6장 — 밑에서 보면 가운데 아홉 장의 안쪽을 받치는 것으로 읽힌다
 */
function Pylon() {
  const parts = useMemo(() => {
    const w = TOWER_SLAB * 1.6;
    const h = TOWER_TOP - TOWER_SLAB_H - 0.06; // 가운데 발판 밑면까지
    const beam = 0.14;
    const levels = 4;
    const lh = h / levels;
    const out: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number, number]; stripe?: boolean }[] = [];
    // 모서리 빔
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ pos: [(sx * w) / 2, h / 2, (sz * w) / 2], rot: [0, 0, 0], size: [beam, h, beam] });
    for (let l = 0; l <= levels; l += 1) {
      const y = l * lh;
      // 가로 띠 — 네 면. 맨 위 띠는 황색(경고 띠)
      const stripe = l === levels;
      out.push({ pos: [0, y, w / 2], rot: [0, 0, 0], size: [w, beam * 0.8, beam * 0.8], stripe });
      out.push({ pos: [0, y, -w / 2], rot: [0, 0, 0], size: [w, beam * 0.8, beam * 0.8], stripe });
      out.push({ pos: [w / 2, y, 0], rot: [0, 0, 0], size: [beam * 0.8, beam * 0.8, w], stripe });
      out.push({ pos: [-w / 2, y, 0], rot: [0, 0, 0], size: [beam * 0.8, beam * 0.8, w], stripe });
      if (l === levels) continue;
      // X 가새 — 면마다 둘
      const len = Math.hypot(w, lh);
      const a = Math.atan2(lh, w);
      for (const s of [-1, 1]) {
        out.push({ pos: [0, y + lh / 2, w / 2], rot: [0, 0, s * a], size: [len, beam * 0.55, beam * 0.55] });
        out.push({ pos: [0, y + lh / 2, -w / 2], rot: [0, 0, s * a], size: [len, beam * 0.55, beam * 0.55] });
        out.push({ pos: [w / 2, y + lh / 2, 0], rot: [-s * a, 0, 0], size: [beam * 0.55, beam * 0.55, len] });
        out.push({ pos: [-w / 2, y + lh / 2, 0], rot: [-s * a, 0, 0], size: [beam * 0.55, beam * 0.55, len] });
      }
    }
    // 발판 밑 갓판 · 바닥 발치판 — 얇게, 기둥 폭에 맞춰
    out.push({ pos: [0, h + 0.03, 0], rot: [0, 0, 0], size: [w + 0.2, 0.06, w + 0.2] });
    out.push({ pos: [0, 0.04, 0], rot: [0, 0, 0], size: [w + 0.3, 0.08, w + 0.3] });
    return out;
  }, []);
  return (
    <group position={[TOWER_CENTER.x, 0, TOWER_CENTER.z]}>
      {parts.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={p.rot} material={p.stripe ? BEAM_STRIPE : BEAM_MAT} castShadow>
          <boxGeometry args={p.size} />
        </mesh>
      ))}
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
      {/* 격자 기둥 — 탑의 몸통 */}
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
    </group>
  );
}
