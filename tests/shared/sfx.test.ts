// @vitest-environment jsdom
/**
 * UI 효과음 — **무엇이 눌렸을 때 어떤 소리가 나는가**를 지킨다.
 *
 * 소리 자체(합성된 파형)는 시험하지 않는다. jsdom 에는 AudioContext 가 없어서 낼 소리도 없고,
 * 있어도 "쇳소리처럼 들리나"는 코드가 답할 질문이 아니다. 대신 이 화면의 계약을 지킨다:
 *   · 누를 수 있는 것에서만 난다 (글·입력칸은 조용하다)
 *   · 못 누르는 버튼에서는 안 난다 — 소리가 나면 눌린 줄 안다
 *   · data-sfx 로 그 버튼만의 소리를 정한다, "none" 이면 조용하다
 *   · 꺼 두면 아무 소리도 나지 않고, 그 결정은 브라우저에 남는다
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { playSfx, pressable, setSfxOn, sfxFor, sfxOn } from '@/shared/sfx';

/** html 을 붙이고 첫 요소를 돌려준다 — 이벤트의 target 자리에 넣을 것 */
function put(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('무엇이 눌렸나', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('버튼은 기본 클릭음이다', () => {
    expect(sfxFor(put('<button>가기</button>'), 'press')).toBe('click');
  });

  it('data-sfx 가 그 버튼만의 소리를 정한다 — 방은 철컹이다', () => {
    expect(sfxFor(put('<button data-sfx="clank">1024번 방</button>'), 'press')).toBe('clank');
  });

  it('모르는 이름이 적혀 있으면 그냥 클릭음이다 — 오타로 버튼이 조용해지지 않게', () => {
    expect(sfxFor(put('<button data-sfx="쿵쾅">가기</button>'), 'press')).toBe('click');
  });

  it('data-sfx="none" 은 조용하다 — 효과음 스위치 자신이 이것이다', () => {
    expect(sfxFor(put('<button data-sfx="none">🔊</button>'), 'press')).toBeNull();
  });

  it('버튼 안의 아이콘을 눌러도 버튼의 소리가 난다', () => {
    const btn = put('<button data-sfx="clank"><svg><path/></svg><span>들어가기</span></button>');
    expect(sfxFor(btn.querySelector('path'), 'press')).toBe('clank');
    expect(sfxFor(btn.querySelector('span'), 'press')).toBe('clank');
  });

  it('못 누르는 버튼에서는 소리가 나지 않는다', () => {
    expect(sfxFor(put('<button disabled data-sfx="start">게임 시작</button>'), 'press')).toBeNull();
    expect(sfxFor(put('<button aria-disabled="true">게임 시작</button>'), 'press')).toBeNull();
  });

  it('누를 수 없는 것은 조용하다 — 글·입력칸·바탕', () => {
    expect(sfxFor(put('<p>목록은 그림이다</p>'), 'press')).toBeNull();
    expect(sfxFor(put('<input aria-label="방 번호" />'), 'press')).toBeNull();
    expect(sfxFor(put('<a>주소 없는 앵커</a>'), 'press')).toBeNull();
    expect(sfxFor(null, 'press')).toBeNull();
  });

  it('갈 곳이 있는 링크는 버튼과 같다', () => {
    expect(sfxFor(put('<a href="/lobby">로비</a>'), 'press')).toBe('click');
  });

  it('훑고 지나가는 소리는 늘 hover 다 — 그 버튼의 소리를 미리 내지 않는다', () => {
    expect(sfxFor(put('<button data-sfx="start">게임 시작</button>'), 'hover')).toBe('hover');
    expect(sfxFor(put('<button data-sfx="none">🔊</button>'), 'hover')).toBeNull();
  });

  it('pressable 은 눌린 버튼 자체를 돌려준다 — 같은 버튼 위에서 hover 가 두 번 울리지 않게', () => {
    const btn = put('<button><span>가기</span></button>');
    expect(pressable(btn.querySelector('span'))).toBe(btn);
    expect(pressable(put('<p>글</p>'))).toBeNull();
  });
});

describe('켜고 끄기', () => {
  beforeEach(() => localStorage.clear());

  it('기본은 켜짐이다 — 이 소리는 전부 누른 뒤에만 난다', () => {
    expect(sfxOn()).toBe(true);
  });

  it('끄면 브라우저에 남는다', () => {
    setSfxOn(false);
    expect(sfxOn()).toBe(false);
    setSfxOn(true);
    expect(sfxOn()).toBe(true);
  });

  it('소리를 낼 수 없는 환경에서도 화면을 멈추지 않는다 (jsdom 에는 AudioContext 가 없다)', () => {
    expect(() => playSfx('clank')).not.toThrow();
    setSfxOn(false);
    expect(() => playSfx('start')).not.toThrow();
  });
});
