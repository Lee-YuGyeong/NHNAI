/**
 * 방 방송의 시각 규율 — "같은 순간 같은 내용"이 지켜지는지.
 *
 * 네트워크 지터(수십 ms)는 소리로 안 들린다. 진짜 위협은 각자의 큐다 —
 * 앞 방송을 읽고 있던 사람만 몇 초 늦게 시작하면 그 순간 동시성이 깨진다.
 * 그래서 서버 방송(ts 가 붙은 것)은 기다리지 않고, 그러고도 늦으면 읽지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { STALE_MS, isStale, ttsActions, ttsSlice, type TtsState } from '@/features/tts/ttsSlice';
import { broadcastAnnounce } from '@/shared/broadcast';

const r = ttsSlice.reducer;
const init = (): TtsState => r(undefined, { type: '@@init' });

describe('서버 방송은 기다리지 않는다', () => {
  it('재생 중이던 일반 방송을 끊고 먼저 나간다', () => {
    let s = r(init(), broadcastAnnounce({ text: '혼자 도는 화면의 방송' }));
    s = r(s, ttsActions.playNext());
    expect(s.current?.text).toBe('혼자 도는 화면의 방송');

    s = r(s, broadcastAnnounce({ text: '방 방송', ts: 1000 }));
    expect(s.current).toBeNull(); // 끊겼다 — TtsPlayer 가 소리를 멈춘다
    expect(s.queue[0].text).toBe('방 방송'); // 큐 맨 앞
  });

  it('혼자 도는 화면의 방송(ts 없음)은 여전히 줄을 선다', () => {
    let s = r(init(), broadcastAnnounce({ text: 'A' }));
    s = r(s, ttsActions.playNext());
    s = r(s, broadcastAnnounce({ text: 'B' }));
    expect(s.current?.text).toBe('A'); // 안 끊긴다
    expect(s.queue.map((q) => q.text)).toEqual(['B']);
  });

  it('서버가 찍은 시각을 큐가 그대로 들고 간다 — 지각 판정의 근거다', () => {
    const s = r(init(), broadcastAnnounce({ text: '방 방송', ts: 4242 }));
    expect(s.queue[0].ts).toBe(4242);
  });
});

describe('isStale — 늦게 도착한 방송', () => {
  const live = (ts: number) => ({ text: '방 방송', kind: 'announce' as const, ts });

  it('갓 온 방송은 읽는다', () => {
    expect(isStale(live(1000), 1000)).toBe(false);
    expect(isStale(live(1000), 1000 + STALE_MS)).toBe(false);
  });

  it('임계를 넘으면 읽지 않는다 — 남들은 이미 듣고 넘어갔다', () => {
    expect(isStale(live(1000), 1000 + STALE_MS + 1)).toBe(true);
  });

  it('혼자 도는 화면의 방송은 늦는다는 개념이 없다', () => {
    expect(isStale({ text: 'A', kind: 'announce' }, 9_999_999)).toBe(false);
  });
});
