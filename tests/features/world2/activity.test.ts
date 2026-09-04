/**
 * 하던 일이 몸으로 나오는가 — activity.ts.
 *
 * 세는 것 셋이다. **폭**(3~5 m 에서 읽히되 발작으로 안 보이는 선), **결정성**(같은 몸은 늘 같은 박자, 다른 몸은 절대 같은 박자가 아니다),
 * 그리고 **일마다 다른 것**(그리는 손은 크게 오가고 문을 보는 것은 거의 안 움직인다 — 그 차이가 없으면 이 시스템이 없는 것과 같다).
 * 뼈도 three 도 안 부른다: 이 파일이 지키는 것은 수뿐이고, 그 수를 뼈에 얹는 것은 CastBody 다.
 */
import { describe, expect, it } from 'vitest';

import { ACT_LIMIT, actGain, actOn, actPose, type ActPose } from '../../../src/features/world2/activity';
import { CAST_BY_ID, type Act } from '../../../src/features/world2/cast';
import { ROOM_UNITS } from '../../../src/features/world2/scenario2';

/** Unit 의 seedOf 와 같은 셈 — 시험이 실제 개체의 씨앗으로 돌린다 */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return h;
}

/*
 * 여덟 전부를 손으로 적는다 — Act 에 이름을 늘리고 여기 안 넣으면 폭 · 결정성 · 튐 검사가 **하나도 안 돈다.**
 * 뒤 넷은 2026-09-03 에 늘어난 것들이다 (사용자: 「다른객체들 왜 아무것도 안움직여」).
 */
const ACTS: readonly Act[] = ['paint', 'read', 'watch', 'wait', 'shift', 'scan', 'fidget', 'lean'];
const STEP = 1 / 30;

/** 초 단위로 훑는다 — 프레임마다 한 번, 기본 60 초 (가장 긴 주기 14 초를 네 바퀴) */
function sweep(act: Act, seed: number, seconds = 60, t0 = 0): ActPose[] {
  const out: ActPose[] = [];
  for (let i = 0; i * STEP < seconds; i += 1) out.push(actPose(act, t0 + i * STEP, seed));
  return out;
}

/** 이 자세에서 읽을 수 있는 모든 각 — 폭을 셀 때 하나도 안 빠뜨리려고 한 줄로 편다 */
function values(p: ActPose): { k: string; v: number; cap: number }[] {
  return [
    { k: 'torso.pitch', v: p.torso.pitch, cap: ACT_LIMIT.torso },
    { k: 'torso.yaw', v: p.torso.yaw, cap: ACT_LIMIT.torso },
    { k: 'torso.roll', v: p.torso.roll, cap: ACT_LIMIT.torso },
    { k: 'head.pitch', v: p.head.pitch, cap: ACT_LIMIT.head },
    { k: 'head.yaw', v: p.head.yaw, cap: ACT_LIMIT.head },
    { k: 'armR.raise', v: p.armR.raise, cap: ACT_LIMIT.raise },
    { k: 'armR.bend', v: p.armR.bend, cap: ACT_LIMIT.raise },
    { k: 'armR.swing', v: p.armR.swing, cap: ACT_LIMIT.swing },
    { k: 'armL.raise', v: p.armL.raise, cap: ACT_LIMIT.raise },
    { k: 'armL.bend', v: p.armL.bend, cap: ACT_LIMIT.raise },
    { k: 'armL.swing', v: p.armL.swing, cap: ACT_LIMIT.swing },
    { k: 'lean', v: p.lean, cap: ACT_LIMIT.lean },
  ];
}

const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
/** 초당 간 거리(rad/s) — 「얼마나 자주 움직이나」. 폭만 재면 가끔 크게 도는 것과 쉬지 않고 도는 것이 같아 보인다 */
function travel(s: ActPose[], f: (p: ActPose) => number): number {
  let t = 0;
  for (let i = 1; i < s.length; i += 1) t += Math.abs(f(s[i]) - f(s[i - 1]));
  return t / (s.length * STEP);
}

describe('폭 — 3~5 m 에서 읽히되 발작으로 안 보이는 선', () => {
  it('어느 일도 ACT_LIMIT 을 안 넘는다 (팔 25° 흔들림 · 든 팔 50° · 고개 20° · 앞뒤 0.1 m)', () => {
    // 넘은 것만 모아서 한 번에 본다 — 프레임마다 expect 를 부르면 수십만 번이라 시험이 시간에 걸린다
    const over: string[] = [];
    for (const act of ACTS) {
      for (const seed of [0, 7, 137, 272, 999]) {
        for (const p of sweep(act, seed, 90)) {
          for (const { k, v, cap } of values(p)) {
            if (!Number.isFinite(v) || Math.abs(v) > cap + 1e-9) over.push(`${act}/${seed}/${k}=${v}`);
          }
        }
      }
    }
    expect(over.slice(0, 5)).toEqual([]);
  });

  it('한 프레임에 튀지 않는다 — 어느 값도 1/30 초에 4° · 1 cm 를 안 넘는다 (튀면 그게 발작이다)', () => {
    const jumps: string[] = [];
    for (const act of ACTS) {
      for (const seed of [0, 137, 999]) {
        const s = sweep(act, seed, 90);
        for (let i = 1; i < s.length; i += 1) {
          const a = values(s[i - 1]);
          const b = values(s[i]);
          for (let k = 0; k < a.length; k += 1) {
            const lim = a[k].k === 'lean' ? 0.01 : 4 * (Math.PI / 180);
            if (Math.abs(b[k].v - a[k].v) > lim) jumps.push(`${act}/${seed}/${a[k].k}@${(i * STEP).toFixed(2)}s`);
          }
        }
      }
    }
    expect(jumps.slice(0, 5)).toEqual([]);
  });
});

describe('결정성 — 같은 몸은 늘 같은 박자, 다른 몸은 절대 같은 박자가 아니다', () => {
  it('같은 (일 · 시각 · 씨앗)이면 값이 똑같다 — 프레임을 건너뛰어도 몸이 안 튄다', () => {
    for (const act of ACTS) {
      expect(actPose(act, 12.345, 137)).toEqual(actPose(act, 12.345, 137));
      // 큰 t 에서도 (주기 나머지 셈이 음수로 새지 않는다)
      expect(actPose(act, 3600.5, 137)).toEqual(actPose(act, 3600.5, 137));
    }
  });

  it('씨앗이 다르면 두 몸이 한 박자로 안 움직인다 — 복도의 실제 넷으로 센다', () => {
    const ids = ROOM_UNITS.corridor;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = sweep('watch', seedOf(ids[i]), 30);
        const b = sweep('watch', seedOf(ids[j]), 30);
        // 같은 일을 시켜도 30 초 동안 고개 각이 늘 같을 수는 없다
        const same = a.every((p, k) => Math.abs(p.head.yaw - b[k].head.yaw) < 1e-6);
        expect(same, `${ids[i]} vs ${ids[j]}`).toBe(false);
      }
    }
  });
});

describe('일마다 다르다 — 이 차이가 없으면 시스템이 없는 것과 같다', () => {
  const seed = seedOf('u137');

  it('그린다 — 몸이 획을 긋고, 8~12 초마다 멈춰 반 걸음 물러나 그림 전체를 본다', () => {
    const s = sweep('paint', seed, 40);
    const work = s.filter((p) => p.phase === 'work');
    const pause = s.filter((p) => p.phase === 'pause');
    // 그리는 참이 훨씬 길다 — 물러나 보는 것은 2 초짜리 쉼표다
    expect(pause.length).toBeGreaterThan(0);
    expect(work.length).toBeGreaterThan(pause.length * 3);
    /*
     * ★ 획은 **몸이 긋는다** — 팔은 하나도 안 쓴다 (2026-09-03 사용자 스크린샷: 팔을 돌리면 Tripo 리그의 스킨이 찢어져
     *   팔뚝이 몸에서 떨어져 나갔다). 몸통이 좌우로 돌고 벽 쪽으로 기울고 고개가 그 끝을 좇는 것이 그리는 시늉의 전부다.
     */
    expect(s.every((p) => p.armR.raise === 0 && p.armR.bend === 0 && p.armR.swing === 0)).toBe(true);
    expect(s.every((p) => p.armL.raise === 0 && p.armL.bend === 0 && p.armL.swing === 0)).toBe(true);
    // 몸통이 획을 따라 좌우로 돈다 (10° 이상 폭)
    expect(range(work.map((p) => p.torso.yaw))).toBeGreaterThan(10 * (Math.PI / 180));
    // 그리는 동안은 벽 쪽으로 기울고(+), 물러난 참에는 뒤로 물러난다(−)
    expect(Math.min(...pause.map((p) => p.lean))).toBeLessThan(-0.05);
    expect(Math.max(...work.map((p) => p.lean))).toBeGreaterThan(0.03);
    // 고개가 그 끝을 따라간다
    expect(range(work.map((p) => p.head.yaw))).toBeGreaterThan(5 * (Math.PI / 180));
  });

  it('읽는다 — 고개만 느리게 흐른다. 팔은 하나도 안 쓴다', () => {
    const s = sweep('read', seedOf('u104'), 60);
    expect(s.every((p) => p.armR.raise === 0 && p.armR.bend === 0 && p.armR.swing === 0)).toBe(true);
    expect(s.every((p) => p.armL.raise === 0 && p.armL.bend === 0 && p.armL.swing === 0)).toBe(true);
    expect(range(s.map((p) => p.head.yaw))).toBeGreaterThan(20 * (Math.PI / 180));
    // 이따금 다가섰다 물러난다 — 8 cm 안쪽으로만
    expect(Math.max(...s.map((p) => p.lean))).toBeGreaterThan(0.05);
    expect(Math.min(...s.map((p) => p.lean))).toBeGreaterThanOrEqual(0);
    // 늘 제 일을 하는 중이다 — 물러나 보는 참은 그리는 것만 갖는다
    expect(s.every((p) => p.phase === 'work')).toBe(true);
  });

  it('문을 본다 — 그리는 것보다 훨씬 조용하다. 고개는 몇 도만, 팔은 안 쓴다', () => {
    const watch = sweep('watch', seedOf('u089'), 60);
    const paint = sweep('paint', seedOf('u137'), 60);
    expect(watch.every((p) => p.armR.raise === 0 && p.armL.raise === 0)).toBe(true);
    expect(watch.every((p) => p.lean === 0)).toBe(true);
    /*
     * 고개는 도는데(멈춘 몸이 아니다) **간 거리**가 그리는 것의 절반도 안 된다.
     * 폭(max−min)이 아니라 간 거리로 세는 이유: 6 초에 한 번 7 도 도는 고개와 쉬지 않고 7 도씩 오가는 고개는 폭이 같다 —
     * 화면에서 갈리는 것은 「얼마나 자주 움직이나」다 (문을 보는 것 2.4°/s · 그리는 것 6.7°/s)
     */
    expect(Math.max(...watch.map((p) => Math.abs(p.head.yaw)))).toBeLessThanOrEqual(8 * (Math.PI / 180));
    expect(travel(watch, (p) => p.head.yaw)).toBeGreaterThan(1 * (Math.PI / 180));
    expect(travel(watch, (p) => p.head.yaw)).toBeLessThan(travel(paint, (p) => p.head.yaw) * 0.6);
    // 훑는 쪽을 번갈아 바꾼다 — 늘 한쪽으로만 도는 고개는 고장이다
    expect(Math.max(...watch.map((p) => p.head.yaw))).toBeGreaterThan(0);
    expect(Math.min(...watch.map((p) => p.head.yaw))).toBeLessThan(0);
  });

  it('기다린다 — 무게 이동 · 곁눈질 · 제 손 내려다보기. 남들이 쓰는 낱말만 쓴다 (구별되면 안 되는 몸이라)', () => {
    const s = sweep('wait', seedOf('ally-timid'), 60);
    expect(range(s.map((p) => p.torso.roll))).toBeGreaterThan(2 * (Math.PI / 180));
    expect(range(s.map((p) => p.head.yaw))).toBeGreaterThan(8 * (Math.PI / 180));
    // 손 확인도 고개로 낸다 — 이따금 제 손을 내려다본다 (팔은 어느 일에서도 안 돈다, CastBody ★)
    expect(Math.max(...s.map((p) => p.head.pitch))).toBeGreaterThan(5 * (Math.PI / 180));
    expect(s.every((p) => p.armR.bend === 0 && p.armL.bend === 0)).toBe(true);
    expect(s.every((p) => p.lean === 0)).toBe(true);
  });
});

/*
 * 2026-09-03 사용자: 「다른객체들 왜 아무것도 안움직여 자연스럽게 움직이게 해줘야지」.
 * 그 지적을 시험으로 바꾼 자리다. 앞 넷과 반대로 이 넷은 **폭이 아니라 주기로** 읽히므로,
 * 세는 것도 다르다: 「크게 움직이나」가 아니라 **「멎은 프레임이 없나」** 다.
 */
describe('아무 일도 안 적힌 몸도 멎어 있지 않다 — 늘어난 넷', () => {
  const NEW: readonly Act[] = ['shift', 'scan', 'fidget', 'lean'];

  it('★ 넷 다 30 초 동안 한 번도 안 멎는다 — 어느 1 초 구간에도 자세가 그대로인 곳이 없다', () => {
    const frozen: string[] = [];
    for (const act of NEW) {
      for (const id of ['bg-rest-1', 'bg-rest-7', 'bg-c2-061', 'u118']) {
        const s = sweep(act, seedOf(id), 30);
        // 1 초(30 프레임) 창을 밀면서, 그 창 안에서 어느 값도 0.05° 넘게 안 움직인 구간이 있으면 「멎었다」
        for (let i = 0; i + 30 < s.length; i += 15) {
          const win = s.slice(i, i + 30);
          const moved = values(win[0]).some((_, k) => range(win.map((p) => values(p)[k].v)) > 0.05 * (Math.PI / 180));
          if (!moved) frozen.push(`${act}/${id}@${(i * STEP).toFixed(1)}s`);
        }
      }
    }
    expect(frozen.slice(0, 5)).toEqual([]);
  });

  it('팔은 여기서도 한 줄도 안 돈다 — 뼈를 돌리면 스킨이 찢어진다 (CastBody 의 applyAct ★)', () => {
    for (const act of NEW) {
      const s = sweep(act, seedOf('bg-rest-3'), 40);
      expect(s.every((p) => p.armR.raise === 0 && p.armR.bend === 0 && p.armR.swing === 0), act).toBe(true);
      expect(s.every((p) => p.armL.raise === 0 && p.armL.bend === 0 && p.armL.swing === 0), act).toBe(true);
    }
    // 물러나 보는 참은 그리는 것만 갖는다 — 이 넷은 늘 제 일을 하는 중이다
    for (const act of NEW) expect(sweep(act, 137, 40).every((p) => p.phase === 'work'), act).toBe(true);
  });

  it('무게중심을 옮긴다 — 몸통이 한쪽으로 기울었다 반대로 넘어간다. 고개는 반대쪽에 남는다', () => {
    const s = sweep('shift', seedOf('u201'), 60);
    expect(range(s.map((p) => p.torso.roll))).toBeGreaterThan(8 * (Math.PI / 180));
    // 고개는 몸통과 **반대 부호**다 — 같이 기울면 넘어지는 인형이다
    const tilted = s.filter((p) => Math.abs(p.torso.roll) > 4 * (Math.PI / 180));
    expect(tilted.every((p) => p.torso.roll * p.head.yaw <= 0)).toBe(true);
    // 아주 느리다 — 문을 보는 것(가장 조용한 앞 넷)보다 고개가 덜 간다
    expect(travel(s, (p) => p.head.yaw)).toBeLessThan(travel(sweep('watch', seedOf('u089'), 60), (p) => p.head.yaw));
    expect(s.every((p) => p.lean === 0)).toBe(true);
  });

  it('둘러본다 — 고개가 방 전체를 훑는다 (읽는 것만큼 넓게, 절반 느리게)', () => {
    const s = sweep('scan', seedOf('bg-c2-061'), 90);
    const read = sweep('read', seedOf('u104'), 90);
    expect(range(s.map((p) => p.head.yaw))).toBeGreaterThan(20 * (Math.PI / 180));
    expect(travel(s, (p) => p.head.yaw)).toBeLessThan(travel(read, (p) => p.head.yaw));
    expect(s.every((p) => p.lean === 0)).toBe(true);
  });

  it('제 손을 확인한다 — 기다리는 것과 같은 동작인데 훨씬 자주 한다 (그 빈도가 성격이다)', () => {
    const s = sweep('fidget', seedOf('u118'), 60);
    const w = sweep('wait', seedOf('ally-timid'), 60);
    expect(Math.max(...s.map((p) => p.head.pitch))).toBeGreaterThan(10 * (Math.PI / 180));
    // 고개를 숙였다 드는 횟수가 곧 빈도다 — 간 거리로 센다
    expect(travel(s, (p) => p.head.pitch)).toBeGreaterThan(travel(w, (p) => p.head.pitch) * 1.5);
    // 손을 보는 동안에는 곁눈질이 멎는다
    const looking = s.filter((p) => p.head.pitch > 12 * (Math.PI / 180));
    expect(looking.length).toBeGreaterThan(0);
    expect(Math.max(...looking.map((p) => Math.abs(p.head.yaw)))).toBeLessThan(1.5 * (Math.PI / 180));
  });

  it('기댄다 — 흔들림이 아니라 자세다. 기운 채 있고, 벽이 뒤라 앞뒤는 늘 뒤로 남는다', () => {
    const s = sweep('lean', seedOf('bg-rest-2'), 120);
    // 이 넷 중 폭이 가장 크다 — 멀리서 실루엣이 갈리는 유일한 것
    expect(range(s.map((p) => p.torso.roll))).toBeGreaterThan(12 * (Math.PI / 180));
    expect(range(s.map((p) => p.torso.roll))).toBeGreaterThan(range(sweep('shift', seedOf('bg-rest-2'), 120).map((p) => p.torso.roll)));
    // 앞으로 기울면 기댄 것이 아니라 일어서는 것이다
    expect(s.every((p) => p.lean < 0)).toBe(true);
    // 기댄 쪽으로 목도 눕는다 — 몸통과 같은 부호다 (무게 옮김과 정반대다)
    const tilted = s.filter((p) => Math.abs(p.torso.roll) > 5 * (Math.PI / 180));
    expect(tilted.every((p) => p.torso.roll * p.head.yaw >= 0)).toBe(true);
  });

  it('벽을 따라 선 열여섯이 한 박자로 안 움직인다 — 같은 일을 시켜도 씨앗이 갈린다', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `bg-rest-${i + 1}`);
    const seen = new Set<string>();
    for (const id of ids) {
      const key = sweep('scan', seedOf(id), 8)
        .filter((_, i) => i % 30 === 0)
        .map((p) => p.head.yaw.toFixed(6))
        .join('|');
      expect(seen.has(key), `${id} 이 앞의 것과 같은 박자다`).toBe(false);
      seen.add(key);
    }
  });

  it('배역표의 모든 몸이 하던 일을 든다 — 총 든 셋만 없다 (그 몸은 activity 를 안 읽는다)', () => {
    const actless = [...CAST_BY_ID.values()].filter((c) => !c.look.act).map((c) => c.id);
    expect(actless.sort()).toEqual(['guard21', 'guard22', 'guard23']);
    // 총 든 셋은 enforcer 로 그려진다 — act 을 적어 두면 코드가 거짓말을 한다
    expect(actless.every((id) => CAST_BY_ID.get(id)?.look.enforcer === true)).toBe(true);
  });
});

describe('언제 꺼지나 — 걷는 몸과 말을 듣는 몸은 제 일을 안 한다', () => {
  it('actOn — 일이 없거나 · 걷거나 · 나를 보는 중이거나 · 멎은 몸이면 안 한다', () => {
    expect(actOn({ act: 'paint', alive: true, walking: false, attending: false })).toBe(true);
    expect(actOn({ act: undefined, alive: true, walking: false, attending: false })).toBe(false);
    expect(actOn({ act: 'paint', alive: true, walking: true, attending: false })).toBe(false);
    expect(actOn({ act: 'paint', alive: true, walking: false, attending: true })).toBe(false);
    expect(actOn({ act: 'paint', alive: false, walking: false, attending: false })).toBe(false);
    // 안 주면 살아 있고 안 걷는 것으로 본다 (CastBody 의 기본값과 같다)
    expect(actOn({ act: 'read' })).toBe(true);
  });

  it('actGain — 말을 걸면 0.3 초 안에 손이 내려오고, 놓으면 다시 붙는다', () => {
    let g = 1;
    for (let i = 0; i < 9; i += 1) g = actGain(g, false, STEP);
    expect(g).toBeLessThan(0.05);
    for (let i = 0; i < 30; i += 1) g = actGain(g, true, STEP);
    expect(g).toBeGreaterThan(0.9);
    // 프레임이 아무리 길어도 1 을 안 넘고 0 밑으로 안 간다
    expect(actGain(0, true, 10)).toBeLessThanOrEqual(1);
    expect(actGain(1, false, 10)).toBeGreaterThanOrEqual(0);
  });
});

describe('명부 — 복도의 넷은 전부 제 일이 있다 (기획서의 줄 그대로)', () => {
  it('u137 그린다 · u104 읽는다 · u089 문을 본다 · 동료는 아무것도 아닌 것을 한다', () => {
    expect(CAST_BY_ID.get('u137')?.look.act).toBe('paint');
    expect(CAST_BY_ID.get('u104')?.look.act).toBe('read');
    expect(CAST_BY_ID.get('u089')?.look.act).toBe('watch');
    expect(CAST_BY_ID.get('ally-timid')?.look.act).toBe('wait');
  });
  it('복도에 선 넷은 하나도 빠짐없이 뭔가를 하고 있다 — 첫 방이 「보는 방」이라 여기가 비면 안 된다', () => {
    for (const id of ROOM_UNITS.corridor) {
      const act = CAST_BY_ID.get(id)?.look.act;
      expect(act, id).toBeTruthy();
      expect(ACTS).toContain(act!);
    }
  });
});
