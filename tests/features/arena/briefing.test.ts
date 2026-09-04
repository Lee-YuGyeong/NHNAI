/**
 * 리더의 말을 언제까지 기다리는가 — 세 자리다.
 *
 * ① 브리핑 → 카운트다운: 여기가 틀리면 **판이 지시 도중에 돈다**.
 * ② 폐기 → 다음 검사: 여기가 틀리면 **선고 위에 검사가 겹친다**.
 * ③ 결말 → 결말 카드: 여기가 틀리면 **내 선고 위에 「다시 — 새 판」이 겹친다**.
 *
 * 셋 다 화면으로는 "좀 정신없네" 정도로만 보여서, 규칙으로 붙잡아 두지 않으면 다시 샌다.
 */
import { describe, expect, it } from 'vitest';
import {
  END_CEIL_MS,
  END_FLOOR_MS,
  END_TAIL_MS,
  PURGE_CEIL_MS,
  PURGE_FLOOR_MS,
  briefWaitMs,
  endHoldMs,
  purgeHoldMs,
} from '@/features/arena/briefing';

/** 76자 지시문의 실측값 — 자막 9.0초 · 소리 13.8초 (글자당 89ms 대 182ms) */
const FLOOR = 9_000;
const CEIL = 35_000;

describe('브리핑 → 카운트다운', () => {
  it('낭독 중이면 바닥이 지나도 세지 않는다 — 이게 고치려던 고장이다', () => {
    // 자막은 9.0초에 사라지지만 소리는 13.8초까지 간다. 예전에는 여기서 세기 시작해
    // 5초 뒤, 그러니까 리더가 아직 말하는 중에 판이 돌았다
    expect(briefWaitMs(true, 9_500, FLOOR, CEIL)).toBeGreaterThan(0);
    expect(briefWaitMs(true, 13_000, FLOOR, CEIL)).toBeGreaterThan(0);
  });

  it('낭독이 끝나면 곧바로 센다 — 읽을 시간은 이미 지났다', () => {
    expect(briefWaitMs(false, 13_800, FLOOR, CEIL)).toBe(0);
  });

  it('소리가 없으면 자막 시간만큼은 기다린다 — 눈으로 읽을 시간이 있어야 한다', () => {
    // 음소거·빈 방송처럼 낭독이 애초에 없는 경우. 여기서 0 이 되면 지시문이 뜨자마자 사라진다
    expect(briefWaitMs(false, 0, FLOOR, CEIL)).toBe(FLOOR);
    expect(briefWaitMs(false, 3_000, FLOOR, CEIL)).toBe(FLOOR - 3_000);
  });

  it('낭독이 영영 안 끝나도 판은 돈다 — 천장에서 센다', () => {
    // 방송이 통째로 멈춘 때만 걸리는 안전선. 판이 안 도는 것보다는 이르게 도는 편이 낫다
    expect(briefWaitMs(true, CEIL, FLOOR, CEIL)).toBe(0);
    expect(briefWaitMs(true, CEIL + 5_000, FLOOR, CEIL)).toBe(0);
  });

  it('남은 시간은 음수가 되지 않는다 — setTimeout 이 음수를 0 으로 삼키는 데 기대지 않는다', () => {
    expect(briefWaitMs(false, 99_999, FLOOR, CEIL)).toBe(0);
  });
});

/**
 * 폐기와 검사는 **같은 갱신에서 잇달아 발동한다** — 몰이가 개체 하나를 100 까지 태우면
 * 앞 효과가 폐기하고 뒤 효과가 남은 도합으로 새 검사를 세운다. 뒤엣것의 방송은 경보라
 * 「즉시 폐기」를 끊고 맨 앞에 서고, 잘린 선고 위로 카운트다운이 겹쳤다
 * (2026-09-02 사용자: "폐기랑 게임이랑 동시에 나올 때도 있어").
 */
describe('폐기 → 다음 검사', () => {
  it('선고를 읽는 중이면 검사가 안 선다 — 이게 고치려던 고장이다', () => {
    expect(purgeHoldMs(true, 1_000)).toBeGreaterThan(0);
    expect(purgeHoldMs(true, PURGE_FLOOR_MS + 1_000)).toBeGreaterThan(0);
  });

  it('선고가 끝나면 미뤄 둔 검사가 선다', () => {
    expect(purgeHoldMs(false, PURGE_FLOOR_MS)).toBe(0);
  });

  it('소리가 없어도 바닥만큼은 든다 — 행진이 눈에 끝나야 한다', () => {
    // 무대까지 걸어가 링 조명 아래 서고 소멸하는 데 드는 시간. 방송이 없다고 겹쳐도 되는 것은 아니다
    expect(purgeHoldMs(false, 0)).toBe(PURGE_FLOOR_MS);
    expect(purgeHoldMs(false, 2_000)).toBe(PURGE_FLOOR_MS - 2_000);
  });

  it('방송이 영영 안 끝나도 판은 돈다 — 천장에서 푼다', () => {
    expect(purgeHoldMs(true, PURGE_CEIL_MS)).toBe(0);
  });
});

/**
 * 내가 폐기되는 순간 리더는 내 죄목과 조사 결과를 읽고, 나는 그 앞에서 무너지는 중이다.
 * 결말 카드가 그 자리에서 화면을 덮으면 **내가 죽는 장면이 통째로 없어진다**
 * (2026-09-02 사용자: "리더는 말하고 있는데 나는 빨간색으로 다시 시작 떠").
 */
describe('결말 → 결말 카드', () => {
  it('내 선고를 읽는 중이면 카드가 안 뜬다 — 이게 고치려던 고장이다', () => {
    expect(endHoldMs(true, 0)).toBeGreaterThan(0);
    expect(endHoldMs(true, END_FLOOR_MS + 1_000)).toBeGreaterThan(0);
  });

  it('소리가 없어도 바닥만큼은 든다 — 쓰러지는 것이 눈에 보여야 한다', () => {
    expect(endHoldMs(false, 0)).toBe(END_FLOOR_MS);
    expect(endHoldMs(false, 2_000)).toBe(END_FLOOR_MS - 2_000);
  });

  it('선고가 끝나도 한 박자를 더 둔다 — 마지막 자막이 지는 것까지가 그 장면이다', () => {
    // 다른 둘과 갈리는 자리다: 저쪽은 0 이 되면 곧바로 다음 것이 서지만, 여기서 0 이면
    // 리더가 입을 다무는 그 프레임에 붉은 판이 뜬다
    expect(endHoldMs(false, END_FLOOR_MS)).toBe(END_TAIL_MS);
    expect(endHoldMs(false, 99_999)).toBe(END_TAIL_MS);
  });

  it('방송이 영영 안 끝나도 판은 끝난다 — 천장에서 뜬다', () => {
    expect(endHoldMs(true, END_CEIL_MS)).toBe(END_TAIL_MS);
  });
});
