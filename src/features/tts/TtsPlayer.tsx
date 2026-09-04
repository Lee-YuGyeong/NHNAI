import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { speechMs } from './cap';
import { engine, setRemote, setVolume } from './engine';
import { inVoiceScope } from './scope';
import { isStale, ttsActions, ttsSelectors } from './ttsSlice';

/** 소리 자물쇠를 여는 것으로 치는 조작들 */
const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * 낭독 감시견의 여유(ms) — 어림한 낭독 시간의 두 배에 이만큼을 더한 뒤에도 끝났다는 신호가
 * 없으면 스스로 넘긴다. 넉넉한 쪽으로 틀린다: 일찍 울리면 말을 자르고, 늦게 울려도 잃는 것은
 * 멎어 있던 시간뿐이다.
 */
const PLAY_GUARD_SLACK_MS = 8_000;

/**
 * 전역 방송 재생기 — App 에 한 번 마운트되는 화면 없는 컴포넌트.
 * 어느 화면에 있든 큐에 쌓인 방송을 순서대로 읽는다.
 */
export function TtsPlayer() {
  const dispatch = useAppDispatch();
  const current = useAppSelector(ttsSelectors.selectCurrent);
  const queue = useAppSelector(ttsSelectors.selectQueue);
  const muted = useAppSelector(ttsSelectors.selectMuted);
  const volume = useAppSelector(ttsSelectors.selectVolume);
  const { pathname } = useLocation();

  // 손잡이를 엔진의 마스터 게인에 얹는다. 재생 중에 돌려도 바로 먹는다 (같은 노드를 계속 쓴다)
  useEffect(() => { setVolume(volume); }, [volume]);

  /**
   * 소리가 안 나는 상태 — 음소거이거나 볼륨이 0 이거나.
   * 둘을 한 이름으로 묶는 이유: 아래 두 곳(읽기·미리 받기)이 **소리가 나는가**만 알면 되기 때문이다.
   * 볼륨 0 인데 합성을 시키면 들리지도 않는 소리에 크레딧만 나간다.
   */
  const silent = muted || volume === 0;

  // 아직 손보는 중인 장치는 내 화면에서만 켠다 (scope.ts).
  // 밖에서는 폴백으로 예전과 똑같이 읽힌다 — 남의 화면에서 소리를 뺏지 않는다.
  useEffect(() => { setRemote(inVoiceScope(pathname)); }, [pathname]);

  // 재생 자리가 비고 대기가 있으면 다음 방송을 꺼낸다.
  // 소리가 안 나도 꺼낸다 — 자막(BroadcastBanner)은 흘러야 한다
  useEffect(() => {
    if (!current && queue.length > 0) dispatch(ttsActions.playNext());
  }, [current, queue.length, dispatch]);

  // 재생 자리에 방송이 올라오면 엔진으로 읽고, 끝나면 비운다.
  // 경보 인터럽트도 여기서 성립한다 — 슬라이스가 current 를 비우면 cleanup 이 engine.stop() 으로 소리를 끊는다.
  // 소리 여부를 여기서 함께 보는 이유: 끄는 순간 이 효과가 다시 돌면서 cleanup 이 소리를 끊고,
  // 아래 시계가 이어받는다. 소리를 멈추는 자리를 따로 두면 두 곳이 같은 일을 하게 된다.
  useEffect(() => {
    if (!current) return;

    // 방 방송인데 이미 늦었다 — 남들은 다 듣고 넘어갔다. 읽지 않고 다음으로 넘긴다
    if (isStale(current, Date.now())) {
      dispatch(ttsActions.ended());
      return;
    }

    // 소리를 끈 동안에도 방송은 지나가야 한다. 아무도 넘겨 주지 않으면 자막이 첫 문장에
    // 멈춰 서고 큐가 그대로 쌓인다 — 읽었을 만한 시간만큼 세웠다가 직접 넘긴다.
    if (silent) {
      const timer = setTimeout(() => dispatch(ttsActions.ended()), speechMs(current.text));
      return () => clearTimeout(timer);
    }

    let dropped = false; // 언마운트·교체 뒤 도착한 종료 신호는 버린다

    /*
     * ── 낭독이 끝났다는 신호는 **안 올 수도 있다** ──
     * Web Speech 는 사용자 제스처 전이거나 탭이 뒤로 밀리면 onend·onerror 를 둘 다 안 부르고
     * 발화를 조용히 삼킨다. 그러면 speak 의 약속이 영영 안 풀려 ended() 가 안 나가고,
     * **current 가 안 비면 방송이 통째로 선다** — 자막은 그 한 줄에 멈추고, 큐는 쌓이기만 하고,
     * 심문소에서는 개체들이 nodeVoice.setBlocked 에 걸린 채 영영 입을 못 연다
     * (리더만 말하는 화면이 된다). 실패로 약속이 깨질 때도 마찬가지다 — 그래서 catch 도 같이 문다.
     *
     * 그래서 감시견을 둔다: 먼저 오는 쪽이 이긴다. 이건 다음 방송을 재촉하는 시계가 아니라
     * **영영 안 끝나는 경우만 끊는 안전선**이라, 늦게 울릴수록 안전하고 일찍 울리면 말을 자른다.
     * speechMs 는 글자 어림이고 실제 소리와 2배 넘게 벌어지므로(76자: 어림 9.0초 · 실제 13.8초)
     * 두 배에 여유를 더 얹는다.
     */
    const finish = () => {
      if (dropped) return;
      dropped = true;
      clearTimeout(guard);
      dispatch(ttsActions.ended());
    };
    const guard = setTimeout(finish, speechMs(current.text) * 2 + PLAY_GUARD_SLACK_MS);

    // 소리를 내기 전에 준비부터 시킨다. 대개는 아래 미리 받기가 이미 해 둬서 즉시 끝나고,
    // 끼어든 방송처럼 미리 알 수 없었던 것만 여기서 왕복을 치른다.
    void engine.prefetch(current.text, current.kind).then(() => {
      if (dropped) return;
      // ★ 지각을 여기서 한 번 더 본다. 위 검사는 합성값을 치르기 **전**의 시각이라,
      //   창이 900ms 남았는데 받아 오는 데 700ms 가 걸리면 이미 늦은 방송이 통과한다.
      //   늦은 방송을 읽는 것은 창을 둔 이유(방 전원이 같은 순간에 듣는다)를 그대로 어긴다.
      if (isStale(current, Date.now())) {
        finish();
        return;
      }
      return engine.speak(current.text, current.kind).then(finish);
    // 합성이든 재생이든 실패해도 방송은 넘어간다 — 여기서 멎으면 뒤가 통째로 선다
    }).catch(finish);
    return () => {
      dropped = true;
      clearTimeout(guard);
      engine.stop();
    };
  }, [current, silent, dispatch]);

  /*
   * 읽는 동안 다음 방송을 미리 받아 둔다.
   *
   * 원격 합성은 왕복이 300~800ms 다. 차례가 온 다음에 받기 시작하면 방송과 방송 사이가
   * 그만큼 조용하고, 심문소는 지시문에 이어 판독이 바로 나가는 화면이라 그 틈이 매번 생긴다.
   *
   * 소리가 안 나는 상태(음소거·볼륨 0)면 받지 않는다 — 어차피 안 들리는데 크레딧만 나간다.
   * 요청은 한 문장에 한 번이다: 미리 받은 것과 진짜 차례가 같은 약속을 나눠 쓴다 (engine.ts 캐시).
   */
  const next = queue[0];
  useEffect(() => {
    // 읽는 것이 있을 때만. 비어 있으면 이 머리가 곧 재생 자리로 올라가고 위에서 받는다 —
    // 여기서도 받으면 같은 문장을 두 번 시키는 셈이다 (엔진 캐시가 막아 주긴 하지만,
    // 안 시켜도 될 일을 시켜 놓고 밑에서 막히기를 기대할 이유가 없다).
    if (!next || !current || silent) return;
    void engine.prefetch(next.text, next.kind);
  }, [next, current, silent]);

  // 첫 사용자 조작에 소리를 열어 둔다. 이걸 안 하면 브라우저가 첫 방송을 조용히 삼킨다 —
  // 인트로 버튼이든 방 입장이든, 사람이 화면을 건드리는 첫 순간이면 아무거나 된다.
  useEffect(() => {
    const open = () => {
      engine.unlock();
      for (const ev of GESTURES) window.removeEventListener(ev, open);
    };
    for (const ev of GESTURES) window.addEventListener(ev, open);
    return () => { for (const ev of GESTURES) window.removeEventListener(ev, open); };
  }, []);

  return null;
}
