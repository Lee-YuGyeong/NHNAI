/**
 * 닳은 몸에서 **코드가 얹을 것만** 뽑는다 — 기획서 「어디가 닳았나」의 제작 절.
 *
 * 개체 열을 각각 모델링하면 값이 감당이 안 된다. 그럴 필요도 없다 — 이 세계관에서는 원래 다 같은 모델이었다.
 * **세계관이 곧 최적화다.** 그래서 몸은 성격마다 뽑은 GLB 열 장(cast 의 look.asset)이 전부이고,
 * 이 파일은 그 위에 얹을 값만 준다: 텍스처에 곱할 색, 서 있는 기울기, 그룹 변형, 서 있는 동안의 버릇.
 *
 * ★ 2026-09-03 — **조각(상자)을 전부 걷어냈다.** 원래는 수선 부품 · 얼굴판의 금 · 손끝의 안료 · 어깨의 총을
 *   납작한 상자 메시로 몸에 붙였다. 그건 몸이 단색 아바타 하나뿐이던 시절의 답이었다.
 *   지금은 열 장 전부가 **그것들을 이미 모델링해 들고 있다** (tools/scenario2-cast-parts.json 의 프롬프트:
 *   u137 의 「THREE VERTICAL MARKS … FINGERTIPS ARE STAINED」, guard21 의 「a plain dark carbine hangs SLUNG ACROSS ITS BACK」,
 *   u104 의 색 안 맞는 교체 패널). 같은 것을 두 번 그리니 근접에서 얼굴 앞에 주황 막대 셋이 떠 있었고,
 *   사용자의 말 그대로 「glb 에 상자를 달고 다니는」 몸이 됐다. 두 번 그리지 않는다 — 그리는 쪽은 GLB 다.
 *
 * ★ 남은 것 셋은 GLB 가 **못 하는 것**들이다:
 *   1 색 — 열 장은 각자 한 벌씩만 구워졌다. 등급 · 그을림 · 바램 · 구형은 텍스처에 **곱해서** 낸다 (tint)
 *   2 형태 — 어깨가 닳은 개체는 어깨선이 실제로 굽어 있다 (lean · pose)
 *   3 버릇 — 자세는 **멀리서 읽는** 정보다. 벽을 보는 개체와 문을 보는 개체는 10 m 밖에서 갈린다 (idle)
 *
 * ★ 몸 없는 look 은 **몸을 빌린다** (bodyOf). 예전에는 그런 look 이 단색 리깅 아바타로 섰는데, 노출 2.0 의 이 맵에서
 *   그건 검은 덩어리 하나였다 (2026-09-03 근접 촬영). 지금 명부에는 몸 없는 개체가 하나도 없지만 Look.asset 은 여전히 선택이라,
 *   자리표에 몸을 안 적은 것이 생기면 여기서 빌려 준다 — 아바타로 되돌아가는 길은 없다. 빌리는 것은 원래 이 게임의 규칙이다
 *   (cast.ts: 동료 요원 둘과 검문 앞줄 둘도 개체의 몸을 빌려 쓴다).
 */

import * as THREE from 'three';

import type { Idle, Look, WearPart } from './cast';

/**
 * GLB 텍스처에 곱하는 가장 어두운 값(선형) — grade 3. 노출 2.0 은 값을 두 배로 올리므로 선형 0.2 아래라야 회색으로 남는다
 * (0.3 은 근접 촬영에서 아직 흰색이었다 — 재질 색 b3b4b8 이 그대로 들어가 있는데도)
 */
const TINT_FLOOR = 0.15;

/**
 * 몸이 없는 look 이 빌리는 몸 — **닳은 자리로 고른다.** 아무거나 주면 「어깨가 닳았다」고 적어 둔 배경이
 * 손끝만 닳은 몸으로 서게 되고, 그러면 이 시스템이 스스로 거짓말을 한다.
 * 무릎(knee)이 경비의 몸으로 안 가는 것은 그 몸만 총을 메고 있어서다 — 배경 하나가 무장한 것으로 보이면 안 된다.
 */
const BORROW: Record<WearPart, string> = {
  shoulder: 's2_u104',
  hand: 's2_u118',
  front: 's2_u063',
  knee: 's2_u089',
  whole: 's2_u089',
  none: 's2_u201',
};

/** 이 look 이 설 몸 — 제 몸이 있으면 그것, 없으면 닳은 자리가 같은 것을 빌린다 */
export function bodyOf(look: Look | undefined): string {
  if (look?.asset) return look.asset;
  return BORROW[look?.wear ?? 'whole'];
}

/** 서 있는 동안의 버릇 — 값은 CastBody 가 프레임마다 읽는다. 전부 0 이면 안 움직이는 몸이다 */
export interface IdleProfile {
  /** 숨 — y 스케일 진폭 */
  breath: number;
  /** 무게 이동 — roll 진폭(rad) */
  sway: number;
  /** 주기 배율 — 1 이 기준(숨 1.6 rad/s · 무게 이동 0.35 rad/s). 리더는 0.5 */
  rate: number;
  /** 6~9 초마다 1 초 동안 pitch 를 더 꺾어 제 손을 본다 */
  handCheck: boolean;
  /** 4~7 초마다 기대는 쪽(roll 부호)을 바꾼다 */
  flip: boolean;
}

export interface Dress {
  /** GLB 텍스처 위에 **곱하는** 색 — 등급 · 그을림 · 바램 · 구형. 1 이면 그대로 (곱하기는 밝힐 수 없다) */
  tint: THREE.Color;
  /** 서 있는 기울기 — 어깨가 굽었거나 등을 붙였거나 손을 내려다보거나 */
  lean: { pitch: number; roll: number };
  /**
   * 그룹 변형으로 내는 자세 — back 은 보는 방향의 **반대**로 이만큼(m) 물러나 벽에 붙고(자리표는 그대로),
   * widen 은 x/z 스케일(구형은 크고 각지다)
   */
  pose: { back: number; widen: number };
  idle: IdleProfile;
}

/** 버릇 이름 — 안 적힌 개체는 자세에서 짐작한다. 성격표(cast)와 같은 이름이라 여기서 갈라도 어긋나지 않는다 */
export function idleOf(look: Look): Idle {
  if (look.idle) return look.idle;
  if (look.stance === 'hands') return 'hands';
  if (look.stance === 'copy') return 'copy';
  if (look.stance === 'back') return 'still';
  return 'default';
}

/** 버릇 → 값. 기준은 숨 0.006 · 무게 이동 0.015 (그 이상이면 서 있는 몸이 아니라 흔들리는 몸으로 보인다) */
export function idleProfile(look: Look): IdleProfile {
  /*
   * 값을 키웠다 — 0.006 / 0.015 는 **화면에서 안 보였다.** 뼈 클립(preset:biped:idle)이 거의 안 움직여서
   * 서 있는 몸의 흔들림은 사실상 이 두 수가 전부인데, 숨 0.6 % · 무게 이동 0.9 도는 멀리서 정지 화면이다
   * (2026-09-03 사용자: 「로봇들이 다 멈춰있고」 — 헤드리스로 12 초를 재니 머리가 0.02 m 움직였다).
   * 자세 바꾸기(flip)도 기본으로 켠다: 사인 곡선보다 **4~7 초마다 기대는 쪽이 바뀌는 것**이 살아 있다는 신호다.
   */
  const base: IdleProfile = { breath: 0.012, sway: 0.028, rate: 1, handCheck: false, flip: true };
  switch (idleOf(look)) {
    case 'hands':
      return { ...base, handCheck: true };
    case 'copy':
      // 따라 하는 것 — 자세 바꾸기가 이제 기본이라 여기서 더 얹을 것이 없다. 이름은 남긴다(cast 의 idle 값과 짝이다)
      return { ...base, flip: true };
    case 'still':
      return { ...base, sway: 0 };
    case 'guard':
      return { ...base, sway: base.sway * 2 };
    case 'leader':
      return { breath: base.breath / 2, sway: base.sway / 2, rate: 0.5, handCheck: false, flip: false };
    default:
      return base;
  }
}

/**
 * 외형 한 벌을 뽑는다. 조합이 곧 성격이므로 **기획서에 없는 개체도 이 함수 하나로 만들어진다** —
 * 배경 개체에게 말을 걸어도 자기 외형에 맞는 반응이 나오는 이유다.
 */
export function dress(look: Look): Dress {
  const g = look.grade / 3;

  /*
   * ── 곱하는 색: 텍스처를 살리고 **어둡게만** 한다 ──
   * 등급은 회색으로 깎고, 앞이 그은 것은 그을음 쪽으로, 바랜 것은 따뜻하게 빛이 빠진 쪽으로, 구형은 보랏빛으로.
   * 등급 하나로 몸 열둘이 갈리는 것이 아니다 — 몸이 다르고, 그 위에 이 색이 얹힌다
   */
  const tint = new THREE.Color(Math.pow(TINT_FLOOR, g), Math.pow(TINT_FLOOR * 1.03, g), Math.pow(TINT_FLOOR * 1.1, g));
  if (look.wear === 'front') tint.multiply(new THREE.Color(0.7, 0.62, 0.58));
  if (look.bleached) tint.set(1, 0.95, 0.82);
  if (look.older) tint.set(0.78, 0.7, 0.82);

  /*
   * ── 자세: 10m 밖에서 읽히는 정보 ──
   * 어깨가 닳은 개체는 어깨선이 **실제로** 굽어 있고, 손끝이 닳은 개체는 제 손을 내려다본다.
   * hands 0.25: 0.16 은 GLB 몸에서 「고개를 숙였나」 수준이라 5 m 밖에서 안 읽혔다
   */
  const lean = { pitch: 0, roll: 0 };
  if (look.wear === 'shoulder') lean.pitch = 0.1 * g;
  if (look.stance === 'hands') lean.pitch = 0.25;
  if (look.stance === 'back') lean.pitch = -0.05;
  if (look.stance === 'wall') lean.pitch = 0.06;
  if (look.stance === 'copy') lean.roll = 0.04;
  if (look.wear === 'knee') lean.roll = 0.03;

  // 등을 붙인 것은 자리표에서 0.15 m 벽 쪽으로 — 자리표(Room2Scene)는 그대로 두고 몸만 물러난다
  const pose = { back: look.stance === 'back' ? 0.15 : 0, widen: look.older ? 1.15 : 1 };

  return { tint, lean, pose, idle: idleProfile(look) };
}
