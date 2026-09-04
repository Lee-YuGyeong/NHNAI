/**
 * 엿듣기 — 배회하는 둘이 스치면 두 마디, 들리는 범위 안일 때만 내게 든다 (D5). 시계는 손으로 넘긴다.
 *
 * ★ **판에서는 지금 이게 안 걸린다** (2026-09-03 사용자: 「계획서에 없던 로봇 개체는 일단 없애줘」).
 *   엿듣기는 배회하는 둘이 **서로 스쳐야** 성립하는데 그 둘이던 배경 여섯을 걷어내서, scenario2 의 OVERHEAR_PAIR 가 비어 있다.
 *   모듈은 멀쩡하므로 시험도 그대로 둔다 — 여기 id 는 자리표의 것이 아니라 **가짜 둘**이다(walker-a · walker-b).
 *   기획서의 군중(휴게 「스무 개체」)을 캐스팅해 배회하는 둘이 생기면, OVERHEAR_PAIR 에 그 둘을 적는 것으로 판에서도 다시 걸린다.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { OVERHEAR_RULE } from '../../../src/features/world2/corefield';
import { overhear, pickKind, type OverhearHost } from '../../../src/features/world2/overhear';
import { OVERHEAR } from '../../../src/features/world2/script';

function makeHost() {
  const said: { id: string; text: string }[] = [];
  const heard: string[] = [];
  const host: OverhearHost = {
    say: (id, text) => said.push({ id, text }),
    heard: (kind) => heard.push(kind),
  };
  return { host, said, heard };
}

const pos = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  new Map([
    ['walker-a', a],
    ['walker-b', b],
  ]);

describe('엿듣기 — 스치면 두 마디', () => {
  beforeEach(() => overhear.reset());

  it('두 마디는 대본 표의 것 그대로다', () => {
    expect(OVERHEAR.resting?.[0]).toBe('쉬었어?');
    expect(OVERHEAR.resting?.[1]).toBe('…아직.');
    expect(OVERHEAR.memorial?.[1]).toBe('열다섯.');
  });

  it('★ 시각이 지나고 둘이 1.5 m 안에 들면 A 가 말하고, replyMs 뒤 B 가 받고, 그때 주제가 열린다', () => {
    const { host, said, heard } = makeHost();
    overhear.bind(host);
    overhear.schedule('corridor', [{ at: 5000, kind: 'resting', pair: ['walker-a', 'walker-b'] }]);
    const me = { x: 0, z: 0 };
    // 시각 전 — 스쳐도 안 낸다
    overhear.tick(4000, pos({ x: 0.7, z: -2 }, { x: -0.7, z: -2 }), me, 6);
    expect(said).toEqual([]);
    // 시각 뒤인데 멀다
    overhear.tick(5000, pos({ x: 0.7, z: 2 }, { x: -0.7, z: -6 }), me, 6);
    expect(said).toEqual([]);
    // 스쳤다
    overhear.tick(6000, pos({ x: 0.7, z: -2 }, { x: -0.7, z: -2 }), me, 6);
    expect(said).toEqual([{ id: 'walker-a', text: OVERHEAR.resting![0] }]);
    expect(heard).toEqual([]);
    overhear.tick(6000 + OVERHEAR_RULE.replyMs - 1, pos({ x: 0.7, z: -2.5 }, { x: -0.7, z: -1.5 }), me, 6);
    expect(said).toHaveLength(1);
    overhear.tick(6000 + OVERHEAR_RULE.replyMs, pos({ x: 0.7, z: -3 }, { x: -0.7, z: -1 }), me, 6);
    expect(said).toEqual([
      { id: 'walker-a', text: OVERHEAR.resting![0] },
      { id: 'walker-b', text: OVERHEAR.resting![1] },
    ]);
    expect(heard).toEqual(['resting']);
    expect(overhear.count()).toBe(1);
    // 같은 슬롯은 두 번 안 낸다
    overhear.tick(20000, pos({ x: 0.7, z: -2 }, { x: -0.7, z: -2 }), me, 6);
    expect(said).toHaveLength(2);
  });

  it('들리는 범위 밖이면 나에게는 아무것도 안 든다 — 그래도 둘은 말했으니 슬롯은 쓴 것이다', () => {
    const { host, said, heard } = makeHost();
    overhear.bind(host);
    overhear.schedule('corridor', [{ at: 0, kind: 'carry', pair: ['walker-a', 'walker-b'] }]);
    const me = { x: 8, z: -9 };
    overhear.tick(1000, pos({ x: 0.7, z: 1 }, { x: -0.7, z: 1 }), me, 6);
    overhear.tick(1000 + OVERHEAR_RULE.replyMs, pos({ x: 0.7, z: 1 }, { x: -0.7, z: 1 }), me, 6);
    expect(said).toEqual([]);
    expect(heard).toEqual([]);
    expect(overhear.count()).toBe(1);
  });

  it('기록 복도(반경 0)에서는 붙어 있어도 안 들린다', () => {
    const { host, said } = makeHost();
    overhear.bind(host);
    overhear.schedule('archive', [{ at: 0, kind: 'memorial', pair: ['walker-a', 'walker-b'] }]);
    const me = { x: 0, z: 0 };
    overhear.tick(1000, pos({ x: 0.2, z: 0 }, { x: -0.2, z: 0 }), me, 0);
    expect(said).toEqual([]);
  });

  it('★ 판당 perRun(3) 을 넘기지 않는다 — 넷째 슬롯은 스쳐도 안 낸다', () => {
    const { host, said } = makeHost();
    overhear.bind(host);
    overhear.schedule('rest', [
      { at: 0, kind: 'resting', pair: ['walker-a', 'walker-b'] },
      { at: 0, kind: 'carry', pair: ['walker-a', 'walker-b'] },
      { at: 0, kind: 'danger', pair: ['walker-a', 'walker-b'] },
      { at: 0, kind: 'window', pair: ['walker-a', 'walker-b'] },
    ]);
    const me = { x: 0, z: 0 };
    const together = pos({ x: 0.5, z: 0 }, { x: -0.5, z: 0 });
    for (let t = 1000; t < 1000 + 10 * OVERHEAR_RULE.replyMs; t += OVERHEAR_RULE.replyMs) overhear.tick(t, together, me, Infinity);
    expect(overhear.count()).toBe(OVERHEAR_RULE.perRun);
    expect(said).toHaveLength(OVERHEAR_RULE.perRun * 2);
    expect(overhear.remaining()).toBe(0);
    // 한 번에 하나씩 — 첫 마디와 둘째 마디 사이에 다른 슬롯이 끼지 않았다
    expect(said.map((s) => s.text)).toEqual([...OVERHEAR.resting!, ...OVERHEAR.carry!, ...OVERHEAR.danger!]);
  });

  it('방을 옮기면 앞 방의 슬롯과 기다리던 둘째 마디는 사라진다', () => {
    const { host, said } = makeHost();
    overhear.bind(host);
    overhear.schedule('corridor', [{ at: 0, kind: 'resting', pair: ['walker-a', 'walker-b'] }]);
    overhear.tick(1000, pos({ x: 0.5, z: 0 }, { x: -0.5, z: 0 }), { x: 0, z: 0 }, 6);
    expect(said).toHaveLength(1);
    overhear.schedule('rest', []);
    overhear.tick(1000 + OVERHEAR_RULE.replyMs, pos({ x: 0.5, z: 0 }, { x: -0.5, z: 0 }), { x: 0, z: 0 }, Infinity);
    expect(said).toHaveLength(1);
    expect(overhear.room()).toBe('rest');
  });

  it('pickKind — 안 연 주제를 먼저, 다 열렸으면 첫 후보', () => {
    const opened = new Set(['resting']);
    expect(pickKind(['resting', 'carry', 'danger'], (k) => opened.has(k))).toBe('carry');
    expect(pickKind(['resting'], (k) => opened.has(k))).toBe('resting');
    expect(pickKind([], () => false)).toBeNull();
  });
});
