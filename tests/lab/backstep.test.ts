/**
 * 뒷걸음 판정 (src/lab/backstep.ts) — AI 에게 넘길 상황이 제대로 실리는지, 값이 판을 깨지 않는지.
 *
 * 판정 자체(어떤 상황이 의심스러운가)는 모델이 하므로 여기서 잠그지 않는다. 여기서 잠그는 것은
 * **모델에게 상황이 전달되는가**(무대·굉음·검문 같은 근거가 프롬프트에 실리는가)와,
 * 모델이 이상한 값을 줘도 판이 안 깨지는가(0~12 로 자른다), 그리고 LLM 이 없을 때의 폴백이다.
 */

import { describe, expect, it, vi } from 'vitest';
import { judgeBackstep, runBackstep, validateBackstep, type BackstepRequest } from '../../src/lab/backstep';

const base: BackstepRequest = {
  kind: 'backstep',
  seconds: 1.8,
  meters: 1.6,
  watchers: [{ kind: 'ai', from: 3.4, to: 4.6, approaching: false }],
  suspicion: 22,
  sync: 91,
  scene: '챕터1 arrive — 목표: 코어로 접근하라',
  recent: [],
};

describe('뒷걸음 판정', () => {
  it('본문이 성하지 않으면 사유를 돌려준다', () => {
    expect(validateBackstep(null)).toBeTruthy();
    expect(validateBackstep({ kind: 'interrogate' })).toBeTruthy();
    expect(validateBackstep({ kind: 'backstep', watchers: [] })).toBeTruthy();
    expect(validateBackstep({ ...base })).toBeNull();
  });

  it('상황이 프롬프트에 실린다 — 무대·굉음·검문·거리·다가옴', async () => {
    const complete = vi.fn().mockResolvedValue({ delta: 0, why: '길을 비켰다' });
    await runBackstep(
      {
        ...base,
        watchers: [{ kind: 'ai', from: 4.2, to: 2.1, approaching: true }],
        recent: ['옆에서 굉음이 났다 (아무도 반응하지 않는다)', '검문 경비가 내 앞으로 오고 있다'],
      },
      complete,
    );
    const user = complete.mock.calls[0][0].user as string;
    expect(user).toContain('챕터1 arrive');
    expect(user).toContain('굉음');
    expect(user).toContain('검문 경비가 내 앞으로');
    expect(user).toContain('다가오는 중');
    expect(user).toContain('4.2m → 2.1m');
    // 판정은 걷는 도중에 끼어든다 — 무거운 설정으로 돌리지 않는다
    expect(complete.mock.calls[0][0].effort).toBe('low');
  });

  it('모델이 이상한 값을 줘도 0~12 로 자른다 — 한 번에 판이 끝나면 안 된다', async () => {
    const high = await runBackstep(base, vi.fn().mockResolvedValue({ delta: 80, why: 'x'.repeat(50) }));
    expect(high.delta).toBe(12);
    expect(high.why.length).toBeLessThanOrEqual(24);
    const low = await runBackstep(base, vi.fn().mockResolvedValue({ delta: -30, why: '' }));
    expect(low.delta).toBe(0);
    const junk = await runBackstep(base, vi.fn().mockResolvedValue({}));
    expect(junk.delta).toBe(0);
  });

  it('폴백 — LLM 이 없으면 거칠게라도 친다: 한 걸음은 공짜, 다가오는 개체 앞이면 더', () => {
    expect(judgeBackstep({ ...base, seconds: 0.6, meters: 0.4 }).delta).toBe(0);
    expect(judgeBackstep({ ...base, watchers: [] }).delta).toBe(0);
    const plain = judgeBackstep(base).delta;
    const fleeing = judgeBackstep({ ...base, watchers: [{ kind: 'ai', from: 4.2, to: 2.0, approaching: true }] }).delta;
    expect(plain).toBeGreaterThan(0);
    expect(fleeing).toBeGreaterThan(plain);
  });
});
