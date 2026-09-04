// @vitest-environment jsdom
/**
 * **네 장을 지나오는 동안 소리가 끊기는 자리가 없어야 한다.**
 *
 * 복도 → 중앙 시설 → 재검실까지는 맵마다 곡이 붙어 있었는데(MapDef.bgm), 마지막 방인 인지 검증실만
 * 곡이 없었다 (MAPS.warehouse). 그래서 재검실의 암전이 걷히는 순간 — 인계 서류 4.2초부터 판이 끝날
 * 때까지 — 이야기의 마지막 무대가 통째로 무음이었다. 화면은 이어지는데 소리만 거기서 끝났다.
 *
 * 손잡이도 같이 잃었다: 앞 세 장은 오른쪽 위 머리줄에 음량이 늘 있는데(WorldFeature), 검증실은
 * 그 줄이 없다. 그래서 소리는 화면이 물고(knob={false}) 손잡이는 Esc 음향판이 그린다 (SoundPanel).
 */
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { bgmVolume } from '@/features/world/Bgm';

const MAP_SRC = readFileSync('src/world/map/index.ts', 'utf8');
const ARENA_SRC = readFileSync('src/features/arena/ArenaFeature.tsx', 'utf8');
const PANEL_SRC = readFileSync('src/features/arena/SoundPanel.tsx', 'utf8');

/** `  <name>: {` 부터 그 맵이 끝나는 `\n  },` 까지 */
function mapBlock(name: string): string {
  const at = MAP_SRC.indexOf(`\n  ${name}: {`);
  expect(at, `${name} 맵이 없다`).toBeGreaterThan(-1);
  return MAP_SRC.slice(at, MAP_SRC.indexOf('\n  },', at));
}

describe('이야기가 지나는 방은 전부 곡을 가진다', () => {
  // 검증실의 무대는 격납고 홀이다 (features/arena 의 MAP_DEF = MAPS.warehouse)
  for (const [map, room] of [
    ['corridor', '복도'],
    ['central', '중앙 시설'],
    ['recheck', '재검실'],
    ['warehouse', '인지 검증실'],
  ] as const) {
    it(`${room} — 곡이 붙어 있다`, () => {
      expect(mapBlock(map)).toMatch(/bgm: '\/audio\/[^']+'/);
    });
  }
});

describe('검증실은 소리만 물고 손잡이는 음향판이 그린다', () => {
  it('화면이 곡을 문다 — 맵이 정한 그 곡으로', () => {
    expect(ARENA_SRC).toContain('<Bgm src={MAPS.warehouse.bgm}');
  });

  it('손잡이는 여기서 안 그린다 — 이 화면에는 머리줄이 없다', () => {
    expect(ARENA_SRC).toContain('knob={false}');
  });

  it('판이 끝나면 곡을 재운다 — 선고 한 장 위로 곡이 계속 돌면 장이 안 닫힌다', () => {
    expect(ARENA_SRC).toContain("fade={outcome !== 'playing'}");
  });

  it('음향판이 그 손잡이를 그린다 — 리더 방송 · 배경음악 · 효과음 셋이 한자리다', () => {
    expect(PANEL_SRC).toContain('배경음악');
    expect(PANEL_SRC).toContain('bgmVolume.set(');
  });
});

/**
 * 값은 컴포넌트 밖에 있다 — 손잡이가 서는 자리가 화면마다 달라서다 (Bgm 의 bgmVolume 머리말).
 * 월드 머리줄에서 줄인 값이 검증실 음향판에서도 그 값이어야 한다.
 */
describe('배경음악 볼륨은 한 곳에서 본다', () => {
  beforeEach(() => bgmVolume.set(0.35));

  it('손잡이 둘이 같은 값을 잡는다', () => {
    let seen = -1;
    const off = bgmVolume.subscribe(() => (seen = bgmVolume.get()));
    bgmVolume.set(0.6);
    expect(seen).toBe(0.6);
    expect(bgmVolume.get()).toBe(0.6);
    off();
  });

  it('0~1 을 벗어나면 잘라 담는다', () => {
    bgmVolume.set(-1);
    expect(bgmVolume.get()).toBe(0);
    bgmVolume.set(9);
    expect(bgmVolume.get()).toBe(1);
  });

  it('화면을 옮겨도 남는다 — 저장은 여기 한 곳이다', () => {
    bgmVolume.set(0.15);
    expect(localStorage.getItem('world.bgm.volume')).toBe('0.15');
  });

  it('떼어 낸 손잡이는 더 안 듣는다', () => {
    let hits = 0;
    const off = bgmVolume.subscribe(() => (hits += 1));
    bgmVolume.set(0.5);
    off();
    bgmVolume.set(0.25);
    expect(hits).toBe(1);
  });
});
