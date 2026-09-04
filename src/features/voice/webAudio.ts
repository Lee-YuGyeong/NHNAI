/**
 * 소리를 실제로 내는 관문 — roomVoice 의 규칙에 브라우저를 붙인다 (docs/VOICE.md §5).
 *
 * 방송 엔진(features/tts/engine.ts)과 **같은 AudioContext · 같은 마스터**를 쓴다.
 * 두 벌 만들면 볼륨 손잡이가 둘이 되고, 자동재생 자물쇠도 두 번 열어야 한다.
 *
 * ★ **좌석마다 소리를 다르게 만들지 않는다.** 여기에는 필터도, 좌석별 게인도, 재생 배속도
 *   없다 — 좌석을 가르는 것은 오로지 **서버가 고른 목소리**뿐이다 (docs/VOICE.md §3).
 *   /world 의 화자별 체인(features/world/voice.ts 의 chainFor)에서 발상만 가져오고 필터는
 *   버렸다: 저쪽은 등장인물마다 음색이 달라야 하는 이야기고, 여기는 음색 차이가 곧
 *   역할 차이로 읽히는 게임이다 (P11).
 *
 *   `play(seat, …)` 가 seat 를 받고도 소리에 안 쓰는 것은 그래서다. 끊을 때 쓰고, 앞으로도
 *   **여기서** 좌석을 갈라선 안 된다는 표시로 남긴다.
 */

import { audioContext, masterOut } from '@/features/tts/engine';
import type { VoicePorts } from './roomVoice';

/** 지금 울고 있는 소리 — 판이 끝날 때 끊으려고 들고 있는다 (동시 2개까지, floor.ts) */
const sources = new Map<number, Set<AudioBufferSourceNode>>();

async function fetchClip(token: string): Promise<AudioBuffer> {
  const res = await fetch(`/api/tts/clip?c=${encodeURIComponent(token)}`);
  if (!res.ok) {
    // 워커가 붙여 보낸 사유를 그대로 올린다 — 키·명부·예산 중 무엇인지 거기 적혀 있다
    const said = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(said?.error ?? `HTTP ${res.status}`);
  }
  return audioContext().decodeAudioData(await res.arrayBuffer());
}

function play(seat: number, clip: unknown): Promise<void> {
  const buf = clip as AudioBuffer;
  const ctx = audioContext();
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(masterOut());

    let mine = sources.get(seat);
    if (!mine) sources.set(seat, (mine = new Set()));
    mine.add(src);

    src.onended = () => {
      mine.delete(src);
      src.disconnect();
      resolve();
    };
    src.start();
  });
}

export function webAudioPorts(): VoicePorts {
  return {
    fetchClip,
    play,
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    /*
     * 발언권의 지각 판정은 **서버가 찍은 발화 시각**과 견준다 (floor.ts 의 Line.ts).
     * 그래서 여기는 performance.now() 가 아니라 벽시계여야 한다 — 둘을 섞으면
     * 모든 줄이 늦은 것으로 판정돼 방이 통째로 조용해진다.
     */
    now: () => Date.now(),
  };
}

/**
 * 판이 끝난다 / 화면을 떠난다 — 울고 있던 소리를 끊는다.
 * **Web Speech 는 건드리지 않는다** — 참가자 음성은 폴백이 없어서 여기서 날 수가 없고,
 * speechSynthesis.cancel() 은 전역이라 리더 방송이 폴백으로 읽는 중이면 그것까지 자른다
 * (features/world/voice.ts 의 stop 이 같은 함정을 밟고 배운 것이다).
 */
export function stopAll(): void {
  for (const set of sources.values()) {
    for (const src of set) {
      try {
        src.stop();
      } catch {
        /* 이미 끝났다 */
      }
    }
    set.clear();
  }
}

/**
 * 사용자 제스처 안에서 불러 소리를 열어 둔다. 브라우저는 페이지를 건드리기 전의 소리를
 * 조용히 삼킨다 — 토론이 시작되자마자 첫 줄이 오는 흐름이라 이게 없으면 그 줄이 사라진다.
 * (방송 엔진의 unlock 과 같은 문맥이라 한 번만 열면 둘 다 열린다.)
 */
export function unlock(): void {
  void audioContext().resume();
}
