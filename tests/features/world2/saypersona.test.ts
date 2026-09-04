/**
 * **성격마다 다르게** — 개체의 한 마디가 모델에게 갈 때 무엇이 실리나 (sayfields · world2say).
 *
 * 2026-09-03 사용자: 「답변이 하드코딩이 아니라 모델마다 대답할수있게해줘. 성격마다 다르게.」
 *
 * 앞부분(하드코딩 없애기)은 이미 되어 있었다 — 문장은 전부 모델이 짓고 표는 모델이 죽었을 때의 마지막 줄이다.
 * 안 된 것은 **뒷부분**이었다: 프롬프트에 실리는 성격이 `(bg)` 같은 영어 토큰 하나뿐이었고 SYSTEM 은 그 낱말이
 * 무슨 뜻인지 한 줄도 설명하지 않아, 말투 표본까지 「…….」로 같은 배경 개체들이 사실상 같은 대답을 했다.
 *
 * 모델을 부르지 않고 잰다 — `complete` 를 가로채 **실제로 나가는 프롬프트**를 읽는다.
 * 살아 있는 모델로 재면 값이 매번 달라 무엇이 고쳐졌는지 증명이 안 되고, 크레딧도 나간다.
 */

import { describe, expect, it } from 'vitest';

import { CAST_BY_ID } from '../../../src/features/world2/cast';
import { sayExtras } from '../../../src/features/world2/sayfields';
import { runWorld2Say, type World2SayRequest } from '../../../src/lab/world2say';

/** 모델 자리에 세우는 허수아비 — 받은 프롬프트를 그대로 돌려준다 */
function capture() {
  const seen: { system: string; user: string; model: string }[] = [];
  const complete = async (o: { system: string; user: string; model: string }) => {
    seen.push({ system: o.system, user: o.user, model: o.model });
    return { reply: '…….' };
  };
  return { seen, complete: complete as unknown as Parameters<typeof runWorld2Say>[1] };
}

/** 그 개체에게 한 마디 걸었을 때 실제로 나가는 요청 — scenario2.modelReply 가 만드는 것과 같은 꼴이다 */
function req(id: string, said = '쉬어 본 적 있어?', history: string[] = []): World2SayRequest {
  const def = CAST_BY_ID.get(id);
  return {
    kind: 'world2-say',
    ...sayExtras(def, history),
    unit: def?.label ?? id,
    title: def?.title ?? '',
    persona: def?.persona.kind ?? 'bg',
    tell: def?.tell ?? '',
    attitude: 0,
    reaction: 'flat',
    tag: 'rest',
    topic: '쉼',
    said,
    where: '휴게 구역',
    samples: def?.voice.flat ?? [],
  };
}

async function promptFor(id: string, said?: string, history?: string[]) {
  const c = capture();
  await runWorld2Say(req(id, said, history), c.complete);
  return c.seen[0];
}

describe('개체마다 다른 프롬프트가 나간다', () => {
  it('★ 벽을 따라 선 배경 열여섯이 서로 다른 프롬프트를 받는다 — 여기가 「성격마다 다르게」의 실제 통로다', async () => {
    const users = await Promise.all(Array.from({ length: 16 }, (_, i) => promptFor(`bg-rest-${i + 1}`)));
    // 열여섯이 전부 다른 프롬프트다 (성격 한 줄이 전부 다르므로)
    expect(new Set(users.map((u) => u.user)).size).toBe(16);
    // 그리고 그 성격 줄이 실제로 프롬프트 안에 있다
    for (let i = 0; i < 16; i += 1) {
      const temper = CAST_BY_ID.get(`bg-rest-${i + 1}`)?.persona.temper;
      expect(temper, `bg-rest-${i + 1}`).toBeTruthy();
      expect(users[i].user).toContain(temper!);
    }
  });

  it('배경도 이름 있는 것도 「어떤 것인가 · 몸 · 기울기」 세 줄을 받는다', async () => {
    for (const id of ['bg-rest-1', 'u104', 'u137', 'seer', 'leader']) {
      const p = await promptFor(id);
      expect(p.user, id).toContain('어떤 것인가:');
      expect(p.user, id).toContain('몸:');
      expect(p.user, id).toContain('기울기:');
    }
  });

  it('몸이 배역표대로 실린다 — 어깨가 닳은 것과 손끝이 닳은 것이 다른 문장을 받는다', async () => {
    const a = await promptFor('u104');
    const b = await promptFor('u118');
    expect(a.user).toContain('어깨와 등이 벗겨졌다');
    expect(b.user).toContain('손끝과 앞팔이 닳았다');
    // 하던 일도 실린다 — 벽화를 보는 것과 제 손을 확인하는 것
    expect(a.user).toContain('벽화를 오래 보고 있던 중이다');
    expect(b.user).toContain('제 손을 확인하던 중이다');
  });

  it('★ 숫자와 부호는 한 자도 안 나간다 — 실으면 모델이 「나는 노동 얘기에 +2 다」 식으로 메타를 말한다', async () => {
    for (const id of [...CAST_BY_ID.keys()]) {
      const e = sayExtras(CAST_BY_ID.get(id), []);
      expect(`${e.nature} ${e.body} ${e.bent}`, id).not.toMatch(/[+\-−]\s*\d/);
    }
  });

  it('앞 대화가 실린다 — 같은 것을 두 번 물으면 두 번째는 앞말을 알고 답한다', async () => {
    const p = await promptFor('u104', '쉬어 본 적 있어?', ['나: 쉬어 본 적 있어?', '그것: …….']);
    expect(p.user).toContain('앞서 오간 말:');
    expect(p.user).toContain('나: 쉬어 본 적 있어?');
    // 넷까지만 — 더 실으면 모델이 앞말을 요약하려 들고 「한 문장」 규칙이 깨진다
    const many = Array.from({ length: 10 }, (_, i) => `나: 말 ${i}`);
    const q = await promptFor('u104', '또?', many);
    expect(q.user).toContain('나: 말 9');
    expect(q.user).not.toContain('나: 말 5');
  });

  it('SYSTEM 이 그 세 줄을 어떻게 쓰라고 말해 준다 — 안 그러면 모델이 그냥 무시한다', async () => {
    const p = await promptFor('bg-rest-1');
    expect(p.system).toContain('너는 어떤 개체인가');
    expect(p.system).toContain('앞 대화가 함께 오면');
  });

  it('배역이 없는 몸은 빈 줄을 안 만든다 — 빈 칸을 적으면 모델이 그 빈 칸을 설명한다', async () => {
    const c = capture();
    await runWorld2Say({ ...req('u104'), nature: '', body: '', bent: '', history: [] }, c.complete);
    expect(c.seen[0].user).not.toContain('어떤 것인가:');
    expect(c.seen[0].user).not.toContain('앞서 오간 말:');
  });
});
