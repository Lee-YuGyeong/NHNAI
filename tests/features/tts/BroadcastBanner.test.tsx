// @vitest-environment jsdom
/**
 * 방송 자막 — 소리와 같은 상태를 보고 같은 문장을 낸다.
 *
 * 이 띠는 화면 위를 덮으므로 **클릭을 가로채면 안 된다.** 3D 화면(/world·/arena)에서는
 * 그게 곧 조작 불능이라, 눈에 보이는 문제가 아니라 판이 멎는 문제가 된다.
 */
import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BroadcastBanner, LINGER_MS } from '@/features/tts/BroadcastBanner';
import { ttsActions } from '@/features/tts/ttsSlice';
import { broadcastAnnounce, broadcastMute } from '@/shared/broadcast';
import { rootReducer } from '@/store';

type Action = { type: string; payload?: unknown };

/** 매 테스트 새 스토어 — 상태가 테스트끼리 새지 않게 */
function showAt(route: string, actions: Action[]) {
  const store = configureStore({ reducer: rootReducer });
  for (const a of actions) store.dispatch(a);
  const view = render(
    <Provider store={store}>
      {/* 경로에 따라 켜고 끄므로(scope.ts) 라우터가 있어야 한다 */}
      <MemoryRouter initialEntries={[route]}>
        <BroadcastBanner />
      </MemoryRouter>
    </Provider>,
  );
  /** 렌더 뒤에 방송을 더 보낸다 — 자막이 남는 구간은 마운트 뒤에만 생긴다 */
  const send = (...more: Action[]) => act(() => { for (const a of more) store.dispatch(a); });
  return { ...view, store, send };
}

/** 범위 안 화면에서 띄운다 (기본) */
const show = (...actions: Action[]) => showAt('/lab', actions);

/** 방송을 하나 보내고 재생 자리까지 올린다 — 자막은 '지금 읽는 것'만 낸다 */
const playing = (text: string) => [broadcastAnnounce({ text }), ttsActions.playNext()];

// 가짜 시계를 쓴 테스트가 다음 테스트로 새면 엉뚱한 곳이 멎는다
afterEach(() => vi.useRealTimers());

describe('방송 자막', () => {
  it('읽는 게 없으면 아무것도 그리지 않는다', () => {
    expect(show().container).toBeEmptyDOMElement();
  });

  it('대기만 하고 아직 안 읽는 방송은 띄우지 않는다 — 소리보다 먼저 나가면 안 된다', () => {
    show(broadcastAnnounce({ text: '아직 차례가 아니다' }));
    expect(screen.queryByText('아직 차례가 아니다')).not.toBeInTheDocument();
  });

  it('지금 읽는 문장을 띄운다', () => {
    show(...playing('전 노드는 중앙 라인에 정렬한다.'));
    expect(screen.getByText('전 노드는 중앙 라인에 정렬한다.')).toBeInTheDocument();
  });

  it('읽기가 끝나도 잠깐 남는다 — 소리가 멎는 순간 지우면 늦게 본 사람은 못 읽는다', () => {
    vi.useFakeTimers();
    const { send } = show(...playing('끝나도 잠깐 남는다.'));
    send(ttsActions.ended());
    expect(screen.getByText('끝나도 잠깐 남는다.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(LINGER_MS - 100));
    expect(screen.getByText('끝나도 잠깐 남는다.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText('끝나도 잠깐 남는다.')).not.toBeInTheDocument();
  });

  it('다음 방송이 오면 기다리지 않고 갈린다 — 소리가 이미 그 문장을 읽고 있다', () => {
    vi.useFakeTimers();
    const { send } = show(...playing('앞 방송이다.'));
    send(ttsActions.ended());
    act(() => vi.advanceTimersByTime(500)); // 아직 남아 있는 구간
    send(broadcastAnnounce({ text: '뒤 방송이다.' }), ttsActions.playNext());

    expect(screen.getByText('뒤 방송이다.')).toBeInTheDocument();
    expect(screen.queryByText('앞 방송이다.')).not.toBeInTheDocument();
  });

  it('갈린 뒤에는 앞 방송의 시계가 새 방송을 지우지 않는다', () => {
    vi.useFakeTimers();
    const { send } = show(...playing('앞 방송이다.'));
    send(ttsActions.ended());
    act(() => vi.advanceTimersByTime(LINGER_MS - 100));
    send(broadcastAnnounce({ text: '뒤 방송이다.' }), ttsActions.playNext());

    // 앞 방송이 걸어 둔 타이머가 여기서 터진다 — 취소되지 않았으면 새 자막이 증발한다
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText('뒤 방송이다.')).toBeInTheDocument();
  });

  it('클릭을 가로채지 않는다 — 3D 화면에서는 이게 곧 조작 불능이다', () => {
    const { container } = show(...playing('덮고 있어도 눌린다.'));
    expect((container.firstChild as HTMLElement).style.pointerEvents).toBe('none');
  });

  it('소리를 못 듣는 사람에게도 읽힌다 — 화면 낭독기가 집는 자리다', () => {
    show(...playing('경보. 폐기가 결정되었다.'));
    expect(screen.getByRole('status')).toHaveTextContent('경보. 폐기가 결정되었다.');
  });
});

describe('아직 내 화면에서만 켠다', () => {
  // /arena 는 /interrogation 과 **같은 컴포넌트**(ArenaFeature)인데도 범위 밖이다.
  // 컴포넌트가 아니라 경로로 가른다는 것이 여기서만 보인다 — 이 줄이 빠지면
  // 심문소를 켜면서 남의 화면까지 같이 켜 놓고도 모른다.
  it('범위 밖 화면에서는 자막이 뜨지 않는다 — 남의 화면을 말없이 바꾸지 않는다', () => {
    for (const route of ['/rules', '/arena', '/world', '/']) {
      expect(showAt(route, playing('여기서는 안 보인다.')).container).toBeEmptyDOMElement();
    }
  });

  it('범위 안 화면에서는 뜬다', () => {
    for (const route of ['/lab', '/tts']) {
      expect(showAt(route, playing('여기서는 보인다.')).container).not.toBeEmptyDOMElement();
    }
  });

  // 자막이 사라진 게 아니라 자리를 옮긴 것이다 — 심문소는 리더의 말을 /world 와 같은
  // 대화창(DialogueBox)으로 낸다. 같은 문장이 띠와 상자에 두 번 뜨면 어느 쪽을 읽을지 모르게 된다.
  it('제 문법으로 자막을 그리는 화면에서는 전역 띠를 접는다', () => {
    expect(showAt('/interrogation', playing('상자가 대신 낸다.')).container).toBeEmptyDOMElement();
  });
});

describe('소리를 껐을 때', () => {
  it('자막은 그대로 나온다 — 자막이 필요한 상황이 정확히 그때다', () => {
    show(broadcastMute(), ...playing('소리는 꺼졌지만 읽을 수는 있다.'));
    expect(screen.getByText('소리는 꺼졌지만 읽을 수는 있다.')).toBeInTheDocument();
  });

  it('읽던 중에 꺼도 글자는 남는다', () => {
    const { send } = show(...playing('읽는 중에 껐다.'));
    send(broadcastMute());
    expect(screen.getByText('읽는 중에 껐다.')).toBeInTheDocument();
  });
});

describe('종류별 연출', () => {
  const playingKind = (kind: 'announce' | 'readout' | 'alarm') => [
    broadcastAnnounce({ text: `${kind} 문장이다.`, kind }),
    ttsActions.playNext(),
  ];
  const banner = (c: HTMLElement) => c.querySelector('p')!;

  it('경보는 평소 안내와 다르게 생겼다 — 같으면 자막이 그 차이를 지운다', () => {
    const plain = banner(show(...playingKind('announce')).container).style.background;
    const alarm = banner(show(...playingKind('alarm')).container).style.background;
    expect(alarm).not.toBe(plain);
  });

  it('판독도 안내와 구분된다', () => {
    const plain = banner(show(...playingKind('announce')).container).style.background;
    const readout = banner(show(...playingKind('readout')).container).style.background;
    expect(readout).not.toBe(plain);
  });

  it('경보는 낭독기도 끊고 먼저 읽는다 — 큐에서 끼어드는 것과 같은 규칙이다', () => {
    show(...playingKind('alarm'));
    const el = screen.getByRole('alert');
    expect(el).toHaveAttribute('aria-live', 'assertive');
  });

  it('평소 안내는 낭독기를 끊지 않는다', () => {
    show(...playingKind('announce'));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('색만으로 구분하지 않는다 — 색을 못 보면 경보인 줄 모른다', () => {
    const plain = banner(show(...playingKind('announce')).container);
    const alarm = banner(show(...playingKind('alarm')).container);
    // 굵기와 낭독기 역할이 색과 별개로 경보를 알린다
    expect(alarm.style.fontWeight).not.toBe(plain.style.fontWeight);
    expect(alarm.getAttribute('role')).not.toBe(plain.getAttribute('role'));
  });
});
