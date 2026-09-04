/**
 * 방송 계약의 selector — 연출을 낭독에 맞추려는 화면이 읽는 신호.
 *
 * **가짜 state 를 손으로 짓지 않고 진짜 슬라이스를 돌린다.** selector 는 모양만 읽도록
 * 써 있어서(구현 슬라이스를 import 하지 않는다) 손으로 지은 state 로는 언제나 통과한다 —
 * 정작 알고 싶은 것은 "진짜 큐가 저 모양인가" 다.
 */
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { broadcastAnnounce, selectBroadcastSpeaking } from '@/shared/broadcast';
import { ttsActions } from '@/features/tts/ttsSlice';
import { rootReducer } from '@/store';

const fresh = () => configureStore({ reducer: rootReducer });

describe('리더가 아직 말하는 중인가', () => {
  it('아무 방송도 없으면 말하는 중이 아니다', () => {
    expect(selectBroadcastSpeaking(fresh().getState())).toBe(false);
  });

  it('방송이 들어온 그 순간부터 말하는 중이다 — 아직 재생 자리에 오르기 전에도', () => {
    // 심문소의 브리핑이 정확히 이 순간에 기다릴지를 정한다: 국면 전환과 방송 dispatch 가
    // 같은 배치라(ArenaFeature 762-764·798-799) 효과가 돌 때 방송은 아직 **대기에만** 있다.
    // 여기서 false 가 나오면 카운트다운이 낭독을 안 기다리고 바로 시작해 버린다.
    const store = fresh();
    store.dispatch(broadcastAnnounce({ text: '전 개체는 중앙 라인으로 정렬한다.' }));

    expect(store.getState().tts.current).toBeNull(); // 아직 큐에만 있다
    expect(selectBroadcastSpeaking(store.getState())).toBe(true);
  });

  it('읽는 중이면 말하는 중이다', () => {
    const store = fresh();
    store.dispatch(broadcastAnnounce({ text: '전 개체는 중앙 라인으로 정렬한다.' }));
    store.dispatch(ttsActions.playNext());

    expect(store.getState().tts.current).not.toBeNull();
    expect(selectBroadcastSpeaking(store.getState())).toBe(true);
  });

  it('읽는 중에 다음이 대기해도 말하는 중이다 — 끼어든 경보까지 리더의 말이다', () => {
    const store = fresh();
    store.dispatch(broadcastAnnounce({ text: '전 개체는 중앙 라인으로 정렬한다.' }));
    store.dispatch(ttsActions.playNext());
    store.dispatch(broadcastAnnounce({ text: '위반이다. 즉시 폐기.', kind: 'alarm' }));

    expect(selectBroadcastSpeaking(store.getState())).toBe(true);
  });

  it('다 읽고 대기도 비면 말이 끝난 것이다 — 여기가 연출이 이어받는 자리다', () => {
    const store = fresh();
    store.dispatch(broadcastAnnounce({ text: '전 개체는 중앙 라인으로 정렬한다.' }));
    store.dispatch(ttsActions.playNext());
    store.dispatch(ttsActions.ended());

    expect(selectBroadcastSpeaking(store.getState())).toBe(false);
  });

  it('음소거여도 말하는 중이다 — 소리만 꺼진 것이고 자막은 그대로 흐른다', () => {
    // 음소거는 큐를 건드리지 않는다(ttsSlice). 소리를 껐다고 판이 지시문을 건너뛰면
    // 같은 판을 보는 두 사람이 다른 속도로 게임을 하게 된다.
    const store = fresh();
    store.dispatch(broadcastAnnounce({ text: '전 개체는 중앙 라인으로 정렬한다.' }));

    expect(selectBroadcastSpeaking(store.getState())).toBe(true);
  });
});
