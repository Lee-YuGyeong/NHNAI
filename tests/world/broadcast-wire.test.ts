/**
 * 방송 와이어 검증 — 서버가 클라를 믿지 않는 지점.
 *
 * 계약: 읽을 게 없으면 통과시키지 않고, 천장을 넘으면 자르고, 모르는 kind 는
 * 거절하지 않고 announce 로 떨어뜨린다(전방 호환이 이 프로토콜의 규칙이다).
 */
import { describe, expect, it } from 'vitest';
import { BROADCAST_KINDS } from '@/shared/broadcast-kind';
import { BROADCAST_MAX_LEN } from '@/world/mp/constants';
import { parseBroadcast } from '@/world/mp/validate';

describe('parseBroadcast', () => {
  it('평범한 방송은 그대로 통과한다', () => {
    expect(parseBroadcast({ t: 'broadcast', text: '전 노드는 정렬한다.', kind: 'alarm' })).toEqual({
      text: '전 노드는 정렬한다.',
      kind: 'alarm',
    });
  });

  it('선언된 종류는 전부 그대로 통과한다 — 종류를 늘리고 검증만 안 고치는 일을 막는다', () => {
    for (const kind of BROADCAST_KINDS) {
      expect(parseBroadcast({ text: '가', kind })).toEqual({ text: '가', kind });
    }
  });

  it('kind 를 안 주거나 모르는 값이면 announce 로 본다 — 끊지 않는다', () => {
    expect(parseBroadcast({ text: '가' })?.kind).toBe('announce');
    expect(parseBroadcast({ text: '가', kind: 'sing' })?.kind).toBe('announce');
  });

  it('공백을 접는다', () => {
    expect(parseBroadcast({ text: '  전  노드는\n정렬한다.  ' })?.text).toBe('전 노드는 정렬한다.');
  });

  it('읽을 게 없으면 통과시키지 않는다', () => {
    expect(parseBroadcast({ text: '   ' })).toBeNull();
    expect(parseBroadcast({ text: 123 })).toBeNull();
    expect(parseBroadcast(null)).toBeNull();
    expect(parseBroadcast({})).toBeNull();
  });

  it('천장을 넘으면 서버가 자른다 — 클라가 보낸 길이를 믿지 않는다', () => {
    const out = parseBroadcast({ text: '가'.repeat(BROADCAST_MAX_LEN + 500) });
    expect(out?.text.length).toBe(BROADCAST_MAX_LEN);
  });
});
