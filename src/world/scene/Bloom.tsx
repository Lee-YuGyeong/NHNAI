/**
 * 블룸 후처리 — three 내장 EffectComposer(RenderPass → UnrealBloomPass → OutputPass).
 *
 * 맵이 MapDef.Effects 로 선택해 쓴다 (심문소: 청색 격자선·링 조명·모니터가 안개 속에서 번져야 참고 렌더처럼 보인다).
 * useFrame 우선순위 1 이라 R3F 의 기본 렌더 루프가 멈추고 여기서 대신 그린다.
 *
 * 색 공간: 씬은 HalfFloat 타깃에 **톤매핑 없이**(three 는 화면에 그릴 때만 톤매핑을 건다) 그려지고, OutputPass 가 renderer 의
 * 톤매핑(ACES)·노출·sRGB 를 마지막에 한 번 건다. 그래서 발광 재질은 color 를 1 보다 크게 잡아야(HDR) 블룸이 잡는다 —
 * `toneMapped:false` 는 이 경로에선 의미가 없다. MSAA 는 타깃의 samples 로 (컴포저는 기본 AA 가 없다).
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface BloomProps {
  /** 번짐 세기. 0.3~0.6 이 절제된 값 */
  strength?: number;
  /** 번짐 반경 (0~1) */
  radius?: number;
  /** 이 밝기(선형) 위만 번진다. 발광체는 1 넘게, 벽·바닥은 0.3 아래라 0.7 이면 빛만 잡힌다 */
  threshold?: number;
}

export function Bloom({ strength = 0.45, radius = 0.5, threshold = 0.7 }: BloomProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const { composer, bloom } = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold);
    c.addPass(b);
    c.addPass(new OutputPass());
    return { composer: c, bloom: b };
  }, [gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps -- 파라미터는 아래 effect 가 갱신한다

  useEffect(() => {
    bloom.strength = strength;
    bloom.radius = radius;
    bloom.threshold = threshold;
  }, [bloom, strength, radius, threshold]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame(() => composer.render(), 1);
  return null;
}
