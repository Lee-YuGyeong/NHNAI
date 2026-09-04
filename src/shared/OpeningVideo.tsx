/**
 * 오프닝 영상 화면 — 영상 한 편을 화면 가득 틀고, 끝나거나 건너뛰면 비켜난다.
 *
 * 두 곳에서 쓴다:
 *   /lobby   처음 오는 사람에게 **방 목록보다 먼저** 한 번 (LobbyFeature 의 관문)
 *   /        「영상 테스트」 단추 — 봤다는 표시를 건드리지 않고 그냥 튼다 (Launcher)
 *
 * ┌─ 유튜브 임베드가 아니라 **우리 파일**이다 (2026-09-04) ──────────────────┐
 * │ 임베드 시절에는 재생기 위에 유튜브 로고·채널 이름·「나중에 볼 동영상」이   │
 * │ 얹혔고 매개변수로 지울 수 없었다 (사용자: "마크가 거슬리네").              │
 * │ 파일을 직접 틀면 얹히는 것이 없다 — 화면에 있는 것은 우리가 놓은 것뿐이다: │
 * │ 건너뛰기 · 전체화면 손잡이 · (막혔을 때의) 재생 단추. 그게 전부다.         │
 * │ 파일 자리는 shared/opening.ts 의 OPENING_SRC.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 자동재생은 막히는 것이 정상이다 ────────────────────────────────────────┐
 * │ 소리가 있는 영상을 사람이 누르지 않았는데 시작하는 것은 브라우저 대부분이 │
 * │ 막는다. 그래서 이 화면은 **막힌 경우를 예외가 아니라 기본으로** 다룬다:  │
 * │ 소리 있는 play() 가 거절당하면 **소리를 끄고 바로 돌린다**(소리 없는       │
 * │ 자동재생은 어디서나 통한다) — 검은 화면 대신 그림은 흐른다 — 그리고       │
 * │ 가운데에 「소리 켜기」 단추를 낸다. 그 단추든 화면 어디든 **첫 손길**       │
 * │ (누름 · 자판)에 소리를 켠다 (2026-09-05 사용자: "음성도 나오게").          │
 * │                                                                          │
 * │ 시작은 OPENING_START_SEC(15초)부터다 — 길이를 받아 온 순간 거기로 놓는다. │
 * │                                                                          │
 * │ 그리고 무슨 일이 있어도 **건너뛰기는 사라지지 않는다** — 파일을 못 받아 와도│
 * │ 그 한 단추로 게임에 들어갈 수 있어야 한다.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { OPENING_SOURCES, OPENING_START_SEC, markOpeningSeen } from './opening';
import './opening.css';

/**
 * 화살표 한 번에 건너뛰는 폭 (2026-09-04 사용자: "화살표 방향키 … 10초씩 뛰어넘기").
 * 재생기 띠를 얹지 않는 화면이라(파일 머리말) 앞뒤로 움직이는 손잡이는 이 키가 전부다.
 */
const SEEK_SEC = 10;

export interface OpeningVideoProps {
  /** 끝났거나 건너뛰었을 때. 부르는 쪽이 이 화면을 거두고 다음 칸을 띄운다 */
  onDone: () => void;
  /**
   * 「봤다」를 남길지. 로비의 관문은 true(다시 안 뜬다), 루트의 시험 단추는 false —
   * 시험 삼아 한 번 튼 것 때문에 정작 처음 오는 사람의 오프닝이 사라지면 안 된다.
   */
  remember?: boolean;
}

export function OpeningVideo({ onDone, remember = true }: OpeningVideoProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** 소리 있는 자동재생이 막혔다 — 소리 없이 돌리는 중이고, 가운데에 「소리 켜기」 단추를 낸다 */
  const [tap, setTap] = useState(false);
  /** 전체화면에 들어가 있나. 못 들어간 판에서는 왼쪽 위에 손잡이를 낸다 */
  const [full, setFull] = useState(false);
  /** 파일 자체를 못 받아 왔다 — 검은 화면만 남지 않게 한 줄 적는다 */
  const [broken, setBroken] = useState(false);
  /**
   * 받아 오는 중이라 그림이 멈췄다.
   *
   * 파일이 우리 서버에 있을 때는 거의 볼 일이 없었지만, 원본을 바깥(R2 같은 곳)에
   * 두면 이야기가 다르다 — 회선이 얇은 사람에게는 **검은 화면이 몇 초씩** 간다.
   * 그때 아무 표시가 없으면 사람은 고장으로 읽고 건너뛰기를 누른다. 한 줄 띄운다.
   */
  const [waiting, setWaiting] = useState(false);
  /**
   * 방금 건너뛴 방향. 잠깐 떴다 사라진다 — **뛰었다는 것이 보여야** 한다.
   * 검은 화면이 많은 영상이라 표시가 없으면 키가 먹었는지 안 먹었는지 알 수 없다.
   */
  const [jump, setJump] = useState<'fwd' | 'back' | null>(null);
  const jumpTimer = useRef<number | null>(null);
  /** 끝/건너뛰기를 두 번 처리하지 않는다 (영상 끝과 사람 손이 겹친 경우) */
  const doneRef = useRef(false);

  /** 전체화면을 청한다. 사람이 누른 직후가 아니면 브라우저가 거절한다 — 그건 고장이 아니다 */
  const goFull = useCallback(() => {
    const el = boxRef.current;
    if (!el || document.fullscreenElement) return;
    void el.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (remember) markOpeningSeen();
    // 소리를 끌고 나가지 않는다 — 다음 화면으로 넘어간 뒤에도 계속 울리면 유령이 된다
    videoRef.current?.pause?.();
    // 우리가 들어간 전체화면은 우리가 나온다 — 다음 화면이 전체화면에 갇혀 있으면 안 된다
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen?.()?.catch(() => {});
    }
    onDone();
  }, [onDone, remember]);

  /** 소리를 켠다 — 멈춰 있었으면(소리 없는 재생도 막힌 판) 같이 튼다 */
  const unmute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    if (v.paused) {
      try {
        void v.play()?.catch(() => {});
      } catch {
        /* 이 판에서는 영상이 안 돈다. 건너뛰기가 남아 있다 */
      }
    }
    setTap(false);
  }, []);

  /*
   * 열자마자 둘을 시도한다 — 전체화면과 **소리 있는 재생.**
   * 사람이 누른 직후(루트의 시험 단추)면 둘 다 통하고, 주소를 타고 그냥 들어온
   * 경우(로비의 관문)면 둘 다 거절당한다. 거절은 규칙이므로 조용히 받는다 —
   * 소리를 끄고 다시 틀어 그림은 흐르게 하고, 손잡이(전체화면)와 「소리 켜기」 단추를 남긴다.
   * 첫 손길(누름 · 자판)이 오면 단추를 안 눌러도 소리를 켠다.
   */
  useEffect(() => {
    goFull();
    const onChange = () => setFull(document.fullscreenElement === boxRef.current);
    document.addEventListener('fullscreenchange', onChange);

    const v = videoRef.current;
    const blocked = () => {
      setTap(true);
      if (!v) return;
      v.muted = true;
      try {
        void v.play()?.catch(() => {});
      } catch {
        /* 소리 없이도 안 돈다 — 단추와 건너뛰기가 남아 있다 */
      }
    };
    try {
      const started = v?.play();
      // jsdom 에는 play() 가 없다 — 있으면 promise 고, 거절되면 그때 소리를 끄고 돌린다
      if (started && typeof started.catch === 'function') started.catch(blocked);
    } catch {
      blocked();
    }

    // 첫 손길에 소리 — 화면 어디를 누르든, 어느 키를 치든 (한 번만)
    const onTouch = () => {
      if (videoRef.current?.muted) unmute();
    };
    document.addEventListener('pointerdown', onTouch);
    document.addEventListener('keydown', onTouch);

    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('pointerdown', onTouch);
      document.removeEventListener('keydown', onTouch);
    };
  }, [goFull, unmute]);

  /** 가운데 「소리 켜기」 단추 — 전체화면 + 소리. 돌던 자리 그대로 잇는다 (처음으로 되감지 않는다) */
  const play = () => {
    goFull();
    unmute();
  };

  /** 길이를 받아 온 순간 시작점으로 — 앞 OPENING_START_SEC 초는 건너뛴다. 이미 그 뒤면(다시 받아 옴) 손대지 않는다 */
  const startAt = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime < OPENING_START_SEC) v.currentTime = OPENING_START_SEC;
  };

  /*
   * 영상 자리를 누르면 멈추고, 다시 누르면 잇는다. 재생기 띠를 얹지 않는 대신이다 —
   * 5분짜리를 보는 동안 잠깐 멈출 길이 아예 없으면 그건 붙잡아 두는 화면이 된다.
   */
  const toggle = () => {
    const v = videoRef.current;
    if (!v || tap) return;
    if (v.paused) void v.play()?.catch(() => {});
    else v.pause();
  };

  /**
   * 앞뒤로 건너뛴다 (← → 10초).
   *
   * ★ 길이를 모르면 손대지 않는다. 아직 받아 오는 중이면 duration 이 NaN 이고,
   *   거기에 더하면 currentTime 이 NaN 이 돼서 **영상이 통째로 멈춘다.**
   * ★ 끝을 넘겨 뛰면 그대로 끝난 것으로 둔다 — 오른쪽 키를 눌러 끝까지 간 사람은
   *   건너뛰려던 사람이고, 그때 나가는 자리는 이미 finish 하나다 (ended 가 부른다).
   */
  const seek = useCallback((by: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + by));
    setJump(by > 0 ? 'fwd' : 'back');
    if (jumpTimer.current) window.clearTimeout(jumpTimer.current);
    jumpTimer.current = window.setTimeout(() => setJump(null), 700);
  }, []);

  /* 화면을 거둘 때 표시 타이머도 걷는다 — 사라진 화면에 setState 하지 않게 */
  useEffect(() => () => {
    if (jumpTimer.current) window.clearTimeout(jumpTimer.current);
  }, []);

  /*
   * 자판 — 이 화면의 손잡이는 셋뿐이다 (재생기 띠를 얹지 않기 때문에).
   *
   *   →   10초 앞으로      ←  10초 뒤로   (2026-09-04 사용자 지시)
   *   Esc 건너뛰기
   *
   * ★ Esc 는 전체화면일 때는 **가로채지 않는다.** 그때 Esc 는 브라우저가 먼저 먹어
   *   전체화면만 벗기고(영상은 계속 돈다), 여기서 또 finish 를 부르면 전체화면을
   *   벗기려던 사람이 로비로 튕겨 나간다.
   * ★ 화살표는 기본 동작(화면 굴리기)을 막는다. 이 화면이 화면을 덮고 있어 눈에는
   *   안 보이지만, 뒤에 있는 로비가 스크롤된 채로 남는다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        seek(SEEK_SEC);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seek(-SEEK_SEC);
      } else if (e.code === 'Escape' && !document.fullscreenElement) {
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, seek]);

  return (
    <div className="ov" ref={boxRef}>
      {/*
        title 은 장식이 아니다 — 화면 읽기 프로그램이 이 칸을 무엇이라고 읽어 줄
        유일한 근거다. autoPlay 는 위의 play() 와 겹치지만 남겨 둔다: 둘 중 어느
        쪽이든 먼저 통하면 영상이 구르고, 둘 다 막히면 재생 단추가 뜬다.
      */}
      <video
        ref={videoRef}
        className="ov__frame"
        title="오프닝 영상"
        autoPlay
        playsInline
        preload="auto"
        onLoadedMetadata={startAt}
        onEnded={finish}
        onPlaying={() => {
          setTap(false);
          setBroken(false);
          setWaiting(false);
        }}
        /* 받아 오느라 그림이 멈췄다 (원격 파일에서 흔하다). canplay 로 풀린다 */
        onWaiting={() => setWaiting(true)}
        onStalled={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        /*
         * ★ **앞의 <source> 하나가 실패한 것과 영상이 안 나오는 것은 다르다.**
         *   AV1 을 못 푸는 브라우저는 첫 줄에서 error 를 내고 둘째 줄로 잘 넘어가는데,
         *   리액트는 그 error 도 여기로 실어 온다 (미디어 error 는 안 올라오는 사건이라
         *   루트에서 캡처로 받는다). 그것만 보고 「못 불렀다」를 띄우면, 720p 로 잘 돌고
         *   있는 화면 위에 고장 안내가 뜬다 — 2026-09-04 에 실제로 그랬다.
         *   그래서 **영상 자신이 손을 든 경우만** 본다: 줄이 다 떨어지면 video.error 가 찬다.
         */
        onError={() => {
          if (videoRef.current?.error) setBroken(true);
        }}
        onClick={toggle}
      >
        {/*
          자리가 셋이다 — R2 의 1440p 를 먼저 걸고, 안 열리면 저장소의 AV1, 그것도 못 풀면
          H.264 로 떨어진다 (shared/opening.ts 의 OPENING_SOURCES).
          ★ src 속성을 같이 주면 이 줄들이 **무시된다.** 그래서 위에 src 가 없다.
          ★ 떨어지는 것은 「열리지 않을 때」다. 느린 것은 실패가 아니라서, R2 가 굼뜬 날은
            떨어지지 않고 버퍼링한다 — 그때 뜨는 것이 아래의 「불러오는 중…」이다.
        */}
        {OPENING_SOURCES.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>

      {!full ? (
        <button type="button" className="ov-full" data-sfx="clank" onClick={goFull}>
          전체화면
        </button>
      ) : null}

      {/* ★ 이 단추는 어떤 상태에서도 사라지지 않는다 (파일 머리말) */}
      <button type="button" className="ov-skip" data-sfx="clank" onClick={finish}>
        건너뛰기 <Chevron />
      </button>

      {broken ? (
        <p className="ov-broken">
          영상을 불러오지 못했다. <b>건너뛰기</b>로 그대로 들어갈 수 있다.
        </p>
      ) : null}

      {/* 받아 오는 중. 고장(위)과 자리를 나눠 쓰지 않는다 — 둘이 겹쳐 뜨면 무슨 말인지 모른다 */}
      {waiting && !broken && !tap ? <p className="ov-wait">불러오는 중…</p> : null}

      {/*
        방금 뛴 자리. 뛴 방향 쪽에 잠깐 떴다 사라진다 — 검은 장면이 많은 영상이라
        표시가 없으면 키가 먹었는지 알 수 없다. 읽을 것이 아니라 **신호**라 aria 에서 뺀다.
      */}
      {jump ? (
        <span className={`ov-seek ov-seek--${jump}`} aria-hidden>
          {jump === 'fwd' ? `▶▶ ${SEEK_SEC}초` : `${SEEK_SEC}초 ◀◀`}
        </span>
      ) : null}

      {tap && !broken ? (
        <button type="button" className="ov-tap" data-sfx="clank" onClick={play} aria-label="소리 켜기">
          <span className="ov-tap__ring" aria-hidden>
            <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden>
              <path d="M2 2 L24 15 L2 28 Z" fill="#cfe6f5" />
            </svg>
          </span>
          <span className="ov-tap__label">소리 켜기</span>
          <span className="ov-tap__sub">전체화면으로 · 화면 아무 데나 눌러도 켜진다</span>
        </button>
      ) : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 2 L7 6 L2 10 M8.5 2 V10" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
