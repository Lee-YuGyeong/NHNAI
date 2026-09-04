/**
 * 방송 큐 — 순수 리듀서라 node 환경 그대로 돈다.
 *
 * 계약: 방송은 `shared/broadcast` 로만 들어오고, 일반 방송은 선입선출·경보는 끼어들어 끊으며,
 * 대기 상한을 넘치면 오래된 일반 방송부터 버린다. **음소거는 순서에 아무 영향이 없다** —
 * 끄는 것은 소리뿐이고 큐는 그대로 흘러서 자막이 이어진다.
 * 엔진(재생)은 여기서 보지 않는다 — TtsPlayer 몫.
 */
import { describe, expect, it } from 'vitest';
import { ttsActions, ttsSlice, type TtsState } from '@/features/tts/ttsSlice';
import { broadcastAnnounce, broadcastMute, broadcastSkip } from '@/shared/broadcast';
import { budgetChars } from '@/features/tts/cap';

const r = ttsSlice.reducer;
const init = (): TtsState => r(undefined, { type: '@@init' });
const texts = (s: TtsState) => s.queue.map((q) => q.text);

describe('방송 유입 — broadcastAnnounce', () => {
  it('보낸 순서대로 큐에 쌓이고, kind 생략은 announce 다', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: '첫 방송' }));
    s = r(s, broadcastAnnounce({ text: '둘째 방송', kind: 'readout' }));
    expect(s.queue).toEqual([
      { text: '첫 방송', kind: 'announce' },
      { text: '둘째 방송', kind: 'readout' },
    ]);
  });

  it('예산을 넘는 방송은 잘린 채로 큐에 앉는다 — 큐에 담긴 문장이 곧 읽힐 문장이다', () => {
    // 한 문장은 예산 안, 두 문장이면 넘는 길이 → 첫 문장만 남아야 한다
    const n = Math.floor(budgetChars('announce') * 0.6);
    const one = `${'가'.repeat(n - 1)}.`;
    const long = `${one} ${'나'.repeat(n - 1)}.`;
    const s = r(init(), broadcastAnnounce({ text: long }));
    expect(s.queue[0].text).toBe(one);
    expect(s.queue[0].text.length).toBeLessThan(long.length);
  });

  it('읽을 게 없는 방송은 자리를 차지하지 않는다', () => {
    expect(r(init(), broadcastAnnounce({ text: '   ' })).queue).toEqual([]);
  });

  it('음소거 중에도 받는다 — 끄는 것은 소리뿐이고 자막은 계속 흐른다', () => {
    let s = r(init(), broadcastMute());
    s = r(s, broadcastAnnounce({ text: '소리는 안 나도 글자로는 남는다' }));
    expect(texts(s)).toEqual(['소리는 안 나도 글자로는 남는다']);
  });
});

describe('재생 순서 — playNext / ended', () => {
  it('조용할 때만 큐 머리를 꺼낸다 (재생 중엔 아무 일 없음)', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: 'A' }));
    s = r(s, broadcastAnnounce({ text: 'B' }));
    s = r(s, ttsActions.playNext());
    expect(s.current?.text).toBe('A');
    expect(texts(s)).toEqual(['B']);
    s = r(s, ttsActions.playNext()); // 재생 중 — B 를 건드리면 안 된다
    expect(s.current?.text).toBe('A');
    expect(texts(s)).toEqual(['B']);
  });

  it('끝나면 비워지고, 다음 playNext 가 이어받는다', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: 'A' }));
    s = r(s, broadcastAnnounce({ text: 'B' }));
    s = r(s, ttsActions.playNext());
    s = r(s, ttsActions.ended());
    expect(s.current).toBeNull();
    s = r(s, ttsActions.playNext());
    expect(s.current?.text).toBe('B');
    expect(s.queue).toEqual([]);
  });
});

describe('경보 — 끼어들기', () => {
  it('경보는 큐 맨 앞에 서고, 재생 중이던 일반 방송을 끊는다', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: '일반' }));
    s = r(s, ttsActions.playNext());
    s = r(s, broadcastAnnounce({ text: '대기 일반' }));
    s = r(s, broadcastAnnounce({ text: '경보!', kind: 'alarm' }));
    expect(s.current).toBeNull(); // 재생이 끊겼다 — TtsPlayer 가 engine.stop() 하고 다음을 꺼낸다
    expect(texts(s)).toEqual(['경보!', '대기 일반']);
    s = r(s, ttsActions.playNext());
    expect(s.current?.kind).toBe('alarm');
  });

  it('경보가 재생 중이면 새 경보도 끊지 않고 그 뒤에 선다', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: '경보1', kind: 'alarm' }));
    s = r(s, ttsActions.playNext());
    s = r(s, broadcastAnnounce({ text: '경보2', kind: 'alarm' }));
    expect(s.current?.text).toBe('경보1'); // 경보끼리는 안 끊는다
    expect(texts(s)).toEqual(['경보2']);
  });
});

describe('대기 상한', () => {
  it('상한(5)을 넘치면 가장 오래된 일반 방송부터 버리고, 경보는 남긴다', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: '재생중' }));
    s = r(s, ttsActions.playNext());
    s = r(s, broadcastAnnounce({ text: '경보', kind: 'alarm' })); // 재생을 끊고 큐 맨 앞에
    for (const t of ['n1', 'n2', 'n3', 'n4']) s = r(s, broadcastAnnounce({ text: t }));
    expect(texts(s)).toEqual(['경보', 'n1', 'n2', 'n3', 'n4']); // 정확히 5건
    s = r(s, broadcastAnnounce({ text: 'n5' }));
    expect(texts(s)).toEqual(['경보', 'n2', 'n3', 'n4', 'n5']); // n1 이 버려졌다
  });
});

describe('음소거', () => {
  it('켜도 재생 자리와 대기 큐를 비우지 않는다 — 소리를 끄는 순간 자막까지 죽으면 안 된다', () => {
    let s = init();
    s = r(s, broadcastAnnounce({ text: 'A' }));
    s = r(s, broadcastAnnounce({ text: 'B' }));
    s = r(s, ttsActions.playNext());
    s = r(s, broadcastMute());
    expect(s.muted).toBe(true);
    expect(s.current?.text).toBe('A');
    expect(texts(s)).toEqual(['B']);
  });

  it('음소거 중에도 playNext 가 꺼낸다 — 안 꺼내면 자막이 첫 문장에 멈춰 선다', () => {
    let s = r(init(), broadcastMute());
    s = r(s, broadcastAnnounce({ text: 'B' }));
    s = r(s, ttsActions.playNext());
    expect(s.current?.text).toBe('B');
  });

  it('음소거는 순서를 바꾸지 않는다 — 켠 채로 돌린 판과 끈 채로 돌린 판이 같아야 한다', () => {
    const run = (mute: boolean) => {
      let s = mute ? r(init(), broadcastMute()) : init();
      for (const t of ['하나', '둘']) s = r(s, broadcastAnnounce({ text: t }));
      s = r(s, broadcastAnnounce({ text: '경보', kind: 'alarm' }));
      return [s.current?.text ?? null, ...texts(s)];
    };
    expect(run(true)).toEqual(run(false));
  });
});

/*
 * 대사 스킵(T) — 검증실은 소리를 방송으로 내므로 넘기는 것도 여기서 끊는다 (shared/broadcast 의 broadcastSkip).
 * 자막만 넘기고 소리를 안 끊으면 목소리가 앞 줄을 계속 읽는다.
 */
describe('스킵 — broadcastSkip', () => {
  it('읽고 있던 한 줄을 비운다 — 그 순간 재생기가 소리를 끊는다', () => {
    let s = r(init(), broadcastAnnounce({ text: '지시문' }));
    s = r(s, ttsActions.playNext());
    expect(s.current?.text).toBe('지시문');

    s = r(s, broadcastSkip());
    expect(s.current).toBeNull();
  });

  it('대기 중인 방송은 그대로 남는다 — 한 번 누른 것은 한 줄이다', () => {
    let s = init();
    for (const t of ['지시문', '판독']) s = r(s, broadcastAnnounce({ text: t }));
    s = r(s, ttsActions.playNext());

    s = r(s, broadcastSkip());
    expect(texts(s)).toEqual(['판독']);
    s = r(s, ttsActions.playNext()); // 재생기가 곧바로 다음을 꺼낸다
    expect(s.current?.text).toBe('판독');
  });

  it('읽고 있는 것이 없을 때 눌러도 판이 흐트러지지 않는다', () => {
    let s = r(init(), broadcastAnnounce({ text: '지시문' }));
    s = r(s, broadcastSkip());
    expect(s.current).toBeNull();
    expect(texts(s)).toEqual(['지시문']);
  });
});
