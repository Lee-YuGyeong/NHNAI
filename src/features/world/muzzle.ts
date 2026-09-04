/**
 * 총구 섬광 — **총을 든 몸이면 어느 판에서든 같은 불꽃이 핀다.**
 *
 * 원래는 무장 심문 AI(Enforcer.tsx) 안에만 있었다. 시나리오 2 의 집행자도 같은 소총(enforcer_rifle.glb)을 같은
 * 오른손 뼈에 달고 같은 순간에 쏘는데, 그쪽에는 빛도 불꽃도 없어서 **총성 없이 사람이 죽었다**
 * (2026-09-03 사용자: 「world 의 처형 임팩트 · 총 쏘는 임팩트가 world2 에는 없다」). 두 벌로 두면 한쪽만 손질되니
 * 여기 한 벌만 둔다 — 값(FLASH_*)도 여기 것이 원본이다.
 *
 * 한 발은 두 가지가 같이 터진다:
 *   ① 점광원  방을 한 번 하얗게 물들인다. 제곱으로 죽어서 번쩍이 짧다
 *   ② 스프라이트  총구에 피는 불꽃 자체 — 점광원만으로는 빛만 번쩍이고 총 끝은 그대로였다
 *                (2026-08-31 사용자: 「두려움을 느낄 정도로 화력 임팩트를 더 세게」). 가산 합성이라 어두운 복도에서 더 탄다.
 * 발마다 크기·각도를 흔든다 — 같은 그림이 두 번 나오면 그때부터 그림으로 보인다.
 *
 * 붙이는 자리는 **소총의 자식**이다 (소총 길이 1 · 총구 +z 기준의 국소 좌표). 소총이 손 뼈의 자식이니
 * 자세가 어떻든 불꽃은 총구에서 난다.
 */

import * as THREE from 'three';

/** 한 발의 섬광이 사는 시간 */
export const FLASH_MS = 110;
/** 섬광 점광원의 최대 세기 (예전 40) */
export const FLASH_LIGHT = 130;
/** 섬광 판의 크기 — 소총 좌표(총 길이 1) 기준. 총 길이 ≈0.86m 라 0.55 ≈ 47cm */
export const FLASH_SIZE = 0.55;
/** 총구 — 소총 국소 좌표(+z 가 총열). 빛은 총구 안, 판은 그 바로 앞 */
const LIGHT_AT: readonly [number, number, number] = [0, 0.2, 0.55];
const FLASH_AT: readonly [number, number, number] = [0, 0.2, 0.72];

/** 총구 섬광 판의 그림 — 가운데가 하얗게 타고 바깥으로 노랗게 퍼지는 원 (한 번만 만든다) */
let flashTex: THREE.Texture | null = null;
export function flashTexture(): THREE.Texture | null {
  if (flashTex) return flashTex;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,230,170,0.95)');
  grd.addColorStop(0.55, 'rgba(255,150,60,0.45)');
  grd.addColorStop(1, 'rgba(255,110,30,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // 십자 스파이크 — 총구가 뱉는 불꽃
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,235,190,0.4)';
  g.fillRect(0, 60, 128, 8);
  g.fillRect(60, 0, 8, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  flashTex = t;
  return t;
}

/** 한 발 — 이 발의 크기·각도. 발이 바뀔 때만(at 이 달라질 때만) 새로 뽑는다 */
export interface Shot {
  at: number;
  size: number;
  spin: number;
}

export interface Muzzle {
  light: THREE.PointLight;
  flash: THREE.Sprite;
  /** 소총에 매단다 — 국소 좌표라 소총이 어디로 가든 총구에 붙어 있다 */
  attach(rifle: THREE.Object3D): void;
  detach(): void;
  /** 한 프레임. flashAt 은 마지막 발사 시각(performance.now 기준). 없으면 −Infinity */
  update(flashAt: number, now: number): void;
}

/**
 * 총구 한 벌.
 * `bodyScale` 은 이 몸이 얹혀 있는 배율 — 빛의 도달 거리(distance)는 월드 미터라 안에서 나눠 준다.
 * (소총 자신의 배율까지는 안 본다: Enforcer 가 그렇게 써 왔고 그 그림이 기준이다)
 */
export function makeMuzzle(bodyScale: number): Muzzle {
  const light = new THREE.PointLight('#ffd9a0', 0, 14 / Math.max(1e-3, bodyScale), 1.5);
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTexture() ?? undefined, color: '#fff0cc', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
  );
  flash.visible = false;
  flash.frustumCulled = false;
  light.position.set(...LIGHT_AT);
  flash.position.set(...FLASH_AT);
  const shot: Shot = { at: -Infinity, size: 1, spin: 0 };
  return {
    light,
    flash,
    attach(rifle) {
      rifle.add(light);
      rifle.add(flash);
    },
    detach() {
      light.removeFromParent();
      flash.removeFromParent();
    },
    update(flashAt, now) {
      // 새 발이면 이 발의 크기·각도를 뽑는다
      if (flashAt !== shot.at) {
        shot.at = flashAt;
        shot.size = 0.85 + Math.random() * 0.5;
        shot.spin = Math.random() * Math.PI;
      }
      const age = now - flashAt;
      const k = age < FLASH_MS ? 1 - age / FLASH_MS : 0;
      light.intensity = FLASH_LIGHT * k * k;
      flash.visible = k > 0;
      if (k <= 0) return;
      const mat = flash.material as THREE.SpriteMaterial;
      mat.opacity = Math.min(1, k * 1.8);
      mat.rotation = shot.spin;
      // 피었다가 오므라든다 — 처음 프레임이 가장 크다
      flash.scale.setScalar(FLASH_SIZE * shot.size * (0.55 + 0.75 * k));
    },
  };
}
