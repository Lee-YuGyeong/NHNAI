/**
 * 클립 토큰과 방당 예산 (worker/src/seat-voice.ts, docs/VOICE.md §5·§6).
 *
 * 두 가지를 잰다:
 *  ① 서명 — DO 가 서명한 문장만 합성된다. 이게 뚫리면 콘솔에서 크레딧을 태울 수 있고,
 *    §6 의 예산이 클라이언트의 선의에 기대는 값이 된다.
 *  ② 예산 — 바닥나면 **잠긴다.** 안 잠그면 끝물에 짧은 줄만 계속 울어서 편향이 생긴다.
 *
 * (handleSeatClip 자체는 caches.default · 상류 fetch 가 있어야 도는 자리라 여기서 안 부른다.
 *  워커 동작은 목으로 흉내 내지 않는다 — vitest.config.ts 머리말의 교훈과 같다.)
 */
import { describe, expect, it } from 'vitest';
import {
  CLIP_TTL_MS,
  createClipBudget,
  mintClip,
  readClip,
  seatVoiceIds,
} from '../../worker/src/seat-voice';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

function payload(over: Partial<{ v: number; t: string; x: number }> = {}) {
  return { v: 3, t: '저 사람 중력 바뀐 걸 늦게 알아챘어', x: NOW + CLIP_TTL_MS, ...over };
}

/**
 * 위조본을 만들 때 쓴다 — 원본과 **같은 방식으로** 본문을 싸야 「서명만 안 맞는」 토큰이 된다.
 * btoa 에 한국어를 바로 넣으면 Latin-1 이 아니라 던진다 (원본은 TextEncoder 로 UTF-8 을 거친다).
 */
function b64urlUtf8(s: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('클립 토큰 — 서명', () => {
  it('만든 토큰은 읽힌다', async () => {
    const token = await mintClip(payload(), SECRET);
    expect(await readClip(token, SECRET, NOW)).toEqual(payload());
  });

  it('같은 내용이면 같은 문자열이다 — 방 전체가 같은 URL 을 두드려야 캐시가 산다', async () => {
    const a = await mintClip(payload(), SECRET);
    const b = await mintClip(payload(), SECRET);
    expect(a).toBe(b);
  });

  it('문장이 다르면 토큰이 다르다', async () => {
    const a = await mintClip(payload(), SECRET);
    const b = await mintClip(payload({ t: '다른 말' }), SECRET);
    expect(a).not.toBe(b);
  });

  it('목소리가 다르면 토큰이 다르다', async () => {
    const a = await mintClip(payload({ v: 3 }), SECRET);
    const b = await mintClip(payload({ v: 4 }), SECRET);
    expect(a).not.toBe(b);
  });
});

describe('클립 토큰 — 위조는 거절한다', () => {
  it('열쇠가 다르면 안 읽힌다', async () => {
    const token = await mintClip(payload(), SECRET);
    expect(await readClip(token, 'other-secret', NOW)).toBeNull();
  });

  it('본문을 갈아 끼우면 안 읽힌다 — 서명 없이 아무 문장이나 태울 수 없다', async () => {
    const token = await mintClip(payload(), SECRET);
    const sig = token.slice(token.indexOf('.'));
    const forged = b64urlUtf8(JSON.stringify(payload({ t: '공짜로 크레딧을 태우는 아주 긴 문장' }))) + sig;
    expect(await readClip(forged, SECRET, NOW)).toBeNull();
  });

  it('서명을 잘라내면 안 읽힌다', async () => {
    const token = await mintClip(payload(), SECRET);
    expect(await readClip(token.slice(0, token.indexOf('.')), SECRET, NOW)).toBeNull();
  });

  it('모양이 깨진 토큰에 던지지 않고 null 을 준다', async () => {
    for (const bad of ['', '.', 'abc', 'a.b', '....', '%%%.%%%']) {
      expect(await readClip(bad, SECRET, NOW)).toBeNull();
    }
  });
});

describe('클립 토큰 — 만료', () => {
  it('만료된 토큰은 안 읽힌다', async () => {
    const token = await mintClip(payload({ x: NOW - 1 }), SECRET);
    expect(await readClip(token, SECRET, NOW)).toBeNull();
  });

  it('만료 직전은 읽힌다', async () => {
    const token = await mintClip(payload({ x: NOW }), SECRET);
    expect(await readClip(token, SECRET, NOW)).not.toBeNull();
  });
});

/**
 * ★ 예산이 잠기는지 — P11 이 걸린 자리다.
 *
 * 남은 예산과 줄 길이를 매번 비교하면, 끝물에 긴 줄만 떨어지고 짧은 줄은 계속 운다.
 * 방에서는 그게 「쟤만 계속 들린다」로 읽히고, 말버릇을 타는 편향은 좌석 편향과 구별되지 않는다.
 */
describe('방당 예산 — 바닥나면 잠긴다', () => {
  it('예산 안에서는 그대로 통과한다', () => {
    const budget = createClipBudget(100);
    expect(budget.take(40)).toBe(true);
    expect(budget.take(40)).toBe(true);
    expect(budget.spent()).toBe(80);
    expect(budget.exhausted()).toBe(false);
  });

  it('넘치는 줄에서 꺼지고, 그 뒤로는 짧은 줄도 안 통과한다', () => {
    const budget = createClipBudget(100);
    expect(budget.take(90)).toBe(true);
    expect(budget.take(20)).toBe(false); // 여기서 잠긴다
    expect(budget.exhausted()).toBe(true);
    // ★ 남은 예산(10자)에 들어가는 짧은 줄이지만 통과하면 안 된다
    expect(budget.take(1)).toBe(false);
  });

  it('꺼진 뒤에는 예산이 더 깎이지 않는다', () => {
    const budget = createClipBudget(100);
    budget.take(90);
    budget.take(20);
    const after = budget.spent();
    budget.take(1);
    expect(budget.spent()).toBe(after);
  });
});

describe('명부 읽기', () => {
  it('쉼표로 나눠 읽고 공백을 턴다', () => {
    expect(seatVoiceIds({ ELEVENLABS_SEAT_VOICE_IDS: 'a, b ,c' })).toEqual(['a', 'b', 'c']);
  });

  it('비어 있으면 빈 명부다 — 부르는 쪽이 방을 조용하게 만든다', () => {
    expect(seatVoiceIds({})).toEqual([]);
    expect(seatVoiceIds({ ELEVENLABS_SEAT_VOICE_IDS: '  ' })).toEqual([]);
  });
});
