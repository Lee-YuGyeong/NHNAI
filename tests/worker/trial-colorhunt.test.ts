/**
 * 색 사냥 — 팔레트(조명 × 반사율) · 기록(HuntStats) · 엔진(줍기 판정 · 전환 · 리스폰 · NPC)을 고정한다.
 *
 *   ① 법칙: 적색 차단이면 빨강은 죽고, 노랑은 초록과 합류하되 밝기 갭이 남는다 (docs/COLORHUNT.md §2)
 *   ② 와이어에는 진짜 색(반사율 · hue)이 없다 — 표시색뿐이다 (P8)
 *   ③ 판별은 시간축이다: 전환 후 첫 선택까지(hesitationMs)가 남고, 오답의 방향(합류색 ±)이 남는다
 *   ④ NPC 의 precision 은 시간축에만 물린다 — 정답률 파라미터는 p=0 과 p=1 이 같다 (P2 보호)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUNT_HUE_COUNT, HUNT_ORBS_PER_HUE, HUNT_RESPAWN_MS, TRIAL_PHASE_MS } from '../../src/world/mp/constants';
import type { ColorOrb, S2CMessage } from '../../src/world/mp/protocol';
import { ColorhuntEngine } from '../../worker/src/trial/colorhunt/engine';
import { makeHuntProfile } from '../../worker/src/trial/colorhunt/npc';
import { HUNT_HUES, confusableWith, deadHue, freeHue, hueOf, lightOf, pickTargets, shownHex } from '../../worker/src/trial/colorhunt/palette';
import { HuntStats } from '../../worker/src/trial/colorhunt/stats';
import { COLORHUNT_BLOCK } from '../../worker/src/trial/condition';

function channel(hex: string, i: 0 | 1 | 2): number {
  return Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

describe('palette — 표시색 = 조명 × 반사율', () => {
  const redBlock = lightOf('red');
  const greenBlock = lightOf('green');

  it('적색 차단: 빨강은 거의 검게 죽고, 검정 미끼와 합류한다', () => {
    const red = shownHex(hueOf('red').refl, redBlock);
    expect(channel(red, 0)).toBe(0);
    expect(channel(red, 1)).toBeLessThan(32);
    expect(channel(red, 2)).toBeLessThan(32);
    expect(confusableWith('red', 'red')).toContain('black');
  });

  it('적색 차단: 노랑은 초록과 합류하되 12~15% 밝기 갭이 남는다 — 사람이 풀 길', () => {
    const yellow = shownHex(hueOf('yellow').refl, redBlock);
    const green = shownHex(hueOf('green').refl, redBlock);
    expect(channel(yellow, 0)).toBe(0); // 적색 성분이 사라져 초록 계열이 됐다
    expect(channel(green, 0)).toBe(0);
    const gap = (channel(green, 1) - channel(yellow, 1)) / channel(green, 1);
    expect(gap).toBeGreaterThan(0.1);
    expect(gap).toBeLessThan(0.2);
    expect(confusableWith('yellow', 'red')).toEqual(['green']);
  });

  it('녹색 차단: 흰색은 마젠타로 홀로 남는다(자유색), 노랑은 빨강과 합류한다', () => {
    expect(shownHex(hueOf('white').refl, greenBlock)).toBe('#ff00ff');
    expect(freeHue('green')).toBe('white');
    expect(deadHue('green')).toBe('green');
    expect(confusableWith('yellow', 'green')).toEqual(['red']);
  });

  it('목표색: 검정은 절대 안 나오고, 같은 색이 연속 두 구간에 안 나온다', () => {
    for (let i = 0; i < 200; i += 1) {
      const t = pickTargets(1 + (i % 3), COLORHUNT_BLOCK);
      expect(t).toHaveLength(3);
      expect(t).not.toContain('black');
      expect(t[0]).not.toBe(t[1]);
      expect(t[1]).not.toBe(t[2]);
    }
  });

  it('난이도가 목표를 정한다 — 3이면 마지막 구간이 죽는 색(위치 기억 싸움)', () => {
    for (let i = 0; i < 100; i += 1) {
      const t = pickTargets(3, COLORHUNT_BLOCK);
      // 2구간 목표가 우연히 green 이었으면 연속 금지로 mid 폴백이다 — 그 외에는 반드시 죽는 색
      if (t[1] !== 'green') expect(t[2]).toBe('green');
      const low = pickTargets(1, COLORHUNT_BLOCK);
      if (low[1] !== 'white') expect(low[2]).toBe('white');
    }
  });
});

describe('HuntStats — 기록', () => {
  it('전환 후 첫 선택까지(hesitationMs)와 전환 창 오답률이 남는다', () => {
    const s = new HuntStats();
    s.record({ at: 1_000, phase: 1, correct: true, honest: false });
    // 전환(20초) 후 1.2초 멈칫했다가 창(3초) 안에 하나 틀린다
    s.record({ at: 21_200, phase: 2, correct: false, honest: true });
    s.record({ at: 24_500, phase: 2, correct: true, honest: false });
    const r = s.result('p', [20_000, 40_000]);
    expect(r.metrics.hesitationMs).toBeCloseTo(1_200, 5);
    expect(r.metrics.transitionError).toBeCloseTo(1, 5); // 창 안 선택 1개가 오답
    expect(r.metrics.accuracy).toBeCloseTo(2 / 3, 5);
    expect(r.metrics.wrongPicks).toBe(1);
    expect(r.errorDirection).toEqual([1]); // 합류색으로 틀렸다 — 정직한 오답
  });

  it('전환 뒤에 아무것도 안 주웠으면 NaN — 0 이 「즉답」으로 읽히면 안 된다', () => {
    const s = new HuntStats();
    s.record({ at: 5_000, phase: 1, correct: true, honest: false });
    const r = s.result('p', [20_000, 40_000]);
    expect(Number.isNaN(r.metrics.hesitationMs)).toBe(true);
    expect(Number.isNaN(r.metrics.transitionError)).toBe(true);
  });
});

describe('npc — precision 은 시간축에만 물린다 (P2 보호)', () => {
  it('기계 쪽(p=1)은 머뭇이 짧고, 사람 쪽(p=0)은 길다 — 정답률 파라미터는 같다', () => {
    const machine = makeHuntProfile(0, 1);
    const human = makeHuntProfile(0, 0);
    expect(machine.switchDelayMs).toBeLessThanOrEqual(500);
    expect(human.switchDelayMs).toBeGreaterThanOrEqual(3_000);
    expect(machine.boardCheckP).toBe(0);
    expect(human.boardCheckP).toBeGreaterThan(0);
    // 정오는 p 와 무관 — 정확도에 물리면 편차가 폭발해 P2 가 무의미해진다
    expect(machine.accBase).toBe(human.accBase);
    expect(machine.accMerged).toBe(human.accMerged);
    expect(machine.accDead).toBe(human.accDead);
  });
});

/* ═══════════════════════════ 엔진 — 가짜 시계로 1분을 돌린다 ═══════════════════════════ */

function makeCtx() {
  const sent: S2CMessage[] = [];
  let finished = false;
  return {
    sent,
    isFinished: () => finished,
    ctx: {
      broadcast: (m: S2CMessage) => {
        sent.push(m);
      },
      finish: () => {
        finished = true;
      },
    },
  };
}

type Sync = Extract<S2CMessage, { t: 'trial_colorhunt' }>;

function lastSync(sent: S2CMessage[]): Sync {
  const s = [...sent].reverse().find((m): m is Sync => m.t === 'trial_colorhunt');
  if (!s) throw new Error('trial_colorhunt 가 없다');
  return s;
}

/** 목표색 이름 → 견본판의 표시색 → 그 색의 구슬. 견본판 대조(§5-③)를 테스트가 그대로 한다 */
function orbOfTarget(sync: Sync, correct: boolean): ColorOrb {
  const c = sync.board.find((b) => b.name === sync.target)!.c;
  const orb = sync.orbs.find((o) => (correct ? o.c === c : o.c !== c));
  if (!orb) throw new Error('맞는 구슬이 없다');
  return orb;
}

describe('ColorhuntEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function start(realIds: string[] = ['p1'], aiIds: string[] = [], tuning?: Parameters<ColorhuntEngine['start']>[4]) {
    const engine = new ColorhuntEngine();
    const c = makeCtx();
    engine.start(2, realIds, aiIds, c.ctx, tuning);
    return { engine, ...c };
  }

  it('시작하면 구슬 70개 · 견본판 7색이 표시색으로 방송되고, 와이어 어디에도 진짜 색이 없다 (P8)', () => {
    const { engine, sent } = start();
    const sync = lastSync(sent);
    expect(sync.orbs).toHaveLength(HUNT_HUE_COUNT * HUNT_ORBS_PER_HUE);
    expect(sync.board).toHaveLength(HUNT_HUES.length);
    expect(sync.light).toBe('#ffffff'); // 1구간은 기준광
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain('refl');
    expect(wire).not.toContain('"hue"');
    expect(wire).not.toContain('lightFilter');
    engine.stop();
  });

  it('줍기 — 가까우면 판정되고(trial_picked), 쿨다운 안의 연타와 먼 구슬은 흘린다', () => {
    const { engine, sent } = start();
    const sync = lastSync(sent);
    const good = orbOfTarget(sync, true);
    const wrong = orbOfTarget(sync, false);

    engine.onMove('p1', good.x, good.z, Date.now());
    engine.onPick('p1', good.id);
    expect(sent.filter((m) => m.t === 'trial_picked')).toHaveLength(1);

    engine.onPick('p1', wrong.id); // 쿨다운(0.8초) 안 — 흘린다
    expect(sent.filter((m) => m.t === 'trial_picked')).toHaveLength(1);

    vi.advanceTimersByTime(1_000);
    const far = sync.orbs.find((o) => Math.hypot(o.x - good.x, o.z - good.z) > 5)!;
    engine.onPick('p1', far.id); // 내 자리에서 멀다 — 흘린다
    expect(sent.filter((m) => m.t === 'trial_picked')).toHaveLength(1);
    engine.stop();
  });

  it('주워진 자리 근처에 같은 색이 다시 돋는다 (trial_orb)', () => {
    const { engine, sent } = start();
    const sync = lastSync(sent);
    const good = orbOfTarget(sync, true);
    engine.onMove('p1', good.x, good.z, Date.now());
    engine.onPick('p1', good.id);

    vi.advanceTimersByTime(HUNT_RESPAWN_MS + 300);
    const orbMsg = sent.find((m): m is Extract<S2CMessage, { t: 'trial_orb' }> => m.t === 'trial_orb');
    expect(orbMsg).toBeDefined();
    expect(orbMsg!.orb.c).toBe(good.c); // 같은 색 (아직 1구간 — 조명도 같다)
    expect(Math.hypot(orbMsg!.orb.x - good.x, orbMsg!.orb.z - good.z)).toBeLessThan(2.5);
    engine.stop();
  });

  it('20초마다 조명이 바뀌어 전체 동기화가 다시 나가고, 표시색이 실제로 달라진다', () => {
    const { engine, sent } = start();
    const first = lastSync(sent);
    vi.advanceTimersByTime(TRIAL_PHASE_MS + 300);
    const second = lastSync(sent);
    expect(second.at).toBeGreaterThan(first.at);
    expect(second.light).not.toBe('#ffffff');
    expect(second.board.map((b) => b.c)).not.toEqual(first.board.map((b) => b.c));
    engine.stop();
  });

  it('1분이 차면 스스로 끝나고, 기록에 정답률 · 머뭇 · 오답 방향이 남는다 — 안 주운 사람은 빠진다', () => {
    const { engine, sent, isFinished } = start(['p1', 'ghost']);
    const sync = lastSync(sent);
    const good = orbOfTarget(sync, true);
    engine.onMove('p1', good.x, good.z, Date.now());
    engine.onPick('p1', good.id);

    // 전환(20초) 후 1.5초쯤 있다가 하나 더 — 이번엔 아무 색이나 (전환 뒤 목표는 바뀌었을 수 있다)
    vi.advanceTimersByTime(TRIAL_PHASE_MS + 1_400);
    const now2 = lastSync(sent);
    const any = now2.orbs[0];
    engine.onMove('p1', any.x, any.z, Date.now());
    engine.onPick('p1', any.id);

    vi.advanceTimersByTime(60_000);
    expect(isFinished()).toBe(true);

    const results = engine.results();
    expect(results.map((r) => r.id)).toEqual(['p1']); // ghost 는 한 번도 안 주웠다
    const r = results[0];
    expect(r.metrics.picks).toBe(2);
    expect(r.metrics.accuracy).toBeGreaterThanOrEqual(0.5); // 첫 개는 확실히 정답
    expect(r.metrics.hesitationMs).toBeGreaterThan(1_000); // 전환 후 멈칫이 잡혔다
    expect(r.metrics.hesitationMs).toBeLessThan(3_000);
  });

  it('NPC — 서버가 걷고 줍는다. 걸음은 trial_snapshot 으로, 선택은 사람과 같은 trial_picked 로 나간다 (P9)', () => {
    const { engine, sent } = start([], ['SUBJECT_01'], { SUBJECT_01: { precision: 1 } });
    vi.advanceTimersByTime(60_500);

    const picks = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_picked' }> => m.t === 'trial_picked');
    expect(picks.length).toBeGreaterThan(3);
    for (const p of picks) expect(p.id).toBe('SUBJECT_01');

    const snaps = sent.filter((m): m is Extract<S2CMessage, { t: 'trial_snapshot' }> => m.t === 'trial_snapshot');
    expect(snaps.length).toBeGreaterThan(100); // ~10Hz × 60초
    expect(snaps.at(-1)!.ai[0].id).toBe('SUBJECT_01');

    const r = engine.results().find((x) => x.id === 'SUBJECT_01')!;
    expect(r.metrics.picks).toBeGreaterThan(3);
    expect(Number.isFinite(r.metrics.accuracy)).toBe(true);
  });
});
