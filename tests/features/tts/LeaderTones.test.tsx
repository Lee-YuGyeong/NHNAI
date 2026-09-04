// @vitest-environment jsdom
/**
 * 관리 AI 세 톤 (src/features/tts/LeaderTones.tsx).
 *
 * 여기서 재는 것은 **화면이 워커의 실제 상태를 비추는가**다. 화면이 제 손에 든 값만 그리면
 * 「분명히 골랐는데 소리가 그대로」의 원인을 알 수 없다 — 갈래 전용을 안 넣어 기본으로
 * 떨어진 것인지, 환경 변수를 넣고 워커를 안 띄운 것인지가 갈려야 한다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderTones, type AccountVoice } from '@/features/tts/LeaderTones';
import { store } from '@/store';

const VOICES: AccountVoice[] = [
  { id: 'v-a', name: '안내용 목소리', category: 'premade' },
  { id: 'v-b', name: '경보용 목소리', category: 'premade' },
];

/** 실제 값 그대로 (worker/src/tts.ts 의 VOICE_SETTINGS) — 갈래마다 달라야 화면이 갈리는지 잰다 */
const SETTINGS: Record<string, Record<string, number>> = {
  announce: { stability: 0.85, style: 0, speed: 0.95 },
  readout: { stability: 0.9, style: 0, speed: 1.0 },
  alarm: { stability: 0.7, style: 0.3, speed: 1.1 },
};

const tone = (kind: string, over: Record<string, unknown> = {}) => ({
  kind,
  id: 'v-a',
  name: '안내용 목소리',
  known: true,
  own: false,
  settings: SETTINGS[kind],
  envVar: `ELEVENLABS_VOICE_ID_${kind.toUpperCase()}`,
  ...over,
});

function stubLeader(body?: { tones: unknown[] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      body
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
        : Promise.reject(new Error('no worker')),
    ),
  );
}

const ALL = { tones: [tone('announce'), tone('readout'), tone('alarm')] };

beforeEach(() => stubLeader(ALL));
afterEach(() => vi.unstubAllGlobals());

const view = () =>
  render(
    <Provider store={store}>
      <LeaderTones voices={VOICES} />
    </Provider>,
  );

describe('관리 AI 세 톤', () => {
  it('세 갈래가 저마다 선다 — 개시 · 해설 · 경보', async () => {
    view();
    expect(await screen.findByText('개시 · 고지')).toBeInTheDocument();
    expect(screen.getByText('기록 해설 · 판정')).toBeInTheDocument();
    expect(screen.getByText('격리 경보')).toBeInTheDocument();
  });

  it('갈래마다 들어보는 단추가 있다', async () => {
    view();
    expect(await screen.findAllByRole('button', { name: /이 톤으로/ })).toHaveLength(3);
  });

  /**
   * 갈래를 가르는 것이 목소리가 아니라 **발성값**이라는 게 보여야, 「목소리까지 갈아야 하나」를
   * 판단할 수 있다. 셋이 서로 다른 값으로 적히는지를 잰다 — 같은 값으로 적히면 화면이
   * 「셋이 다르다」고 거짓말을 하는 것이다.
   */
  it('갈래마다 제 발성값을 적는다 — 경보만 연기 0.3 · 속도 1.1', async () => {
    view();
    expect(await screen.findByText(/안정 0.85 · 연기 0 · 속도 0.95/)).toBeInTheDocument();
    expect(screen.getByText(/안정 0.9 · 연기 0 · 속도 1/)).toBeInTheDocument();
    expect(screen.getByText(/안정 0.7 · 연기 0.3 · 속도 1.1/)).toBeInTheDocument();
  });

  it('기본을 같이 쓰는지, 갈래 전용인지 적는다', async () => {
    view();
    expect(await screen.findAllByText(/기본을 같이 쓴다/)).toHaveLength(3);
  });

  it('갈래 전용을 넣었으면 그렇게 적는다', async () => {
    stubLeader({ tones: [tone('announce', { own: true }), tone('readout'), tone('alarm')] });
    view();
    expect(await screen.findByText(/이 갈래 전용/)).toBeInTheDocument();
  });

  it('목소리가 아예 없으면 눈에 띄게 적는다', async () => {
    stubLeader({ tones: [tone('announce', { id: '', name: '', known: false }), tone('readout'), tone('alarm')] });
    view();
    expect(await screen.findByText(/목소리가 없다/)).toBeInTheDocument();
  });

  it('워커에 못 물으면 그렇게 적는다 — 화면이 조용하면 원인을 못 찾는다', async () => {
    stubLeader();
    view();
    expect(await screen.findByText(/워커에 못 물었다/)).toBeInTheDocument();
  });

  /** 고른 갈래만 줄이 나와야 한다 — 셋을 다 채우도록 몰면 세 시스템처럼 들리는 판이 기본이 된다 */
  it('고른 갈래만 환경 변수 줄로 나온다', async () => {
    view();
    await screen.findByText('격리 경보');
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[2], { target: { value: 'v-b' } });
    expect(screen.getByText('ELEVENLABS_VOICE_ID_ALARM=v-b')).toBeInTheDocument();
    expect(screen.queryByText(/ELEVENLABS_VOICE_ID_ANNOUNCE/)).not.toBeInTheDocument();
  });
});
