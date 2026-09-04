/**
 * 코어 출력 콘솔 — **중앙 시설에서 손댈 수 있는 단 하나.** 대사 v7 「CORE_RING」· 레벨 설계 중앙 시설 04.
 *
 * 이 파일은 **가까이 있는가**만 안다. 콘솔 앞 2.2 m 안에서 콘솔 쪽을 보고 있으면 scenario2.consoleNear 를 켜고,
 * 벗어나면 끈다. 그게 전부다 — E 키가 무엇을 하는지(15 초 감광 · 태도 −1 · 경보 +12)는 scenario2.useConsole 이
 * corefield.CONSOLE 을 읽어 정하고, 키 바인딩은 Scenario2Feature 가 잇는다. 여기에 비용을 적는 순간 값이 두 곳이 된다.
 *
 * 벽화(Murals)와 달리 **머무는 시간이 없다.** 그림은 「들여다봤다」가 되려면 1.2 초를 서야 했지만, 콘솔은 손을 대기 전까지
 * 아무 일도 없다 — 보는 것만으로 비용이 생기지 않으니 시선이 닿는 즉시 켜도 된다. 대신 HUD 의 [E] 안내는 켜진 동안만 뜬다.
 *
 * 콘솔 자리와 방향은 맵(world2/map/central2 CENTRAL2_CONSOLE)이 준다 — 콘솔이 어느 벽에 붙었는지는 맵만 안다.
 * 여기서 읽는 것은 `look` 하나 — **플레이어가 콘솔을 볼 때 보는 방향**(방에서 벽으로, −x 벽이면 (−1, 0)).
 * 콘솔 화면이 방을 향하는 법선은 그 반대(−look)라, 표시 띠는 −look 쪽으로 띄우고 −look 을 보게 돌린다.
 * `facing` 은 Unit·patrol 의 heading 규약(θ 가 보는 방향 = (sin θ, cos θ))이라 +x 기준 cos/sin 으로 읽으면
 * 띠가 옆면에 서 버린다 — 그래서 안 쓴다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { hdr } from '@/world/map/scifi';
import { CENTRAL2_CONSOLE } from '@/world2/map/central2';

import { scenario2 } from './scenario2';

/** 손이 닿는 거리와 정면 각 — 콘솔은 만지는 물건이라 그림(5 m · 45°)보다 좁다. 플레이테스트 뒤 좁힐 값 */
const REACH_M = 2.2;
/** 35° 는 corefield.FLEE_ANGLE_DEG(도주각)와 값만 같을 뿐 다른 개념이다 — 균형 조정 때 하나로 묶지 말 것 */
const REACH_DEG = 35;
const REACH_DOT = Math.cos((REACH_DEG * Math.PI) / 180);

/** 표시 띠 — 콘솔 화면 아래 얇은 한 줄. 가까우면 밝아진다. 발광 배율 1 초과 금지(scifi 규칙) */
const STRIP = { w: 1.6, h: 0.05, lift: 0.04, y: 1.28 } as const;
const STRIP_FAR = hdr('#4d8fd6', 0.35);
const STRIP_NEAR = hdr('#9fd8ff', 1.0);
const EASE = 6;

const _fwd = new THREE.Vector3();

/**
 * 매 프레임 거리·각도만 재고, 바뀔 때만 저장소에 알린다 — setConsoleNear 도 같은 값은 무시하지만
 * 여기서 한 번 더 거르는 건 ref 로 마지막 값을 들고 있어 리렌더 없이 띠 밝기까지 같은 판단으로 움직이기 위해서다.
 */
export function Console2() {
  const camera = useThree((s) => s.camera);
  const near = useRef(false);
  const stripMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const dx = CENTRAL2_CONSOLE.x - camera.position.x;
    const dz = CENTRAL2_CONSOLE.z - camera.position.z;
    const dist = Math.hypot(dx, dz);
    let hit = false;
    if (dist <= REACH_M && dist > 0.05) {
      camera.getWorldDirection(_fwd);
      const flen = Math.hypot(_fwd.x, _fwd.z) || 1;
      hit = (dx * _fwd.x + dz * _fwd.z) / (dist * flen) >= REACH_DOT;
    }
    if (hit !== near.current) {
      near.current = hit;
      scenario2.setConsoleNear(hit);
    }
    const m = stripMat.current;
    if (m) m.color.lerp(hit ? STRIP_NEAR : STRIP_FAR, Math.min(1, delta * EASE));
  });

  // 화면이 방을 향하는 법선(−look) 쪽으로 lift 만큼 띄운다 — 면에 묻히면 z-fight 로 깜빡이고, 깜빡임은 금지다
  const nx = -CENTRAL2_CONSOLE.look.dx;
  const nz = -CENTRAL2_CONSOLE.look.dz;
  const px = CENTRAL2_CONSOLE.x + nx * STRIP.lift;
  const pz = CENTRAL2_CONSOLE.z + nz * STRIP.lift;
  // planeGeometry 정면은 +z — y 축으로 θ 돌리면 +z 가 (sin θ, 0, cos θ) 로 가니 법선 (nx, 0, nz) 는 θ = atan2(nx, nz)
  return (
    <mesh name="코어 출력 콘솔 표시" position={[px, STRIP.y, pz]} rotation-y={Math.atan2(nx, nz)}>
      <planeGeometry args={[STRIP.w, STRIP.h]} />
      <meshBasicMaterial ref={stripMat} color={STRIP_FAR} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
