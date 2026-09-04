// @vitest-environment jsdom
/**
 * 오프닝 영상 화면의 손잡이들 (shared/OpeningVideo.tsx).
 *
 * 이 화면에는 **재생기 띠가 없다.** 유튜브를 걷어내면서 남의 재생기도 같이 걷었기 때문에,
 * 앞뒤로 움직이고 빠져나가는 길은 전부 우리가 놓은 것들이다. 그래서 여기서 지키는 것은
 * 「무엇이 보이나」가 아니라 **「나가고 움직일 수 있나」**다:
 *
 *   · → 10초 앞으로 · ← 10초 뒤로 (2026-09-04 사용자 지시)
 *   · 양 끝을 넘지 않는다 — 길이를 모를 때는 아예 손대지 않는다 (NaN 이 들어가면 영상이 선다)
 *   · Esc 로 건너뛴다. 단 **전체화면일 때는 안 된다** (그 Esc 는 전체화면을 벗기는 Esc 다)
 *   · 건너뛰기 단추는 어떤 상태에서도 있다
 *
 * 영상 알맹이(재생·코덱·버퍼링)는 jsdom 이 흉내 낼 것이 아니라 여기서 보지 않는다 —
 * 그건 브라우저에서 직접 눌러 확인한다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningVideo } from '@/shared/OpeningVideo';

/** jsdom 에는 재생이 없다 — 없다고 시끄럽게 굴지 않게 조용한 것으로 갈아 끼운다 */
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 영상을 세우고 **시각을 손에 쥔다.** jsdom 의 <video> 는 currentTime·duration 이
 * 붙박이 0/NaN 이라, 이 화면의 셈(±10초·양 끝 자르기)을 보려면 여기서 대신 들고 있어야 한다.
 */
function renderVideo({ at = 100, dur = 293.7 }: { at?: number; dur?: number } = {}) {
  const onDone = vi.fn();
  render(<OpeningVideo onDone={onDone} />);
  const video = screen.getByTitle('오프닝 영상') as HTMLVideoElement;
  let t = at;
  Object.defineProperty(video, 'duration', { get: () => dur, configurable: true });
  Object.defineProperty(video, 'currentTime', {
    get: () => t,
    set: (v: number) => {
      t = v;
    },
    configurable: true,
  });
  return { onDone, video, now: () => t };
}

const press = (code: string) => fireEvent.keyDown(window, { code });

describe('화살표로 10초씩', () => {
  it('오른쪽은 앞으로 10초', () => {
    const { now } = renderVideo({ at: 100 });
    press('ArrowRight');
    expect(now()).toBe(110);
  });

  it('왼쪽은 뒤로 10초', () => {
    const { now } = renderVideo({ at: 100 });
    press('ArrowLeft');
    expect(now()).toBe(90);
  });

  it('여러 번 누르면 그만큼 간다', () => {
    const { now } = renderVideo({ at: 100 });
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowLeft');
    expect(now()).toBe(110);
  });

  /* 뛴 것이 보여야 한다 — 검은 장면이 많은 영상이라 표시가 없으면 키가 먹었는지 모른다 */
  it('뛴 방향이 화면에 잠깐 뜬다', () => {
    renderVideo({ at: 100 });
    press('ArrowRight');
    expect(screen.getByText(/10초/)).toBeInTheDocument();
  });

  it('처음보다 앞으로는 못 간다', () => {
    const { now } = renderVideo({ at: 4 });
    press('ArrowLeft');
    expect(now()).toBe(0);
  });

  it('끝보다 뒤로는 못 간다', () => {
    const { now } = renderVideo({ at: 290, dur: 293.7 });
    press('ArrowRight');
    expect(now()).toBe(293.7);
  });

  /*
   * ★ 아직 받아 오는 중이면 duration 이 NaN 이다. 거기에 10 을 더하면 currentTime 이
   *   NaN 이 되고 **영상이 통째로 선다** — 눌러서 고장 내는 키가 된다.
   */
  it('길이를 모르면 아예 손대지 않는다', () => {
    const { now } = renderVideo({ at: 12, dur: Number.NaN });
    press('ArrowRight');
    expect(now()).toBe(12);
  });
});

describe('나가는 길', () => {
  it('Esc 로 건너뛴다', () => {
    const { onDone } = renderVideo();
    press('Escape');
    expect(onDone).toHaveBeenCalled();
  });

  /*
   * ★ 전체화면일 때의 Esc 는 **브라우저 것**이다 — 전체화면만 벗기고 영상은 계속 돈다.
   *   여기서 같이 finish 를 부르면, 전체화면을 벗기려던 사람이 로비로 튕겨 나간다.
   */
  it('전체화면일 때의 Esc 는 가로채지 않는다', () => {
    const { onDone, video } = renderVideo();
    Object.defineProperty(document, 'fullscreenElement', { value: video, configurable: true });
    press('Escape');
    expect(onDone).not.toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  it('건너뛰기 단추는 늘 있다', () => {
    const { onDone } = renderVideo();
    fireEvent.click(screen.getByRole('button', { name: /건너뛰기/ }));
    expect(onDone).toHaveBeenCalled();
  });

  /* 한 번만 나간다 — 영상 끝과 사람 손이 겹쳐도 로비로 두 번 가지 않는다 */
  it('두 번 눌러도 한 번만 나간다', () => {
    const { onDone } = renderVideo();
    fireEvent.click(screen.getByRole('button', { name: /건너뛰기/ }));
    press('Escape');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
