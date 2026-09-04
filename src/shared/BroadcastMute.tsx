import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { broadcastMute, selectBroadcastMuted } from './broadcast';

/**
 * 방송 음소거 버튼 — 리더 방송이 나가는 화면이면 어디든 붙인다.
 * BackToRoot 옆 고정 자리라 화면 레이아웃을 건드리지 않는다.
 *
 * **끄는 것은 소리뿐이다.** 방송은 자막으로 계속 지나간다 — 소리를 끄는 이유가
 * 대개 "안 들려서"가 아니라 "들을 수 없어서"라, 그때 내용까지 끊으면 판이 멎는다.
 */
export function BroadcastMute() {
  const dispatch = useAppDispatch();
  const muted = useAppSelector(selectBroadcastMuted);
  return (
    <button
      title={muted ? '방송 소리 켜기' : '방송 소리 끄기 (자막은 계속 나온다)'}
      style={{ position: 'fixed', top: 12, left: 96, zIndex: 10 }}
      onClick={() => dispatch(broadcastMute())}
    >
      {muted ? '🔇 소리 꺼짐' : '🔊 방송'}
    </button>
  );
}
