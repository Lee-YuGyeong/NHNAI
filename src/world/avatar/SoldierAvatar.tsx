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

  const { scale, mixer, actions } = useMemo(() => {
    scene.updateMatrixWorld(true);
    // 스킨 먹인 실제 크기로 잰다 — 뼈가 움직여도 경계구가 틀리지 않게 컬링도 끈다
    const box = new THREE.Box3();
    let skinned = false;
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
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
    return { scale, mixer, actions };
  }, [scene, clips]);

  const state = useRef<ClipKey>('idle');
  useEffect(() => {
    actions.idle?.reset().play();
    state.current = 'idle';
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, actions]);

  useFrame((_, delta) => {
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
    mixer.update(Math.min(delta, 0.1));
  });

  return <primitive object={scene} scale={scale} />;
}
