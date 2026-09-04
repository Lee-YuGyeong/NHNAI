/**
 * 의심도 감지 — 점프가 의심도를 올리고, 가만히 있어도 안 내려가는지 잠근다.
 * 그리고 **쳐다보는 것으로는 오르지 않는다** (2026-09-01 사용자: "시선 쳐다보는 거나 이런 걸로 의심도를 올리지 마 —
 * 너무 어이없게 죽는 경우가 많아"). 응시·관심·급회전은 규칙에서 뺐다 — 마우스를 움직이는 것만으로 게이지가 찼기 때문이다.
 * 남은 것은 내가 단추를 눌러서 하는 짓뿐이라(뒷걸음·점프·이모트), 여기서 잠그는 것도 그것들이다.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { bystanders } from '../../src/world/mp/bystanders';
import { resetSensor, sense, setBackstepJudge, watchJump, type BackstepEpisode } from '../../src/world/mp/sensor';
import { suspicion } from '../../src/world/mp/suspicion';

const base = { dt: 1 / 60, x: 0, z: 0, fx: 0, fz: -1, anim: 'idle' as const, moveZ: 0, jumped: false };

describe('의심도 감지', () => {
  beforeEach(() => {
    bystanders.clear();
    resetSensor();
  });

  it('점프하면 오른다 — 10초 안에 또 뛰면 더 (보는 AI 가 있을 때)', () => {
    bystanders.set('UNIT-07', 0, 5, Math.PI); // 5m 앞에서 나를 마주 본다 (정면 −z)
    sense({ ...base, jumped: true }, 1000);
    const first = suspicion.get().value;
    expect(first).toBeGreaterThanOrEqual(10);
    expect(suspicion.get().last?.reason).toBe('돌발');
    sense({ ...base, jumped: true }, 4000);
    expect(suspicion.get().value - first).toBeGreaterThanOrEqual(14);
  });

  it('★ watchJump(false) 면 뛰어도 아무 일도 없다 — 시나리오 2 가 이걸 끈다 (2026-09-03 사용자)', () => {
    bystanders.set('UNIT-07', 0, 5, Math.PI);
    watchJump(false);
    sense({ ...base, jumped: true }, 1000);
    sense({ ...base, jumped: true }, 4000);
    expect(suspicion.get().value).toBe(0);
    // 되돌리면 본판은 그대로다
    watchJump(true);
    sense({ ...base, jumped: true }, 20000);
    expect(suspicion.get().value).toBeGreaterThanOrEqual(10);
  });

  it('아무도 안 보면 뛰어도 안 오른다 — 빈 복도의 점프는 아무도 모른다 (2026-08-30)', () => {
    sense({ ...base, jumped: true }, 1000);
    expect(suspicion.get().value).toBe(0);
    // 등을 돌린 개체도 못 본다
    bystanders.set('UNIT-07', 0, 5, 0); // 5m 앞에서 저쪽(+z)을 본다
    sense({ ...base, jumped: true }, 4000);
    expect(suspicion.get().value).toBe(0);
    // 방향을 모르는 개체는 거리로만 — 가까우면 본 것으로 친다
    bystanders.set('UNIT-12', 3, 0);
    sense({ ...base, jumped: true }, 20000);
    expect(suspicion.get().value).toBeGreaterThanOrEqual(10);
  });

  it('시야를 아무리 홱홱 돌려도 안 오른다 — 급회전은 규칙에서 뺐다 (2026-09-01 사용자)', () => {
    bystanders.set('UNIT-07', 0, 5, Math.PI);
    let t = 0;
    for (let i = 0; i < 20; i++) {
      t += 16;
      sense({ ...base }, t); // 프레임당 36° 로 두 바퀴를 돌리던 자리다
    }
    expect(suspicion.get().value).toBe(0);
  });

  it('가만히 있는다고 내려가지 않는다 — 의심은 말로만 지운다', () => {
    suspicion.bump(20, '감정', 0);
    for (let i = 0; i < 600; i++) sense(base, 1000 + i * 16);
    expect(suspicion.get().value).toBe(20);
  });
});

/**
 * 뒷걸음은 **곁에 개체가 있어야** 성립한다. 여태 방에서 온 사람들만 훑었는데,
 * 혼자 하는 챕터에서는 그 명부가 늘 비어 있다 — 맵이 세운 순찰 경비 앞에서 물러서도 아무 일이 없었다.
 * 그러니 여기서 잠그는 것은 「어디서 곁을 찾는가」와, **쳐다보는 것만으로는 아무 일도 안 일어난다**는 것이다.
 */
describe('곁에 있는 개체', () => {
  beforeEach(() => {
    bystanders.clear();
    resetSensor();
    setBackstepJudge(null);
  });

  /** +z 를 보고 3초 서 있는다 — 예전 규칙이라면 공짜 구간(1.6초)을 넘겨 게이지가 찼을 시간이다 */
  const stare = () => {
    let t = 1000;
    for (let i = 0; i < 180; i += 1) {
      sense({ ...base, fz: 1, dt: 1 / 60 }, t);
      t += 16;
    }
  };

  it('마주 본 경비를 오래 쳐다봐도 안 오른다 — 응시는 규칙에서 뺐다 (2026-09-01 사용자)', () => {
    bystanders.set('UNIT-07', 0, 5, Math.PI); // 5m 앞에서 나를 마주 본다
    stare();
    expect(suspicion.get().value).toBe(0);
  });

  it('인간 전용 물건을 들여다봐도 안 오른다 — 관심도 같이 뺐다', () => {
    bystanders.set('UNIT-07', 0, 5, Math.PI);
    stare();
    expect(suspicion.get().value).toBe(0);
  });

  /**
   * 뒷걸음은 값을 프레임에서 정하지 않는다 — **한 장면**을 모아 판정기(AI)에 넘긴다 (2026-08-30 사용자).
   * 그러니 여기서 잠그는 것은 "언제 장면이 만들어지는가"다.
   *
   * 나는 +z 를 보고 −z 쪽으로 물러선다 (앞이 +z 이므로 뒤 = −z).
   */
  const backAway = (t0: number, frames: number, z0 = 0) => {
    let t = t0;
    let z = z0;
    for (let i = 0; i < frames; i += 1) {
      z -= 0.03; // 프레임당 3cm — 60프레임에 1.8m
      sense({ ...base, z, fz: 1, moveZ: -1, dt: 1 / 60 }, t);
      t += 16;
    }
    // 물러서기를 멈춘다 — 유예(0.35초)가 지나면 장면이 닫힌다
    for (let i = 0; i < 40; i += 1) {
      sense({ ...base, z, fz: 1, moveZ: 0, dt: 1 / 60 }, t);
      t += 16;
    }
    return t;
  };

  it('뒷걸음 한 장면을 판정기에 넘긴다 — 얼마나·어디서·상대가 다가왔나', () => {
    const seen: BackstepEpisode[] = [];
    setBackstepJudge((ep) => seen.push(ep));
    bystanders.set('UNIT-07', 0, 3, Math.PI); // 3m 앞에서 나를 마주 본다
    backAway(1000, 60);
    expect(seen).toHaveLength(1);
    // 멀어져도 마주 보고 있는 동안은 한 장면으로 이어진다 — 3m 에서 열려 1.8m 를 물러선 1초짜리다
    expect(seen[0].seconds).toBeGreaterThan(0.9);
    expect(seen[0].meters).toBeGreaterThan(1.6);
    expect(seen[0].watchers[0].kind).toBe('ai');
    // 나는 멀어졌다 — 상대가 다가온 것이 아니다
    expect(seen[0].watchers[0].approaching).toBe(false);
    expect(seen[0].watchers[0].to).toBeGreaterThan(seen[0].watchers[0].from);
    // 값은 센서가 안 매긴다 — 판정기 몫이다
    expect(suspicion.get().value).toBe(0);
  });

  it('등을 돌린 개체 앞에서는 장면 자체가 안 생긴다 — 물러서는 걸 못 본다', () => {
    const seen: BackstepEpisode[] = [];
    setBackstepJudge((ep) => seen.push(ep));
    bystanders.set('UNIT-07', 0, 3, 0); // 3m 앞, 등을 돌렸다
    backAway(1000, 60);
    expect(seen).toHaveLength(0);
  });

  it('멀어져도 마주 본 채 계속 물러서면 한 장면이다 — 4.5m 에서 토막 나지 않는다', () => {
    const seen: BackstepEpisode[] = [];
    setBackstepJudge((ep) => seen.push(ep));
    bystanders.set('UNIT-07', 0, 3, Math.PI);
    backAway(1000, 100); // 1.7초 · 3m — 개체는 6m 밖으로 멀어진다
    expect(seen).toHaveLength(1);
    expect(seen[0].seconds).toBeGreaterThan(1.5);
    expect(seen[0].watchers[0].from).toBeLessThan(3.5);
    expect(seen[0].watchers[0].to).toBeGreaterThan(5.5);
  });

  it('스치듯 한 걸음은 버린다 — 판정을 부를 일이 아니다', () => {
    const seen: BackstepEpisode[] = [];
    setBackstepJudge((ep) => seen.push(ep));
    bystanders.set('UNIT-07', 0, 3, Math.PI);
    backAway(1000, 20); // 0.33초
    expect(seen).toHaveLength(0);
  });

  it('판정기가 없으면 폴백으로 스스로 친다 — 규칙이 조용히 죽지 않게', () => {
    setBackstepJudge(null);
    bystanders.set('UNIT-07', 0, 3, Math.PI);
    backAway(1000, 60);
    expect(suspicion.get().value).toBeGreaterThan(0);
    expect(suspicion.get().last?.reason).toBe('뒷걸음');
  });

  it('장면을 떠난 개체는 더 안 보인다 — 맵을 옮기면 앞 맵의 경비가 남으면 안 된다', () => {
    bystanders.set('UNIT-07', 0, 5);
    bystanders.drop('UNIT-07');
    stare();
    expect(suspicion.get().value).toBe(0);
  });
});
