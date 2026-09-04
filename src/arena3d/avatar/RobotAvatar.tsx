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
export const TARGET_HEIGHT = 1.72;
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

/**
 * 자세 하나. rot 은 뼈마다 [x, y, z] (도), hipY 는 엉덩이 높이 오프셋(모델 단위 — 키 0.98 기준),
 * tilt 는 **몸 전체가 발끝을 축으로 앞으로 기운 각도**(도)다.
 *
 * tilt 만 뼈가 아니다. 넘어지는 것은 관절이 아니라 **몸 전체가 도는 일**이라, 뼈로는 못 짓는다 —
 * 척추와 무릎을 아무리 굽혀도 서 있는 몸이 웅크릴 뿐이다. 그래서 이 한 값은 뼈가 아니라
 * 아바타를 감싼 group 의 rotation.x 로 나간다 (아래 useFrame).
 * +값이 앞(정면 +z)으로 넘어가는 쪽이다.
 */
class Pose {
  readonly rot = new Float32Array(BONES.length * 3);
  hipY = 0;
  tilt = 0;
  /**
   * 몸 전체를 띄우는 높이(m — 여기만 모델 단위가 아니라 월드 단위다. 감싼 group 의 position 이라
   * scale 바깥이다). tilt 와 짝이다: 발밑을 축으로 90° 넘어가면 몸의 중심선이 딱 바닥에 놓여서
   * **몸통 절반이 바닥에 잠긴다.** 다 넘어간 만큼만 살짝 들어 그 위에 눕힌다.
   */
  lift = 0;

  reset(): void {
    this.rot.fill(0);
    this.hipY = 0;
    this.tilt = 0;
    this.lift = 0;
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
    this.tilt += (target.tilt - this.tilt) * k;
    this.lift += (target.lift - this.lift) * k;
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
    /*
     * ── 무게중심 옮기기 ── 아주 느리게(주기 14초) 한쪽 다리로 섰다가 반대쪽으로 옮긴다.
     * 이 방은 **서 있는 시간이 길다** — 판 사이의 대화 국면이 판보다 길어서, 숨만 쉬는 몸이
     * 오래 서 있으면 그 화면이 정지 그림으로 굳는다. 골반이 기울면 그 위가 반대로 따라온다.
     */
    const shift = Math.sin(clock * 0.45);
    out.add('Hip', 0, 0, 2.4 * shift);
    out.add('Spine01', 0, 0, -1.6 * shift);
    out.hipY -= 0.006 * Math.abs(shift);
    /*
     * ── 두리번 ── 가끔 고개를 크게 돌려 방을 훑는다. 늘 돌면 두리번이 아니라 도리질이라,
     * 도는 폭 자체를 더 느린 물결로 여닫는다 — 대개는 거의 안 돌고 이따금 크게 돈다.
     */
    out.add('Head', 0, 24 * Math.sin(clock * 0.23) * Math.max(0, Math.sin(clock * 0.11 + 1.2)), 0);
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

  /**
   * 지목 — 오른팔을 뻗어 **앞을 가리킨다.**
   *
   * 몸은 이미 그 개체 쪽으로 돌아 서 있으므로(ArenaFeature 의 look), 앞을 가리키면 그것이 곧
   * 그 개체를 가리킨 것이 된다. 팔을 스르르 올리면 지목이 아니라 안내가 되므로, 뻗는 순간
   * 한 번 더 밀어 준다 (jab). 상체는 팔을 따라 조금 틀리고 왼팔은 살짝 뒤로 남는다.
   */
  point(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.point / 1000;
    const e = envelope(Math.min(t, D), D, 0.12, 0.45);
    const jab = pulse(t, 0.22, 0.22);
    // Rz 는 ARM_HANG(내린 팔)에서 16(수평 조금 아래)까지 간다 — 값이 아니라 **거기까지 가는 길**을 적는다
    out.set('R_Upperarm', -4 * e, (76 + 10 * jab) * e, ARM_HANG - (ARM_HANG - 16) * e);
    out.set('R_Forearm', 0, 14 - (10 + 5 * jab) * e, 0);
    out.add('Spine01', 0, -7 * e, 0);
    out.add('Spine02', 4 * e, 0, 0);
    out.add('Head', 3 * e, 0, 0);
    out.add('L_Upperarm', 8 * e, 0, 4 * e);
  },

  /** 부인 — 고개를 좌우로 젓고 두 손바닥을 앞으로 내민다. 물린 개체가 입을 열면 이 자세다 */
  deny(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.deny / 1000;
    const e = envelope(Math.min(t, D), D, 0.14, 0.4);
    const swing = Math.sin(t * TWO_PI * 2.2);
    out.add('Head', 2 * e, 24 * e * swing, 0);
    out.add('Spine02', -3 * e, 6 * e * swing, 0);
    // 위팔을 앞으로 조금, 팔뚝을 세워 손이 가슴 높이에 온다 (손바닥이 앞을 본다)
    out.set('L_Upperarm', -10 * e, -46 * e, -ARM_HANG + 20 * e);
    out.set('L_Forearm', 0, -14 - 10 * e, 74 * e);
    out.mirror();
  },

  /** 으쓱 — 어깨가 올라가고 팔꿈치가 벌어진다. 넘기거나 할 말이 없을 때다 */
  shrug(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.shrug / 1000;
    const e = envelope(Math.min(t, D), D, 0.18, 0.4);
    out.set('L_Upperarm', 4 * e, -18 * e, -ARM_HANG + 26 * e);
    out.set('L_Forearm', 0, -14 - 22 * e, 58 * e);
    out.mirror();
    out.add('Head', 0, 0, 5 * e);
    out.add('Spine02', -4 * e, 0, 0);
    out.hipY = 0.012 * e;
  },

  /**
   * 움찔 — 총이 나간 순간, **쏘지 않은 쪽들이** 하는 것. 어깨를 움츠리고 고개를 숙이며 한쪽 발이
   * 반보 물러선다. 빠르게 들어가고 천천히 풀린다 — 놀라는 것은 순간이고 가라앉는 데는 시간이 든다.
   */
  flinch(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.flinch / 1000;
    const e = envelope(Math.min(t, D), D, 0.05, 0.5);
    const jolt = pulse(t, 0.1, 0.16);
    out.add('Spine02', 10 * e + 6 * jolt, 0, 0);
    out.add('Head', 14 * e + 8 * jolt, 0, 0);
    out.set('L_Upperarm', 12 * e, -24 * e, -ARM_HANG + 30 * e);
    out.set('L_Forearm', 0, -14 - 26 * e, 44 * e);
    out.mirror();
    // 한쪽 발만 뒤로 — 두 발이 같이 움직이면 뒷걸음이 아니라 앉는 자세가 된다
    out.add('L_Thigh', 7 * e, 0, 0);
    out.add('R_Thigh', -7 * e, 0, 0);
    out.hipY = -0.02 * e;
  },

  /**
   * 물러선다 — 발밑에 붉은 원이 켜졌을 때. 움찔(flinch)과 다른 것은 **까닭이 앞에 있다는 점**이다:
   * 놀라서 움츠리는 것이 아니라 그은 선을 보고 거리를 두는 것이라, 몸이 웅크리지 않고
   * 한 발이 뒤로 빠지며 두 손이 앞아래를 막는다.
   */
  back(t, _clock, out) {
    stand(out);
    const D = EMOTE_MS.back / 1000;
    const e = envelope(Math.min(t, D), D, 0.1, 0.45);
    const step = pulse(t, 0.32, 0.3);
    out.add('Spine02', -6 * e, 0, 0);
    out.add('Head', -4 * e, 0, 0);
    out.set('L_Upperarm', -14 * e, -30 * e, -ARM_HANG + 16 * e);
    out.set('L_Forearm', 0, -14 - 18 * e, 26 * e);
    out.mirror();
    // 한쪽 발만 뒤로 빼고 무게를 그쪽에 싣는다
    out.add('L_Thigh', 16 * step, 0, 0);
    out.add('L_Calf', 20 * step, 0, 0);
    out.add('R_Thigh', -10 * step, 0, 0);
    out.hipY = -0.025 * step;
  },

  /**
   * 쓰러진다 — 리더가 무대 위에서 쏜 뒤 (2026-09-03 사용자 요청).
   *
   * **무릎을 안 꺾는다.** 사람이 쓰러지는 그림은 다리가 접히면서 주저앉는 것인데, 이건 기계다 —
   * 전원이 끊긴 것처럼 **선 자세 그대로 발끝을 축으로 앞으로 넘어간다.** 그게 이 방에서 벌어지는
   * 일(폐기)에 맞고, 무엇보다 옆에서 보는 다른 개체들에게 무서운 그림이다.
   *
   * 셋으로 나뉜다. ① 맞는 순간 가슴이 뒤로 젖혀지고 두 팔이 튀어 오른다(hit) —
   * 총알이 몸을 때린 방향이다. ② 그 반동이 지나면 앞으로 넘어간다(fall, 0.16→0.78초).
   * ③ 바닥에 닿으며 한 번 튄다(bump). 그 뒤로는 t 가 아무리 흘러도 값이 안 변한다 —
   * smooth 가 1 에서 멎으므로 **넘어진 자세로 그대로 멈춘다** (몇 초 뒤 몸이 지워진다).
   *
   * 되돌아오지 않는 상태라 clock(반복 위상)을 안 쓴다. 숨쉬기도 없다: 꺼진 몸이다.
   */
  down(t, _clock, out) {
    stand(out);
    /** ① 맞는 순간 — 총알이 몸을 때린 그 한 박자 */
    const hit = pulse(t, 0.07, 0.18);
    /** ② 발목이 풀려 몸이 기우는 몫 — 처음에는 천천히, 넘어가면서 빨라진다 */
    const topple = smooth((t - 0.16) / 0.46);
    /** ②' 다 기운 뒤 바닥까지 — 여기서부터는 몸이 제 무게로 떨어진다 */
    const drop = smooth((t - 0.44) / 0.36);
    /** ③ 팔이 바닥을 짚는 몫 — 닿기 직전에 뻗는다 */
    const brace = smooth((t - 0.5) / 0.22);
    /** ③' 짚은 팔이 미끄러지는 몫 — 버티다 힘이 빠져 옆으로 밀린다 */
    const slip = smooth((t - 0.86) / 0.3);
    /** 바닥에 닿으며 한 번 튄다 */
    const bump = pulse(t, 0.88, 0.15);
    /** ④ 머리는 늦다 — 몸이 다 넘어간 뒤에 따라와서 한 번 더 튄다 */
    const headLag = smooth((t - 0.42) / 0.4);
    const headBump = pulse(t, 1.02, 0.16);

    // ① 맞는 순간 — 가슴이 뒤로 젖혀지고 두 팔이 튀어 오른다
    out.add('Spine02', -12 * hit, 0, 0);
    out.add('Head', -18 * hit, 0, 0);
    out.add('L_Upperarm', -46 * hit, 0, 24 * hit);
    out.add('L_Forearm', 0, -34 * hit, 0);

    /*
     * ② **두 단계로 꺾인다.** 한 축으로 90° 를 한 번에 돌리면 판때기가 넘어가는 그림이다.
     * 앞의 절반(topple)은 발목만 풀려 몸이 통째로 기울고, 뒤의 절반(drop)에서 **상체가 먼저
     * 떨어진다** — 척추가 접히면서 가슴과 머리가 몸통보다 앞서 바닥으로 간다. 기계라도
     * 무게중심은 있고, 넘어가는 몸은 위쪽이 더 빨리 돈다.
     */
    out.add('Spine01', 10 * drop, 0, 0);
    out.add('Spine02', 16 * drop - 6 * bump, 0, 0);
    // 다리는 거의 그대로다 — 접히지 않는 몸이라는 것이 이 클립의 뼈대다
    out.add('L_Thigh', -6 * topple, 0, 0);
    out.add('L_Calf', 8 * drop, 0, 0);

    /*
     * ③ **팔이 바닥을 짚었다 미끄러진다.** 넘어가는 몸이 반사로 손을 내미는 한 박자다 —
     * 이게 없으면 팔이 몸에 붙은 채로 통째로 떨어져서 마네킹이 쓰러지는 그림이 된다.
     * 짚고(brace) → 버티고 → 힘이 빠지며 팔꿈치가 꺾이고 어깨가 벌어진다(slip).
     */
    const hold = brace * (1 - slip);
    // 부호 규약은 이 파일 머리말 — 팔은 Rx− 가 앞이다 (Rx+ 는 뒤). Rz+ 는 왼팔이 바깥·위로 벌어진다
    out.add('L_Upperarm', -58 * hold - 26 * slip, 0, 20 * hold + 46 * slip);
    out.add('L_Forearm', 0, 12 * hold - 52 * slip, 0);

    out.mirror();

    /*
     * ④ **머리는 늦게 온다.** 위의 척추(drop)보다 한 박자 뒤에 따라오고(headLag), 몸이 멎은
     * 뒤에 한 번 더 튄다(headBump). 이 지연 하나가 「몸이 꺾인다」와 「몸이 죽는다」를 가른다.
     * 좌우 대칭이 아니어야 하는 것이 아니므로 mirror 뒤에 얹는다 (머리는 짝이 없는 뼈다).
     */
    out.add('Head', 26 * headLag + 12 * headBump - 8 * bump, 0, 0);

    /*
     * 몸 전체가 기우는 각. 맞는 순간 살짝 뒤로 밀렸다가(−) 두 단계로 넘어가고, 바닥에서 한 번
     * 튀고(+bump), 짚은 팔이 미끄러질 때 마지막으로 조금 더 주저앉는다(+slip).
     * 방향은 클립이 모른다 — 총알이 민 쪽은 무대의 사정이라 바깥이 넣어 준다 (Pose.tilt · getFall).
     */
    out.tilt = 42 * topple + 46 * drop - 7 * hit + 5 * bump + 3 * slip;
    out.hipY = -0.03 * topple - 0.02 * drop;
    // 다 넘어간 만큼만 든다 (Pose.lift) — 넘어가는 중에는 거의 안 뜨고 마지막에만 얹힌다
    out.lift = 0.14 * drop * drop;
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
/** 넘어지는 축 — 프레임마다 새로 만들지 않는다 (down 클립) */
const _axis = new THREE.Vector3();

export function RobotAvatar({
  getAnim,
  getAirborne,
  getFall,
}: {
  getAnim: () => AnimState;
  /** 공중에 떠 있나. 점프 클립을 켜는 조건이다 (높이로만 판단) */
  getAirborne: () => boolean;
  /**
   * 어느 쪽으로 넘어지나 (rad, 이 몸의 로컬 기준 · 0 = 정면 · atan2(x, z) 규약).
   * down 클립에서만 쓴다. 총알이 민 쪽은 무대의 사정이라(리더가 어디 서 있나) 여기서는 알 수 없다 —
   * 쏘는 쪽이 넣어 주고(net/remote-players 의 fall) 여기서는 받아서 축만 돌린다. 안 주면 정면이다.
   */
  getFall?: () => number;
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
  /**
   * 반복 동작의 위상(clock)은 **아바타마다 다른 데서 시작한다.**
   *
   * 여섯이 같은 순간에 태어나므로 0 에서 같이 출발하면 숨쉬기·무게중심·걸음이 **전부 한 몸처럼
   * 맞아 돈다** — 여섯이 같은 박자로 숨쉬는 방은 개체가 여섯인 것이 아니라 하나를 여섯 번
   * 복사한 것으로 보인다. 이 한 줄이 그걸 흩는다. 클립이 바뀌는 순간의 t 는 since 를 빼서 재므로
   * (아래 useFrame) 시작 값이 무엇이든 한 번짜리 몸짓은 늘 0 에서 시작한다.
   */
  const state = useRef<{ name: ClipName; since: number; clock: number }>({
    name: 'idle',
    since: 0,
    clock: Math.random() * 20,
  });
  /** 몸 전체를 기울이는 자리 — 넘어지는 것은 뼈가 아니라 이 group 이 한다 (Pose.tilt) */
  const root = useRef<THREE.Group>(null);
  /**
   * 넘어지는 방향 — **쓰러지기 시작할 때 한 번 잡고 그대로 간다.**
   * 프레임마다 다시 읽으면 넘어가는 도중에 축이 바뀌어 몸이 비틀린다.
   */
  const fallDir = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = state.current;
    st.clock += dt;

    const next: ClipName = getAirborne() ? 'jump' : getAnim();
    if (next !== st.name) {
      st.name = next;
      st.since = st.clock;
      // 넘어지기 시작하는 그 프레임에 방향을 못 박는다 (fallDir 머리말)
      if (next === 'down') fallDir.current = getFall?.() ?? 0;
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
    /*
     * 몸 전체의 기울기 — 뼈가 아니라 감싼 group 을 돌린다 (Pose.tilt 머리말).
     * 축이 group 의 원점, 곧 **발밑**이라 앞으로 넘어가는 그림이 그대로 나온다.
     * 이 group 은 heading 이 이미 걸린 안쪽이므로, +x 회전은 늘 그 몸의 정면 쪽이다.
     */
    if (root.current) {
      /*
       * 몸 전체의 기울기 — 뼈가 아니라 감싼 group 을 돌린다 (Pose.tilt 머리말).
       * 축이 group 의 원점, 곧 **발밑**이라 그 자리에서 넘어가는 그림이 그대로 나온다.
       *
       * **넘어지는 방향을 축으로 받는다** (getFall). 넘어가는 쪽이 (sin d, 0, cos d) 면
       * 돌아야 할 축은 그것과 수직인 (cos d, 0, −sin d) 다. d = 0 이면 축이 +x 라
       * 여태처럼 정면으로 넘어가고, d = 90° 면 축이 −z 라 제 왼쪽으로 넘어간다.
       */
      const d = fallDir.current;
      _axis.set(Math.cos(d), 0, -Math.sin(d));
      root.current.quaternion.setFromAxisAngle(_axis, current.tilt * DEG);
      root.current.position.y = current.lift;
    }
  });

  return (
    <group ref={root} scale={scale}>
      {/* 발끝이 +z 를 향하는 모델이라 +z 가 정면이다. heading = atan2(x, z) 규약과 맞는다 */}
      <primitive object={scene} rotation-y={0} />
    </group>
  );
}
