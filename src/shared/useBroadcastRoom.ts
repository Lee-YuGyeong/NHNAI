import { useCallback, useEffect, useRef, useState } from 'react';
// 등록부('@/world')가 아니라 파일을 직접 본다 — 등록부는 three.js 까지 끌고 오는데,
// 이 통로를 쓰는 화면 중에는 3D 를 안 쓰는 것(로비·대기방)이 있다.
import { WorldConnection, worldWsBase, type WorldEvents } from '@/world/net/connection';
import { useAppDispatch } from '@/store/hooks';
import { broadcastAnnounce, type BroadcastKind } from './broadcast';

/**
 * 방송을 방으로 내보내는 통로 — 화면이 방에 붙어 있으면 서버를 거치고, 아니면 여기서만 읽는다.
 *
 * 방 안에서는 **낸 쪽도 로컬로 먼저 읽지 않는다.** 서버가 되돌려주는 것을 듣는다 —
 * 그래야 여덟 명이 같은 순간에 같은 문장을 듣는다 (채팅이 로컬 에코를 안 하는 것과 같은 이유,
 * worker/src/room-do.ts 참고). 방 밖(혼자 도는 화면)에서만 직접 dispatch 한다.
 *
 * 방송을 낼 수 있는 것은 **호스트 좌석뿐**이다. 서버가 좌석으로 판정하고 나머지는 조용히
 * 버리므로, 화면이 그걸 모르면 "내 방송이 안 나온다"로만 보인다. 그래서 명부로 호스트인지
 * 계산해 돌려준다 — 서버가 쓰는 규칙(가장 낮은 좌석)과 같은 규칙이다.
 */
export interface BroadcastRoom {
  /** 방송을 낸다. 방 안이면 서버로, 방 밖이면 이 화면에서 바로 읽는다 */
  send(text: string, kind?: BroadcastKind): void;
  /** 방에 붙어 있나 */
  connected: boolean;
  /** 내가 방송을 낼 수 있는 좌석인가 (방 밖이면 언제나 true — 낼 상대가 나뿐이다) */
  canBroadcast: boolean;
}

/** 서버와 같은 규칙 — 방에서 가장 낮은 좌석이 호스트다 */
export function isHostSeat(seats: number[], mine: number | undefined): boolean {
  if (mine === undefined || seats.length === 0) return false;
  return mine === Math.min(...seats);
}

/**
 * @param roomCode 방 번호. null 이면 방에 붙지 않는다 (혼자 도는 화면)
 * @param nickname 입장 이름
 */
export function useBroadcastRoom(roomCode: string | null, nickname: string): BroadcastRoom {
  const dispatch = useAppDispatch();
  const connRef = useRef<WorldConnection | null>(null);
  const [state, setState] = useState({ connected: false, isHost: false });

  useEffect(() => {
    if (!roomCode) {
      setState({ connected: false, isHost: false });
      return;
    }

    // 명부는 ref 로 든다 — 좌석이 바뀔 때마다 렌더를 돌릴 이유가 없고, 결과(호스트인가)만 상태다
    const seats = new Map<string, number>();
    let selfId: string | null = null;
    const settle = () =>
      setState({ connected: true, isHost: isHostSeat([...seats.values()], selfId ? seats.get(selfId) : undefined) });

    const events: WorldEvents = {
      onWelcome: (id, players) => {
        selfId = id;
        seats.clear();
        for (const p of players) seats.set(p.id, p.seat);
        settle();
      },
      onJoined: (p) => {
        seats.set(p.id, p.seat);
        settle();
      },
      onLeft: (id) => {
        seats.delete(id);
        settle();
      },
      // 이 통로는 방송만 쓴다 — 이동·채팅은 이 화면의 관심사가 아니다
      onMoved: () => {},
      onChat: () => {},
      onBroadcast: (text, kind, ts) => dispatch(broadcastAnnounce({ text, kind, ts })),
      onError: () => setState({ connected: false, isHost: false }),
      onClose: () => setState({ connected: false, isHost: false }),
    };

    const conn = new WorldConnection();
    connRef.current = conn;
    conn.connect(worldWsBase(), roomCode, nickname, events);
    return () => {
      conn.close();
      connRef.current = null;
    };
  }, [roomCode, nickname, dispatch]);

  const send = useCallback(
    (text: string, kind: BroadcastKind = 'announce') => {
      // 방에 나갔으면 여기서 끝 — 서버가 되돌려줄 때 읽는다
      if (connRef.current?.sendBroadcast(text, kind)) return;
      dispatch(broadcastAnnounce({ text, kind }));
    },
    [dispatch],
  );

  return { send, connected: state.connected, canBroadcast: !state.connected || state.isHost };
}
