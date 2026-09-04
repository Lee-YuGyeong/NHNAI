/**
 * Esc 로 음향판을 여닫는 규칙.
 *
 * 여기가 틀리면 **소리를 만질 길이 없어지거나**(안 열린다), 반대로 **판이 뜬 채로 시행이 돈다**.
 * 화면으로는 "가끔 안 열리네" 정도로만 보여서, 규칙으로 붙잡아 두지 않으면 다시 샌다.
 */
import { describe, expect, it } from 'vitest';
import { ESC_ECHO_MS, escKeySound, unlockOpensSound, type EscKeyState } from '@/features/arena/sound-esc';

/** 걷다 Esc 를 누른 자리 — 잠겨 있었고, 지금 풀렸다 */
const unlocked = (over: Partial<{ composing: boolean; veiled: boolean; answering: boolean }> = {}) =>
  unlockOpensSound(true, false, over.composing ?? false, over.veiled ?? false, over.answering ?? false);

const key = (over: Partial<EscKeyState> = {}): EscKeyState => ({
  open: false,
  locked: false,
  composing: false,
  inField: false,
  sinceUnlockMs: 10_000,
  veiled: false,
  answering: false,
  ...over,
});

describe('잠금이 풀린 것으로 받는 Esc', () => {
  it('걷다 누르면 열린다 — 이 키는 keydown 으로 안 온다', () => {
    expect(unlocked()).toBe(true);
  });

  it('잠근 적 없이 안 잠겨 있는 것만으로는 안 열린다 — 고치려던 화면이 이것이다', () => {
    // /interrogation?from=central 은 암전이 걷히자마자 안 잠긴 상태다. 여기서 열리면
    // 검문소의 첫 장면이 볼륨 손잡이가 된다
    expect(unlockOpensSound(false, false, false, false)).toBe(false);
  });

  it('말하던 중이면 안 열린다 — 그 Esc 는 입력창을 무르는 키다', () => {
    expect(unlocked({ composing: true })).toBe(false);
  });

  it('다시 잠기는 쪽은 여는 자리가 아니다', () => {
    expect(unlockOpensSound(false, true, false, false)).toBe(false);
  });

  it('도착 암전이 덮여 있으면 안 열린다 — 그 Esc 는 인계 서류를 넘기는 키다', () => {
    // 막 위에서 클릭(잠금) → Esc(잠금 해제)로 서류를 넘기면 키는 안 오고 **풀린 것만** 보인다.
    // 여기를 안 막으면 음향판이 검은 화면 뒤에서 열려, 막이 걷힌 자리에 볼륨 손잡이가 서 있다
    expect(unlocked({ veiled: true })).toBe(false);
  });
});

describe('안 잠긴 채로 온 Esc 키', () => {
  it('닫혀 있으면 연다', () => {
    expect(escKeySound(key())).toBe('open');
  });

  it('열려 있으면 닫는다 — 같은 키가 여닫는다', () => {
    expect(escKeySound(key({ open: true }))).toBe('close');
  });

  it('국면을 보고 막지 않는다 — 눌러도 아무 일이 없는 키는 고장 난 키로 보인다', () => {
    // 한때 시행 중·배역 만드는 중·판이 끝난 뒤에는 안 열리게 했다 (사용자 2026-09-01 에 물렸다).
    // 잘못 열렸어도 아무 데나 한 번 누르면 게임으로 돌아간다 — 대가가 클릭 한 번이다
    expect(escKeySound(key())).toBe('open');
    expect(escKeySound(key({ open: true }))).toBe('close');
  });

  it('볼륨 손잡이 위에서도 닫힌다 — 범위 손잡이는 글 치는 칸이 아니다', () => {
    expect(escKeySound(key({ open: true, inField: false }))).toBe('close');
  });

  it('글 치는 칸의 Esc 는 그 칸 몫이다', () => {
    expect(escKeySound(key({ inField: true }))).toBe('none');
    expect(escKeySound(key({ open: true, inField: true }))).toBe('none');
  });

  it('말하는 중에는 안 연다 — 입력창을 무르는 키와 겹친다', () => {
    expect(escKeySound(key({ composing: true }))).toBe('none');
  });

  it('도착 암전 위의 Esc 는 서류 몫이다 — 「아무 키나 눌러 계속」의 그 아무 키다', () => {
    expect(escKeySound(key({ veiled: true }))).toBe('none');
    // 막 뒤에서 어떻게든 열렸더라도 그 위의 키로 닫지 않는다 — 닫는 것도 게임 손잡이다
    expect(escKeySound(key({ veiled: true, open: true }))).toBe('none');
  });

  it('잠긴 채로 온 키는 흘려보낸다 — 뒤따라 올 잠금 해제가 연다', () => {
    // 키를 주는 브라우저에서 여기서도 열면, 열고 나서 잠금 해제가 한 번 더 연다
    expect(escKeySound(key({ locked: true }))).toBe('none');
  });

  it('잠금을 푼 그 Esc 가 키로도 오면 한 번으로 센다 — 열자마자 닫히던 자리', () => {
    // 잠금 해제가 이미 열어 놓은 뒤라면 뒤따라온 키는 **닫는 자리**에 떨어진다. 여기를 안 막으면
    // 판이 뜨자마자 접혀 깜빡임 하나로만 보인다
    expect(escKeySound(key({ open: true, sinceUnlockMs: 0 }))).toBe('none');
    expect(escKeySound(key({ sinceUnlockMs: ESC_ECHO_MS - 1 }))).toBe('none');
    expect(escKeySound(key({ sinceUnlockMs: ESC_ECHO_MS }))).toBe('open');
  });
});

/**
 * ── 답을 기다리는 판 위에서는 안 연다 ──
 *
 * 즉답 시행의 답판(.ask)은 z 30 이고 음향판은 z 45 라 **덮인다.** 덮인 쪽에는 초가 흐르고 있고,
 * 덮이는 순간 초점도 답 칸을 떠나서 그 뒤로는 쳐도 안 들어간다 — 사용자에게는 「엔터나 그런 거
 * 누르면 답 입력판이 없어진다」로 보인다 (2026-09-03 사용자).
 *
 * 이 한 자리만 국면을 본다. 위의 「국면을 보고 막지 않는다」와 어긋나지 않는 것은, 저 규칙이 막는
 * 것이 **아무 일도 안 일어나는 키**이기 때문이다 — 여기서 Esc 는 초점을 답 칸으로 되돌린다.
 */
describe('답을 기다리는 판 위의 Esc', () => {
  it('키로 와도 안 연다 — 그 판을 덮어 버린다', () => {
    expect(escKeySound(key({ answering: true }))).toBe('none');
  });

  it('잠금이 풀린 것으로 와도 안 연다 — 두 길 다 막아야 한다', () => {
    expect(unlocked({ answering: true })).toBe(false);
  });

  it('이미 열려 있으면 닫는 것은 그대로다 — 덮인 판을 걷는 길이 있어야 한다', () => {
    expect(escKeySound(key({ answering: true, open: true }))).toBe('close');
  });

  it('답판이 없으면 예전 그대로 열린다 — 막는 것은 이 한 자리뿐이다', () => {
    expect(escKeySound(key())).toBe('open');
    expect(unlocked()).toBe(true);
  });
});
