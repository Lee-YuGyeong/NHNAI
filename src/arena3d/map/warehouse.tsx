/**
 * 창고 시네마 라운지 — 3D 월드의 배경. humanish 의 app/world/warehouse.tsx 에서 가져왔다.
 *
 * 사진 한 장을 판때기에 붙이는 방식과 달리 방을 **실제로 짓는다**.
 * 바닥·벽·박공지붕·트러스·스크린·가구가 전부 별개의 메시라 카메라가 움직이면 시차가 생긴다.
 *
 * 텍스처는 타일링용 3장이다: public/textures/warehouse/{wall,floor,box}.webp
 *
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다.
 * 치수는 mp/constants.ts 의 WORLD 와 같은 좌표계다 (WORLD 는 아래 ROOM 을 0.6 인셋한 값).
 *
 * ★ 원본의 인트로 영상·카운트다운·주제 영사는 뺐다 — 스크린은 그냥 빈 발광 판이다.
 */

import { useFrame } from '@react-three/fiber';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt, resolveCollisions } from '../mp/collide';

/* ─────────────────────────── 창고 치수 (월드 단위 ≈ m) ─────────────────────────── */

const ROOM = {
  width: 22,
  /** z 범위: -14(스크린 벽) ~ 6(등 뒤 벽) */
  back: -14,
  front: 6,
  /** 처마 높이. 여기까지가 벽, 위는 박공지붕 */
  eave: 5.6,
  /** 용마루(지붕 꼭대기) 높이 */
  ridge: 8.8,
};
const DEPTH = ROOM.front - ROOM.back;
const MID_Z = (ROOM.front + ROOM.back) / 2;
const HALF_W = ROOM.width / 2;
const RISE = ROOM.ridge - ROOM.eave;
const SLOPE_ANGLE = Math.atan2(RISE, HALF_W);
const SLOPE_LEN = Math.hypot(HALF_W, RISE);

const TEX = {
  wall: '/textures/warehouse/wall.webp',
  floor: '/textures/warehouse/floor.webp',
  box: '/textures/warehouse/box.webp',
};

useTexture.preload([TEX.wall, TEX.floor, TEX.box]);

/* ─────────────────────────────── 텍스처 ─────────────────────────────── */

/** 면마다 반복 횟수가 달라야 하는데 useTexture 는 URL 단위로 캐시를 공유하므로 clone 해서 쓴다. */
function useTiled(map: THREE.Texture, repeatX: number, repeatY: number) {
  return useMemo(() => {
    const t = map.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [map, repeatX, repeatY]);
}

/* ─────────────────────────────── 건물 ─────────────────────────────── */

const STEEL = '#1e1b17';

/** 건물 골조 · 스크린 · 선반 */
export function Warehouse() {
  const [wall, floor, box] = useTexture([TEX.wall, TEX.floor, TEX.box]);

  const sideTex = useTiled(wall, DEPTH / 3.2, ROOM.eave / 3.2);
  const gableTex = useTiled(wall, ROOM.width / 3.2, ROOM.ridge / 3.2);
  const roofTex = useTiled(wall, DEPTH / 3.2, SLOPE_LEN / 3.2);
  const floorTex = useTiled(floor, ROOM.width / 7, DEPTH / 7);

  return (
    <group>
      {/* 바닥 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, MID_Z]} receiveShadow>
        <planeGeometry args={[ROOM.width, DEPTH]} />
        <meshStandardMaterial map={floorTex} color="#93887a" roughness={0.88} metalness={0.04} />
      </mesh>

      {/* 스크린이 걸린 안쪽 박공벽 */}
      <mesh position={[0, ROOM.ridge / 2, ROOM.back]}>
        <planeGeometry args={[ROOM.width, ROOM.ridge]} />
        <meshStandardMaterial map={gableTex} color="#8b847b" roughness={0.92} />
      </mesh>
      {/* 등 뒤 박공벽 */}
      <mesh position={[0, ROOM.ridge / 2, ROOM.front]} rotation-y={Math.PI}>
        <planeGeometry args={[ROOM.width, ROOM.ridge]} />
        <meshStandardMaterial map={gableTex} color="#6f6a62" roughness={1} />
      </mesh>

      {/* 좌우 벽 (처마 높이까지) */}
      <mesh position={[-HALF_W, ROOM.eave / 2, MID_Z]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[DEPTH, ROOM.eave]} />
        <meshStandardMaterial map={sideTex} color="#8b847b" roughness={0.92} />
      </mesh>
      <mesh position={[HALF_W, ROOM.eave / 2, MID_Z]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[DEPTH, ROOM.eave]} />
        <meshStandardMaterial map={sideTex} color="#8b847b" roughness={0.92} />
      </mesh>

      <Roof map={roofTex} />
      <Trusses />
      <WallBraces />

      <Screen />
      <Stage />

      {/* 스크린 양옆 + 좌우 벽의 박스 선반 */}
      <Rack map={box} position={[-8.3, 0, ROOM.back + 0.75]} />
      <Rack map={box} position={[8.3, 0, ROOM.back + 0.75]} />
      <Rack map={box} position={[-HALF_W + 0.75, 0, -8.5]} rotationY={Math.PI / 2} />
      <Rack map={box} position={[HALF_W - 0.75, 0, -8.5]} rotationY={-Math.PI / 2} />
      <Rack map={box} position={[-HALF_W + 0.75, 0, -4.8]} rotationY={Math.PI / 2} />
      <Rack map={box} position={[HALF_W - 0.75, 0, -4.8]} rotationY={-Math.PI / 2} />

      <SteelDoor position={[-HALF_W + 0.08, 0, -11.4]} side={1} />
      <SteelDoor position={[HALF_W - 0.08, 0, -11.4]} side={-1} />

      <RoadCases />
    </group>
  );
}

/** 박공지붕 — 경사면 두 장. 안쪽에서 올려다보므로 DoubleSide */
function Roof({ map }: { map: THREE.Texture }) {
  const y = (ROOM.eave + ROOM.ridge) / 2;
  return (
    <group>
      <group position={[-HALF_W / 2, y, MID_Z]} rotation-z={SLOPE_ANGLE}>
        <mesh rotation-x={Math.PI / 2}>
          <planeGeometry args={[SLOPE_LEN, DEPTH]} />
          <meshStandardMaterial map={map} color="#4b453e" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group position={[HALF_W / 2, y, MID_Z]} rotation-z={-SLOPE_ANGLE}>
        <mesh rotation-x={Math.PI / 2}>
          <planeGeometry args={[SLOPE_LEN, DEPTH]} />
          <meshStandardMaterial map={map} color="#4b453e" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/** 철골 트러스 — 하현재 + 서까래 + 킹포스트 + 사재. */
function Trusses() {
  const zs = useMemo(() => Array.from({ length: 5 }, (_, i) => ROOM.back + 4.2 + i * 3.4), []);
  const midY = (ROOM.eave + ROOM.ridge) / 2;

  return (
    <group>
      {zs.map((z) => (
        <group key={z}>
          <mesh position={[0, ROOM.eave, z]}>
            <boxGeometry args={[ROOM.width, 0.18, 0.16]} />
            <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
          </mesh>
          <group position={[-HALF_W / 2, midY, z]} rotation-z={SLOPE_ANGLE}>
            <mesh>
              <boxGeometry args={[SLOPE_LEN, 0.18, 0.14]} />
              <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
            </mesh>
          </group>
          <group position={[HALF_W / 2, midY, z]} rotation-z={-SLOPE_ANGLE}>
            <mesh>
              <boxGeometry args={[SLOPE_LEN, 0.18, 0.14]} />
              <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
            </mesh>
          </group>
          <mesh position={[0, ROOM.eave + RISE / 2, z]}>
            <boxGeometry args={[0.14, RISE, 0.12]} />
            <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
          </mesh>
          {[-1, 1].map((s) => (
            <group
              key={s}
              position={[(s * HALF_W) / 4, ROOM.eave + RISE / 4, z]}
              rotation-z={-s * Math.atan2(RISE / 2, HALF_W / 2)}
            >
              <mesh>
                <boxGeometry args={[Math.hypot(HALF_W / 2, RISE / 2), 0.1, 0.1]} />
                <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** 좌우 벽의 기둥과 X자 가새 */
function WallBraces() {
  const bayW = 6;
  const bays = useMemo(() => Array.from({ length: 3 }, (_, i) => ROOM.back + 2.2 + i * (bayW + 0.6)), []);
  const diagLen = Math.hypot(bayW, ROOM.eave - 1);
  const diagAngle = Math.atan2(ROOM.eave - 1, bayW);

  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (HALF_W - 0.18), 0, 0]} rotation-y={side < 0 ? Math.PI / 2 : -Math.PI / 2}>
          {bays.map((z0) => (
            <group key={z0} position={[side < 0 ? -(z0 + bayW / 2) : z0 + bayW / 2, 0, 0]}>
              {[-bayW / 2, bayW / 2].map((x) => (
                <mesh key={x} position={[x, ROOM.eave / 2, 0]}>
                  <boxGeometry args={[0.22, ROOM.eave, 0.2]} />
                  <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
                </mesh>
              ))}
              {[diagAngle, -diagAngle].map((a) => (
                <mesh key={a} position={[0, ROOM.eave / 2 + 0.4, 0]} rotation-z={a}>
                  <boxGeometry args={[diagLen, 0.12, 0.1]} />
                  <meshStandardMaterial color={STEEL} roughness={0.85} metalness={0.35} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ─────────────────────────────── 스크린 · 무대 ─────────────────────────────── */

/** 스크린 치수 — 16:9 */
const SCREEN = { w: 10, h: 10 * (9 / 16), y: 4.2, z: ROOM.back + 0.22 };

/** 스크린 한가운데. **들어오면 이 점을 보고 시작한다** (WorldScene 의 LocalRig). */
export const SCREEN_FOCUS = { x: 0, y: SCREEN.y, z: SCREEN.z } as const;

/** 안쪽 벽의 대형 빈 스크린. 흰 판이 살짝 발광하고, 위에서 쏘는 스포트 3개가 빛 웅덩이를 만든다. */
function Screen() {
  return (
    <group position={[0, SCREEN.y, SCREEN.z]}>
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[SCREEN.w + 0.3, SCREEN.h + 0.3, 0.1]} />
        <meshStandardMaterial color="#15120e" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        <meshStandardMaterial color="#e8ddcd" emissive="#d8c9b2" emissiveIntensity={0.14} roughness={0.95} />
      </mesh>
      <pointLight position={[0, 0, 4]} intensity={30} distance={22} decay={1.6} color="#e6c9a3" />
    </group>
  );
}

/** 스크린 아래 낮은 무대턱 — 스피커와 붉은 표시등 */
function Stage() {
  return (
    <group>
      <mesh position={[0, 0.55, ROOM.back + 0.45]} castShadow receiveShadow>
        <boxGeometry args={[ROOM.width * 0.82, 1.1, 0.9]} />
        <meshStandardMaterial color="#37332e" roughness={1} />
      </mesh>
      {[-4.6, 0, 4.6].map((x) => (
        <group key={x} position={[x, 1.42, ROOM.back + 0.5]}>
          <mesh castShadow>
            <boxGeometry args={[0.62, 0.62, 0.5]} />
            <meshStandardMaterial color="#12100d" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.26]}>
            <circleGeometry args={[0.2, 20]} />
            <meshStandardMaterial color="#050505" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {[-7.4, -2.3, 2.3, 7.4].map((x) => (
        <mesh key={x} position={[x, 1.02, ROOM.back + 0.91]}>
          <boxGeometry args={[0.09, 0.09, 0.03]} />
          <meshBasicMaterial color="#ff3320" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────────── 선반 · 소품 ─────────────────────────────── */

function Rack({ map, position, rotationY = 0 }: { map: THREE.Texture; position: [number, number, number]; rotationY?: number }) {
  const W = 2.8;
  const D = 1.0;
  const H = 4.4;
  const shelfYs = [0.18, 1.35, 2.52, 3.69];
  const boxTex = useTiled(map, W / 8.4, 1.05 / 8.4);
  const stacks = [
    { w: W - 0.25, h: 0.95 },
    { w: W - 0.55, h: 0.9 },
    { w: W - 0.35, h: 0.85 },
    { w: W - 1.1, h: 0.7 },
  ];

  return (
    <group position={position} rotation-y={rotationY}>
      {[
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, H / 2, z]} castShadow>
          <boxGeometry args={[0.09, H, 0.09]} />
          <meshStandardMaterial color={STEEL} roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      {shelfYs.map((y, i) => (
        <group key={y}>
          <mesh position={[0, y, 0]} castShadow>
            <boxGeometry args={[W + 0.06, 0.07, D]} />
            <meshStandardMaterial color="#252220" roughness={0.9} />
          </mesh>
          <mesh position={[0, y + 0.05 + stacks[i].h / 2, 0]} castShadow>
            <boxGeometry args={[stacks[i].w, stacks[i].h, D - 0.2]} />
            <meshStandardMaterial map={boxTex} color="#9c8b71" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SteelDoor({ position, side }: { position: [number, number, number]; side: 1 | -1 }) {
  return (
    <group position={position} rotation-y={(side * Math.PI) / 2}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.2, 2.4, 0.14]} />
        <meshStandardMaterial color="#2e2a24" roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0.44, 1.15, 0.09]}>
        <boxGeometry args={[0.06, 0.22, 0.06]} />
        <meshStandardMaterial color="#8a8578" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 2.72, 0.1]}>
        <boxGeometry args={[0.24, 0.14, 0.1]} />
        <meshBasicMaterial color="#ff3320" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 투어 장비 케이스 — 실루엣용 잡동사니 (충돌 박스는 mp/collide.ts) */
function RoadCases() {
  const cases = [
    { x: HALF_W - 1.3, z: 1.6, w: 1.4, h: 1.3 },
    { x: HALF_W - 1.2, z: 3.2, w: 1.1, h: 0.9 },
    { x: HALF_W - 2.6, z: 2.4, w: 1.0, h: 1.05 },
    { x: -HALF_W + 1.3, z: 2.2, w: 1.3, h: 1.15 },
  ];
  return (
    <group>
      {cases.map((c) => (
        <group key={`${c.x}${c.z}`} position={[c.x, 0, c.z]}>
          <mesh position={[0, c.h / 2, 0]} castShadow>
            <boxGeometry args={[c.w, c.h, 0.85]} />
            <meshStandardMaterial color="#191a1c" roughness={0.65} metalness={0.35} />
          </mesh>
          <mesh position={[0, c.h / 2, 0]}>
            <boxGeometry args={[c.w + 0.02, 0.05, 0.87]} />
            <meshStandardMaterial color="#6f6e68" roughness={0.4} metalness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/** 스크린 스포트 3개 + 펜던트 등 + 벽 브래킷 등. 그림자는 좌석 위 스포트 2개만 굽는다. */
export function Lights({ flicker }: { flicker: boolean }) {
  return (
    <>
      <ambientLight intensity={0.22} color="#7a6a55" />
      <hemisphereLight args={['#5a5044', '#33261c', 0.38]} />

      {[-3.4, 0, 3.4].map((x) => (
        <Spot key={x} from={[x, ROOM.eave + 1, ROOM.back + 2.2]} to={[x, SCREEN.y - 0.9, ROOM.back]} angle={0.4} intensity={190} color="#ffe3bd" />
      ))}

      <Spot from={[-3.2, ROOM.eave - 0.4, -5.5]} to={[-3.2, 0, -5.5]} angle={0.85} intensity={80} color="#ffd9ac" castShadow />
      <Spot from={[3.2, ROOM.eave - 0.4, -3.5]} to={[3.2, 0, -3.5]} angle={0.85} intensity={80} color="#ffd9ac" castShadow />

      {[
        { x: -7.4, z: -12, lit: false },
        { x: 7.4, z: -12, lit: false },
        { x: -5.8, z: -8, lit: true },
        { x: 5.8, z: -8, lit: true },
        { x: -5.8, z: -1.2, lit: true },
        { x: 5.8, z: -1.2, lit: true },
        { x: 0, z: 2.2, lit: false },
        { x: -5.8, z: 4.5, lit: false },
        { x: 5.8, z: 4.5, lit: false },
      ].map((p) => (
        <Pendant key={`${p.x}${p.z}`} x={p.x} z={p.z} lit={p.lit} flicker={flicker} />
      ))}

      <Sconce position={[-HALF_W + 0.25, 3.6, -9.8]} lit />
      <Sconce position={[HALF_W - 0.25, 3.6, -9.8]} lit />
      <Sconce position={[-HALF_W + 0.25, 3.6, -2]} />
      <Sconce position={[HALF_W - 0.25, 3.6, -2]} />
    </>
  );
}

function Spot({
  from,
  to,
  angle,
  intensity,
  color = '#ffe0bb',
  castShadow = false,
}: {
  from: [number, number, number];
  to: [number, number, number];
  angle: number;
  intensity: number;
  color?: string;
  castShadow?: boolean;
}) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current;
  }, []);

  return (
    <>
      <object3D ref={target} position={to} />
      <spotLight
        ref={light}
        position={from}
        angle={angle}
        penumbra={0.9}
        intensity={intensity}
        distance={26}
        decay={1.4}
        color={color}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}

/** 트러스에 매달린 공장 갓등. lit 이면 점광원을 품는다 */
function Pendant({ x, z, lit, flicker }: { x: number; z: number; lit: boolean; flicker: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const rodLen = 1.0;
  const shadeY = ROOM.eave - rodLen;
  const phase = useMemo(() => z * 1.7 + x * 0.3, [x, z]);

  useFrame(({ clock }) => {
    if (!light.current) return;
    if (!flicker) {
      light.current.intensity = 26;
      return;
    }
    const t = clock.getElapsedTime() + phase;
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 2.9) * 0.5;
    light.current.intensity = 26 + n * 3;
  });

  return (
    <group position={[x, shadeY, z]}>
      <mesh position={[0, rodLen / 2 + 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.02, rodLen, 8]} />
        <meshStandardMaterial color={STEEL} roughness={0.8} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.09, 0.4, 0.32, 24, 1, true]} />
        <meshStandardMaterial color="#26221d" roughness={0.6} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color="#ffd9a3" toneMapped={false} />
      </mesh>
      {lit && <pointLight ref={light} position={[0, -0.25, 0]} intensity={26} distance={13} decay={1.7} color="#ffca8e" />}
    </group>
  );
}

function Sconce({ position, lit = false }: { position: [number, number, number]; lit?: boolean }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.13, 14, 14]} />
        <meshBasicMaterial color="#ffe8c4" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.05, 0.14, 0.12, 12]} />
        <meshStandardMaterial color={STEEL} roughness={0.7} metalness={0.4} />
      </mesh>
      {lit && <pointLight intensity={11} distance={9} decay={1.8} color="#ffd9a8" />}
    </group>
  );
}

/* ─────────────────────────────── 가구 ─────────────────────────────── */

const LEATHER_BLACK = '#1b1715';
const CHAIR_BROWN = '#4a2b21';
const WOOD_DARK = '#241a13';

export function Furniture() {
  return (
    <group>
      <Sofa position={[-4.4, 0, -8.2]} rotation={0.12} />
      <Sofa position={[0.2, 0, -7.4]} rotation={0} />
      <Sofa position={[4.8, 0, -8]} rotation={-0.12} />
      <Sofa position={[-7.8, 0, -6.6]} rotation={0.5} />
      <Sofa position={[7.9, 0, -6.4]} rotation={-0.5} />
      <LowTable position={[-4.2, 0, -6.7]} />
      <LowTable position={[0.4, 0, -5.9]} />
      <LowTable position={[4.7, 0, -6.5]} width={1.5} />

      <TableSet position={[-7.6, 0, -1.6]} rotation={0.15} />
      <TableSet position={[-6.9, 0, 3]} rotation={-0.2} />
      <TableSet position={[0.1, 0, 1.4]} rotation={0.05} />
      <TableSet position={[7.2, 0, -1.9]} rotation={-0.12} />
      <TableSet position={[6.6, 0, 3.1]} rotation={0.25} />
    </group>
  );
}

function Sofa({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[2.7, 0.48, 1.05]} radius={0.09} position={[0, 0.32, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={LEATHER_BLACK} roughness={0.62} />
      </RoundedBox>
      <RoundedBox args={[2.7, 0.66, 0.3]} radius={0.09} position={[0, 0.66, -0.4]} castShadow>
        <meshStandardMaterial color={LEATHER_BLACK} roughness={0.62} />
      </RoundedBox>
      {[-1.3, 1.3].map((x) => (
        <RoundedBox key={x} args={[0.26, 0.6, 1.05]} radius={0.08} position={[x, 0.4, 0]} castShadow>
          <meshStandardMaterial color={LEATHER_BLACK} roughness={0.62} />
        </RoundedBox>
      ))}
      {[-0.65, 0.65].map((x) => (
        <RoundedBox key={x} args={[1.18, 0.14, 0.9]} radius={0.06} position={[x, 0.56, 0.02]} castShadow>
          <meshStandardMaterial color={LEATHER_BLACK} roughness={0.68} />
        </RoundedBox>
      ))}
    </group>
  );
}

function LowTable({ position, width = 1.8, depth = 1.0 }: { position: [number, number, number]; width?: number; depth?: number }) {
  const height = 0.46;
  const legX = width / 2 - 0.12;
  const legZ = depth / 2 - 0.12;

  return (
    <group position={position}>
      <mesh position={[0, height, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, height / 2, z]} castShadow>
          <boxGeometry args={[0.09, height, 0.09]} />
          <meshStandardMaterial color="#1a1310" roughness={0.85} />
        </mesh>
      ))}
      <Tabletop height={height} />
    </group>
  );
}

/** 테이블 위 잡동사니 — 접시와 컵. 크기 대비가 생겨 스케일이 읽힌다 */
function Tabletop({ height }: { height: number }) {
  return (
    <group position={[0, height + 0.05, 0]}>
      <mesh position={[0.28, 0, -0.1]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.025, 18]} />
        <meshStandardMaterial color="#d6cfc2" roughness={0.4} />
      </mesh>
      <mesh position={[-0.3, 0.05, 0.12]} castShadow>
        <cylinderGeometry args={[0.045, 0.04, 0.11, 12]} />
        <meshStandardMaterial color="#3c3a36" roughness={0.5} />
      </mesh>
      <mesh position={[-0.02, 0, 0.24]} rotation-y={0.5} castShadow>
        <boxGeometry args={[0.16, 0.025, 0.11]} />
        <meshStandardMaterial color="#22201d" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** 식탁 하나 + 의자 4개 */
function TableSet({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const W = 1.5;
  const H = 0.74;
  const legX = W / 2 - 0.12;

  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, H, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 0.07, W]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.65} />
      </mesh>
      {[
        [-legX, -legX],
        [legX, -legX],
        [-legX, legX],
        [legX, legX],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, H / 2, z]} castShadow>
          <boxGeometry args={[0.08, H, 0.08]} />
          <meshStandardMaterial color="#15100c" roughness={0.85} />
        </mesh>
      ))}
      <Tabletop height={H} />

      <Chair position={[-0.42, 0, 1.02]} rotation={Math.PI} />
      <Chair position={[0.42, 0, 1.02]} rotation={Math.PI} />
      <Chair position={[-0.42, 0, -1.02]} rotation={0} />
      <Chair position={[0.42, 0, -1.02]} rotation={0} />
    </group>
  );
}

function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[0.5, 0.1, 0.5]} radius={0.04} position={[0, 0.46, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={CHAIR_BROWN} roughness={0.75} />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.55, 0.1]} radius={0.04} position={[0, 0.82, -0.2]} castShadow>
        <meshStandardMaterial color={CHAIR_BROWN} roughness={0.75} />
      </RoundedBox>
      {[
        [-0.19, -0.19],
        [0.19, -0.19],
        [-0.19, 0.19],
        [0.19, 0.19],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.2, z]} castShadow>
          <boxGeometry args={[0.06, 0.4, 0.06]} />
          <meshStandardMaterial color="#16110d" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────────── 가구 충돌 ─────────────────────────────── */

/** 충돌 데이터와 판정은 mp/collide.ts 하나에만 있다. 여기는 THREE.Vector3 를 제자리에서 고쳐 주는 껍데기다. */
export function resolveColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY);
  p.x = out.x;
  p.z = out.z;
}

export { groundHeightAt };
