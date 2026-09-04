/**
 * 시행 참가자 — 리더는 참가하지 않고, 정원은 그대로다.
 *
 * 리더가 자기 시행에 참가하면 노림수(watching)를 아는 유일한 개체가 그 시행을 치르고,
 * 판정 단계에서 자기 기록을 자기가 채점하게 된다. 그래서 명단에서 뺀다 —
 * 다만 인원까지 줄이면 판이 헐거워지므로 리더가 겸하던 자리는 일반 개체가 채운다.
 */
import { describe, expect, it } from 'vitest';
import { EXTRA_PERSONAS, LEADER_ID, PERSONAS, TRIAL_PARTY, trialCast } from '@/lab/personas';

const me = PERSONAS[PERSONAS.length - 2].id;

describe('trialCast', () => {
  it('리더는 참가자에 없다', () => {
    expect(trialCast(me).some((p) => p.id === LEADER_ID)).toBe(false);
  });

  it('나도 참가자 명단에는 없다 — 명단은 나 말고 나머지다', () => {
    expect(trialCast(me).some((p) => p.id === me)).toBe(false);
  });

  it('정원은 그대로다 — 나까지 더하면 TRIAL_PARTY 명', () => {
    expect(trialCast(me)).toHaveLength(TRIAL_PARTY - 1);
  });

  it('리더가 겸하던 자리는 추가 성격 풀에서 채운다', () => {
    const filled = trialCast(me).filter((p) => EXTRA_PERSONAS.some((e) => e.id === p.id));
    expect(filled).toHaveLength(1);
  });

  it('같은 개체가 두 번 들어가지 않는다', () => {
    const ids = trialCast(me).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
