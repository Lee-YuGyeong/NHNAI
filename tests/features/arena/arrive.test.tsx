// @vitest-environment jsdom
/**
 * 도착 암전(.arrive) — 재검실을 나와 인지 검증실로 들어서는 그 검은 화면.
 *
 * 여기서 지키는 것은 둘이다.
 *
 *   ① **막이 그 위의 서류를 덮지 않는다.** 막에는 한때 「인지 검증실로 이동 중…」 한 줄이 있었고
 *      그 줄을 그리던 `.arena .arrive span` 이 서류(HandoverCard)로 자리가 바뀐 뒤에도 남아 있었다.
 *      서류는 span 으로 짜여 있어서 그 한 줄이 표제·게이지·장면 이름을 전부 잿빛으로 눌러 쓰고,
 *      깜빡임(arenawait)까지 얹어 서류가 통째로 숨을 쉬었다. **선택자가 더 세서 서류가 졌다** —
 *      눈으로는 "왜 흐릿하지" 로만 보여서, 규칙으로 붙잡아 두지 않으면 다음 화면에서 또 난다.
 *
 *   ② **막을 넘기는 키가 게임 손잡이로 안 샌다.** 서류가 「아무 키나 눌러 계속」이라고 적어 두는데
 *      그 「아무 키」는 이 화면의 손잡이와 같은 window 를 나눠 쓴다 (Enter 채팅 · Esc 음향 ·
 *      P 멈춤 · E 지목). Esc 쪽 규칙은 sound-esc.test 가 따로 본다.
 */
import { readFileSync } from 'node:fs';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HANDOVER_CSS, HandoverCard } from '@/features/arena/HandoverCard';
import { buildHandover } from '@/features/arena/handover';

const SRC = readFileSync('src/features/arena/ArenaFeature.tsx', 'utf8');

/**
 * 화면이 실제로 심는 그 스타일. 아레나 쪽은 상수를 내보내지 않으므로 소스에서 그대로 떠 오고,
 * 서류 쪽은 화면이 하는 그대로 뒤에 잇는다 (ArenaFeature 의 `const CSS = ... + HANDOVER_CSS`).
 */
const ARENA_CSS = SRC.split('const CSS = `')[1].split('`')[0];
const PAGE_CSS = ARENA_CSS + HANDOVER_CSS;
/** 규칙만 — 주석은 뺀다 (이 파일의 주석에도 「.arena .arrive span」이라고 적혀 있다) */
const ARENA_RULES = ARENA_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const record = buildHandover({
  unit: 'A38-091',
  unitKnown: true,
  sector: 4,
  suspicion: 62,
  syncLow: false,
  verdict: 'pass',
  rounds: 3,
  peers: ['A38-206'],
  entries: [{ kind: 'note', scene: '복도', text: '정비 명판을 읽음' }],
});

/** 서류를 막 안에 넣고, 화면이 심는 스타일을 그대로 얹는다 (검증실이 그리는 그 층 그대로) */
function paint() {
  return render(
    <main className="arena">
      <style>{PAGE_CSS}</style>
      <div className="arrive">
        <HandoverCard record={record} ready order="이 방에 인간이 하나 있다." />
      </div>
    </main>,
  ).container;
}

describe('막이 그 위의 서류를 덮지 않는다', () => {
  it('막에는 요소를 무는 규칙이 없다 — 안에 무엇을 그리든 규칙은 그 화면 제 파일에 있다', () => {
    // `.arena .arrive span` 같은 규칙. `.arrive.lift`(클래스)와 `.arrive {`(선언)은 걸리지 않는다
    expect(ARENA_RULES).not.toMatch(/\.arena\s+\.arrive\s+[a-z]/);
  });

  it('서류의 글자가 깜빡이지 않는다 — 다 읽기 전에 흐려지면 「아직 로딩 중」으로 읽힌다', () => {
    const container = paint();
    for (const el of container.querySelectorAll('.ho span')) {
      expect(getComputedStyle(el).animation).not.toContain('arenawait');
    }
  });

  it('막의 마지막 줄은 깜빡인다 — 그 깜빡임은 서류 제 파일이 부르는 것이다', () => {
    const container = paint();
    const wait = container.querySelector('.ho-wait') as HTMLElement;
    expect(getComputedStyle(wait).animation).toContain('arenawait');
  });
});

describe('막을 넘기는 키가 게임 손잡이로 안 샌다', () => {
  it('Enter — 막 뒤에서 채팅창이 열리면 막이 걷힌 자리에서 조작이 잠긴 채로 시작한다', () => {
    expect(SRC).toMatch(/막 위에서 온 Enter[\s\S]{0,200}?\n\s*if \(veiled\) return;/);
  });

  it('E · P — 막 뒤에서 판이 멈추거나 아직 보지도 않은 몸이 물린다', () => {
    expect(SRC).toMatch(/if \(keyNow\.current\.veiled\) return;/);
  });
});

describe('막과 서류는 한 장면으로 걷힌다', () => {
  it('서류를 먼저 걷고 나서 막을 밝히지 않는다 — 전환이 두 번이 된다', () => {
    // 서류는 막 안에 남아 막의 투명도를 같이 탄다 (.arrive.lift). 걷히는 조건으로 끊지 않는다
    expect(SRC).not.toMatch(/!curtainUp && handover/);
    expect(SRC).toMatch(/\.arena \.arrive\.lift \{ animation: arenaarrive/);
  });
});
