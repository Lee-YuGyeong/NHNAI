/**
 * 방을 울린다 — 좌석마다 제 목소리로, 발언권 안에서 (docs/VOICE.md §4·§6·§7).
 *
 * 소리 내는 장치(WebAudio·네트워크)는 **관문(VoicePorts)으로 빼 두었다.** 여기 남는 것은
 * 규칙뿐이라 브라우저 없이도 잰다 — 이 파일에서 틀리면 안 되는 것은 소리의 질이 아니라
 * **누구의 줄이 소리가 되고 누구의 줄이 조용한가**이고, 그건 순수 규칙이다.
 *
 * ── 두 가지가 조용히 어긋나는 자리 ──
 *
 * ★ **내 줄도 발언권 자리를 차지한다.** 내 말은 나에게만 무음이지만(§7), 자리를 안 잡으면
 *   내 클라이언트만 남들보다 한 줄을 더 듣게 된다 — 아홉 명이 서로 **다른 부분집합**을
 *   듣게 되고, 그건 §5 에서 「같은 판을 보는 사람들이 다른 방에 있게 된다」고 막으려던 바로
 *   그것이다. 그래서 소리만 안 낼 뿐 자리는 잡고, 글자 수로 어림한 시간만큼 물고 있다가 놓는다
 *   (features/tts/cap.ts 의 speechMs — 「소리를 껐다고 자막이 빨리 지나가면 두 사람이 다른
 *   속도로 게임을 하게 된다」는 그 파일의 이유가 여기서도 같다).
 *
 * ★ **폴백이 없다.** 원격 합성이 안 되면 브라우저 음성으로 내려가지 **않는다.** 방송 쪽
 *   규칙(features/tts/engine.ts 의 「침묵보다는 나쁜 목소리가 낫다」)이 여기서는 뒤집힌다 —
 *   한 좌석만 다른 목소리로 들리는 것은 그 좌석이 조용한 것보다 나쁘다. 리더 방송은 안
 *   들리면 정보가 사라질 뿐이지만, 참가자 목소리는 **틀린 정보를 만들어 낸다**(P11).
 */

import { speechMs } from '@/features/tts/cap';
import { type Drop, type FloorLimits, type Line, createFloor } from './floor';

/** 방에서 한 줄이 오갔다 */
export interface SeatLine extends Line {
  /**
   * 서버(RoomDO)가 서명해 준 클립 토큰. **없으면 그 줄은 글자만 남는다** —
   * 예산이 바닥났거나(§6) 명부가 없어서 서버가 소리를 안 내기로 한 것이다.
   * 그 결정은 방 단위라, 없을 때는 전원이 같은 줄부터 같이 조용해진다.
   */
  clip?: string;
}

/** 그 줄이 어떻게 됐나 — 말한 사람에게 「소리로는 안 나갔다」를 표시해 주려고 돌려준다 */
export type Heard = 'play' | 'self' | 'no-clip' | 'silenced' | Drop;

export interface VoicePorts {
  /** 토큰으로 소리를 받아 온다. 실패하면 던진다 */
  fetchClip(token: string): Promise<unknown>;
  /** 그 좌석의 목소리로 튼다. 끝나면 resolve */
  play(seat: number, clip: unknown): Promise<void>;
  /** 소리를 안 내는 줄이 자리를 물고 있는 동안 기다린다 */
  wait(ms: number): Promise<void>;
  now(): number;
}

/**
 * 이만큼 잇달아 실패하면 그만 부른다. features/world/voice.ts 의 LIVE_GIVE_UP 과 같은 값 ·
 * 같은 생각이다 — 키가 없는 판에서 줄마다 왕복을 시도하면 그 자체가 느려진다.
 * 한 번의 네트워크 딸꾹질로 방을 영영 조용하게 만들지 않으려고 세 번을 준다.
 */
const GIVE_UP = 3;

export interface RoomVoice {
  /** 방에서 한 줄이 나왔다 */
  hear(line: SeatLine): Heard;
  /** 내 좌석 — 여기서 나온 줄은 나에게만 무음이다 (§7) */
  setSelfSeat(seat: number | null): void;
  /** 이 판에서 소리가 꺼졌나 */
  silenced(): boolean;
  /** 판이 새로 선다 */
  reset(): void;
  stats(): { playing: number; waiting: number };
}

export function createRoomVoice(ports: VoicePorts, limits?: FloorLimits): RoomVoice {
  const floor = createFloor(limits);
  /** 자리를 잡은 줄의 본문 — next() 가 Line 만 주므로 토큰·자기 여부를 여기서 찾는다 */
  const pending = new Map<string, SeatLine>();
  let selfSeat: number | null = null;
  let fails = 0;
  let off = false;

  function pump(): void {
    for (;;) {
      const line = floor.next(ports.now());
      if (!line) return;
      void start(line);
    }
  }

  async function start(line: Line): Promise<void> {
    const full = pending.get(line.id);
    pending.delete(line.id);
    try {
      if (!full) return;
      if (full.seat === selfSeat || !full.clip) {
        /*
         * 소리는 안 내지만 자리는 잡고 있는다 (머리말 ★). 남들은 이 줄을 듣고 있고,
         * 그동안 내 발언권도 같이 차 있어야 아홉 명의 발언권 상태가 같이 간다.
         */
        await ports.wait(speechMs(full.text));
        return;
      }
      const clip = await ports.fetchClip(full.clip);
      fails = 0;
      await ports.play(full.seat, clip);
    } catch (e) {
      fails += 1;
      if (fails >= GIVE_UP && !off) {
        off = true;
        // 조용히 꺼지면 「왜 소리가 안 나지」로 한참 뒤에 발견된다 (world/voice.ts 의 교훈)
        console.warn(
          `[voice] 합성이 ${GIVE_UP}번 잇달아 실패했다 — 이 판의 참가자 음성을 끈다: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    } finally {
      floor.done(line.id);
      pump();
    }
  }

  return {
    hear(line) {
      if (off) return 'silenced';

      const now = ports.now();
      const drop = floor.offer(line, now);
      if (drop) return drop;

      pending.set(line.id, line);
      pump();

      /*
       * 여기까지 왔으면 그 줄은 자리를 잡았거나 대기줄에 섰다 — 둘 다 「나갈 예정」이다.
       * 자기 줄과 토큰 없는 줄은 자리만 잡고 소리는 안 난다는 것을 말한 사람에게 알려 준다
       * (§7 — 내 줄이 규칙에 걸려 조용히 지나갔을 때 내가 그걸 모르면 안 된다).
       */
      if (line.seat === selfSeat) return 'self';
      if (!line.clip) return 'no-clip';
      return 'play';
    },

    setSelfSeat(seat) {
      selfSeat = seat;
    },

    silenced: () => off,

    reset() {
      floor.reset();
      pending.clear();
      fails = 0;
      off = false;
    },

    stats: () => floor.stats(),
  };
}
