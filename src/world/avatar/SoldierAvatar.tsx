/**
 * 군인 아바타 — 검문소(/interrogation)의 남의 몸. 사용자가 준 Tripo 리깅 GLB 넷(mp/bodies.ts)에 든 **클립을 그대로 튼다**
 * (RobotAvatar 는 뼈를 코드로 돌리지만, 이 몸들은 걷기·달리기·점프·동의·화남 클립이 들어 있다 — 2026-09-04 사용자).
 *
 *   AnimState → 클립: idle(정지) · walk · run · angry · agree. 공중(y > 0)이면 jump.
 *   idle 클립은 없다 — agree 클립의 첫 프레임(차렷)에 멈춰 세운다.
 *
 * ★ 걷기·달리기·점프 클립에는 **제자리 이동(root motion)** 이 들어 있다 — 그대로 틀면 몸이 클립 안에서 앞으로 미끄러진 뒤
 *   튀어 돌아온다. 자리는 서버 좌표(remotePlayers)가 정하므로 로드 때 **값이 변하는 position 트랙을 전부 뗀다**
 *   (뼈 길이를 정하는 상수 트랙은 남긴다). 점프의 위아래도 같은 이유로 뗀다 — 높이는 y 로 온다.
 * ★ 씬은 clone 한다 (RobotAvatar 와 같은 이유 — useGLTF 캐시를 공유하면 한 사람이 걸을 때 전원이 걷는다).
 * ★ 모델 정면은 +z 다 (Tripo 관례, RobotAvatar 와 같다) — heading = atan2(x, z).
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { useAsset } from '../assets/loader';
import type { BodyId } from '../mp/bodies';
import type { AnimState } from '../mp/protocol';
import { EYES, buildBlinkMorph } from './blink';

/* ─────────────────────────────── 눈 깜빡임 ─────────────────────────────── */

/**
 * 감은 눈 모프를 **GLB 마다 한 번** 만들어 지오메트리에 붙인다 (clone 은 지오메트리를 공유하므로 영향값만 몸마다 다르다).
 * 눈 중심은 blink.ts 의 EYES 표(모델 좌표)를 속성 공간으로 옮겨 쓴다 — 속성 공간 변환은 스킨의 바인드 행렬에서 잰다.
 */
const blinkReady = new WeakSet<THREE.BufferGeometry>();
function attachBlinkMorph(mesh: THREE.SkinnedMesh, body: BodyId): void {
  const geo = mesh.geometry;
  if (blinkReady.has(geo)) return;
  blinkReady.add(geo);
  const eyes = EYES[body];
  if (!eyes) return;
  const pa = geo.getAttribute('position');
  const n = pa.count;
  const flat = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    flat[i * 3] = pa.getX(i);
    flat[i * 3 + 1] = pa.getY(i);
    flat[i * 3 + 2] = pa.getZ(i);
  }
  const bone = mesh.skeleton.bones[0];
  const T = new THREE.Matrix4().multiplyMatrices(mesh.bindMatrixInverse, new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[0])).multiply(mesh.bindMatrix);
  const e = T.elements;
  const morph = buildBlinkMorph(flat, n, eyes, { scale: e[0], offset: [e[12], e[13], e[14]] });
  if (morph.eyes.length === 0) return;
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = [new THREE.BufferAttribute(morph.delta, 3)];
}

/** 깜빡임 한 번의 시간표(초) — 감기 0.08 · 감은 채 0.04 · 뜨기 0.12. 다음 깜빡임까지 2~6초, 열에 하나는 곧바로 한 번 더 */
const BLINK_CLOSE = 0.08;
const BLINK_HOLD = 0.04;
const BLINK_OPEN = 0.12;
const BLINK_TOTAL = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN;
function blinkAmount(t: number): number {
  if (t < 0 || t >= BLINK_TOTAL) return 0;
  if (t < BLINK_CLOSE) return t / BLINK_CLOSE;
  if (t < BLINK_CLOSE + BLINK_HOLD) return 1;
  return 1 - (t - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
}
const nextBlinkDelay = () => 2 + Math.random() * 4;

/** 모델 키를 이 값으로 맞춘다 (RobotAvatar 와 같다 — 눈높이 1.62 와 어울린다) */
const TARGET_HEIGHT = 1.72;
/** 클립 사이 크로스페이드(초) */
const FADE = 0.16;

type ClipKey = AnimState | 'jump';
/** GLB 클립 이름(preset:biped:xxx)에서 찾는 조각 — angry 는 angry_01·angry_02 둘 다 있다 */
const CLIP_MATCH: Record<Exclude<ClipKey, 'idle'>, string> = { walk: ':walk', run: ':run', jump: ':jump', angry: ':angry', agree: ':agree' };
/** 한 번만 도는 클립 — 끝 프레임에 멈춘다. 보내는 쪽이 EMOTE_MS 뒤 idle 로 돌아오며 다시 걷는다 */
const ONCE: ReadonlySet<ClipKey> = new Set<ClipKey>(['jump', 'angry', 'agree']);

/** 값이 변하는 position 트랙을 뗀다 (root motion). 상수 트랙은 남긴다 */
function stripRootMotion(clips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.map((c) => {
    const tracks = c.tracks.filter((t) => {
      if (!t.name.endsWith('.position')) return true;
      const v = t.values;
      const n = t.getValueSize();
      for (let axis = 0; axis < n; axis++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = axis; i < v.length; i += n) {
          if (v[i] < lo) lo = v[i];
          if (v[i] > hi) hi = v[i];
        }
        if (hi - lo > 1e-4) return false;
      }
      return true;
    });
    return new THREE.AnimationClip(c.name, c.duration, tracks, c.blendMode);
  });
}

/** 걸음·달리기 클립이 "1배속"으로 맞는 이동 속도(m/s) — 이보다 느리면 클립도 느리게, 빠르면 빠르게 */
const WALK_CLIP_SPEED = 2.6;
const RUN_CLIP_SPEED = 5.2;
/** 이 속도(m/s) 아래면 서 있는 것이다 — anim 이 walk 로 남아 있어도 걷지 않는다 */
const STILL_SPEED = 0.12;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ─────────────────────────────── 숨 ─────────────────────────────── */

/**
 * idle 은 **클립이 한 프레임에 멈춘 차렷**이다(위) — 그대로 두면 서 있는 몸이 통째로 얼어붙어 인형으로 보인다.
 * 클립이 뼈를 다 쓴 뒤에 1° 남짓을 덧걸어 숨을 넣는다. 프레임마다 새로 얹으므로 쌓이지 않는다.
 * 걷기·달리기·점프 클립이 돌 때는 0 으로 잦아든다 — 그쪽은 클립 안에 이미 움직임이 있다.
 */
const BREATH_HZ = 0.25;
/** 뼈마다 [숨으로 앞뒤(도), 아주 느린 좌우(도)] — 척추는 폈다 굽고, 머리는 그 절반에 좌우를 얹는다 */
const BREATH: Record<string, [number, number]> = { Spine02: [1.2, 0], Head: [-0.7, 2.2] };
const BREATH_NAMES = Object.keys(BREATH);
/** 숨이 들고 나는 시간 상수(초) — 클립 크로스페이드(FADE)와 비슷하게 */
const BREATH_TAU = 0.3;

const DEG = Math.PI / 180;
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _wrap = new THREE.Quaternion();

export function SoldierAvatar({
  body,
  getAnim,
  getAirborne,
  getSpeed,
}: {
  body: BodyId;
  /** 프레임마다 묻는다 — 값으로 받으면 상태가 바뀔 때마다 다시 그려진다 (RobotAvatar 와 같은 약속) */
  getAnim: () => AnimState;
  /** 공중에 떠 있나. 점프 클립을 켜는 조건이다 (높이로만 판단) */
  getAirborne: () => boolean;
  /**
   * 화면에서 실제로 움직이는 속도(m/s). 걸음 클립의 빠르기를 여기에 맞추고, 멈춰 있으면 걷기 클립을 안 튼다 —
   * 보내는 쪽의 anim 과 받는 쪽의 자리가 어긋나도(대역 · 늦은 패킷) 제자리 걸음이 안 난다. 없으면 anim 만 믿는다
   */
  getSpeed?: () => number;
}) {
  const gltf = useAsset(body);
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const clips = useMemo(() => stripRootMotion(gltf.animations), [gltf.animations]);

  const { scale, mixer, actions, skinnedMeshes, sway } = useMemo(() => {
    scene.updateMatrixWorld(true);
    // 스킨 먹인 실제 크기로 잰다 — 뼈가 움직여도 경계구가 틀리지 않게 컬링도 끈다
    const box = new THREE.Box3();
    let skinned = false;
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      attachBlinkMorph(m, body);
      m.updateMorphTargets();
      skinnedMeshes.push(m);
      // 얼굴을 비스듬히 볼 때 눈·입의 결이 뭉개지지 않게 — GLTFLoader 기본은 1 이다 (corridor/part.tsx 와 같은 손)
      const mat = m.material as THREE.MeshStandardMaterial;
      for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) if (tex) tex.anisotropy = 8;
      m.computeBoundingBox();
      if (m.boundingBox) {
        box.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld));
        skinned = true;
      }
    });
    if (!skinned) box.setFromObject(scene);
    const h = box.max.y - box.min.y;
    const scale = Number.isFinite(h) && h > 1e-4 ? TARGET_HEIGHT / h : 1;

    const mixer = new THREE.AnimationMixer(scene);
    const actions: Partial<Record<ClipKey, THREE.AnimationAction>> = {};
    for (const key of Object.keys(CLIP_MATCH) as Exclude<ClipKey, 'idle'>[]) {
      const clip = clips.find((c) => c.name.includes(CLIP_MATCH[key]));
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (ONCE.has(key)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions[key] = a;
    }
    // idle — agree 첫 프레임에 멈춘 차렷. 같은 클립을 두 액션으로 못 쓰니 짧은 부분 클립을 하나 더 만든다
    const agree = clips.find((c) => c.name.includes(CLIP_MATCH.agree)) ?? clips[0];
    if (agree) {
      const idleClip = THREE.AnimationUtils.subclip(agree, 'idle', 0, 2, 30);
      const idle = mixer.clipAction(idleClip);
      idle.timeScale = 0;
      actions.idle = idle;
    }

    /*
     * 숨 쉴 뼈 — 모델 좌표계의 회전을 뼈 로컬로 옮기려면 **부모의 정지 회전**으로 감싼다 (RobotAvatar 와 같은 수법):
     * q' = Qp⁻¹ · R · Qp · q. Tripo 가 뼈 로컬축을 어떻게 잡았든 「앞으로 숙임」이 앞으로 숙임이 된다.
     * 여기서 scene 은 아직 트리 밖이라 월드 = 모델 좌표계다 (위의 updateMatrixWorld 가 채워 뒀다)
     */
    const sway = BREATH_NAMES.map((name) => {
      const bone = scene.getObjectByName(name);
      if (!bone?.parent) return null;
      const fromParent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      return { bone, deg: BREATH[name], fromParent, toParent: fromParent.clone().invert() };
    }).filter((s): s is NonNullable<typeof s> => s !== null);

    return { scale, mixer, actions, skinnedMeshes, sway };
  }, [scene, clips, body]);

  /** 깜빡임 시계 — 다음 깜빡임까지 남은 초와, 깜빡이는 중이면 시작한 뒤 흐른 초 */
  const blink = useRef({ wait: 1 + Math.random() * 3, t: -1 });
  /** 숨 시계 — 몸마다 위상이 다르게 태어난다(넷이 한 박자로 숨 쉬면 그게 더 인형 같다). amt 는 지금 숨이 든 만큼 */
  const breath = useRef({ t: Math.random() * 10, amt: 1 });

  const state = useRef<ClipKey>('idle');
  useEffect(() => {
    actions.idle?.reset().play();
    state.current = 'idle';
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, actions]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const v = getSpeed?.();
    let next: ClipKey = getAirborne() ? 'jump' : getAnim();
    if (v !== undefined && (next === 'walk' || next === 'run')) {
      if (v < STILL_SPEED) next = 'idle';
      else {
        // 발이 바닥을 미끄러지지 않게 — 클립 배속을 실제 속도에 맞춘다 (대역은 사람의 절반 속도로 걷는다)
        const a = actions[next];
        if (a) a.timeScale = clamp(v / (next === 'run' ? RUN_CLIP_SPEED : WALK_CLIP_SPEED), 0.55, 1.6);
      }
    }
    if (next !== state.current) {
      const from = actions[state.current];
      const to = actions[next] ?? actions.idle;
      if (to && to !== from) {
        to.reset().fadeIn(FADE).play();
        from?.fadeOut(FADE);
      }
      state.current = next;
    }
    mixer.update(dt);

    // 숨 — 차렷으로 얼어붙은 몸에만. 클립이 뼈를 다 쓴 **뒤에** 얹는다 (머리말)
    const br = breath.current;
    br.t += dt;
    br.amt += ((state.current === 'idle' ? 1 : 0) - br.amt) * Math.min(1, dt / BREATH_TAU);
    if (br.amt > 0.005) {
      const s = Math.sin(br.t * BREATH_HZ * Math.PI * 2);
      const turn = Math.sin(br.t * 0.31);
      for (const w of sway) {
        _euler.set(w.deg[0] * s * br.amt * DEG, w.deg[1] * turn * br.amt * DEG, 0, 'XYZ');
        _q.setFromEuler(_euler);
        w.bone.quaternion.premultiply(_wrap.copy(w.toParent).multiply(_q).multiply(w.fromParent));
      }
    }

    // 눈 깜빡임 — 모프 영향값만 몸마다 움직인다 (지오메트리는 공유)
    const b = blink.current;
    if (b.t < 0) {
      b.wait -= dt;
      if (b.wait <= 0) b.t = 0;
    } else {
      b.t += dt;
      if (b.t >= BLINK_TOTAL) {
        b.t = -1;
        // 열에 하나는 곧바로 한 번 더 — 사람은 가끔 두 번 연달아 깜빡인다
        b.wait = Math.random() < 0.1 ? 0.25 : nextBlinkDelay();
      }
    }
    const amount = b.t < 0 ? 0 : blinkAmount(b.t);
    for (const m of skinnedMeshes) if (m.morphTargetInfluences && m.morphTargetInfluences.length > 0) m.morphTargetInfluences[0] = amount;
  });

  return <primitive object={scene} scale={scale} />;
}
