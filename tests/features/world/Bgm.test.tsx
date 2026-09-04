// @vitest-environment jsdom
/**
 * 배경음악의 볼륨 손잡이 — 여기서 지키는 것은 소리가 아니라 **자리**다.
 *
 * 2026-09-02 사용자 신고: "수첩 접은 후에 열 수가 없어. 겹쳐서." 이 손잡이가 `right:12 / top:44`
 * 에 제 발로 서 있었고, 그 바로 아래가 접힌 관찰 수첩의 [메모] 자리였다. 오른쪽 위에 무엇이 더
 * 서는지는 이 부품이 알 수 없는 일이다 — 오늘은 수첩이지만 내일은 다른 것이다.
 *
 * 그래서 계약은 하나다: **이 부품은 제 자리를 정하지 않는다.** 자리는 부르는 쪽의 머리줄이 정한다
 * (features/world/WorldFeature · features/world2/Scenario2Feature 의 오른쪽 위 한 줄).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Bgm } from '@/features/world/Bgm';

/** jsdom 에는 재생이 없다 — 이 시험은 소리를 안 재므로 껍데기면 충분하다 */
class FakeAudio {
  loop = false;
  preload = '';
  volume = 1;
  paused = true;
  src = '';
  constructor(src?: string) {
    this.src = src ?? '';
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('Audio', FakeAudio);
});

describe('볼륨 손잡이', () => {
  it('한 줄짜리 손잡이를 그린다', () => {
    render(<Bgm src="/audio/x.m4a" />);
    expect(screen.getByLabelText('배경음악 볼륨')).toHaveAttribute('type', 'range');
  });

  it('제 자리를 정하지 않는다 — 자리는 부르는 쪽의 머리줄이 정한다', () => {
    render(<Bgm src="/audio/x.m4a" />);
    const box = screen.getByTitle('배경음악 볼륨');
    // 절대 좌표를 스스로 잡으면 오른쪽 위에 나중에 서는 것과 반드시 겹친다 (수첩의 [메모]가 그랬다)
    expect(box.style.position).toBe('');
    expect(box.style.top).toBe('');
    expect(box.style.right).toBe('');
    expect(box.style.zIndex).toBe('');
    // 그래도 제 모양은 갖는다 — 줄 안에 흘러 앉는 한 줄
    expect(box.style.display).toBe('flex');
  });

  it('옮긴 값은 브라우저에 남는다 — 방을 옮길 때마다 다시 맞추지 않게', () => {
    const { unmount } = render(<Bgm src="/audio/x.m4a" />);
    fireEvent.change(screen.getByLabelText('배경음악 볼륨'), { target: { value: '0.6' } });
    expect(localStorage.getItem('world.bgm.volume')).toBe('0.6');
    unmount();

    render(<Bgm src="/audio/x.m4a" />);
    expect(screen.getByLabelText('배경음악 볼륨')).toHaveValue('0.6');
  });
});
