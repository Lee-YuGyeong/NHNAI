/**
 * 떨어졌다 다시 서는 순간이동 — **언제 거는가**만 여기서 잰다 (그림은 WarpFx).
 *
 * 회전 원판 · 무게 중심 다리 · 무너지는 타워는 서버가 세우므로, 화면은 「누웠다」만 보고 다시 서는 시각을 스스로 짚어야 한다
 * (2026-09-05 사용자: 발판 게임의 그 텔레포트를 이 셋에도). 틀리면 둘 중 하나가 된다 —
 * 몸이 저쪽에 선 뒤에도 여기서 사라지는 중이거나, 아직 누워 있는데 회수만 끝나 몸이 안 보이는 채로 바닥에 남거나.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { WARP_OUT_MS, warp } from '@/features/interrogation/scene/warp';
import { makeFallWarp } from '@/features/trial/games/common/fallWarp';

/** 회전 원판의 다시서기 시간 (DISC_RESPAWN_MS) */
const RESPAWN = 2000;
const FELL = 10_000;
/** 회수가 도는 구간 — 다시 서기 직전 600ms */
const OUT_AT = FELL + RESPAWN - WARP_OUT_MS;

beforeEach(() => warp.clear());

describe('makeFallWarp — 누운 시각에서 다시 설 시각을 짚는다', () => {
  it('누운 뒤 한동안은 아무것도 안 건다 — 누워 있는 것도 이 게임들이 보여 주려는 것이다', () => {
    const fw = makeFallWarp(RESPAWN);
    fw.seen('a', true, 1, 0, 2, FELL);
    expect(warp.beams(FELL).length).toBe(0);
    expect(warp.bodyAt('a', FELL).xz).toBe(1);
    expect(warp.beams(OUT_AT - 1).length).toBe(0);
    expect(warp.bodyAt('a', OUT_AT - 1).xz).toBe(1);
  });

  it('회수는 다시 서기 직전 600ms 에 돈다 — 그동안 몸이 가늘어진다', () => {
    const fw = makeFallWarp(RESPAWN);
    fw.seen('a', true, 1, 0, 2, FELL);
    const mid = warp.beams(OUT_AT + WARP_OUT_MS / 2);
    expect(mid.length).toBe(1);
    expect(mid[0].kind).toBe('out');
    expect(warp.bodyAt('a', OUT_AT + WARP_OUT_MS / 2).xz).toBeLessThan(1);
    // 다시 서는 그 시각에 몸은 다 사라져 있다 — 저쪽에 선 뒤에 여기서 사라지는 중이면 안 된다
    expect(warp.bodyAt('a', FELL + RESPAWN).xz).toBeLessThan(0.05);
  });

  it('다시 서면 도착이 회수를 덮는다 — 기둥은 새 자리에 하나만', () => {
    const fw = makeFallWarp(RESPAWN);
    fw.seen('a', true, 1, 0, 2, FELL);
    fw.seen('a', false, 5, 0.75, 6, FELL + RESPAWN);
    const beams = warp.beams(FELL + RESPAWN + 10);
    expect(beams.length).toBe(1);
    expect(beams[0].kind).toBe('in');
    expect([beams[0].x, beams[0].y, beams[0].z]).toEqual([5, 0.75, 6]);
    // 도착 중의 몸은 작다가 제 크기로 선다
    expect(warp.bodyAt('a', FELL + RESPAWN + 10).xz).toBeLessThan(1);
    expect(warp.bodyAt('a', FELL + RESPAWN + 10_000).xz).toBe(1);
  });

  it('누운 자리가 옮겨져도 회수는 처음부터 다시 돌지 않는다 — 미끄러지다 멎는 몸', () => {
    const fw = makeFallWarp(RESPAWN);
    fw.seen('a', true, 1, 0, 2, FELL);
    fw.seen('a', true, 3, 0, 4, FELL + 100);
    fw.seen('a', true, 3, 0, 4, FELL + 200);
    expect(warp.beams(OUT_AT - 1).length).toBe(0); // 시각은 그대로다
    const b = warp.beams(OUT_AT + 10);
    expect(b.length).toBe(1);
    expect([b[0].x, b[0].z]).toEqual([3, 4]); // 자리는 멎은 자리다
  });

  it('남의 몸은 화면이 늦게 그리는 만큼 기둥도 늦게 세운다 — 기둥이 몸보다 먼저 서면 안 된다', () => {
    const delay = 130;
    const fw = makeFallWarp(RESPAWN, delay);
    fw.seen('b', true, 1, 0, 2, FELL);
    expect(warp.beams(OUT_AT + delay - 1).length).toBe(0);
    expect(warp.beams(OUT_AT + delay + 10).length).toBe(1);
  });

  it('다시서기가 늦으면 회수를 다시 건다 — 몸이 안 보이는 채로 바닥에 남지 않는다', () => {
    const fw = makeFallWarp(RESPAWN);
    fw.seen('a', true, 1, 0, 2, FELL);
    // 설 만한 발판이 없어 서버가 미뤘다 (무너지는 타워) — 회수가 끝나고도 한참 누워 있다
    const late = FELL + RESPAWN + 1500;
    fw.seen('a', true, 1, 0, 2, late);
    expect(warp.bodyAt('a', late).xz).toBe(1); // 몸이 돌아왔다
    expect(warp.beams(late).length).toBe(0);
    expect(warp.beams(late + 1000).length).toBe(1); // 잠시 뒤 다시 회수한다
  });

  it('판이 끝나면 걸린 것을 다 버린다 — 덮어 줄 도착이 영영 안 오는 몸', () => {
    const fw = makeFallWarp(RESPAWN);
    fw.seen('a', true, 1, 0, 2, FELL);
    expect(warp.bodyAt('a', OUT_AT + 300).xz).toBeLessThan(1);
    fw.clear();
    expect(warp.bodyAt('a', OUT_AT + 300).xz).toBe(1);
    expect(warp.beams(OUT_AT + 300).length).toBe(0);
  });
});
