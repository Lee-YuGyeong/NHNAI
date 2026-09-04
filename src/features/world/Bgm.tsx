/**
 * 배경음악 — 맵이 정한 곡(MapDef.bgm)을 반복 재생하고, 작은 볼륨 손잡이를 그린다.
 *
 * ★ **제 자리를 정하지 않는다** (2026-09-02). 여태 손잡이가 `right:12 / top:44` 로 화면 구석에
 *   제 발로 서 있었는데, 그 자리는 이 부품이 알 수 없는 자리다 — 오른쪽 위에 무엇이 더 서는지는
 *   화면마다 다르다. 실제로 오른쪽에 관찰 수첩(shared/NotePad)이 서자 접힌 수첩의 [메모] 단추와
 *   **정확히 겹쳐서 수첩을 다시 펼 수 없었다** (사용자 신고). 이제 그냥 한 줄짜리 인라인
 *   부품이고, 어디 설지는 **부르는 쪽**이 정한다 — 두 화면 다 머리줄의 「나가기」 왼쪽이다.
 *
 * 브라우저는 사용자 제스처 없이 소리를 못 낸다 — 첫 클릭·키 입력에서 재생을 시작한다 (입장 직후 화면 클릭 = 포인터 잠금이 그 제스처다).
 * 볼륨은 localStorage 에 남긴다 (기본 0.35). 0 이면 일시정지해 디코딩도 쉰다.
 *
 * 곡이 바뀌면(src — 중앙 시설의 코어 트리거 뒤 MapDef.lockdownBgm) 이미 재생 중일 때는 제스처 없이 바로 잇는다:
 * 옛 곡을 FADE_MS 동안 줄여 끄고 새 곡을 0 에서 볼륨까지 올린다 (크로스페이드). 아직 시작 전이면 첫 제스처가 새 곡을 튼다.
 *
 * **장이 닫히는 암전에는 곡도 같이 재운다** (fade). 여태 이 화면이 소리를 끄는 길은 언마운트뿐이었는데,
 * 그건 라우트가 바뀌는 순간이라 **뚝 끊긴다** — 재검실에서 검증실로 넘어가는 자리가 특히 그랬다:
 * 암전과 배너가 지나는 동안 곡은 100% 로 흐르다가, 주소가 바뀌는 프레임에 잘리고, 그다음 무대
 * (인지 검증실)는 배경음악이 아예 없어서(MAPS.warehouse) 인계 서류 4.2초가 통째로 무음이었다.
 * 화면은 어두워지는데 소리만 그대로면 장이 닫히는 게 아니라 화면이 고장 난 것으로 보인다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const STORE = 'world.bgm.volume';
const DEFAULT_VOLUME = 0.35;
/** 곡 교체 크로스페이드 길이 */
const FADE_MS = 900;
const FADE_STEP_MS = 50;

function loadVolume(): number {
  try {
    const v = Number(localStorage.getItem(STORE));
    return Number.isFinite(v) && localStorage.getItem(STORE) !== null ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

/**
 * 볼륨은 **컴포넌트 밖에 둔다.**
 *
 * 손잡이가 서는 자리가 화면마다 다르기 때문이다: 복도·중앙 시설·재검실은 오른쪽 위 머리줄이고
 * (WorldFeature), 인지 검증실은 Esc 로 부르는 음향판이다 (features/arena/SoundPanel — 그 화면에는
 * 머리줄이 없다). 값이 컴포넌트 안에 있으면 손잡이가 곧 값이라, 곡을 트는 쪽과 줄이는 쪽을 갈라
 * 놓을 수가 없다. 저장은 여기 한 곳에서 한다 (localStorage).
 */
const listeners = new Set<() => void>();
let volumeNow = loadVolume();

export const bgmVolume = {
  get: (): number => volumeNow,
  set(v: number): void {
    volumeNow = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem(STORE, String(volumeNow));
    } catch {
      /* 저장 못 해도 재생은 된다 */
    }
    for (const fn of listeners) fn();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** 손잡이가 읽는 값 — 어느 화면의 손잡이든 같은 값을 잡는다 */
export function useBgmVolume(): number {
  return useSyncExternalStore(bgmVolume.subscribe, bgmVolume.get, () => DEFAULT_VOLUME);
}

/** a 의 볼륨을 from → to 로 FADE_MS 동안 옮긴다. 끝나면 done. 취소 함수를 돌려준다 */
function fade(a: HTMLAudioElement, from: number, to: number, done?: () => void): () => void {
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  let i = 0;
  a.volume = from;
  const id = window.setInterval(() => {
    i += 1;
    a.volume = from + ((to - from) * Math.min(1, i / steps));
    if (i >= steps) {
      window.clearInterval(id);
      done?.();
    }
  }, FADE_STEP_MS);
  return () => window.clearInterval(id);
}

export function Bgm({
  src,
  fade: closing = false,
  knob = true,
}: {
  src: string;
  /** 장이 닫히는 암전이 올랐다 — 곡을 재운다 */
  fade?: boolean;
  /** 손잡이를 여기서 그리나. 검증실은 음향판이 따로 그리므로 소리만 맡긴다 (knob={false}) */
  knob?: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const volume = useBgmVolume();
  const [started, setStarted] = useState(false);
  /** 새 곡 페이드인 중 — 볼륨 손잡이가 이 값을 덮어쓰지 않게 */
  const fading = useRef(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const startedRef = useRef(started);
  startedRef.current = started;

  useEffect(() => {
    const prev = audio.current;
    const a = new Audio(src);
    a.loop = true;
    a.preload = 'auto';
    audio.current = a;
    const cancels: Array<() => void> = [];
    if (prev) {
      // 곡 교체 — 옛 곡은 줄여서 끄고
      cancels.push(
        fade(prev, prev.volume, 0, () => {
          prev.pause();
          prev.src = '';
        }),
      );
      // 이미 재생 중이었으면 새 곡을 바로 (제스처는 이미 있었다) 0 에서 올린다
      if (startedRef.current && volumeRef.current > 0) {
        fading.current = true;
        a.volume = 0;
        a.play().catch(() => {});
        cancels.push(
          fade(a, 0, volumeRef.current, () => {
            fading.current = false;
          }),
        );
      }
    }
    // 정리는 페이드 취소·옛 곡 끄기만 — a 자체는 다음 곡이 prev 로 이어받아 끈다 (언마운트는 아래 effect)
    return () => {
      for (const c of cancels) c();
      fading.current = false;
      if (prev) {
        prev.pause();
        prev.src = '';
      }
    };
  }, [src]);

  /**
   * 암전이 오르면 곡을 재운다 — 화면이 어두워지는 그 길이에 맞춰 (FADE_MS 900ms, 암전은 0.82~1.6s).
   * 되돌리지 않는다: 암전이 오른 무대는 곧 떠나는 무대이고, 다음 무대의 Bgm 은 새로 선다.
   */
  useEffect(() => {
    if (!closing) return;
    const a = audio.current;
    if (!a || a.paused) return;
    fading.current = true;
    const cancel = fade(a, a.volume, 0, () => {
      a.pause();
      fading.current = false;
    });
    return () => {
      cancel();
      fading.current = false;
    };
  }, [closing]);

  // 언마운트 — 마지막 곡을 끈다
  useEffect(
    () => () => {
      const a = audio.current;
      if (!a) return;
      a.pause();
      a.src = '';
      audio.current = null;
    },
    [],
  );

  /*
   * 첫 제스처에서 시작 — 자동재생 정책.
   *
   * 다만 **먼저 한 번 그냥 틀어 본다.** 여기는 주소만 바뀌는 한 문서짜리 앱이라, 앞 장을 지나온
   * 사람은 이미 화면을 누른 적이 있고 그러면 브라우저가 소리를 허락한다. 기다리기만 하면 다음
   * 무대의 첫 몇 초가 통째로 무음이었다 — 재검실 → 인지 검증실의 인계 서류 4.2초가 그 자리다
   * (머리말). 거절당하면 여태처럼 첫 제스처를 기다린다.
   */
  useEffect(() => {
    if (started) return;
    const kick = () => {
      const a = audio.current;
      if (!a) return;
      a.volume = volume;
      const p = a.play();
      if (p instanceof Promise) p.then(() => setStarted(true)).catch(() => {});
      else setStarted(true);
    };
    kick();
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
  }, [started, volume]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (!fading.current) a.volume = volume;
    if (started) {
      if (volume === 0) a.pause();
      else if (a.paused) a.play().catch(() => {});
    }
  }, [volume, started]);

  // 소리만 맡은 자리 — 손잡이는 부르는 쪽(음향판)이 그린다
  if (!knob) return null;

  return (
    <label
      title="배경음악 볼륨"
      style={{
        /* 자리는 안 정한다 — 부르는 쪽의 머리줄에 그대로 흘러 앉는다 (머리말 ★) */
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(4,12,22,0.55)',
        border: '1px solid rgba(111,211,255,0.25)',
        color: '#8fd6ff',
        fontFamily: 'monospace',
        fontSize: 10,
        letterSpacing: '0.08em',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <span aria-hidden="true">{volume === 0 ? '♪ ×' : '♪'}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => bgmVolume.set(Number(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ width: 72, accentColor: '#6fd3ff', cursor: 'pointer' }}
        aria-label="배경음악 볼륨"
      />
    </label>
  );
}
