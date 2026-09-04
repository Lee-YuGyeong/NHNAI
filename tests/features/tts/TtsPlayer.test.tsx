// @vitest-environment jsdom
/**
 * 재생기가 큐를 어떻게 흘려보내는가 — 음소거 중에도, 그리고 합성이 오래 걸릴 때도.
 *
 * 엔진은 통째로 가짜다. 진짜 엔진은 네트워크(/api/tts)와 WebAudio 를 쓰는데 여기서 보려는
 * 것은 **재생기가 언제 무엇을 시키는가** 뿐이라, 가짜여야 그게 눈에 보인다.
 */
import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtsPlayer } from '@/features/tts/TtsPlayer';
import { speechMs } from '@/features/tts/cap';
import { STALE_MS } from '@/features/tts/ttsSlice';
import { broadcastAnnounce, broadcastMute } from '@/shared/broadcast';
import { rootReducer } from '@/store';

const { fake } = vi.hoisted(() => ({
  fake: { speak: vi.fn(), prefetch: vi.fn(), stop: vi.fn(), unlock: vi.fn() },
}));
vi.mock('@/features/tts/engine', () => ({ engine: fake, setRemote: vi.fn(), setVolume: vi.fn() }));

beforeEach(() => {
  for (const f of Object.values(fake)) f.mockReset();
  fake.speak.mockResolvedValue(undefined);
  fake.prefetch.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

/** 약속이 줄줄이 걸려 있어서 한 번으로는 끝까지 못 간다 — prefetch → 지각 검사 → speak */
const settle = () => act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });

/** 미리 받아 둘 차례가 왔는지는 **다음 방송**의 문장으로 본다 (지금 읽는 것도 prefetch 를 탄다) */
const prefetched = (text: string) => fake.prefetch.mock.calls.some(([t]) => t === text);

function mutedPlayer() {
  vi.useFakeTimers();
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(broadcastMute());
  render(
    <Provider store={store}>
      {/* 경로를 보고 원격 합성을 켜고 끄므로(scope.ts) 라우터가 있어야 한다 */}
      <MemoryRouter initialEntries={['/lab']}>
        <TtsPlayer />
      </MemoryRouter>
    </Provider>,
  );
  const send = (...texts: string[]) =>
    act(() => { for (const t of texts) store.dispatch(broadcastAnnounce({ text: t })); });
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const now = () => store.getState().tts;
  return { send, wait, now };
}

describe('음소거 중에도 방송은 지나간다', () => {
  it('소리가 안 나도 첫 방송이 재생 자리에 올라온다 — 자막이 볼 자리다', () => {
    const { send, now } = mutedPlayer();
    send('첫 방송이다.');
    expect(now().current?.text).toBe('첫 방송이다.');
  });

  it('읽었을 만한 시간이 지나면 스스로 넘어간다', () => {
    const { send, wait, now } = mutedPlayer();
    send('첫 방송이다.', '둘째 방송이다.');
    expect(now().current?.text).toBe('첫 방송이다.');

    wait(speechMs('첫 방송이다.') + 50);
    expect(now().current?.text).toBe('둘째 방송이다.');
  });

  it('시간이 되기 전에는 넘어가지 않는다 — 자막을 다 읽기 전에 갈리면 안 된다', () => {
    const { send, wait, now } = mutedPlayer();
    send('첫 방송이다.', '둘째 방송이다.');
    wait(speechMs('첫 방송이다.') - 100);
    expect(now().current?.text).toBe('첫 방송이다.');
  });

  it('쌓인 방송이 끝까지 흘러 큐가 빈다 — 여기가 막히면 자막이 첫 문장에 멈춰 선다', () => {
    const { send, wait, now } = mutedPlayer();
    const lines = ['하나요.', '둘이요.', '셋이요.'];
    send(...lines);

    for (const line of lines) {
      expect(now().current?.text).toBe(line);
      wait(speechMs(line) + 50);
    }
    expect(now().current).toBeNull();
    expect(now().queue).toEqual([]);
  });

  it('소리를 안 낼 거면 미리 받지도 않는다 — 안 들릴 소리에 크레딧이 나간다', async () => {
    const { send } = mutedPlayer();
    send('첫 방송이다.', '둘째 방송이다.');
    await settle();
    expect(fake.prefetch).not.toHaveBeenCalled();
  });
});

/**
 * 원격 합성은 왕복이 300~800ms 다. 그 값을 **언제** 치르느냐가 두 가지를 바꾼다:
 * 방송 사이가 조용해지고, 지각 판정이 값을 치르기 전 시각으로 이루어진다.
 */
describe('합성 지연', () => {
  function playing() {
    const store = configureStore({ reducer: rootReducer });
    render(
      <Provider store={store}>
        {/* 경로를 보고 원격 합성을 켜고 끄므로(scope.ts) 라우터가 있어야 한다 */}
        <MemoryRouter initialEntries={['/lab']}>
          <TtsPlayer />
        </MemoryRouter>
      </Provider>,
    );
    const send = (...items: Parameters<typeof broadcastAnnounce>[0][]) =>
      act(() => { for (const i of items) store.dispatch(broadcastAnnounce(i)); });
    return { store, send };
  }

  it('읽는 동안 다음 방송을 미리 받아 둔다 — 차례가 온 다음 받으면 그 사이가 조용하다', async () => {
    // 첫 방송은 붙잡아 둔다. 붙잡힌 동안이 곧 '읽고 있는 중'이다
    fake.speak.mockReturnValue(new Promise(() => {}));
    const { send } = playing();
    send({ text: '지금 읽는 방송.' }, { text: '다음 방송.' });
    await settle();

    expect(prefetched('다음 방송.')).toBe(true);
  });

  it('한 방송에 요청은 한 번이다 — 미리 받은 걸 두고 또 받으면 크레딧이 두 번 나간다', async () => {
    const { send } = playing();
    send({ text: '한 문장.' });
    await settle();

    // 미리 받기와 실제 발화가 같은 문장을 두고 겹친다. 엔진 캐시가 약속을 나눠 쓰는지는
    // 엔진 쪽 일이고, 재생기는 **같은 문장으로 두 번 시키지 않는다**는 것까지가 몫이다
    expect(fake.prefetch.mock.calls.filter(([t]) => t === '한 문장.')).toHaveLength(1);
    expect(fake.speak.mock.calls.filter(([t]) => t === '한 문장.')).toHaveLength(1);
  });

  it('받아 오는 사이에 창을 넘긴 방 방송은 읽지 않는다 — 지각 판정이 합성 전 시각으로 돌면 샌다', async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    // 받아 오는 데 걸리는 시간을 손으로 쥔다
    let arrive!: () => void;
    fake.prefetch.mockReturnValue(new Promise<void>((r) => { arrive = () => r(); }));

    const { store, send } = playing();
    send({ text: '방에서 온 방송.', ts: t0 }); // 보낸 순간이라 아직 안 늦었다 — 첫 검사는 통과한다
    await settle();
    expect(fake.speak).not.toHaveBeenCalled(); // 아직 받아 오는 중

    vi.setSystemTime(t0 + STALE_MS + 500); // 받아 오는 사이에 창이 지나갔다
    arrive();
    await settle();

    expect(fake.speak).not.toHaveBeenCalled();
    expect(store.getState().tts.current).toBeNull(); // 읽지 않고 넘겼다 — 큐가 막히지 않는다
  });

  it('안 늦었으면 읽는다 — 위 검사가 "아무것도 안 읽는다"로 통과하면 안 된다', async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    let arrive!: () => void;
    fake.prefetch.mockReturnValue(new Promise<void>((r) => { arrive = () => r(); }));

    const { send } = playing();
    send({ text: '방에서 온 방송.', ts: t0 });
    await settle();

    vi.setSystemTime(t0 + 200); // 창 안이다
    arrive();
    await settle();

    expect(fake.speak).toHaveBeenCalledWith('방에서 온 방송.', 'announce');
  });
});
