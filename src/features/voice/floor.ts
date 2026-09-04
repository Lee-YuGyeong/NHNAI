/**
 * 발언권 — 여덟이 한꺼번에 떠들 때 무엇을 소리로 내고 무엇을 글자로만 두나
 * (docs/VOICE.md §4).
 *
 * 전부 소리로 내면 알아들을 수 없고, 한 줄씩 세우면 목소리가 대화를 30초씩 뒤따라간다.
 * 둘 다 못 쓴다. **두 줄까지 겹치고, 늦은 것은 버린다** (2026-09-04 사용자).
 *
 * ★ 이 파일이 지키는 한 줄: **버리는 규칙은 좌석을 보지 않는다.**
 *   보는 것은 길이 · 도착 순서 · 시각뿐이다. `seat` 필드가 있지만 그건 재생할 때 어느
 *   목소리로 낼지 고르는 값이라 여기서는 **읽지 않는다** — 읽는 순간 P11 이 깨진다.
 *   AI 가 길게 쓰면 AI 의 줄이 조용해지고 사람이 길게 쓰면 사람의 줄이 조용해진다.
 *
 * 자르지 않고 통째로 버리는 이유는 docs/VOICE.md §4 에 있다 — 참가자의 대사는 그 자체가
 * 증거라, 앞 절반만 소리로 나가면 **읽은 사람과 들은 사람이 서로 다른 주장을 두고 다투게**
 * 된다. 지목과 해명이 곧 의심도인 게임에서 그건 연출 문제가 아니라 규칙 파손이다.
 * (방송 캡 features/tts/cap.ts 이 문장 끝에서 **자르는** 것과 반대다 — 저쪽은 리더 혼자
 *  말하는 자리라 잘려도 다툴 상대가 없다.)
 */

export interface Line {
  /** 방에서 유일한 줄 id — 같은 줄이 두 번 들어와도 한 번만 운다 */
  id: string;
  /** 좌석 번호. **여기서는 읽지 않는다** — 재생층이 목소리를 고를 때만 쓴다 */
  seat: number;
  text: string;
  /** 서버가 찍은 발화 시각(ms). 지각 판정의 기준은 도착 시각이 아니라 이것이다 */
  ts: number;
}

/** 소리로 안 나간 이유 — 말한 사람에게 표시로 알려 주려고 돌려준다 (docs/VOICE.md §7) */
export type Drop = 'too-long' | 'too-late' | 'queue-full' | 'duplicate';

export interface FloorLimits {
  /** 동시 재생. 셋부터 한국어가 서로를 먹는다 */
  concurrent: number;
  /** 대기줄. 넘치면 글자만 — 큐가 길어지는 순간 목소리는 이미 늦은 것이다 */
  waiting: number;
  /** 발화 시각으로부터 이만큼 지나 시작하게 되면 버린다 */
  lateMs: number;
  /** 이보다 긴 줄은 소리를 안 낸다 */
  maxChars: number;
  /**
   * 재생 끝(`done`)이 영영 안 오는 줄을 자리에서 밀어내는 시각.
   * 오디오가 오류로 죽으면 슬롯이 새고, 두 번 새면 **방이 영구히 조용해진다** —
   * 가장 긴 줄(90자 ≈ 16초)에 합성 왕복을 더해도 한참 남는 값으로 둔다.
   */
  stuckMs: number;
}

export const FLOOR_LIMITS: FloorLimits = {
  concurrent: 2,
  waiting: 2,
  lateMs: 8_000,
  maxChars: 90,
  stuckMs: 30_000,
};

export interface Floor {
  /**
   * 줄이 도착했다 — 대기줄에 세우거나, 버린 이유를 돌려준다.
   *
   * 부른 뒤에는 `next` 가 null 을 줄 때까지 꺼내 재생을 건다. 대기줄 한도는 **자리에 못
   * 들어간 줄**을 세는 값이라, 안 꺼내면 울 수 있었던 줄까지 `queue-full` 로 떨어진다.
   */
  offer(line: Line, now: number): Drop | null;
  /**
   * 지금 소리를 낼 줄을 꺼낸다. 자리가 없거나 대기줄이 비었으면 null.
   * 자리가 날 때마다 **빌 때까지 반복해서** 부른다 (두 자리가 한꺼번에 날 수 있다).
   */
  next(now: number): Line | null;
  /** 그 줄의 재생이 끝났다 (오류로 끝난 것도 포함 — 안 부르면 자리가 샌다) */
  done(id: string): void;
  /** 판이 새로 선다 */
  reset(): void;
  /** 진단용 — 지금 몇 줄이 울고 몇 줄이 기다리나 */
  stats(): { playing: number; waiting: number };
}

export function createFloor(limits: FloorLimits = FLOOR_LIMITS): Floor {
  /** 울고 있는 줄 → 시작 시각 (stuckMs 로 밀어내려고 들고 있다) */
  const playing = new Map<string, number>();
  let queue: Line[] = [];
  /**
   * 이미 다룬 줄 id — 같은 줄이 두 번 들어오는 것을 막는다.
   * 판 하나가 100줄 남짓이라 굳이 비우지 않는다. reset 이 통째로 치운다.
   */
  const seen = new Set<string>();

  function late(line: Line, now: number): boolean {
    return now - line.ts > limits.lateMs;
  }

  /** 자리가 새는 것을 막는다 — 너무 오래 물고 있는 줄은 끝난 것으로 친다 */
  function sweep(now: number): void {
    for (const [id, startedAt] of playing) {
      if (now - startedAt > limits.stuckMs) playing.delete(id);
    }
  }

  return {
    offer(line, now) {
      if (seen.has(line.id)) return 'duplicate';
      seen.add(line.id);

      // 길이가 먼저다 — 긴 줄은 자리가 비어 있어도 소리를 안 낸다
      if (line.text.length > limits.maxChars) return 'too-long';
      // 중계가 늦게 닿은 줄. 지금 울리면 대화가 이미 지나간 자리에서 소리만 뒤늦게 난다
      if (late(line, now)) return 'too-late';
      if (queue.length >= limits.waiting) return 'queue-full';

      queue.push(line);
      return null;
    },

    next(now) {
      sweep(now);
      if (playing.size >= limits.concurrent) return null;

      // 기다리는 사이 늦어 버린 줄은 여기서 떨어진다 — 자리가 났을 때 다시 재는 이유가 이것이다
      while (queue.length > 0) {
        const line = queue.shift()!;
        if (late(line, now)) continue;
        playing.set(line.id, now);
        return line;
      }
      return null;
    },

    done(id) {
      playing.delete(id);
    },

    reset() {
      playing.clear();
      queue = [];
      seen.clear();
    },

    stats() {
      return { playing: playing.size, waiting: queue.length };
    },
  };
}
