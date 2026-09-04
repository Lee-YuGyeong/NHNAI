// @vitest-environment jsdom
/**
 * 오프닝 영상의 규칙 — **처음 오는 사람에게 한 번만** (shared/opening.ts).
 *
 * 화면(OpeningVideo)이 아니라 판단만 본다:
 *   · 처음 온 브라우저는 「아직 안 봤다」
 *   · 한 번 표시하면 다시 안 뜬다 (끝까지 봤든 건너뛰었든 같다)
 *   · 표시를 지우면 다시 처음처럼 뜬다 (루트의 「영상 테스트」가 관문을 시험할 때)
 *   · 저장소가 막힌 브라우저에서는 **매번 뜨되 터지지 않는다** — 건너뛰기로 지나간다
 *   · 영상 주소는 **파일을 주는 주소**다 — 재생기를 얹는 임베드가 아니고, 예비가 하나 더 있다
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPENING_SOURCES,
  forgetOpeningSeen,
  markOpeningSeen,
  openingSeen,
} from '@/shared/opening';

beforeEach(() => {
  localStorage.clear();
});

describe('봤다는 표시', () => {
  it('처음 온 브라우저는 아직 안 봤다', () => {
    expect(openingSeen()).toBe(false);
  });

  it('한 번 표시하면 다시 안 뜬다', () => {
    markOpeningSeen();
    expect(openingSeen()).toBe(true);
    // 두 번 표시해도 같다 — 영상 끝과 건너뛰기가 겹쳐도 상태가 흔들리지 않아야 한다
    markOpeningSeen();
    expect(openingSeen()).toBe(true);
  });

  it('지우면 다시 처음처럼 뜬다', () => {
    markOpeningSeen();
    forgetOpeningSeen();
    expect(openingSeen()).toBe(false);
  });

  it('저장소가 막혀 있어도 터지지 않는다 — 매번 뜨는 쪽으로 기운다', () => {
    const boom = () => {
      throw new Error('denied');
    };
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    const del = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);

    expect(() => markOpeningSeen()).not.toThrow();
    expect(() => forgetOpeningSeen()).not.toThrow();
    expect(openingSeen()).toBe(false);

    get.mockRestore();
    set.mockRestore();
    del.mockRestore();
  });
});

describe('영상 자리', () => {
  const [remote, av1, h264] = OPENING_SOURCES;

  /*
   * ★ 재생기를 얹는 곳으로는 가지 않는다. 유튜브 임베드였을 때는 재생기 위에 로고·채널
   *   이름이 얹혔고 지울 방법이 없었다 (2026-09-04 사용자: "마크가 거슬리네").
   *   드라이브도 `/file/d/<id>/preview` 로 물리면 똑같이 구글 재생기가 얹힌다.
   *
   * ★ **구글 드라이브 주소는 여기 못 온다** (2026-09-04 세 형태 다 두드려 봤다).
   *   `/view` 는 사람이 보는 화면이고, `uc?export=download` 는 파일이 크면 「바이러스
   *   검사 경고」 HTML 을 돌려주고, 마지막 형태는 curl 로는 video/mp4 를 주지만
   *   **크롬이 막는다** (net::ERR_BLOCKED_BY_ORB — 첨부 내려받기로 오는 응답은
   *   미디어로 못 쓴다). 그래서 이 검사는 취향이 아니라 계약이다.
   */
  it('어느 줄도 재생기를 얹는 주소가 아니다 — 드라이브 링크가 들어오면 여기서 걸린다', () => {
    for (const s of OPENING_SOURCES) {
      expect(s.src).not.toMatch(/youtube|youtu\.be|\/preview|\/embed\//i);
      expect(s.src).not.toMatch(/drive\.google\.com|drive\.usercontent/i);
    }
  });

  it('세 줄이다 — 바깥의 원본 → 저장소 AV1 → 저장소 H.264', () => {
    expect(OPENING_SOURCES).toHaveLength(3);
    expect(remote.src).toMatch(/^https:\/\/\S+\.mp4$/);
    expect(av1.src).toBe('/opening/opening.av1.mp4');
    expect(h264.src).toBe('/opening/opening.mp4');
  });

  /*
   * AV1 줄에는 codecs 를 적어야 한다. 이게 없으면 브라우저가 「mp4 니까 되겠지」 하고
   * 물었다가 못 풀고 멈춘다 — 떨어질 곳이 있는데도 안 떨어진다.
   * 반대로 앞뒤 두 줄은 **코덱을 밝히지 않는다**: 어디서나 도는 자리여야 한다.
   */
  it('AV1 줄만 코덱을 밝힌다', () => {
    expect(av1.type).toContain('av01');
    expect(remote.type).toBe('video/mp4');
    expect(h264.type).toBe('video/mp4');
  });

  /*
   * 예비 둘을 지우지 않는다. 바깥이 안 되는 날 오프닝이 아예 안 뜨는 것보다 720p 로라도
   * 뜨는 것이 낫고, AV1 을 못 푸는 브라우저도 있다.
   */
  it('예비는 우리 서버에 있다 — 바깥이 죽어도 뜬다', () => {
    expect(av1.src.startsWith('/')).toBe(true);
    expect(h264.src.startsWith('/')).toBe(true);
    expect(new Set(OPENING_SOURCES.map((s) => s.src)).size).toBe(3);
  });
});
