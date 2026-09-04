/**
 * 의심도 막대의 색 — 화면에서 눈으로 잡기 어려운 규칙이다. 개체를 폐기선까지 태우려면 판을
 * 여러 번 돌려야 하고, 그 사이에 색이 한 칸 어긋나 있어도 알아채기 어렵다. 여기서 붙잡아 둔다.
 */
import { describe, expect, it } from 'vitest';
import { SUS_LOOK, SUS_TRACK, susLevel } from '@/arena3d/scene/susbar';

const HOT = 70; // 판의 눈금 (BALANCE.hotAt)

describe('susLevel', () => {
  it('세 칸으로 나뉜다 — 느슨 · 조인다 · 폐기선이 가깝다', () => {
    expect(susLevel(0, HOT)).toBe('calm');
    expect(susLevel(34, HOT)).toBe('calm');
    expect(susLevel(35, HOT)).toBe('warm');
    expect(susLevel(69, HOT)).toBe('warm');
    expect(susLevel(70, HOT)).toBe('hot');
    expect(susLevel(100, HOT)).toBe('hot');
  });

  it('붉은 칸이 시작되는 자리는 **판이 바뀌는 자리와 같다** — 그 선을 넘으면 처형판이 선다', () => {
    expect(susLevel(HOT - 0.01, HOT)).toBe('warm');
    expect(susLevel(HOT, HOT)).toBe('hot');
  });

  it('눈금이 바뀌면 칸도 같이 움직인다 — 색과 판이 갈라지면 안 된다', () => {
    expect(susLevel(45, 40)).toBe('hot');
    expect(susLevel(45, 100)).toBe('calm');
    expect(susLevel(55, 100)).toBe('warm');
  });
});

describe('SUS_LOOK', () => {
  it('빛은 붉은 칸에만 얹는다 — 방 건너에서 그 몸 하나가 먼저 눈에 들어야 한다', () => {
    expect(SUS_LOOK.calm.glow).toBe('none');
    expect(SUS_LOOK.warm.glow).toBe('none');
    expect(SUS_LOOK.hot.glow).not.toBe('none');
  });

  it('세 칸의 색이 서로 다르다 — 같으면 칸을 나눈 뜻이 없다', () => {
    const fills = [SUS_LOOK.calm.fill, SUS_LOOK.warm.fill, SUS_LOOK.hot.fill];
    expect(new Set(fills).size).toBe(3);
  });

  /**
   * 여태 뜨거운 쪽(#ff9f9f)이 평상시(#e2b07f)보다 **연했다** — 위험한 쪽이 더 옅으면
   * 훑어보는 눈에는 오히려 가라앉은 것으로 읽힌다. 붉은 칸이 제일 진해야 한다.
   */
  it('붉은 칸이 제일 진하다', () => {
    const sat = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return max === 0 ? 0 : (max - min) / max;
    };
    expect(sat(SUS_LOOK.hot.fill)).toBeGreaterThan(sat(SUS_LOOK.warm.fill));
    expect(sat(SUS_LOOK.hot.fill)).toBeGreaterThan(sat(SUS_LOOK.calm.fill));
  });
});

/**
 * 판이 서기 전에는 전원이 0 이라, 그때 화면에 있는 것은 **빈 막대뿐**이다.
 * 그게 안 보이면 눈금이 어디서 차오르는지를 알 수가 없다 (2026-09-02 사용자: "너무 검정이라 안 보여").
 */
describe('SUS_TRACK — 빈 막대', () => {
  const lum = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0);

  it('거의 검정이 아니다 — 어두운 벽에 묻히던 자리다', () => {
    expect(lum(SUS_TRACK)).toBeGreaterThan(0.12);
  });

  it('가운데 톤이다 — 밝은 벽과 어두운 구석이 같이 있는 홀이라 한쪽에 맞추면 다른 쪽에서 사라진다', () => {
    expect(lum(SUS_TRACK)).toBeLessThan(0.55);
  });

  /*
   * 밝기로 재지 않는다 — 붉은 칸(#ff4d4d)과 빈 막대는 밝기가 비슷하지만 눈에는 전혀 다른 색이다.
   * 가르는 것은 색 자체라, 세 채널의 거리를 본다.
   */
  it('어느 칸의 색과도 헷갈리지 않는다 — 빈 것과 찬 것은 달라야 한다', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const far = (a: string, b: string) =>
      Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    [SUS_LOOK.calm.fill, SUS_LOOK.warm.fill, SUS_LOOK.hot.fill].forEach((fill) => {
      expect(fill).not.toBe(SUS_TRACK);
      expect(`${fill}:${far(fill, SUS_TRACK) > 80}`).toBe(`${fill}:true`);
    });
  });
});
