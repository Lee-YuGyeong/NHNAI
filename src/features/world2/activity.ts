/**
 * 하던 일 — **개체는 벽만 보고 서 있지 않는다.**
 *
 * 2026-09-03 사용자: 「복도에 로봇들이 벽만 보는 게 아니라 액션을 취했으면 좋겠어. 그림을 그리고 있다든가 하는 거.」
 * 기획서는 이미 그렇게 적어 뒀다 — 코드가 그 줄을 안 읽고 있었을 뿐이다:
 *
 *   그린다  A-137  「벽 앞에 앉아 손에 안료가 묻어 있다」(대본 v7 HALL_UNITS) ·
 *                  「손끝에 안료가 남아 있고, 늘 벽을 보고 서 있다」(배역표) · 「저거 내가 그렸어. …잘 그렸어?」
 *   읽는다  A-104  「벽화 앞에 오래 서 있다」(대본 v7 HALL_UNITS) · 「자세 · 벽 쪽을 본다」(배역표)
 *   문을 본다 A-089 「자세 · 문만 본다」(배역표) · 「말은 편한데 아무것도 안 묻는다」
 *   기다린다 A-051  「겉으로는 구별이 안 된다」(cast.ts — 동료 요원 슬롯이던 자리) · 그래서 **특별한 것이 하나도 없어야 한다**
 *
 * ★ 이 파일은 **수뿐이다.** 뼈도 three 도 모른다: 위상(초)과 씨앗 하나를 받아 「몸통 · 고개 · 두 팔 · 앞뒤로 옮길 거리」를 돌려준다.
 *   뼈에 얹는 것은 CastBody 다 (클립 위에 Δ 로 덧댄다). 그래서 이 규칙은 시험이 돌려 보며 폭과 결정성을 셀 수 있다.
 *
 * ★ **클립과 안 싸운다.** 숨과 걸음은 여전히 클립(또는 wear 의 idleProfile)의 것이고, 하던 일은 팔과 고개만 가진다.
 *   걷는 동안에는 아예 꺼진다 — 걸어가면서 벽에 그림을 그리는 몸은 없다 (actOn).
 *
 * ★ 폭은 **3~5 m 에서 읽히되 발작으로 안 보이는** 선이다 (ACT_LIMIT): 흔드는 폭 25° · 든 팔 50° · 고개 20° · 앞뒤 0.1 m.
 *   든 팔이 흔드는 폭보다 큰 것은 **그것이 흔들림이 아니라 자세**이기 때문이다 — 벽에 손을 댄 것이 멀리서 읽히려면 그만큼 든다.
 *
 * ★ 전부 **씨앗으로 갈린다** (id 해시 — CastBody 의 seed). 같은 일을 하는 몸 둘이 같은 박자로 움직이면 그 순간 기계 둘이다.
 */

import type { Act } from './cast';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

/** 하던 일이 낸 한 프레임의 자세 — 전부 **더할 값**이다 (클립이 그린 자세 위에 얹는다) */
export interface ActPose {
  /** 지금 그 일을 하는 참인가(work), 손을 놓고 물러나 보는 참인가(pause) — 그리는 것만 갈린다 */
  phase: 'work' | 'pause';
  /** 몸통 — 숙임(+ 앞) · 돌림(+ 왼쪽) · 기울임(+ 오른쪽), rad */
  torso: { pitch: number; yaw: number; roll: number };
  /** 고개 — 숙임(+ 아래) · 돌림(+ 왼쪽), rad */
  head: { pitch: number; yaw: number };
  /**
   * 팔 — raise 는 어깨를 앞으로 드는 각, bend 는 팔꿈치를 접는 각, swing 은 손이 좌우로 오가는 각(+ 그 몸의 오른쪽).
   * 좌우가 같은 부호다: 뼈에 얹는 쪽이 두 팔에 같은 축을 쓴다 (CastBody 의 layer)
   */
  armR: { raise: number; bend: number; swing: number };
  armL: { raise: number; bend: number; swing: number };
  /** 앞뒤로 옮기는 거리(m) — + 는 보는 쪽으로, − 는 물러남. 발을 떼는 게 아니라 무게를 옮기는 폭이다 */
  lean: number;
}

/** 넘으면 안 되는 폭 — 이 위로 가면 로봇이 아니라 발작이다 */
export const ACT_LIMIT = {
  /** 흔드는 폭 (팔) */
  swing: 25 * D2R,
  /** 들거나 접은 채 있는 팔 — 흔들림이 아니라 자세라 이만큼까지 간다 */
  raise: 50 * D2R,
  head: 20 * D2R,
  torso: 10 * D2R,
  lean: 0.1,
} as const;

/** 하던 일이 붙었다 떨어지는 데 걸리는 시간의 지수 상수(초) — 끄는 쪽이 빠르다: 말을 걸면 0.3 초 안에 손을 거둔다 */
export const ACT_IN_S = 0.15;
export const ACT_OUT_S = 0.1;

const ZERO_ARM = { raise: 0, bend: 0, swing: 0 } as const;

/* ─────────────────────────────── 도구 ─────────────────────────────── */

/** 0~1 — 씨앗과 번호 하나로 정해진다. 같은 몸은 언제 다시 세워도 같은 박자다 (시험이 이걸 센다) */
function rnd(seed: number, n: number): number {
  const x = Math.sin((seed + 1) * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const between = (lo: number, hi: number, u: number) => lo + (hi - lo) * u;
const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
/** 0→1 매끄러운 오르막 — 끝에서 기울기가 0 이라 켜고 끄는 자리가 안 튄다 */
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** 주기 안의 자리(초) */
function phaseOf(t: number, period: number, off: number): number {
  const x = (t + off) % period;
  return x < 0 ? x + period : x;
}
/** 몇 번째 주기인가 — 훑는 쪽을 번갈아 바꾸는 데만 쓴다 (늘 같은 쪽으로 고개를 돌리면 고장으로 보인다) */
const turnSign = (t: number, period: number, off: number) => (Math.floor((t + off) / period) % 2 === 0 ? 1 : -1);
/** 0 → 1 → 0 의 산. 구간 [0, len] 밖은 0 이라 이어 붙여도 안 튄다 */
const bump = (x: number, len: number) => (x <= 0 || x >= len ? 0 : 0.5 - 0.5 * Math.cos((x / len) * TAU));
/** 두 박자를 겹친 −1~1 — 하나만 쓰면 메트로놈이고, 둘을 겹치면 손이 제멋대로 간다 */
const wobble = (t: number, seed: number, n: number, a: number, b: number) =>
  0.62 * Math.sin(t * a + rnd(seed, n) * TAU) + 0.38 * Math.sin(t * b + rnd(seed, n + 1) * TAU);

/* ─────────────────────────────── 일마다 ─────────────────────────────── */

/**
 * 그린다 — 벽에 손을 대고 짧은 획을 긋는다. 8~12 초마다 손을 멈추고 **반 걸음 물러나 그림 전체를 본다**(2 초).
 * 그 물러섬이 이 동작의 전부다: 계속 긋기만 하면 기계가 벽을 문지르는 것이고, 물러나 보면 **제 그림을 보는 것**이 된다.
 */
const PAINT = { work: [8, 12] as const, look: 2, ramp: 1.4, wob: 8 * D2R, stroke: 12 * D2R, into: 0.05 };
function paint(t: number, seed: number): ActPose {
  const work = between(PAINT.work[0], PAINT.work[1], rnd(seed, 1));
  const len = work + PAINT.look;
  const ph = phaseOf(t, len, rnd(seed, 2) * len);
  // 물러나 보는 참 — 0 에서 1 로 올랐다 내린다. 양쪽 끝을 램프로 깎아 주기의 이음매에서 안 튀게 한다
  const back = smooth(Math.min((ph - work) / PAINT.ramp, (len - ph) / PAINT.ramp, 1));
  const on = 1 - back;
  const stroke = PAINT.stroke * wobble(t, seed, 3, 1.9, 3.1);
  const swing = stroke * on;
  return {
    phase: back > 0.5 ? 'pause' : 'work',
    torso: { pitch: clamp(6 * D2R * on, ACT_LIMIT.torso), yaw: clamp(-swing * 1.1, ACT_LIMIT.torso), roll: clamp(swing * 0.4, ACT_LIMIT.torso) },
    // 고개가 손을 따라간다 — 그리는 동안은 손끝을 내려다보고, 물러선 참에는 들어서 그림 전체를 훑는다
    head: {
      pitch: clamp(7 * D2R * on - 5 * D2R * back, ACT_LIMIT.head),
      yaw: clamp(swing * 0.55 + 12 * D2R * Math.sin(t * 0.8 + rnd(seed, 6) * TAU) * back, ACT_LIMIT.head),
    },
    /*
     * ★ 팔은 안 움직인다 — Tripo 리그의 팔을 돌리면 스킨이 찢어진다 (CastBody 의 applyAct ★).
     *   그리는 것은 **몸으로** 보인다: 벽을 향해 기울고, 몸통이 획을 따라 좌우로 돌고, 고개가 그 끝을 좇는다.
     */
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: clamp(PAINT.into * on - ACT_LIMIT.lean * back, ACT_LIMIT.lean),
  };
}

/**
 * 읽는다 — 벽화를 따라 고개가 **아주 느리게** 흐르고 갸웃한다. 이따금 8 cm 다가섰다 물러난다.
 * 팔은 안 쓴다: 이 개체는 그림을 그린 적이 없고, 그저 오래 보고 서 있는 것이다.
 */
function read(t: number, seed: number): ActPose {
  const yaw = 16 * D2R * Math.sin(t * 0.33 + rnd(seed, 1) * TAU);
  const period = between(9, 14, rnd(seed, 3));
  return {
    phase: 'work',
    torso: { pitch: 0, yaw: clamp(yaw * 0.25, ACT_LIMIT.torso), roll: 0 },
    head: { pitch: clamp(7 * D2R * Math.sin(t * 0.21 + rnd(seed, 2) * TAU), ACT_LIMIT.head), yaw: clamp(yaw, ACT_LIMIT.head) },
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: clamp(0.08 * bump(phaseOf(t, period, rnd(seed, 4) * period), 2.6), ACT_LIMIT.lean),
  };
}

/**
 * 문을 본다 — 거의 안 움직인다. 6 초쯤마다 고개가 몇 도 돌아 훑고 돌아오고, 무게가 천천히 옮겨진다.
 * **적게 움직이는 것이 이 개체의 성격이다** — 되묻는 법이 없는 것이 몸으로도 그렇다.
 */
function watch(t: number, seed: number): ActPose {
  const period = between(5.5, 7, rnd(seed, 1));
  const off = rnd(seed, 2) * period;
  const yaw = 7 * D2R * bump(phaseOf(t, period, off), 1.8) * turnSign(t, period, off);
  return {
    phase: 'work',
    torso: { pitch: 0, yaw: clamp(yaw * 0.25, ACT_LIMIT.torso), roll: clamp(2.5 * D2R * Math.sin(t * 0.18 + rnd(seed, 3) * TAU), ACT_LIMIT.torso) },
    head: { pitch: 0, yaw: clamp(yaw, ACT_LIMIT.head) },
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: 0,
  };
}

/**
 * 기다린다 — 무게를 옮기고, 이따금 곁눈질하고, 제 손을 한 번 확인한다.
 * **아무것도 특별하지 않아야 한다**: 겉으로 구별되면 안 되는 몸이 하는 것이라, 남들과 다른 버릇이 하나라도 보이면 그게 표가 된다.
 * 그래서 쓰는 낱말이 다른 셋과 같다 — 무게 이동(문을 보는 것) · 곁눈질(읽는 것) · 손 확인(wear 의 handCheck).
 */
function wait(t: number, seed: number): ActPose {
  const base = 5 * D2R * Math.sin(t * 0.17 + rnd(seed, 2) * TAU);
  const gp = between(7, 11, rnd(seed, 3));
  const goff = rnd(seed, 4) * gp;
  const glance = 13 * D2R * bump(phaseOf(t, gp, goff), 1.4) * turnSign(t, gp, goff);
  const hp = between(9, 13, rnd(seed, 5));
  // 손 확인 — 두 손을 몸 앞으로 모아 들고 내려다본다. 팔꿈치가 접히는 것이 드는 것보다 크다
  const hand = bump(phaseOf(t, hp, rnd(seed, 6) * hp), 1.4);
  return {
    phase: 'work',
    torso: {
      pitch: 0,
      yaw: clamp(base * 0.3, ACT_LIMIT.torso),
      roll: clamp(3 * D2R * Math.sin(t * 0.22 + rnd(seed, 1) * TAU), ACT_LIMIT.torso),
    },
    head: { pitch: clamp(10 * D2R * hand, ACT_LIMIT.head), yaw: clamp(base + glance, ACT_LIMIT.head) },
    // 손 확인도 팔 없이 — 고개를 숙여 제 손을 내려다보는 것으로 낸다 (팔을 돌리면 스킨이 찢어진다, CastBody ★)
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: 0,
  };
}

/* ───────────────── 아무 일도 안 적힌 몸들 (2026-09-03) ───────────────── */

/*
 * 아래 넷은 기획서에서 온 것이 아니다 — 2026-09-03 사용자: 「다른객체들 왜 아무것도 안움직여 자연스럽게
 * 움직이게 해줘야지」. 앞 넷이 붙은 배역은 열둘 중 넷뿐이었고, 나머지 서른 남짓에게 남은 움직임은
 * GLB idle 클립의 척추 ±1° 와 절차 idle 1.6° 뿐이었다 (CastBody · wear.idleProfile). 6 m 밖에서는
 * 정지와 구별이 안 되는 폭이다.
 *
 * 그래서 이 넷은 **무엇을 하는지 말하지 않는다.** 말하는 것은 「살아 있다」 하나뿐이다. 그 목적 때문에
 * 앞 넷과 설계가 반대다 — 앞 넷은 폭으로 읽히고(획을 긋고, 물러나 보고), 이 넷은 **주기로 읽힌다**:
 * 폭은 앞 넷보다 작게 두고 대신 12~30 초짜리 느린 자세 변화를 준다. 스무 몸이 한 방에 서 있을 때
 * 폭으로 승부하면 그 방이 통째로 발작하는 것으로 보인다.
 */

/**
 * 무게중심을 옮긴다 — 오래 선 몸이 하는 것 (기다리는 줄 · 열하루째).
 * 12~18 초에 한 번 무게가 한쪽으로 **천천히** 넘어가고, 그 사이 몸통이 아주 느리게 흔들린다.
 * 넘어가는 데 6~9 초가 걸려서 한 프레임에 0.05° 도 안 된다 — 눈에 「움직였다」로 안 보이고 「서 있다」로 보인다.
 * 그게 이 일의 목적이다: 화면에서 세는 것은 몸이 **얼마나 움직였나**가 아니라 **정지 프레임이 있나** 다.
 */
const SHIFT = { period: [12, 18] as const, roll: 6 * D2R, sway: 2.2 * D2R, head: 3 * D2R };
function shift(t: number, seed: number): ActPose {
  const period = between(SHIFT.period[0], SHIFT.period[1], rnd(seed, 1));
  const off = rnd(seed, 2) * period;
  // 넘어간 무게 — 주기의 절반씩 한쪽에 머문다 (cos 한 장이라 머무는 참과 넘어가는 참이 저절로 갈린다)
  const side = Math.cos((phaseOf(t, period, off) / period) * TAU);
  const sway = SHIFT.sway * Math.sin(t * 0.19 + rnd(seed, 3) * TAU);
  return {
    phase: 'work',
    torso: { pitch: 0, yaw: clamp(sway, ACT_LIMIT.torso), roll: clamp(SHIFT.roll * side + sway * 0.4, ACT_LIMIT.torso) },
    // 고개는 무게가 간 쪽의 **반대**로 조금 남는다 — 머리까지 같이 기울면 서 있는 몸이 아니라 넘어지는 인형이다
    head: { pitch: 0, yaw: clamp(-SHIFT.head * side, ACT_LIMIT.head) },
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: 0,
  };
}

/**
 * 천천히 둘러본다 — 볼 것이 하나뿐인 방(코어 탑 · 벨트 · 문)에 선 것들.
 * 「읽는다」와 쓰는 낱말이 같고 **주기가 절반 느리다**: 읽는 것은 벽 하나를 따라 흐르고, 이것은 방 전체를 훑는다.
 * 두 박자를 겹쳐 두는 것은 메트로놈이 안 되게 하려는 것이다 — 느린 고개가 일정한 주기로 오가면 그게 감시 카메라다.
 */
function scan(t: number, seed: number): ActPose {
  const yaw = 15 * D2R * Math.sin(t * 0.13 + rnd(seed, 1) * TAU) + 4 * D2R * Math.sin(t * 0.37 + rnd(seed, 2) * TAU);
  return {
    phase: 'work',
    torso: {
      pitch: 0,
      yaw: clamp(yaw * 0.3, ACT_LIMIT.torso),
      roll: clamp(2 * D2R * Math.sin(t * 0.16 + rnd(seed, 3) * TAU), ACT_LIMIT.torso),
    },
    head: { pitch: clamp(3 * D2R * Math.sin(t * 0.11 + rnd(seed, 4) * TAU), ACT_LIMIT.head), yaw: clamp(yaw, ACT_LIMIT.head) },
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: 0,
  };
}

/**
 * 제 손을 확인한다 — 손끝이 닳은 것들 (stance 'hands' 와 같은 낱말이다).
 * 「기다린다」의 손 확인과 같은 동작인데 **훨씬 자주** 한다: 기다리는 몸은 9~13 초에 한 번 보고, 이 몸은 5~8 초에 한 번 본다.
 * 그 빈도가 곧 이 몸의 성격이다 — 실수가 허용되지 않았던 손이라 계속 확인한다.
 * 손은 여기서도 안 든다 (팔을 돌리면 Tripo 리그의 스킨이 찢어진다, CastBody 의 applyAct ★) — 고개를 숙이는 것으로 낸다.
 */
function fidget(t: number, seed: number): ActPose {
  const period = between(5, 8, rnd(seed, 1));
  const off = rnd(seed, 2) * period;
  const look = bump(phaseOf(t, period, off), 2.2);
  return {
    phase: 'work',
    torso: {
      // 손을 볼 때 몸통도 조금 움츠러든다 — 고개만 꺾이면 목이 부러진 것으로 보인다
      pitch: clamp(4 * D2R * look, ACT_LIMIT.torso),
      yaw: clamp(2.5 * D2R * Math.sin(t * 0.23 + rnd(seed, 3) * TAU), ACT_LIMIT.torso),
      roll: clamp(2 * D2R * Math.sin(t * 0.18 + rnd(seed, 4) * TAU), ACT_LIMIT.torso),
    },
    // 손을 보는 동안에는 곁눈질이 멎는다 ((1 − look)) — 손을 보면서 옆을 보는 몸은 둘 다 안 하는 것으로 보인다
    head: {
      pitch: clamp(14 * D2R * look, ACT_LIMIT.head),
      yaw: clamp(5 * D2R * Math.sin(t * 0.21 + rnd(seed, 5) * TAU) * (1 - look), ACT_LIMIT.head),
    },
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: 0,
  };
}

/**
 * 벽·단에 기댄다 — 벽을 따라 선 것들. 몸통이 한쪽으로 **기운 채 있고**, 20~30 초에 한 번 기대는 쪽을 바꾼다.
 * 다른 셋과 다른 점 하나: 이것은 흔들림이 아니라 **자세**다. 그래서 폭(8°)이 이 넷 중 가장 크고 그 폭이 거의 안 변한다 —
 * 멀리서 벽을 따라 선 열여섯을 볼 때 이것만 실루엣이 다르다. 그 하나 때문에 「벽에 붙은 군중」이 열여섯 개의 같은 막대가 아니게 된다.
 * 벽이 뒤에 있으므로 앞뒤는 **뒤로** 조금 남는다 (앞으로 기울면 기댄 것이 아니라 일어서는 것이다).
 */
function leaning(t: number, seed: number): ActPose {
  const period = between(20, 30, rnd(seed, 1));
  const off = rnd(seed, 2) * period;
  const side = Math.cos((phaseOf(t, period, off) / period) * TAU);
  const breathe = 1.6 * D2R * Math.sin(t * 0.24 + rnd(seed, 3) * TAU);
  return {
    phase: 'work',
    torso: { pitch: 0, yaw: clamp(2 * D2R * side, ACT_LIMIT.torso), roll: clamp(8 * D2R * side + breathe, ACT_LIMIT.torso) },
    // 기댄 쪽으로 목도 조금 눕는다. 고개는 살짝 내려 둔다 — 기댄 몸이 정면을 똑바로 보고 있으면 기댄 것으로 안 읽힌다
    head: { pitch: clamp(3 * D2R, ACT_LIMIT.head), yaw: clamp(4 * D2R * side, ACT_LIMIT.head) },
    armR: ZERO_ARM,
    armL: ZERO_ARM,
    lean: clamp(-0.03 - 0.01 * Math.abs(side), ACT_LIMIT.lean),
  };
}

/* ─────────────────────────────── 밖으로 ─────────────────────────────── */

/**
 * 이 몸이 지금 어떤 자세인가 — **순수 함수다.** 같은 (일 · 시각 · 씨앗)이면 늘 같은 값이라,
 * 프레임을 몇 번 건너뛰어도 몸이 튀지 않고 시험이 규칙을 통째로 돌려 볼 수 있다.
 */
export function actPose(act: Act, t: number, seed: number): ActPose {
  switch (act) {
    case 'paint':
      return paint(t, seed);
    case 'read':
      return read(t, seed);
    case 'watch':
      return watch(t, seed);
    case 'shift':
      return shift(t, seed);
    case 'scan':
      return scan(t, seed);
    case 'fidget':
      return fidget(t, seed);
    case 'lean':
      return leaning(t, seed);
    /*
     * ★ 여기로 떨어지는 것은 'wait' 하나여야 한다. Act 에 이름을 하나 늘리고 위에 case 를 안 쓰면
     *   그 일이 조용히 「기다린다」가 되어 **아무 일도 안 하는 것처럼 보인다** — 두 번 조용히 새는 자리다
     *   (시험의 ACTS 리터럴에도 손으로 넣어야 폭·결정성 검사가 돈다).
     */
    default:
      return wait(t, seed);
  }
}

/**
 * 지금 하던 일을 하고 있나 — **걷는 몸과 말을 듣는 몸은 안 한다.**
 * 걸으면서 벽을 칠하는 몸은 없고, 말을 걸었는데 계속 제 일을 하는 몸은 대답하는 것으로 안 보인다 (attitude.attending).
 */
export function actOn(o: { act?: Act; alive?: boolean; walking?: boolean; attending?: boolean }): boolean {
  return !!o.act && o.alive !== false && !o.walking && !o.attending;
}

/** 하던 일이 붙는 정도 — 0 에서 1 로 지수로 민다. 끄면 0.3 초 안에 손이 내려온다 (ACT_OUT_S 셋) */
export function actGain(cur: number, on: boolean, dt: number): number {
  const k = 1 - Math.exp(-Math.max(0, dt) / (on ? ACT_IN_S : ACT_OUT_S));
  return cur + ((on ? 1 : 0) - cur) * k;
}
