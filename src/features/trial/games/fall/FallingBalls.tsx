/**
 * 떨어지는 공들 — 서버 스냅샷(fallState)이 준 자리에 종류별 GLB(FALL_BALLS 순서)를 인스턴싱해 그린다.
 * 스스로 떨어뜨리지 않는다. 공마다 바닥에 그림자 원반을 깐다 — 위를 못 보는 3인칭에서 사람이 "어디 떨어지나"를
 * 읽는 유일한 물리적 단서다(진짜 그림자는 여럿이면 비싸다). 수직 낙하라 그림자 = 착지점. 공이 떨어지기 시작하는
 * 순간부터 옅게 있다가 내려올수록 진해진다 — 그래서 위를 안 봐도 "곧 온다"를 안다.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fitScale, usePartSource, type PartId } from '@/world/map/corridor/part';
import { FALL_BALLS, FALL_SPAWN_Y } from '@/world/mp/constants';
import { fallState, type PodFrame } from './fallState';

/**
 * 한 종류가 동시에 공중·바닥에 있을 수 있는 최대 수.
 * 0.25초 간격 스폰(FALL_SPAWN_MS)이면 한 종류는 1.25초에 하나씩 생긴다 — 가장 오래 사는 탁구공이
 * 낙하 3.75초 + 잔류 1초를 살아 평균 넷, 나머지는 둘 남짓이다. 열여섯은 그 위로 넉넉한 자리다.
 * 넘치면 넘친 공은 **안 그려진다**(판정은 서버가 하므로 맞기는 맞는다) — 간격을 더 줄이면 여기부터 본다.
 */
const MAX_PER_KIND = 16;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

const PART_OF: PartId[] = ['ball_basketball', 'ball_soccer', 'ball_baseball', 'ball_pingpong', 'ball_bowling'];

const SHADOW_GEO = new THREE.CircleGeometry(1, 24);
/** 흰 바탕에 인스턴스 색을 곱한다 — 높이에 따라 회색(멀다) → 검정(닿는다) */
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false });
const _c = new THREE.Color();

function BallKind({ kind, frames }: { kind: number; frames: React.RefObject<PodFrame[]> }) {
  const spec = FALL_BALLS[kind];
  const src = usePartSource(PART_OF[kind]);
  const scale = useMemo(() => fitScale(src.size, { y: spec.r * 2 }), [src.size, spec.r]);
  const balls = useRef<THREE.InstancedMesh>(null);
  const shadows = useRef<THREE.InstancedMesh>(null);

  /*
   * 그림자 원반의 **인스턴스 색 자리를 미리 만든다.** three 는 `instanceColor` 가 있고 없고를 셰이더 프로그램의
   * 열쇠에 넣는다 — 아래 useFrame 의 `setColorAt` 이 그 자리를 처음 만들므로, 그대로 두면 **첫 공이 떨어지는
   * 그 프레임에** 열쇠가 바뀌어 프로그램을 새로 링크한다. 그 링크를 기다리느라 화면이 멎는 자리다
   * (검문소에서는 무대를 미리 세워 두고 링크시키는데 — FallStage 의 Precompile — 이 자리 하나가 그걸 빠져나갔다).
   * 값은 아무래도 좋다: 어차피 공이 있는 프레임에 다시 칠한다.
   */
  useEffect(() => {
    const sm = shadows.current;
    if (sm && !sm.instanceColor) sm.setColorAt(0, _c.setScalar(0));
  }, []);

  useFrame(() => {
    const bm = balls.current;
    const sm = shadows.current;
    if (!bm || !sm) return;
    let n = 0;
    for (const f of frames.current ?? []) {
      if (f.k !== kind || n >= MAX_PER_KIND) continue;
      // 떨어지며 천천히 돈다 — 고정된 각도면 종이 인형처럼 보인다
      _e.set((FALL_SPAWN_Y - f.y) * 0.6, (f.id * 1.7) % Math.PI, 0);
      _q.setFromEuler(_e);
      _p.set(f.x, f.y, f.z);
      // 스폰 확대 — 첫 0.35m 동안 0 → 실물. 배출 호퍼(FallScene) 입 안에서 커지므로 허공 '팝'이 없다.
      // 호퍼 격자 틈에 걸린 공도 11m 위 어둠 속에서 스르륵 나타나 팝으로 안 읽힌다. 판정과 무관한 눈속임이다
      const grow = Math.min(1, Math.max(0, (FALL_SPAWN_Y - f.y) / 0.35));
      _s.set(scale[0] * grow, scale[1] * grow, scale[2] * grow);
      bm.setMatrixAt(n, _m.compose(_p, _q, _s));

      // 그림자 원반 — 크기는 그대로(착지점을 처음부터 알려 준다), 색은 높이에 따라 회색 → 검정
      const near = 1 - Math.min(1, Math.max(0, (f.y - spec.r) / FALL_SPAWN_Y)); // 0 = 천장, 1 = 바닥
      const k = spec.r * 1.35;
      _p.set(f.x, 0.02, f.z);
      _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0));
      _s.set(k, k, 1);
      sm.setMatrixAt(n, _m.compose(_p, _q, _s));
      sm.setColorAt(n, _c.setScalar(0.55 * (1 - near) ** 1.5));
      n += 1;
    }
    bm.count = n;
    sm.count = n;
    bm.instanceMatrix.needsUpdate = true;
    sm.instanceMatrix.needsUpdate = true;
    if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={balls} args={[src.geometry, src.material, MAX_PER_KIND]} frustumCulled={false} />
      <instancedMesh ref={shadows} args={[SHADOW_GEO, SHADOW_MAT, MAX_PER_KIND]} frustumCulled={false} />
    </>
  );
}

export function FallingBalls() {
  // 프레임마다 한 번만 스냅샷을 보간하고, 종류별 메시가 같은 배열을 읽는다
  const frames = useRef<PodFrame[]>([]);
  useFrame(() => {
    frames.current = fallState.podsAt(Date.now());
  }, -1);
  return (
    <>
      {FALL_BALLS.map((b, i) => (
        <BallKind key={b.id} kind={i} frames={frames} />
      ))}
    </>
  );
}
