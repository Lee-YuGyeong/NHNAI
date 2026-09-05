// @vitest-environment jsdom
/**
 * 표식(HeroKey, 복도 벌) — 여러 벌을 시험하던 시절의 규칙(58ddd2b) 을 하나로 정한 뒤에도
 * 그대로 지킨다:
 *
 *   1. 제목 — 이 화면이 무슨 화면인지 말하는 한 줄
 *   2. 문 셋 — 입장하기 · 규칙 보기 · **로그인 없이 들어가기**
 *   3. 아래로 내려가는 길 — 한 번에 한 칸이라 이게 없으면 여기서 끝인 줄 안다
 *
 * 특히 **로그인 없이 들어가기**가 이 시험의 핵심이다. 그 길은 이 게임의 약속이라
 * (shared/guest.ts) 빠지면 화면은 멀쩡해 보인다 — 그림이 아니라 시험이 잡아야 하는
 * 종류의 사고다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroKey, HeroVideo, INTRO_VIDEO_POSTER, INTRO_VIDEO_START_SEC } from '@/features/lobby/heroes';

describe('표식 (HeroKey · 복도)', () => {
  afterEach(cleanup);

  /** 눌린 것을 순서대로 적는다 — 어느 단추가 어디로 가는지 한 번에 본다 */
  function put() {
    const hit: string[] = [];
    render(
      <div className="bl">
        <HeroKey
          titled
          onTitled={() => hit.push('titled')}
          enter={() => hit.push('enter')}
          guest={() => hit.push('guest')}
          rules={() => hit.push('rules')}
          next={() => hit.push('next')}
        />
      </div>,
    );
    return hit;
  }

  /*
   * 2026-09-05 사용자 지시("아예 제거해줘") — 제목(h1) · 방송 두 줄 · 서명을 걷어냈다.
   * 그 자리를 배경 영상이 맡았으므로 **글이 다시 기어들어오는 것**을 여기서 막는다:
   * 걷어낸 이유가 "영상이 하는 말을 글이 되풀이하지 않는다" 였는데, 그건 화면을 안 보면
   * 눈치채기 어려운 종류의 규칙이다.
   */
  it('글은 영문 한 줄뿐이다 — 제목도 방송도 서명도 없다', () => {
    put();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText(/표식이 붙어 있다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/상시 송출/)).not.toBeInTheDocument();
    expect(screen.getByText(/SPECIAL AI RESPONSE CENTER/)).toBeInTheDocument();
  });

  /*
   * 문이 올라오는 신호. 제목이 다 찍히면 오던 것이라, 제목을 걷어낸 순간 이게 영영 안 와서
   * **단추 셋이 통째로 안 보이게 된다**(.hero-late 는 opacity: 0). 화면은 멀쩡해 보이고
   * 들어갈 길만 없는 종류의 사고라, 붙자마자 오는지를 못 박아 둔다.
   */
  it('붙자마자 문을 올리는 신호가 온다', () => {
    expect(put()).toEqual(['titled']);
  });

  it('문 셋이 다 있고 각자 제 곳으로 간다', () => {
    const hit = put();
    fireEvent.click(screen.getByRole('button', { name: /입장하기/ }));
    fireEvent.click(screen.getByRole('button', { name: '규칙 보기' }));
    // 로그인 없이 노는 길 — 표식을 갈아 끼우다 제일 먼저 빠지는 단추다
    fireEvent.click(screen.getByRole('button', { name: '로그인 없이 들어가기' }));
    expect(hit).toEqual(['titled', 'enter', 'rules', 'guest']);
  });

  it('아래 칸으로 내려가는 길이 있다', () => {
    const hit = put();
    fireEvent.click(screen.getByRole('button', { name: /SCROLL/ }));
    expect(hit).toEqual(['titled', 'next']);
  });

  /*
   * 2026-09-05 사용자: "영상 나오기 전에 외부 이상한 이미지가 나오는데 영상 바로 나오게 해줘.
   * 로드까지 시간이 걸린다면 영상 첫 시작부분에 이미지를 따서 보여주면 자연스러울 것 같아."
   * 밑의 그림과 영상의 poster 가 **같은 장면**이어야 영상이 켜지는 순간 화면이 안 튄다.
   */
  it('영상이 오기 전의 그림은 영상의 첫 장면과 같다', () => {
    put();
    const img = document.querySelector('.hero-key__art img') as HTMLImageElement;
    const v = document.querySelector('video') as HTMLVideoElement;
    expect(img.getAttribute('src')).toBe(INTRO_VIDEO_POSTER);
    expect(v.getAttribute('poster')).toBe(INTRO_VIDEO_POSTER);
    expect(INTRO_VIDEO_POSTER).toMatch(new RegExp(`${INTRO_VIDEO_START_SEC}s\\.jpg$`));
  });
});

/**
 * 표지 배경 영상 — 계약 셋: 주소가 없으면 층 자체가 없고, 주소가 있으면 소리 없는 반복
 * 재생이고, 죽으면 그림으로 내려앉는다. 첫 화면은 어떤 경우에도 성립해야 한다 (heroes.tsx).
 */
describe('표지 배경 영상 (HeroVideo)', () => {
  afterEach(cleanup);

  it('주소가 없으면 아무것도 안 세운다 — 그림이 그대로 표지다', () => {
    render(<HeroVideo src="" />);
    expect(document.querySelector('video')).toBeNull();
  });

  it('주소를 주면 소리 없는 재생으로 선다', () => {
    render(<HeroVideo src="https://example.com/intro.mp4" />);
    const v = document.querySelector('video') as HTMLVideoElement;
    expect(v).not.toBeNull();
    // 자동재생의 조건이자 이 화면의 소리 규칙 — 소리는 누른 것에만 대답한다
    expect(v.muted).toBe(true);
    expect(v).toHaveAttribute('playsinline');
  });

  /** 2026-09-05 사용자: "22초부터 시작". loop 속성은 0초로 되감아서 ended 에서 직접 되감는다 */
  it('길이를 받아 오면 22초로 놓고, 끝나면 다시 22초로 되감는다', () => {
    render(<HeroVideo src="https://example.com/intro.mp4" />);
    const v = document.querySelector('video') as HTMLVideoElement;
    let t = 0;
    let ended = false;
    Object.defineProperty(v, 'currentTime', { get: () => t, set: (x: number) => (t = x), configurable: true });
    Object.defineProperty(v, 'ended', { get: () => ended, configurable: true });
    fireEvent.loadedMetadata(v);
    expect(t).toBe(22);
    t = 119;
    ended = true;
    fireEvent.ended(v);
    expect(t).toBe(22);
  });

  /*
   * 2026-09-05 사용자: "22초에서 시작되어야 하는데 다시 돌아왔는데". 같은 파일을 받아 둔 브라우저는
   * metadata 가 React 가 요소를 문서에 붙이기 전에 오고, 그 이벤트는 버려진다 — 그러면 0초부터 돈다.
   * 마운트 직후 이미 길이를 알면(readyState ≥ 1) 이벤트 없이도 22초로 놓아야 한다 (heroes.tsx 「두 길」).
   */
  it('길이를 이미 알고 마운트되면 loadedmetadata 없이도 22초로 놓는다', () => {
    const ready = vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1);
    const set: number[] = [];
    const ct = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      get: () => (set.length ? set[set.length - 1] : 0),
      set: (x: number) => {
        set.push(x);
      },
    });
    try {
      render(<HeroVideo src="https://example.com/intro.mp4" />);
      expect(set).toEqual([22]);
    } finally {
      ready.mockRestore();
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', ct);
    }
  });

  it('아직 길이를 모르고 마운트되면 손대지 않는다 — loadedmetadata 가 놓는다', () => {
    const set: number[] = [];
    const ct = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      get: () => 0,
      set: (x: number) => {
        set.push(x);
      },
    });
    try {
      render(<HeroVideo src="https://example.com/intro.mp4" />);
      expect(set).toEqual([]);
      fireEvent.loadedMetadata(document.querySelector('video') as HTMLVideoElement);
      expect(set).toEqual([22]);
    } finally {
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', ct);
    }
  });

  it('로드가 죽으면 그림으로 내려앉는다 — 다시 시도하지 않는다', () => {
    render(<HeroVideo src="https://example.com/broken.mp4" />);
    fireEvent.error(document.querySelector('video') as HTMLVideoElement);
    expect(document.querySelector('video')).toBeNull();
  });
});
