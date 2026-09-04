/**
 * 개체 하나의 **몸** — 성격마다 다른 GLB 하나를 세운다 (기획서 「어디가 닳았나」).
 *
 * 자세는 프롬프트가 이미 만들어 냈고(제 손을 내려다본다 · 등을 세운다 · 따라 하느라 어정쩡하다),
 * 나머지는 서 있는 자리와 바라보는 방향이 말한다 (Room2Scene).
 *
 * ★ **지금은 열 장 전부 뼈와 클립을 들고 있다** (2026-09-03 확인: public/world/cast2/*.glb 열 장에
 *   preset:biped:idle · preset:biped:walk 둘 다, skins 1). 2026-09-03 아침까지는 animations 0 · skins 0 이라
 *   걷는 몸이 정지 포즈로 미끄러졌고, 그날 리그 작업(tools/scenario2-cast-rig.sh)이 열 장을 다 채웠다.
 *   그래도 파일을 보고 판단하는 분기(gltf.animations)는 **남겨 둔다** — 몸이 새로 들어올 때의 보험이다.
 *
 * ★ 클립이 **1 도 돈다.** 진폭은 Tripo 리타깃이 아니라 이 저장소가 코드로 구운 값이다
 *   (tools/cast-anim-synth.mjs 의 IDLE = { period 4.0, fps 12, spine 1.0, sway 0.5, arm 1.0, lift 0.003 }):
 *   척추 ±1° · 무게 이동 ±0.5° · 루트 3 mm. 헤드리스로 12 초를 재니 서 있는 몸의 머리가 월드에서 0.02 m 밖에
 *   안 흔들렸다. 「idle 클립은 돈다. 다만 1 도 돈다」 — 6 m 밖에서는 정지와 구별이 안 된다.
 *   **그래서 act 층(activity.ts)이 필요했다**: 클립이 뼈를 1 도 움직이는 위에, 하던 일이 몸을 3~10 도 움직인다.
 *   그 사실이 이 파일에 적혀 있어야 다음 사람이 「클립이 있는데 왜 안 움직이지」로 헤매지 않는다.
 *
 * ★ 그래서 **둘 다 둔다.** 클립이 있으면 mixer 가 걸음을 그리고(아래 mixer 경로 — 루트모션 제거까지),
 *   숨·무게 이동·버릇은 클립이 있어도 그룹 변형으로 얹는다(클립의 1 도로는 모자라서다 — 아래 절차 idle 의 ★).
 *   걸을 때의 근사만 여전히 `!mixer` 다: 걷는 클립은 실제로 걷고, 거기 또 흔들면 두 박자가 싸운다.
 *
 * ★ 마모는 **얹지 않는다.** 여기서 하는 것은 재질을 복제해 색을 곱하는 것(tint) 하나뿐이다.
 *   2026-09-03 아침까지는 수선 부품 · 얼굴판의 금 · 손끝의 안료 · 총을 납작한 상자로 얹고, 그 상자를 광선으로 몸 표면까지 밀어
 *   앉히기까지 했다. 그런데 이 열 장은 **그것들을 이미 모델링해 들고 있다** — 두 번 그린 결과가 근접에서 얼굴 앞에 뜬 주황 막대 셋이었고,
 *   사용자가 본 것이 그것이다 (「왜 glb 에 상자를 달고 다니는지 이해가 안 돼」). 표면 광선도 조각도 같이 지웠다: 얹을 것이 없으면 밀 것도 없다.
 *   몸이 서로 갈리는 것은 이제 **몸 자체**와 그 위의 색이다 (wear.ts).
 *
 * 모델마다 크기가 제각각이라(Tripo 는 대략 1.0 높이로 준다) **재는 것부터 한다**:
 * 실제 높이를 재서 목표 키로 맞추고, 바닥이 y=0 에 오도록 내린다. 안 그러면 발이 땅에 묻히거나 뜬다.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { attachRifle, buildRig, type Rig } from '@/features/world/enforcerPose';
import { makeMuzzle } from '@/features/world/muzzle';
import { useAsset } from '@/world/assets/loader';
import type { AssetId } from '@/world/assets/manifest';
import type { AnimState } from '@/world/mp/protocol';

import { actGain, actOn, actPose, type ActPose } from './activity';
import type { Act } from './cast';
import type { Dress } from './wear';

/** 참가자 아바타와 같은 키(m) — 개체는 이 값을 기준으로 크고 작다. wear.ts 의 조각 좌표도 이 키 기준이다 */
const BASE_HEIGHT = 1.72;
/**
 * 모델(+x 를 본다)을 +z 를 보게 — 겉 그룹의 heading 계산이 +z 기준이다 (본판 Enforcer 의 MODEL_YAW 과 같은 값).
 *
 * ★ 2026-09-03 — 이 줄이 **없었다.** cast2 열 장은 심문 AI 와 같은 Tripo 출력이라 전부 +x 를 보는데, Unit 은 그 몸을
 *   heading(atan2(dx,dz) · 0 = +z)으로 돌리고 있었다. 그래서 「자기 그림 앞에 선 것」도 「문만 보는 것」도 **90 도 옆을
 *   보고** 있었다 (근접 촬영에서 전부 옆모습이었다 — 총 든 것만 제대로 앞을 봤는데, 그 몸이 EnforcerBody 라 이 회전을
 *   이미 갖고 있었다). 자리표(Room2Scene)가 `look(여기, 벽화)` 로 적어 둔 방향이 곧 그 개체가 누구인지인데 그게 안 맞고 있었다.
 */
const MODEL_YAW = -Math.PI / 2;
/** 클립 사이를 건너는 시간(초) — 걷다 서는 것이 툭 끊기면 기계가 아니라 오류로 보인다 */
const FADE = 0.22;
/** Tripo 프리셋 이름 — 구울 때 준 이름 그대로다 (tools/scenario2-cast-rig.sh). **열 장 전부 이 둘을 들고 있다** (2026-09-03 확인) */
const CLIP: Record<'idle' | 'walk', string> = { idle: 'preset:biped:idle', walk: 'preset:biped:walk' };

/** 숨 · 무게 이동의 기본 각속도(rad/s) — IdleProfile.rate 가 곱해진다 */
const BREATH_W = 1.6;
const SWAY_W = 0.35;
/** 손 확인 — 6~9 초마다 1 초, pitch 를 이만큼 더 꺾는다 (0.16 → 0.24 의 차) */
const HAND_CHECK_EVERY: readonly [number, number] = [6, 9];
const HAND_CHECK_S = 1;
const HAND_CHECK_PITCH = 0.08;
/** 자세 바꾸기 — 4~7 초마다 기대는 쪽(roll 부호)을 바꾼다. wear 의 lean.roll(+0.04)이 몸 그룹에 걸려 있으니 여기서 −0.08 을 더하면 반대쪽이다 */
const FLIP_EVERY: readonly [number, number] = [4, 7];
const COPY_ROLL = 0.04;
/**
 * 걷기 근사 — heading 방향으로 2 Hz · 2 cm 흔들리고 진행 방향으로 0.04 숙인다.
 * ★ **지금은 여기 도달하지 않는다** — cast2 열 장이 전부 walk 클립을 들고 있어 mixer 가 늘 non-null 이다
 *   (아래 `walking && !mixer` 갈래). 지우지 않는 이유는 클립 없는 GLB 가 새로 들어올 때의 보험이라서다.
 */
const BOB_M = 0.02;
const BOB_HZ = 2;
const WALK_PITCH = 0.04;
/** 자세 변화가 되돌아오는 속도 — 걷다 서는 것, 손 확인이 끝나는 것 */
const SETTLE = 6;
/**
 * **기대는 쪽이 넘어가는 속도** — 0.7 초쯤에 걸쳐 넘어간다 (1/1.4).
 *
 * 2026-09-03: 자세 바꾸기(flipSign)가 여태 **한 프레임에 툭** 옮겨졌다. roll 은 s.pitch·s.bob 과 달리
 * 완화를 안 거치고 매 프레임 새로 계산돼 g.rotation.z 로 바로 나갔기 때문이다 — flip 이 켜진 몸은
 * 4~7 초마다 −2·COPY_ROLL(0.08 rad · 4.6°)이 붙었다 떼졌고, 머리(1.6 m) 기준으로 13 cm 짜리 계단이었다.
 * 절차 idle 이 화면에서 유일하게 눈에 띄던 것이 하필 그 「팝」이었고, 벽을 따라 선 열여섯이 한꺼번에
 * 그것을 하면 흔들림이 아니라 동시다발 팝이 된다 (2026-09-03 사용자: 「자연스럽게 움직이게 해줘야지」).
 *
 * ★ 고치는 것은 **「얼마나」가 아니라 「어떻게」**다. 진폭 4.6° 는 그대로 둔다 — 그 값을 건드리면
 *   스무 몸의 인상이 한꺼번에 바뀌고, 시험은 상대비만 보므로 그걸 안 잡아 준다.
 * ★ SETTLE(6 · 0.17 초)을 쓰면 여전히 튄다. 4.6°/0.7 초 ≈ 6.6°/s 라 한 프레임에 0.22° —
 *   그 정도면 눈에 「움직였다」로 안 보이고 「자세를 바꿨다」로 보인다.
 * ★ 이름이 COPY_ROLL 이지만 flip 은 **버릇 다섯 전부**(default · hands · copy · still · guard)에 붙는다
 *   (wear.ts 의 IdleProfile.flip). wear.dress 가 lean.roll 로 상쇄해 주는 것은 stance 'copy' 하나뿐이다.
 */
const ROLL_SETTLE = 1.4;

const between = (lo: number, hi: number, r: number) => lo + (hi - lo) * r;

/* ─────────────────────────────── 하던 일을 뼈에 얹는다 ─────────────────────────────── */

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qd = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const vw = new THREE.Vector3();

/**
 * 뼈마다 「클립이 그린 값(base)」과 「내가 써 넣은 값(written)」 — 몸 하나에 한 벌 (useMemo).
 *
 * ★ 이게 없으면 **Δ 가 프레임마다 쌓인다.** mixer 는 자기 클립에 트랙이 있는 뼈만 다시 그리는데,
 *   Tripo 프리셋은 척추·머리에 트랙이 없는 몸이 있다(u137). 거기에 매 프레임 Δ 를 곱하면 3 도짜리 흔들림이
 *   1 초 만에 100 도가 된다 — 헤드리스로 재니 그 몸의 머리가 제자리에서 0.5 m 짜리 호를 그리고 있었다.
 *   그래서 **내가 쓴 값이 그대로 남아 있으면 base 를 지키고, 클립이 새로 그렸으면 그 값을 base 로 삼는다.**
 */
interface LayerState {
  base: Map<THREE.Bone, THREE.Quaternion>;
  written: Map<THREE.Bone, THREE.Quaternion>;
}

/**
 * 뼈 하나에 **모델축 Δ 를 덧댄다** — 클립이 그린 자세 위에 곱한다.
 * 클립이 먼저 걷고 숨 쉬고, 하던 일은 그 위에 얹힌다 — 두 박자가 안 싸운다.
 * 축은 심문 AI 리그와 같다 (앞 +x · 위 +y · 오른쪽 +z) — 같은 Tripo biped 라 좌표계가 같다.
 */
function layer(st: LayerState, rig: Rig, bone: THREE.Bone | null | undefined, x: number, y: number, z: number): void {
  if (!bone) return;
  const b = rig.bind.get(bone);
  if (!b) return;
  let base = st.base.get(bone);
  const written = st.written.get(bone);
  if (!base) {
    base = bone.quaternion.clone();
    st.base.set(bone, base);
  } else if (!written || Math.abs(written.dot(bone.quaternion)) < 1 - 1e-8) {
    // 내가 쓴 값이 아니다 — 클립이 이 프레임에 다시 그렸다. 그 값이 새 바탕이다
    base.copy(bone.quaternion);
  }
  qd.identity();
  if (x !== 0) qd.premultiply(qa.setFromAxisAngle(AX, x));
  if (y !== 0) qd.premultiply(qa.setFromAxisAngle(AY, y));
  if (z !== 0) qd.premultiply(qa.setFromAxisAngle(AZ, z));
  qb.copy(b.relInv).multiply(qd).multiply(b.rel);
  bone.quaternion.copy(base).multiply(qb);
  let w = st.written.get(bone);
  if (!w) {
    w = new THREE.Quaternion();
    st.written.set(bone, w);
  }
  w.copy(bone.quaternion);
}

/**
 * 쓸 수 있는 팔인가 — **Tripo 리그는 팔을 엉뚱한 데서 잡아 오기도 한다.**
 * buildRig 는 「다리를 뺀 말단 중 좌우로 가장 먼 둘」을 손으로 보는데, 팔이 하나만 리깅된 몸(u137)에서는
 * 반대쪽으로 **척추·머리 사슬**을 집는다. 그 사슬에 팔 각도를 얹으면 팔이 아니라 머리가 돌아간다.
 * 그래서 몸통·머리·엉덩이가 섞인 사슬은 안 쓴다 — 없는 팔은 없는 대로 둔다 (그리는 손은 어차피 하나다).
 */
function armOf(rig: Rig, arm: readonly THREE.Bone[]): THREE.Bone[] | null {
  if (arm.length < 2) return null;
  const spine = new Set<THREE.Object3D>([rig.hips, rig.torso, rig.head].filter(Boolean) as THREE.Object3D[]);
  return arm.some((b) => spine.has(b)) ? null : [...arm];
}

/** 한 프레임 — 몸통 · 고개 · 두 팔. k 는 붙는 정도(0~1)라 말을 걸면 이 값이 0 으로 내려가며 손이 내려온다 */
function applyAct(st: LayerState, rig: Rig, p: ActPose, k: number): void {
  layer(st, rig, rig.torso, p.torso.roll * k, p.torso.yaw * k, -p.torso.pitch * k);
  layer(st, rig, rig.head, 0, p.head.yaw * k, -p.head.pitch * k);
  /*
   * ★ **팔은 안 돌린다** (2026-09-03 사용자 스크린샷: 「몸이 갈라지거나 그리는 모습이 이상하다」).
   *   Tripo 자동 리그의 팔은 셋 다 못 믿는다 — u089 는 뼈가 한 점에 뭉쳐 팔이 아예 없고, u137 은 팔이 하나뿐이라
   *   반대쪽으로 엉뚱한 사슬을 잡고, 팔이 있는 몸도 어깨 가중치가 성겨서 30° 만 들어도 **스킨이 찢어져** 팔뚝이 몸에서 떨어져 나간다.
   *   프레임에서 확인한 그림이 그거였다: 벽 옆에 손이 떠 있고 어깨가 뾰족한 가시로 늘어났다.
   *   그리는 시늉은 몸통·고개·기울기로만 낸다 — 그것으로 못 하는 동작(손을 벽에 대는 것)은 **클립으로 구워야** 한다.
   *   arms 는 총을 붙일 때(Rifle) 여전히 쓴다 — 손 뼈에 매다는 것은 회전이 아니라 부모 바꾸기라 안 찢어진다.
   */
}

/**
 * 손에 든 총 — `look.rifle` 인 몸(총 든 개체 guard21)만.
 *
 * 이 값은 cast.ts 에 적혀만 있고 **읽는 데가 없었다.** 그래서 복도의 UNIT-21 은 다른 개체와 같은 빈손이었는데,
 * 대화창은 그 개체의 말에 총을 든 초상(portrait-enforcer)을 붙이고 대사도 심문조였다 —
 * 「말을 거는 것」과 「화면에 있는 것」이 안 맞는다 (2026-09-03 사용자: 「트리거는 총든객체 이미지인데 캐릭터는없어」).
 *
 * 몸에 총을 모델링해 넣지 않는다 — 열 장을 다시 굽는 일이고, 총은 이미 따로 있다(enforcer_rifle.glb, 심문 AI 의 것).
 * 붙이는 자리는 **오른손 뼈**다. 뼈 이름은 안 믿는다: Tripo 자동 리그는 좌우·팔다리 이름표가 뒤섞여 있어서
 * 바인드 자세의 **자리**로 사슬을 찾는 심문 AI 쪽 길(enforcerPose.buildRig)을 그대로 쓴다 — 같은 Tripo biped 리그다.
 * 총은 손 뼈의 자식이라 걷기·서기 클립을 그대로 따라간다. 뼈가 없는 몸(아직 리깅 안 된 GLB)에는 buildRig 가 null 이라 안 붙는다.
 */
function Rifle({ body, scale, getFlashAt }: { body: THREE.Object3D; scale: number; getFlashAt?: () => number }) {
  const gltf = useAsset('enforcer_rifle');
  const muzzle = useMemo(() => makeMuzzle(scale), [scale]);
  useEffect(() => {
    const rig = buildRig(body);
    if (!rig) return;
    const rifle = gltf.scene.clone(true);
    attachRifle(rig, rifle);
    muzzle.attach(rifle);
    return () => {
      muzzle.detach();
      rifle.removeFromParent();
    };
  }, [body, gltf.scene, muzzle]);
  // 한 발 — 없는 프레임에는 세기 0 이라 그냥 꺼져 있다
  useFrame(() => muzzle.update(getFlashAt?.() ?? -Infinity, performance.now()));
  return null;
}

export function CastBody({
  asset,
  rifle,
  getFlashAt,
  height = BASE_HEIGHT,
  getAnim,
  getAlive,
  getAttending,
  act,
  dress,
  seed = 0,
  tag,
}: {
  asset: AssetId;
  /** 총을 들고 있나 — cast.ts 의 look.rifle. 오른손 뼈에 enforcer_rifle.glb 를 붙인다 */
  rifle?: boolean;
  /** 마지막 발사 시각(performance.now) — 총구가 이 수를 보고 핀다. 안 주면 영영 안 쏜다 (순찰하는 몸) */
  getFlashAt?: () => number;
  height?: number;
  /** 매 프레임 물어본다 — 값으로 받으면 마운트할 때의 'idle' 이 그대로 굳는다 (RobotAvatar 와 같은 규약) */
  getAnim?: () => AnimState;
  /** 매 프레임 — false 면 절차 idle 이 멎는다 (자는 것 · 불로 가는 것 · 멈칫하는 것). 안 주면 산다 */
  getAlive?: () => boolean;
  /**
   * 매 프레임 — true 면 **하던 일을 멈춘다.** 말을 걸었을 때 그 개체가 나를 보는 동안이다 (attitude.attending).
   * 손은 0.3 초에 내려온다 (activity 의 ACT_OUT_S). 몸이 도는 것은 여기가 아니라 heading 쪽이다 (Unit)
   */
  getAttending?: () => boolean;
  /** 하던 일 — 그리는 것 · 읽는 것 · 문을 보는 것 · 기다리는 것 (activity.ts). 안 주면 아무것도 안 얹는다 */
  act?: Act;
  /** 얹을 것 — 없으면 GLB 그대로 (틴트도 조각도 버릇도 없다) */
  dress?: Dress | null;
  /** 위상 — 같은 버릇의 몸 둘이 같은 박자로 숨 쉬면 기계다. Unit 이 id 해시를 준다 */
  seed?: number;
  /** 확인용 이름 — DEV 에서 window.__s2act 에 손·머리 자리를 적는다 (헤드리스가 폭을 잰다). 화면에는 안 쓰인다 */
  tag?: string;
}) {
  const gltf = useAsset(asset);

  /*
   * 씬을 그대로 쓰면 안 된다 — useAsset 은 파일 하나에 인스턴스 하나를 캐시하므로,
   * 같은 몸을 두 방에서 쓰면 한쪽을 옮길 때 다른 쪽도 같이 움직인다.
   * 뼈가 붙는 날을 위해 **SkeletonUtils.clone** 으로 둔다: 보통 clone 은 스킨 메시를 원본 뼈에 그대로 묶어 둔다. 뼈 없는 메시에도 그냥 clone 이다.
   */
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);

  /*
   * 재는 것부터. **뼈가 붙은 몸은 Box3.setFromObject 로 못 잰다** — 그건 지오메트리를 노드 행렬로만 옮겨 보고
   * 스키닝은 안 본다. 리깅을 거치면 메시가 다른 노드 밑으로 들어가 있어서, 그 값이 실제로 보이는 자리와
   * 0.5 m 씩 어긋난다 (2026-09-02 — 리깅 시험본이 허리까지 바닥에 묻혔다).
   * SkinnedMesh.computeBoundingBox 는 지금 자세로 뼈를 먹여 재 준다. 그것이 있으면 그것을 쓴다.
   * ★ 그 전에 **skeleton.update()** 를 부른다 — 뼈 행렬(boneMatrices)은 렌더러가 프레임마다 채우는 것이라 첫 렌더 전엔 전부 0 이고,
   *   0 을 먹인 정점은 전부 원점에 모여 높이가 0 → 배율 1 → 몸이 제 크기(0.7 m 남짓)로 선다 (2026-09-03 — 리그 들어온 guard21 이 아이만 했다).
   */
  const fit = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let skinnedFound = false;
    scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.skeleton.update();
      sm.computeBoundingBox();
      if (!sm.boundingBox) return;
      skinnedFound = true;
      box.union(sm.boundingBox.clone().applyMatrix4(sm.matrixWorld));
    });
    if (!skinnedFound) box.setFromObject(scene);
    const h = box.max.y - box.min.y;
    const s = Number.isFinite(h) && h > 1e-4 ? height / h : 1;
    // 바닥을 y=0 으로 — 재고 나서 내린다. 모델마다 원점이 배꼽이기도 하고 발바닥이기도 하다
    return { scale: s, lift: -box.min.y * s };
  }, [scene, height]);

  /*
   * 틴트 — 재질을 **복제해서** 곱한다. 클론 씬은 지오메트리·재질을 원본과 공유하므로 원본에 곱하면 캐시가 물들어 다음 방의 같은 몸도 어둡다.
   * 정리에서 복제본을 버리고 원본을 되돌린다 — StrictMode 의 마운트 → 정리 → 마운트에서 두 번 곱해지지 않는 이유가 이 되돌림이다.
   */
  const tint = dress?.tint ?? null;
  useEffect(() => {
    if (!tint || (tint.r === 1 && tint.g === 1 && tint.b === 1)) return;
    const restore: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
    const clones: THREE.Material[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = Array.isArray(m.material) ? m.material : [m.material];
      const mine = src.map((mat) => {
        const c = mat.clone();
        const col = (c as THREE.MeshStandardMaterial).color;
        if (col?.isColor) col.multiply(tint);
        clones.push(c);
        return c;
      });
      restore.push({ mesh: m, material: m.material });
      m.material = Array.isArray(m.material) ? mine : mine[0];
    });
    return () => {
      for (const r of restore) r.mesh.material = r.material;
      for (const c of clones) c.dispose();
    };
  }, [scene, tint]);

  /*
   * 하던 일이 쓸 뼈 — **클론이 갓 만들어진 자리에서** 잰다. buildRig 는 지금 자세를 바인드로 삼는데,
   * effect 에서 부르면 mixer 가 이미 한 프레임 그려 놓은 자세를 바인드로 잡는다 (Rifle 은 손 뼈만 쓰니 상관없었다).
   * 못 찾으면 null 이다 — u089 의 리그가 그렇다: 뼈가 전부 한 점에 겹쳐 있어 사슬이 안 풀린다. 그런 몸은 아래에서 **몸째** 움직인다.
   */
  const rig = useMemo(() => (act ? buildRig(scene) : null), [act, scene]);
  const arms = useMemo(() => (rig ? { l: armOf(rig, rig.armL), r: armOf(rig, rig.armR) } : { l: null, r: null }), [rig]);
  const layers = useMemo<LayerState>(() => ({ base: new Map(), written: new Map() }), [rig]);

  /*
   * 클립. 없으면 mixer 가 null 이고 아래 절차 근사가 대신한다.
   * 걸음은 **제자리 걸음**이라야 한다: 클립에 루트 모션이 들어 있으면 patrol 이 옮기는 자리와 겹쳐 두 배로 나간다.
   * 그래서 Hip 의 수평 이동만 프레임마다 지운다.
   */
  const mixer = useMemo(() => (gltf.animations.length > 0 ? new THREE.AnimationMixer(scene) : null), [gltf.animations.length, scene]);
  const actions = useMemo(() => {
    if (!mixer) return null;
    const find = (name: string) => gltf.animations.find((c) => c.name === name) ?? null;
    const make = (name: string) => {
      const clip = find(name);
      return clip ? mixer.clipAction(clip) : null;
    };
    return { idle: make(CLIP.idle), walk: make(CLIP.walk) };
  }, [gltf.animations, mixer]);

  const cur = useRef<'idle' | 'walk'>('idle');
  const root = useRef<THREE.Object3D | null>(null);
  const rest = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!actions) return;
    actions.idle?.reset().play();
    // 루트(가장 위 뼈)의 정지 위치를 재 둔다 — 걸을 때 여기로 되돌린다
    const skinned = scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh | undefined;
    const bone = skinned?.skeleton?.bones?.[0] ?? null;
    root.current = bone;
    rest.current = bone ? bone.position.clone() : null;
    return () => {
      actions.idle?.stop();
      actions.walk?.stop();
    };
  }, [actions, scene]);

  /** 절차 근사의 상태 — 시계 · 손 확인 · 자세 바꾸기 · 되돌아오는 값들 */
  const anim = useRef<THREE.Group>(null);
  const pr = useRef({
    t: seed * 7.31,
    handAt: between(HAND_CHECK_EVERY[0], HAND_CHECK_EVERY[1], (seed * 0.37) % 1),
    handUntil: -1,
    flipAt: between(FLIP_EVERY[0], FLIP_EVERY[1], (seed * 0.61) % 1),
    flipSign: seed % 2 === 0 ? 1 : -1,
    pitch: 0,
    bob: 0,
    /** 지금 기울어진 각(rad) — 목표값으로 ROLL_SETTLE 에 걸쳐 넘어간다 (한 프레임에 툭 옮기지 않으려고) */
    roll: 0,
    /** 하던 일이 붙은 정도 0~1 · 지금 앞뒤로 옮겨진 거리(m) */
    act: 0,
    lean: 0,
  });

  // DEV 손잡이는 몸이 사라질 때 같이 지운다 — 앞 방의 손 자리가 남아 있으면 헤드리스가 안 움직이는 팔을 움직였다고 센다
  useEffect(() => {
    if (!import.meta.env.DEV || !tag || typeof window === 'undefined') return;
    return () => {
      delete (window as unknown as { __s2act?: Record<string, unknown> }).__s2act?.[tag];
    };
  }, [tag]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const g = anim.current;
    const idle = dress?.idle;
    if (g) {
      const s = pr.current;
      s.t += dt;
      const walking = getAnim?.() === 'walk';
      const alive = getAlive?.() ?? true;
      let sy = 1;
      let roll = 0;
      let pitchWant = 0;
      let bobWant = 0;
      /*
       * 절차 idle — **서 있는 동안은 클립이 있어도 얹는다.**
       *
       * 여태는 `!mixer`, 곧 뼈 클립이 없을 때만 돌렸다(「클립이 있으면 숨도 클립이 쉰다」). 그런데 Tripo 의
       * preset:biped:idle 은 **거의 안 움직인다** — 헤드리스로 12 초를 재니 서 있는 몸의 머리가 월드에서
       * 0.02 m 밖에 안 흔들렸다(걷는 몸은 11 m). 화면에서는 그게 숨이 아니라 정지 화면이다
       * (2026-09-03 사용자: 「로봇들이 다 멈춰있고」).
       * 두 축은 안 싸운다: 클립은 **뼈**를 움직이고 이 층은 몸을 감싼 **그룹**(숨 · 무게 이동 · 손 확인)을 움직인다.
       * 걷기 근사만 여전히 `!mixer` 다 — 걷는 클립은 실제로 걷고, 거기에 또 흔들면 두 박자가 싸운다.
       */
      if (idle && alive && !walking) {
        const t = s.t;
        sy = 1 + Math.sin(t * BREATH_W * idle.rate) * idle.breath;
        roll = Math.sin(t * SWAY_W * idle.rate) * idle.sway * s.flipSign + (idle.flip && s.flipSign < 0 ? -2 * COPY_ROLL : 0);
        // 자세 바꾸기 — 기대는 쪽을 바꾼다. 부호만 바꾸므로 sin 이 0 근처가 아니면 몸이 툭 옮겨 가는데, 그것이 「자세를 바꾼다」다
        if (idle.flip && t >= s.flipAt) {
          s.flipSign = -s.flipSign;
          s.flipAt = t + between(FLIP_EVERY[0], FLIP_EVERY[1], Math.abs(Math.sin(t * 12.9898)) % 1);
        }
        // 손 확인 — 잠깐 더 숙였다가 돌아온다
        if (idle.handCheck) {
          if (s.handUntil < 0 && t >= s.handAt) s.handUntil = t + HAND_CHECK_S;
          if (s.handUntil >= 0) {
            if (t < s.handUntil) pitchWant = HAND_CHECK_PITCH;
            else {
              s.handUntil = -1;
              s.handAt = t + between(HAND_CHECK_EVERY[0], HAND_CHECK_EVERY[1], Math.abs(Math.sin(t * 78.233)) % 1);
            }
          }
        }
      }
      // 걷기 근사 — **뼈 클립이 없을 때만.** mixer 가 있으면 걸음은 클립이 그린다
      if (walking && !mixer && alive) {
        pitchWant = WALK_PITCH;
        bobWant = Math.sin(s.t * Math.PI * 2 * BOB_HZ) * BOB_M;
      }
      const k = Math.min(1, dt * SETTLE);
      s.pitch += (pitchWant - s.pitch) * k;
      s.bob = walking ? bobWant : s.bob * (1 - k);
      // 기울기도 s.pitch 와 같은 꼴로 **완화한다** — 자세 바꾸기가 한 프레임에 4.6° 뛰던 자리다 (ROLL_SETTLE)
      s.roll += (roll - s.roll) * Math.min(1, dt * ROLL_SETTLE);
      g.scale.y = sy;
      g.rotation.set(s.pitch, 0, s.roll);
      g.position.z = s.bob + s.lean;
    }

    /*
     * ★ mixer.update 는 alive 를 안 본다 — 자는 몸(pose 'doze')과 쓰러진 몸도 GLB idle 이 계속 돈다.
     *   지금은 그게 안 보인다(진폭이 1 도라서). **앞으로 idle 클립의 진폭을 키우면 죽은 몸이 숨 쉬는 그림이
     *   그대로 드러난다** — 그때 alive 를 여기 넣어야 한다. 지금 넣으면 죽은 몸이 갑자기 굳어 다른 문제가 된다.
     */
    if (mixer && actions) {
      const want: 'idle' | 'walk' = getAnim?.() === 'walk' ? 'walk' : 'idle';
      if (want !== cur.current) {
        const from = actions[cur.current];
        const to = actions[want];
        if (to) {
          to.reset().play();
          if (from) to.crossFadeFrom(from, FADE, false);
        }
        cur.current = want;
      }
      mixer.update(dt);
      // 제자리 걸음 — 수평 이동만 지운다. 위아래(무게중심)는 남겨야 걸음이 살아 있다
      const b = root.current;
      const r = rest.current;
      if (b && r) {
        b.position.x = r.x;
        b.position.z = r.z;
      }
    }

    /*
     * ── 하던 일 ── 클립(또는 절차 idle) 이 다 그린 **뒤에** 얹는다 (activity.ts).
     * 걷는 동안과 말을 듣는 동안에는 꺼진다 — 손이 0.3 초에 내려오고, 몸이 도는 것은 heading 쪽이 한다 (attitude → Unit).
     */
    const w = pr.current;
    const on = actOn({ act, alive: getAlive?.() ?? true, walking: getAnim?.() === 'walk', attending: getAttending?.() ?? false });
    w.act = actGain(w.act, on, dt);
    let phase: 'work' | 'pause' | null = null;
    if (act && w.act > 0.002) {
      const p = actPose(act, w.t, seed);
      phase = p.phase;
      w.lean = p.lean * w.act;
      if (rig) applyAct(layers, rig, p, w.act);
      else if (g) {
        // 뼈를 못 찾은 몸 — 고개만 돌릴 수가 없으니 **몸째** 조금 돈다. 폭은 절반이다: 그 이상이면 서 있는 몸이 아니라 서성이는 몸이다
        g.rotation.y += (p.head.yaw * 0.5 + p.torso.yaw) * w.act;
        g.rotation.x += p.torso.pitch * w.act;
        g.rotation.z += p.torso.roll * w.act;
      }
    } else if (w.lean !== 0) {
      w.lean *= Math.max(0, 1 - dt * SETTLE);
    }

    if (import.meta.env.DEV && tag && typeof window !== 'undefined') {
      const win = window as unknown as { __s2act?: Record<string, unknown> };
      const hand = arms.r?.[2] ?? arms.r?.[1] ?? null;
      const r3 = (v: number) => +v.toFixed(3);
      (win.__s2act ??= {})[tag] = {
        act: act ?? null,
        phase,
        on: r3(w.act),
        rig: !!rig,
        arms: [!!arms.l, !!arms.r],
        hand: hand ? hand.getWorldPosition(vw).toArray().map(r3) : null,
        head: rig?.head ? rig.head.getWorldPosition(vw).toArray().map(r3) : null,
        // 뼈가 없는 몸은 여기가 전부다 — 하던 일이 몸 그룹을 돌린 각 (u089)
        body: g ? [g.rotation.x, g.rotation.y, g.rotation.z].map(r3) : null,
      };
    }
  });

  /*
   * ★ 정리에서 `scene.clear()` 를 부르지 않는다. StrictMode 는 마운트 → 정리 → 마운트를 한 번 더 도는데,
   *   useMemo 는 그 사이에 다시 안 돌아서 **이미 비워진 클론**을 그대로 다시 쓴다 — 몸이 통째로 사라진다
   *   (2026-09-02 — 개체 열이 전부 그림자 원만 남아 있었다).
   *   지오메트리·재질은 원본과 공유하므로 버릴 것도 없다: 참조를 놓으면 그만이다. 틴트 복제본만 위 effect 가 버린다.
   */

  return (
    <group ref={anim}>
      {/* 모델은 +x 를 본다 — 겉 그룹(Unit)의 heading 은 +z 기준이라 여기서 한 번 돌려 준다 (MODEL_YAW) */}
      <group position={[0, fit.lift, 0]} scale={fit.scale} rotation-y={MODEL_YAW}>
        <primitive object={scene} />
        {rifle ? <Rifle body={scene} scale={fit.scale} getFlashAt={getFlashAt} /> : null}
      </group>
    </group>
  );
}
