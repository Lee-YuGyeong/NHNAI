/**
 * 챕터 2 의 몸 — 중앙 시설(/central) 캔버스에 얹는다 (CentralChapterScene 이 부른다).
 *
 *   - 굉음: 반응 테스트 때 왼쪽 벽에서 쾅 — 소리(sfx) + 그 자리의 점광원이 한 번 번쩍
 *   - 유도등: 이동 명령부터 바닥에 화살표 띠가 줄 끝(내 자리)까지 흐른다 (A-17 → INTERROGATION SECTOR)
 *   - 줄: 같은 모델 넷(RobotAvatar)이 검증실 문 앞으로 하나씩 나가 검증받는다 — 통과하면 문 안으로 사라지고,
 *     **사살되면 그 자리에 쓰러진 채 남는다**(chapter2.QUEUE_UNITS 의 fate). 도망치는 개체는 FLEE_SPOT 으로 달린다. 앞이 비면 한 칸씩 당긴다
 *   - 사격: downed 가 늘어나면 총성(sfx.gunshot)과 총구 섬광 한 번 — 굉음(Bang)과 같은 방식
 *   - 표식: 먼 격납문 위 캔버스 글자판 — COGNITIVE VERIFICATION CHAMBER / VERIFIED
 *   - 트리거: 프레임마다 내 자리·정면을 chapter2.track 에 준다 (hold 이동 감지 · 굉음 응시 · 줄 도착)
 * 서버에 없는 내 화면의 연출이다. 경비의 검문 걸음·재배치는 AgentRobot 이 chapter2 상태를 읽어 한다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';

import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { COLLIDERS, CORE_KEEPOUT, DOOR, FAR_Z } from '@/world/map/central/layout';
import { hdr } from '@/world/map/scifi';
import { bystanders } from '@/world/mp/bystanders';
import { resolveCollisions } from '@/world/mp/collide';
import type { AnimState } from '@/world/mp/protocol';

import { CHAMBER_DOOR, FLEE_SPOT, QUEUE_PLAYER, QUEUE_UNITS, chapter2, type Spot } from './chapter2';
import { gunshot, metalBang } from './sfx';
import { SLIDE_S, STUCK_MPS, STUCK_STOP, STUCK_TURN, contactSlide, steerAround } from './walk';

/* ─────────────────────────────── 굉음 ─────────────────────────────── */

function Bang() {
  const bang = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().bang, () => null);
  const light = useRef<THREE.PointLight>(null);
  useEffect(() => {
    if (bang) metalBang();
  }, [bang]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    if (!bang) {
      l.intensity = 0;
      return;
    }
    const age = (performance.now() - bang.at) / 1000;
    l.intensity = age < 0.5 ? 60 * (1 - age / 0.5) * (0.6 + 0.4 * Math.random()) : 0;
  });
  return <pointLight ref={light} position={[bang?.x ?? 0, 2.2, bang?.z ?? 0]} color="#ffd9a8" distance={14} decay={1.6} intensity={0} />;
}

/* ─────────────────────────────── 즉결 사격 ─────────────────────────────── */

/** 쓰러진 개체가 늘어나면 총성 한 번과 총구 섬광. 문 앞(검증대)에서 난다 */
function Executions() {
  const downed = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().queue?.downed ?? null, () => null);
  const count = downed ? Object.keys(downed).length : 0;
  const at = useRef(-Infinity);
  const light = useRef<THREE.PointLight>(null);
  useEffect(() => {
    if (count === 0) return;
    at.current = performance.now();
    gunshot();
  }, [count]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // 총구 섬광 — 세게, 그리고 벽에 한 번 되튄다 (2026-08-31 사용자: 화력 임팩트를 더 세게)
    const age = (performance.now() - at.current) / 1000;
    const k = age < 0.18 ? (1 - age / 0.18) ** 2 : 0;
    l.intensity = 260 * k + (age > 0.05 && age < 0.16 ? 40 * (1 - (age - 0.05) / 0.11) : 0);
  });
  return <pointLight ref={light} position={[CHAMBER_DOOR.x - 1.4, 1.7, CHAMBER_DOOR.z + 1.2]} color="#fff0c8" distance={24} decay={1.5} intensity={0} />;
}

/* ─────────────────────────────── 유도등 ─────────────────────────────── */

const CHEVRON = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.45, -0.3);
  s.lineTo(0, 0.05);
  s.lineTo(0.45, -0.3);
  s.lineTo(0.45, 0);
  s.lineTo(0, 0.35);
  s.lineTo(-0.45, 0);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();
const GUIDE_MAT = new THREE.MeshBasicMaterial({ color: hdr('#ffb04a', 0.9), toneMapped: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });

/**
 * 스폰 앞(z 1.5)에서 왼쪽으로 꺾어 벽을 따라 내려가 줄 끝(내 자리)까지. 단(마름모)을 피해 x −10.5 를 따른다.
 * 점마다 진행 방향으로 화살표를 돌린다. (홀을 다시 잡으면서 시작점이 z 4 → 1.5, 끝이 −13 → −18.4 로 내려왔다 — central/layout.ts)
 */
const GUIDE_PATH: Spot[] = [
  { x: -3, z: 1.5 },
  { x: -6, z: 0.5 },
  { x: -9, z: -1 },
  { x: -10.5, z: -4 },
  { x: -10.5, z: -7 },
  { x: -10.5, z: -10 },
  { x: -10.5, z: -13 },
  { x: -10.5, z: -16 },
  { x: QUEUE_PLAYER.x, z: QUEUE_PLAYER.z + 1.2 },
];

function GuideLights() {
  const on = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().march, () => false);
  const group = useRef<THREE.Group>(null);
  const items = useMemo(
    () =>
      GUIDE_PATH.map((p, i) => {
        const n = GUIDE_PATH[Math.min(i + 1, GUIDE_PATH.length - 1)];
        const q = GUIDE_PATH[Math.max(i - 1, 0)];
        const dx = n.x - q.x;
        const dz = n.z - q.z;
        return { p, yaw: Math.atan2(dx, dz) };
      }),
    [],
  );
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    g.visible = on;
    if (!on) return;
    const t = clock.getElapsedTime();
    g.children.forEach((c, i) => {
      const m = c as THREE.Mesh;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 4 - i * 0.9));
    });
  });
  return (
    <group ref={group} visible={false} name="유도등">
      {items.map(({ p, yaw }, i) => (
        <mesh key={i} geometry={CHEVRON} material={GUIDE_MAT.clone()} position={[p.x, 0.015, p.z]} rotation={[-Math.PI / 2, 0, -yaw + Math.PI]} />
      ))}
    </group>
  );
}

/* ─────────────────────────────── 줄 ─────────────────────────────── */

const WALK = 1.6;
/** 도망치는 몸은 뛴다 */
const FLEE_RUN = 4.4;
/** 쓰러지는 데 걸리는 시간 */
const FALL_MS = 520;
/** 줄에 선 몸이 돌아가야 하는 곳 — 홀 한가운데 코어 (walk.ts) */
const AVOID = [CORE_KEEPOUT];

function QueueUnit({ index }: { index: number }) {
  const mounted = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().queue !== null, () => false);
  const group = useRef<THREE.Group>(null);
  // slide/side/stuck 은 길 찾기 몫이다 — 벽에 닿으면 그 면을 따라 비껴 걷고(walk.ts), 못 나아가면 선다
  const st = useRef({ x: NaN, z: NaN, heading: 0, anim: 'idle' as AnimState, gone: false, slideX: 0, slideZ: 0, slide: 0, side: (index % 2 ? 1 : -1) as 1 | -1, stuck: 0 });
  const getAnim = useMemo(() => () => st.current.anim, []);
  const grounded = useMemo(() => () => false, []);
  const id = `queue:${index}`;
  useEffect(() => () => bystanders.drop(id), [id]);

  useFrame((_, delta) => {
    const g = group.current;
    // ★ 저장소를 프레임마다 직접 읽는다 — 스냅샷(useSyncExternalStore)은 리렌더 전까지 옛 값이라, 문에 닿은 프레임마다
    //   unitEntered 가 거듭 불려 검증 넷이 한꺼번에 굴러갔다 (2026-08-30)
    const q = chapter2.get().queue;
    if (!g || !q) return;
    const s = st.current;
    const dt = Math.min(delta, 0.1);
    // 사살됐다 — 그 자리에 쓰러진 채 남는다. 더 이상 목격자가 아니다(bystanders 에서 뺀다)
    const downAt = q.downed[index];
    if (downAt !== undefined) {
      g.visible = true;
      if (!s.gone) {
        s.gone = true;
        bystanders.drop(id);
      }
      const t = Math.min(1, (performance.now() - downAt) / FALL_MS);
      s.anim = 'idle';
      g.position.set(s.x, 0, s.z);
      g.rotation.set(0, s.heading, -(Math.PI / 2) * t * t);
      return;
    }
    if (index < q.done) {
      g.visible = false;
      if (!s.gone) {
        s.gone = true;
        bystanders.drop(id);
      }
      return;
    }
    g.visible = true;
    // 자리: 도망 중이면 바깥으로, 검증대에 나갔으면 문으로, 아니면 (내 순번 − 처리된 수) 번째 자리
    const fleeing = q.fleeing === index;
    const target = fleeing ? FLEE_SPOT : q.leaving === index ? CHAMBER_DOOR : q.spots[Math.min(q.spots.length - 1, index - q.done)];
    if (Number.isNaN(s.x)) {
      s.x = target.x;
      s.z = target.z;
    }
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    const d = Math.hypot(dx, dz);
    let anim: AnimState = 'idle';
    // 서 있을 땐 문(오른쪽 앞)을 본다
    let want = Math.atan2(CHAMBER_DOOR.x - s.x, CHAMBER_DOOR.z - s.z);
    if (d > 0.12) {
      /*
       * 직선으로 걷지 않는다 — 코어(AVOID)는 부딪히기 전에 돌아가고, 벽·가구는 경비와 같은 충돌판으로 막는다.
       * 전엔 충돌 판정이 아예 없어 **벽을 뚫고** 지나가거나 코어에 붙어 제자리 걸음을 했다 (2026-08-31 사용자)
       */
      const aim = steerAround(s.x, s.z, target.x, target.z, AVOID, s.side);
      const ux = s.slide > 0 ? s.slideX : aim.dx;
      const uz = s.slide > 0 ? s.slideZ : aim.dz;
      const step = Math.min(d, (fleeing ? FLEE_RUN : WALK) * dt);
      const bx = s.x + ux * step;
      const bz = s.z + uz * step;
      const hit = resolveCollisions(bx, bz, 0, undefined, COLLIDERS);
      const gone = Math.hypot(hit.x - s.x, hit.z - s.z);
      s.x = hit.x;
      s.z = hit.z;
      // 밀려났다 = 벽에 닿았다 → 접촉면을 따라 비껴 걸어 모서리를 돌아 나간다
      const px = hit.x - bx;
      const pz = hit.z - bz;
      const pl = Math.hypot(px, pz);
      if (pl > 1e-4) {
        const t = contactSlide(px / pl, pz / pl, aim.dx, aim.dz, s.slide > 0 ? { x: s.slideX, z: s.slideZ } : null, s.side);
        s.slideX = t.x;
        s.slideZ = t.z;
        s.slide = SLIDE_S;
      } else s.slide = Math.max(0, s.slide - dt);
      want = Math.atan2(ux, uz);
      // 막혀서 못 나아가면 걸음을 멈추고 선다. 더 오래 막히면 반대쪽으로 돌아 나간다 (AgentRobot 과 같은 규칙)
      s.stuck = gone < STUCK_MPS * dt ? s.stuck + dt : 0;
      anim = s.stuck > STUCK_STOP ? 'idle' : 'walk';
      if (s.stuck > STUCK_TURN) {
        s.side = (s.side * -1) as 1 | -1;
        s.slideX = -s.slideX;
        s.slideZ = -s.slideZ;
        s.stuck = 0;
      }
    } else {
      s.slide = 0;
      s.stuck = 0;
      if (q.leaving === index) chapter2.unitAtDoor();
    }
    let dh = want - s.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    s.heading += dh * Math.min(1, dt * (fleeing ? 10 : 6));
    s.anim = anim;
    g.position.set(s.x, 0, s.z);
    g.rotation.set(0, s.heading, 0);
    bystanders.set(id, s.x, s.z, s.heading);
  });

  if (!mounted) return null;
  return (
    <group ref={group} visible={false}>
      <RobotAvatar getAnim={getAnim} getAirborne={grounded} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.34, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Queue() {
  const q = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().queue, () => null);
  if (!q) return null;
  return (
    <Suspense fallback={null}>
      {QUEUE_UNITS.map((_, i) => (
        <QueueUnit key={i} index={i} />
      ))}
    </Suspense>
  );
}

/* ─────────────────────────────── 문 위 표식 ─────────────────────────────── */

function signTexture(text: string, alert: boolean): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#060c16';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = alert ? '#8ff0c8' : '#ff6a5a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = alert ? '#8ff0c8' : '#ffb3a8';
  ctx.font = `700 ${text.length > 16 ? 64 : 96}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function DoorSign() {
  const sign = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().sign, () => null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }), []);
  useEffect(() => {
    if (!sign) return;
    const tex = signTexture(sign, sign === 'VERIFIED');
    mat.map = tex;
    mat.needsUpdate = true;
    return () => tex?.dispose();
  }, [sign, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  if (!sign) return null;
  return (
    <mesh position={[0, DOOR.h + 0.95, FAR_Z + 0.14]} material={mat}>
      <planeGeometry args={[6.4, 1.0]} />
    </mesh>
  );
}

/* ─────────────────────────────── 트리거 ─────────────────────────────── */

function Track() {
  const camera = useThree((s) => s.camera);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const ph = chapter2.get().phase;
    if (ph === 'idle' || ph === 'done') return;
    camera.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    chapter2.track(camera.position.x, camera.position.z, dir.x / len, dir.z / len);
  });
  return null;
}

export function Chapter2Scene() {
  return (
    <group name="챕터 2 · 검증실로">
      <Bang />
      <Executions />
      <GuideLights />
      <Queue />
      <DoorSign />
      <Track />
    </group>
  );
}
