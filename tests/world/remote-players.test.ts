/**
 * 원격 플레이어 보관소 — 시험이 끝나 무대가 사라지면 전원이 바닥에 내려선다 (2026-09-05 사용자: 회전 원판이 끝난 뒤
 * SUBJECT 04 가 0.75m 허공에 떠 있었다). 남의 몸 높이는 서버 샘플뿐이라, 새 샘플이 안 오는 봇 · 격리된 좌석은 마지막 높이에
 * 그대로 남는다 — settle 이 그 자리를 높이 0 으로 한 번 더 찍는다.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { INTERP_DELAY_MS } from '@/world/mp/constants';
import { sampleAt } from '@/world/mp/interp';
import { remotePlayers } from '@/world/net/remote-players';

const snap = (id: string, y: number) => ({ id, seat: 1, nickname: id, x: 1, z: 2, y, heading: 0.5, anim: 'idle' as const });

describe('remotePlayers.settle — 무대가 걷히면 바닥으로', () => {
  beforeEach(() => remotePlayers.clear());

  it('원판 위(0.75) 에 있던 몸이 자리는 그대로, 높이만 0 이 된다', () => {
    remotePlayers.add(snap('a', 0), 0);
    remotePlayers.move('a', 3, 4, 0.75, 1, 'walk', 1000);
    remotePlayers.settle(2000);
    const a = remotePlayers.get('a')!;
    const out = { x: 0, z: 0, y: 0, heading: 0 };
    expect(sampleAt(a.buffer, 2000 + INTERP_DELAY_MS, out)).toBe(true);
    expect(out).toEqual({ x: 3, z: 4, y: 0, heading: 1 });
    expect(a.anim).toBe('idle');
  });

  it('이미 바닥에 선 몸은 건드리지 않는다 — 샘플이 안 는다', () => {
    remotePlayers.add(snap('b', 0), 0);
    remotePlayers.move('b', 3, 4, 0, 1, 'run', 1000);
    const before = remotePlayers.get('b')!.buffer.length;
    remotePlayers.settle(2000);
    expect(remotePlayers.get('b')!.buffer.length).toBe(before);
    expect(remotePlayers.get('b')!.anim).toBe('run');
  });

  it('샘플이 한 번도 안 온 몸(입장 자세만)도 높이가 있으면 내려선다', () => {
    remotePlayers.add(snap('c', 0.5), 0);
    remotePlayers.get('c')!.buffer.length = 0;
    remotePlayers.get('c')!.pose.y = 0.5;
    remotePlayers.settle(2000);
    expect(remotePlayers.get('c')!.pose.y).toBe(0);
    expect(remotePlayers.get('c')!.buffer.at(-1)).toEqual({ t: 2000, x: 1, z: 2, y: 0, heading: 0.5 });
  });
});
