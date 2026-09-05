/**
 * AI 좌석의 원판 위 걸음 — PLANNING P9: 입력을 LLM 이 만들지 않는다. 프로파일(반응 지연 · 목표 반지름 · 과잉 교정 · 흔들림)에서
 * 틱마다 걷기 명령을 뽑는다. 사람과 같은 걷기·달리기 속도, 같은 물리(sim.ts stepBody)다.
 *
 * precision 1(기계 같음): 기둥 둘레 — 원심력이 가장 작은 고리 — 에 붙어 거의 움직이지 않는다. 미끄러지기 시작하면 그 순간
 *   「이 표면이 잡아 주는 가속도」를 알아채고(gripEst), 그 뒤로는 필요한 만큼만 회전 반대 방향으로 달려 마찰 요구를 정확히
 *   μg 아래로 눌러 둔다. 이동거리가 짧고, 반지름이 흔들리지 않고, 반응이 즉각적이다.
 * precision 0(사람 같음): 가운데보다 조금 바깥(2~3.4m)에 서고, 원판이 눈에 띄게 돌면 **실려 가는 반대쪽으로 어설프게 뛴다**
 *   (사용자 스펙 "반대 방향으로 뛰면서 버팀" — 비율이 좌석·사건마다 달라 정확하지 않다). 밀리기 시작하면 한 박자 늦게 안쪽으로
 *   크게 걷고, 회전이 바뀌면 놀라서 반대로 뛰거나 엉뚱한 쪽으로 반 걸음 가고, 이따금 이유 없이 자리를 옮긴다. 이동거리가 길다.
 *   (2026-09-05 사용자: "AI가 원판 게임에서 안 움직이고 있어" — 미끄러질 때만 반응하게 두면 마찰 좋은 구간 내내 동상이 된다.
 *   원판에 실려 도는 것은 걷기가 아니다 — 스냅샷의 m 이 0 이라 화면에서 부동자세 그대로 미끄러져 다닌다.)
 *
 * 어느 좌석이 어느 쪽인지 서버는 말하지 않는다 — 기록(이동거리 · 반지름 편차 · 반응 시간)에만 남는다.
 */
import { DISC_CAP_R, DISC_R, DISC_RUN_SPEED, DISC_WALK_SPEED } from '../../../../src/world/mp/constants';
import { G, cross, type DiscBody, type Vec2 } from './sim';

export interface DiscProfile {
  /** 밀리기 시작한 것을 알아채고 움직이기까지(ms) */
  reactionMs: number;
  /** 서 있고 싶은 반지름(m) */
  targetR: number;
  /** 밀렸을 때 얼마나 크게 안쪽으로 걷는가 (1 = 딱 필요한 만큼) */
  overcorrect: number;
  /** 이유 없이 자리를 옮길 확률(초당) */
  wanderPerSec: number;
  /** 회전이 바뀌었을 때 엉뚱한 쪽으로 먼저 갈 확률 */
  wrongWayP: number;
  /** 원판이 돌 때 실려 가는 반대쪽으로 뛰는 비율(0~1, 원판 속도 ωr 대비). 기계 좌석은 0 — 필요할 때만 정확히 뛴다 */
  jog: number;
  /** 표면을 「계산」하는가 — 미끄러진 순간의 마찰 요구를 기억해 그 아래로 유지한다 */
  computes: boolean;
}

export function makeDiscProfile(index: number, precision?: number, rand: () => number = Math.random): DiscProfile {
  const p = precision === undefined ? (index === 0 ? 1 : rand() * 0.35) : Math.min(1, Math.max(0, precision));
  const r = precision === undefined ? rand : () => 0.5;
  return {
    reactionMs: 60 + (1 - p) * (380 + r() * 300),
    targetR: DISC_CAP_R + 0.15 + (1 - p) * (0.8 + r() * 1.6), // 캡(매끈한 가운데) 바로 밖부터 — 캡 위에서는 누구도 못 선다
    overcorrect: 1 + (1 - p) * (0.6 + r() * 1.2),
    wanderPerSec: (1 - p) * (0.08 + r() * 0.15),
    wrongWayP: (1 - p) * (0.2 + r() * 0.3),
    jog: (1 - p) * (0.35 + r() * 0.45),
    computes: p > 0.7,
  };
}

export interface DiscBot {
  body: DiscBody;
  profile: DiscProfile;
  /** 표면이 잡아 준다고 믿는 가속도(m/s²). computes 인 좌석만 갱신한다 */
  gripEst: number;
  /** 밀리기 시작한 시각 — 반응 지연을 세는 기준 */
  slideSince: number | null;
  reactUntil: number;
  /** 엉뚱한 쪽으로 가는 동안 */
  wrongUntil: number;
  wrongDir: Vec2;
  /** 이유 없는 이동의 목표 반지름 */
  wanderR: number | null;
  wanderUntil: number;
  /** 지금 회전을 거슬러 뛰는 비율 — 사건마다 프로파일 jog 언저리에서 새로 잡는다 */
  jogK: number;
  /** 회전이 바뀐 직후 이 시각까지는 멈칫한다 — 그 뒤에야 새 비율로 뛴다 */
  jogFrom: number;
}

export function makeDiscBot(body: DiscBody, profile: DiscProfile): DiscBot {
  return {
    body,
    profile,
    gripEst: 0.5 * G,
    slideSince: null,
    reactUntil: 0,
    wrongUntil: 0,
    wrongDir: { x: 0, z: 0 },
    wanderR: null,
    wanderUntil: 0,
    jogK: profile.jog,
    jogFrom: 0,
  };
}

/** 회전 목표가 바뀌었다 — 사람 같은 좌석은 놀라고, 반응 지연만큼 멈칫했다가 새 비율로 다시 뛴다 */
export function botSpinEvent(bot: DiscBot, now: number, rand: () => number = Math.random): void {
  const p = bot.profile;
  if (rand() < p.wrongWayP) {
    const a = rand() * Math.PI * 2;
    bot.wrongDir = { x: Math.cos(a), z: Math.sin(a) };
    bot.wrongUntil = now + p.reactionMs + 250 + rand() * 250;
  }
  bot.jogK = Math.min(1, p.jog * (0.7 + rand() * 0.6));
  bot.jogFrom = now + p.reactionMs;
}

/**
 * 한 틱 — 원판 좌표의 걷기 명령을 돌려준다. need 는 지난 틱에 필요했던 마찰 가속도(sim.ts StepOut).
 * 봇은 μ 를 모른다 — 미끄러진 순간의 need 로 추정할 뿐이다(computes).
 */
export function stepBot(bot: DiscBot, omega: number, need: number, now: number, dtSec: number, rand: () => number = Math.random): { w: Vec2; running: boolean } {
  const b = bot.body;
  const p = bot.profile;
  if (!b.on) return { w: { x: 0, z: 0 }, running: false };

  const r = Math.hypot(b.px, b.pz);
  const slide = Math.hypot(b.sx, b.sz);
  const inward: Vec2 = r > 1e-6 ? { x: -b.px / r, z: -b.pz / r } : { x: -1, z: 0 };

  // 미끄러짐을 알아챈다 — 계산하는 좌석은 그 순간의 마찰 요구를 「이 표면의 한계」로 적어 둔다
  if (slide > 0.05) {
    if (bot.slideSince === null) {
      bot.slideSince = now;
      bot.reactUntil = now + p.reactionMs;
      if (p.computes) bot.gripEst = Math.min(bot.gripEst, Math.max(need, slide > 0.3 ? need : need) * 0.92);
    }
  } else {
    bot.slideSince = null;
    // 안 미끄러지고 버텼으면 한계는 적어도 이만큼이다
    if (p.computes && need > bot.gripEst) bot.gripEst = need;
  }

  let wx = 0;
  let wz = 0;
  let running = false;

  // 놀라서 엉뚱한 쪽으로
  if (bot.wrongUntil > now) {
    wx = bot.wrongDir.x * DISC_WALK_SPEED;
    wz = bot.wrongDir.z * DISC_WALK_SPEED;
    return { w: { x: wx, z: wz }, running };
  }

  // 이유 없는 이동 (사람 같은 좌석) — 잠깐 다른 반지름으로 갔다 온다
  if (bot.wanderR === null && rand() < p.wanderPerSec * dtSec) {
    bot.wanderR = Math.min(DISC_R - 1, Math.max(DISC_CAP_R + 0.15, p.targetR + (rand() - 0.5) * 2.4));
    bot.wanderUntil = now + 1500 + rand() * 2000;
  }
  if (bot.wanderR !== null && now > bot.wanderUntil) bot.wanderR = null;
  const wantR = bot.wanderR ?? p.targetR;

  // 사람 같은 좌석 — 원판이 눈에 띄게 돌면 실려 가는 반대쪽으로 뛴다 (머리말: "반대 방향으로 뛰면서 버팀").
  // 비율(jogK)이 좌석·사건마다 달라 정확하지 않고, 회전이 바뀌면 반응 지연만큼 멈칫한다(jogFrom).
  // 실려 가는 것을 지우는 만큼(코리올리) 마찰 요구도 줄어서, 뛰는 좌석이 더 오래 버틴다 — 사람이 실제로 하는 그 놀이다
  if (!p.computes && bot.jogK > 0.05 && Math.abs(omega) >= 0.5 && now >= bot.jogFrom) {
    const t = cross(omega, { x: b.px, z: b.pz }); // 원판이 실어 나르는 방향(ω r)
    wx += -t.x * bot.jogK;
    wz += -t.z * bot.jogK;
  }

  // 반지름 유지 — 목표보다 바깥이면 안쪽으로, 안쪽이면 바깥으로. 계산하는 좌석은 정확히, 사람 같은 좌석은 문턱이 넓다
  const dr = r - wantR;
  const band = p.computes ? 0.05 : 0.35;
  if (Math.abs(dr) > band) {
    const k = Math.min(1, Math.abs(dr) / 0.6);
    const sgn = dr > 0 ? 1 : -1;
    wx += inward.x * sgn * DISC_WALK_SPEED * k;
    wz += inward.z * sgn * DISC_WALK_SPEED * k;
  }

  // 밀리는 중이면(반응 지연 뒤) 미끄러짐을 거슬러 걷는다 — 사람 같은 좌석은 크게, 안쪽으로 쏠린다
  if (bot.slideSince !== null && now >= bot.reactUntil && slide > 0.05) {
    const gain = p.overcorrect;
    wx += (-b.sx / slide) * Math.min(DISC_WALK_SPEED, slide * 2 * gain) + inward.x * DISC_WALK_SPEED * (gain - 1) * 0.6;
    wz += (-b.sz / slide) * Math.min(DISC_WALK_SPEED, slide * 2 * gain) + inward.z * DISC_WALK_SPEED * (gain - 1) * 0.6;
  }

  // 계산하는 좌석: 서 있기만 해서는 ω²r 이 한계를 넘을 때, 회전 반대 방향으로 딱 필요한 비율 k 만큼 달린다 — |F| = (1−k)·ω²r
  if (p.computes && Math.abs(omega) > 0.05) {
    const needStill = omega * omega * r;
    if (needStill > bot.gripEst * 0.9) {
      const k = Math.min(1, 1 - (bot.gripEst * 0.85) / needStill);
      const t = cross(omega, { x: b.px, z: b.pz }); // 원판이 실어 나르는 방향(ω r)
      wx += -t.x * k;
      wz += -t.z * k;
    }
  }

  const len = Math.hypot(wx, wz);
  if (len > DISC_WALK_SPEED) {
    const cap = Math.min(len, DISC_RUN_SPEED);
    running = cap > DISC_WALK_SPEED + 0.1;
    wx *= cap / len;
    wz *= cap / len;
  }
  return { w: { x: wx, z: wz }, running };
}
