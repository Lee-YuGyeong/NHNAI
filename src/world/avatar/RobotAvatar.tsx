/**
 * 3D 아바타 — 휴머노이드 로봇 (public/world/robot.glb, Tripo 리깅 · 118k 삼각형 / 6MB).
 * 원본(Downloads 의 "휴머노이드 로봇 3D 모델.glb", 197만 삼각형 · 78MB)을 tools/robot-glb.sh 로 줄였다.
 *
 * ★ 이 GLB 에는 애니메이션 클립이 **하나도 없다** — 뼈대(Hip · Spine · Head · 팔다리)만 있다.
 *   그래서 idle · walk · jump · angry · agree 를 여기서 **뼈를 직접 돌려** 만든다 (절차적 애니메이션).
 *   자세는 모델 좌표계 기준 오일러각(도)으로 적고, 뼈마다 미리 재 둔 "부모의 정지 회전"으로 로컬 회전에
 *   얹는다 — Tripo 가 뼈 로컬축을 어떻게 잡았든 상관없다.
 *
 *   모델 좌표계: +Y 위 · +Z 정면 · +X 캐릭터의 왼쪽. 정지 자세는 T 포즈.
 *     Rx+  팔·다리는 뒤로, 척추·머리는 앞으로 숙임
 *     Ry+  +Z 가 +X 쪽으로 (왼쪽으로 돌기). 왼팔(+X)은 뒤로, 오른팔(-X)은 앞으로
 *     Rz+  +X 가 +Y 쪽으로. 왼팔은 올라가고 오른팔은 내려간다
 *   오른쪽 뼈는 왼쪽 값의 Ry·Rz 부호를 뒤집어 쓴다 (mirror).
 *
 * ★ 상태를 **prop 이 아니라 함수로** 받는다. 원격 플레이어의 anim 은 Map 안 객체를
 *   제자리 변형해서 갱신되므로 값으로 넘기면 입장할 때의 'idle' 이 영원히 굳는다.
 *   좌표를 useFrame 안에서 직접 읽는 것과 같은 규약으로 **매 프레임 물어본다.**
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { useAsset } from '../assets/loader';
import { EMOTE_MS, WALK_SPEED } from '../mp/constants';
import type { AnimState } from '../mp/protocol';

/** 아바타 키(m). 씬의 EYE_HEIGHT(1.62)와 눈높이가 맞도록 이 값으로 정규화한다 */
const TARGET_HEIGHT = 1.72;
/** 자세가 목표를 따라가는 시간 상수(초). 클립 사이 크로스페이드 역할이다 */
const TAU = 0.09;
/** 걷기 한 주기(두 걸음)/초. 허벅지 진폭 28° · 다리 0.9m 면 보폭 ≈ 1.7m/주기 → 1.5 주기 ≈ WALK_SPEED */
const WALK_CYCLE_HZ = WALK_SPEED / 1.72;
/** 팔을 내리고 섰을 때 위팔이 수평에서 내려간 각도 */
const ARM_HANG = 72;

type ClipName = AnimState | 'jump';

/* ─────────────────────────────── 뼈 · 자세 ─────────────────────────────── */

const BONES = [
  'Hip',
  'Spine01',
  'Spine02',
  'Head',
  'L_Upperarm',
  'L_Forearm',
  'R_Upperarm',
  'R_Forearm',
  'L_Thigh',
  'L_Calf',
  'R_Thigh',
  'R_Calf',
] as const;
type BoneName = (typeof BONES)[number];
const INDEX = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;
const MIRROR: readonly [BoneName, BoneName][] = [
  ['L_Upperarm', 'R_Upperarm'],
  ['L_Forearm', 'R_Forearm'],
  ['L_Thigh', 'R_Thigh'],
  ['L_Calf', 'R_Calf'],
];

/** 자세 하나. rot 은 뼈마다 [x, y, z] (도), hipY 는 엉덩이 높이 오프셋(모델 단위 — 키 0.98 기준) */
class Pose {
  readonly rot = new Float32Array(BONES.length * 3);
  hipY = 0;

  reset(): void {
    this.rot.fill(0);
    this.hipY = 0;
  }
  set(b: BoneName, x: number, y: number, z: number): void {
    const i = INDEX[b] * 3;
    this.rot[i] = x;
    this.rot[i + 1] = y;
    this.rot[i + 2] = z;
  }
  add(b: BoneName, x: number, y: number, z: number): void {
    const i = INDEX[b] * 3;
    this.rot[i] += x;
    this.rot[i + 1] += y;
    this.rot[i + 2] += z;
  }
  /** 왼쪽 팔다리 값을 오른쪽에 거울로 복사한다 (Ry · Rz 부호 반전) */
  mirror(): void {
    for (const [l, r] of MIRROR) {
      const a = INDEX[l] * 3;
      const b = INDEX[r] * 3;
      this.rot[b] = this.rot[a];
      this.rot[b + 1] = -this.rot[a + 1];
      this.rot[b + 2] = -this.rot[a + 2];
    }
  }
  /** 목표 자세로 k 만큼 다가간다 */
  follow(target: Pose, k: number): void {
    for (let i = 0; i < this.rot.length; i++) this.rot[i] += (target.rot[i] - this.rot[i]) * k;
    this.hipY += (target.hipY - this.hipY) * k;
  }
}

/* ─────────────────────────────── 클립 ─────────────────────────────── */

const TWO_PI = Math.PI * 2;

/** 0→1 부드럽게 (smoothstep) */
function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
/** 한 번 켜지는 클립의 세기 — 들어갈 때 attack 초, 끝나기 release 초 전부터 잦아든다 */
function envelope(t: number, duration: number, attack: number, release: number): number {
  return smooth(t / attack) * smooth((duration - t) / release);
}
/** at 근처에서 한 번 솟는 산 (폭 w) */
function pulse(t: number, at: number, w: number): number {
  return smooth(1 - Math.abs(t - at) / w);
}

/** 팔을 내리고 선 기본 자세. 모든 클립이 여기서 출발한다 */
function stand(out: Pose): void {
  out.reset();
  out.set('L_Upperarm', 0, -6, -ARM_HANG);
  out.set('L_Forearm', 0, -14, 0);
  out.mirror();
}

/**
 * 클립. t 는 이 상태에 들어온 뒤 흐른 초, clock 은 아바타가 태어난 뒤 흐른 초.
 * 걷기·숨쉬기 같은 반복 동작은 clock 으로 위상을 잡아 상태를 오가도 끊기지 않는다.
 */
type Clip = (t: number, clock: number, out: Pose) => void;

const CLIPS: Record<ClipName, Clip> = {
  idle(_t, clock, out) {
    stand(out);
    const breath = Math.sin(clock * 1.6);
    out.add('Spine02', 1.5 + 1.5 * breath, 0, 0);
    out.add('Head', 2 * Math.sin(clock * 1.6 + 1), 4 * Math.sin(clock * 0.6), 0);
    out.add('L_Upperarm', 0, 0, 1.5 * breath);
    out.add('R_Upperarm', 0, 0, -1.5 * breath);
  },

  walk(_t, clock, out) {
    stand(out);
    const p = clock * WALK_CYCLE_HZ * TWO_PI;
    const s = Math.sin(p);
    const c = Math.cos(p);
    // 다리: 왼다리가 앞(-Rx)일 때 오른다리는 뒤. 무릎은 앞으로 내딛는 중(cos>0)에 접힌다
    out.set('L_Thigh', -28 * s, 0, 0);
    out.set('R_Thigh', 28 * s, 0, 0);
    out.set('L_Calf', 32 * Math.max(0, c), 0, 0);
    out.set('R_Calf', 32 * Math.max(0, -c), 0, 0);
    // 팔은 반대쪽 다리와 같이 — 왼다리 앞이면 왼팔 뒤(+Rx)
    out.add('L_Upperarm', 22 * s, 0, 0);
    out.add('R_Upperarm', -22 * s, 0, 0);
    out.add('L_Forearm', 0, -8 * Math.max(0, -s), 0);
    out.add('R_Forearm', 0, 8 * Math.max(0, s), 0);
    out.add('Spine01', 4, 4 * s, 0);
    out.add('Head', -2, -3 * s, 0);
    out.hipY = -0.012 * (0.5 - 0.5 * Math.cos(2 * p));
  },

  /** 달리기(검문소의 군인 몸에만 클립이 있다) — 로봇은 걷는 것으로 그린다 */
  run(t, clock, out) {
    CLIPS.walk(t, clock, out);
  },

  jump(t, _clock, out) {
    stand(out);
    const tuck = smooth(t / 0.15);
    out.set('L_Thigh', -35 * tuck, 0, 4);
    out.set('L_Calf', 55 * tuck, 0, 0);
    out.set('L_Upperarm', -12 * tuck, 0, -ARM_HANG + 30 * tuck);
    out.set('L_Forearm', 0, -25 * tuck, 0);
    out.mirror();
    out.add('Spine02', 8 * tuck, 0, 0);
  },

  /** 화남 — 주먹 쥔 두 팔을 얼굴 옆에 올리고 부들부들, 발을 두 번 구른다 */
  angry(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.angry / 1000;
    const e = envelope(Math.min(t, D), D, 0.14, 0.4);
    const shake = Math.sin(t * TWO_PI * 11);
    out.add('Spine01', 7 * e, 0, 0);
    out.add('Spine02', 16 * e, 0, 0);
    out.add('Head', 12 * e, 9 * e * Math.sin(t * TWO_PI * 5.5), 0);
    // 팔: 위팔은 앞·아래로(Ry·Rz), 팔꿈치를 세워 주먹이 어깨 높이 가슴 앞에 온다. 그 상태로 부들거린다
    out.set('L_Upperarm', 5 * e * Math.sin(t * TWO_PI * 11 + 1), -70 * e, -ARM_HANG + (ARM_HANG - 30) * e);
    out.set('L_Forearm', 0, -14 + 4 * e, (105 + 9 * shake) * e);
    out.set('L_Thigh', 0, 0, 7 * e);
    out.set('L_Calf', 5 * e, 0, 0);
    out.mirror();
    // 발 구르기: 오른발 두 번
    const stomp = pulse(t, 0.55, 0.2) + pulse(t, 1.35, 0.2);
    out.add('R_Thigh', -42 * stomp, 0, 0);
    out.add('R_Calf', 58 * stomp, 0, 0);
    out.hipY = -0.03 * (pulse(t, 0.78, 0.14) + pulse(t, 1.58, 0.14)) * e;
  },

  /** 동의 — 고개를 끄덕이고 오른손을 엄지 척 자세로 올린다 */
  agree(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.agree / 1000;
    const e = envelope(Math.min(t, D), D, 0.16, 0.35);
    const nod = (0.5 - 0.5 * Math.cos(t * TWO_PI * 2.1)) * e;
    out.add('Head', 16 * nod, 0, 0);
    out.add('Spine02', 3 * nod, 0, 0);
    // 오른팔만 — 위팔은 몸 옆에 둔 채 앞으로, 팔뚝은 세워서 손이 가슴 높이에 (엄지 척)
    out.set('R_Upperarm', -6 * e, 45 * e, ARM_HANG - 6 * e);
    out.set('R_Forearm', 0, 14 - 6 * e, -112 * e);
    out.hipY = -0.006 * nod;
  },
};

/* ─────────────────────────────── 컴포넌트 ─────────────────────────────── */

interface RigBone {
  bone: THREE.Object3D;
  /** 정지 자세의 로컬 회전 */
  rest: THREE.Quaternion;
  restPos: THREE.Vector3;
  /** 부모의 정지 월드 회전 (모델 좌표계). 모델 좌표계 회전 R 을 로컬로 옮길 때 Qp⁻¹ · R · Qp */
  fromParent: THREE.Quaternion;
  toParent: THREE.Quaternion;
}

const DEG = Math.PI / 180;
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export function RobotAvatar({
  getAnim,
  getAirborne,
}: {
  getAnim: () => AnimState;
  /** 공중에 떠 있나. 점프 클립을 켜는 조건이다 (높이로만 판단) */
  getAirborne: () => boolean;
}) {
  const gltf = useAsset('robot');

  /*
   * ★ 씬을 그대로 쓰면 안 된다. useGLTF 는 같은 파일에 하나의 인스턴스를 캐시하므로
   *   여러 명이 같은 뼈대를 공유해 한 사람이 걸으면 전원이 같이 걷는다.
   */
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);

  /**
   * 모델 실제 키를 재서 TARGET_HEIGHT 로 맞추고, 뼈마다 정지 자세를 기억해 둔다.
   * ★ updateMatrixWorld(true) 를 먼저 부른다 — SkinnedMesh 의 스킨 먹인 실제 크기와
   *   부모 뼈의 월드 회전 둘 다 matrixWorld 가 채워져 있어야 잴 수 있다.
   *   여기서 scene 은 아직 트리 밖이라 월드 = 모델 좌표계다.
   */
  const { scale, rig } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    const scale = Number.isFinite(h) && h > 1e-4 ? TARGET_HEIGHT / h : 1;

    const byName = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      byName.set(o.name, o);
      // 뼈가 움직이면 정지 자세로 잰 경계구가 틀려 화면 가장자리에서 사라진다
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    const rig: (RigBone | null)[] = BONES.map((name) => {
      const bone = byName.get(name);
      if (!bone || !bone.parent) {
        console.warn(`[RobotAvatar] 뼈 ${name} 이 GLB 에 없다 — 이 부위는 움직이지 않는다`);
        return null;
      }
      const fromParent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      return {
        bone,
        rest: bone.quaternion.clone(),
        restPos: bone.position.clone(),
        fromParent,
        toParent: fromParent.clone().invert(),
      };
    });
    return { scale, rig };
  }, [scene]);

  const current = useMemo(() => {
    const p = new Pose();
    stand(p);
    return p;
  }, []);
  const target = useMemo(() => new Pose(), []);
  const state = useRef<{ name: ClipName; since: number; clock: number }>({ name: 'idle', since: 0, clock: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = state.current;
    st.clock += dt;

    const next: ClipName = getAirborne() ? 'jump' : getAnim();
    if (next !== st.name) {
      st.name = next;
      st.since = st.clock;
    }

    CLIPS[next](st.clock - st.since, st.clock, target);
    current.follow(target, 1 - Math.exp(-dt / TAU));

    // 자세 → 뼈. 모델 좌표계 회전을 부모 정지 회전으로 감싸 로컬에 얹는다
    for (let i = 0; i < rig.length; i++) {
      const r = rig[i];
      if (!r) continue;
      const k = i * 3;
      _euler.set(current.rot[k] * DEG, current.rot[k + 1] * DEG, current.rot[k + 2] * DEG, 'XYZ');
      _q.setFromEuler(_euler);
      r.bone.quaternion.copy(r.toParent).multiply(_q).multiply(r.fromParent).multiply(r.rest);
    }
    const hip = rig[INDEX.Hip];
    if (hip) {
      _v.set(0, current.hipY, 0).applyQuaternion(hip.toParent);
      hip.bone.position.copy(hip.restPos).add(_v);
    }
  });

  return (
    <group scale={scale}>
      {/* 발끝이 +z 를 향하는 모델이라 +z 가 정면이다. heading = atan2(x, z) 규약과 맞는다 */}
      <primitive object={scene} rotation-y={0} />
    </group>
  );
}
