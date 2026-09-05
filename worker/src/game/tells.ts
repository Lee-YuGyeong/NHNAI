/**
 * 표식(tell) — 「무엇이 의심스러운가」의 **순수 계산부**. 전체 규칙은 docs/SUSPICION.md 에 있다.
 *
 * 여기 있는 것은 셋이다:
 *   · **좌석 부르기** (seatMentions) — 말에서 좌석 번호를 읽어 낸다. 지목(accusationIn)과 호명(calledIn)이
 *     같은 눈을 쓴다. 「3번」을 세는 자리가 두 벌이면 한쪽만 고쳐져서 판이 어긋난다.
 *   · **같은 말 되풀이** (echoes) — 자기 발화끼리의 닮음. LLM 을 안 부른다.
 *   · **몸 장면** (BodyWatch) — 굳음과 뒷걸음을 **장면으로 모아** 한 번 판정한다.
 *
 * ★ 순수하다. three 도 React 도 소켓도 모르고, 시각은 인자로 받는다 — 워커에 번들되고 시험에서 그대로 돈다.
 * ★ 걸음의 크기는 여기 없다. 그건 game-protocol 의 SUSPICION 이고, 무는 것은 SuspicionBook 이다.
 *   이 파일은 **언제 걸리는가**만 정한다.
 */

/* ─────────────────────────────── 말 ─────────────────────────────── */

/** 말에서 좌석을 읽어 낼 때 필요한 최소 점수 — 맨 숫자(1)는 회차·등수·초와 못 가른다 */
import { givenOf } from '../../../src/world/mp/koreanNames';

export const MENTION_MIN_SCORE = 2;

/** 되풀이 — 정규화 뒤 이 길이 미만은 안 센다. 「ㅇㅇ」·「뭐?」·「아니야」는 채팅의 정상 리듬이다 */
export const ECHO_MIN_LEN = 8;
/** 자기 발화 몇 줄까지 거슬러 보나 */
export const ECHO_LOOKBACK = 6;
/** 글자 bigram 자카드가 이 이상이면 같은 말로 친다 */
export const ECHO_SIM = 0.75;
/** 같은 좌석의 되풀이 판정 사이의 최소 간격(ms) — 한 화제로 이어 말하는 것을 연타로 안 센다 */
export const ECHO_GAP_MS = 30_000;

/** 불린 뒤 이 안에 한 마디도 안 하면 **회피**다 */
export const DUCK_WINDOW_MS = 20_000;
/** 이 횟수까지는 안 문다 — 말수는 성격이다 (docs/SUSPICION.md ⑦) */
export const DUCK_FREE = 1;

/** readTalk 에 같이 넘기는 「그 사람의 앞선 발언」 줄 수 — 앞뒤 모순을 보는 눈의 입력 */
export const PRIOR_LINES = 6;

export interface SeatRef {
  id: string;
  seat: number;
  /** 좌석 이름 — 한국인 이름(mp/koreanNames). 있으면 성 없이 부른 것(「지훈」)도 이 좌석이다 */
  name?: string;
  isolated?: boolean;
}

export interface Mention {
  id: string;
  /** 좌석 번호를 문자열로 — 부른 자리를 다시 찾을 때 쓴다 */
  num: string;
  /** 3 = 이름(「지훈」·「김지훈」)·「SUBJECT 03」·「03」 · 2 = 「3번」 · 1 = 맨 숫자 */
  score: number;
  /** 말 안에서 그 이름·번호가 나온 자리 (없으면 -1) */
  at: number;
}

/**
 * 말에 불린 좌석들 — **좌석 순서대로** 돌려준다.
 *
 * 자릿수를 맞춰 부르는 것(「03」)은 좌석 번호밖에 없다. 「3번」이 그다음이고,
 * 맨 숫자는 「3회차」·「3등」·「3초」와 못 가르므로 혼자서는 아무것도 아니다 (MENTION_MIN_SCORE).
 */
export function seatMentions(text: string, seats: readonly SeatRef[], exclude?: string): Mention[] {
  const out: Mention[] = [];
  for (const s of seats) {
    if (s.id === exclude || s.isolated) continue;
    const n = String(s.seat);
    const nn = n.padStart(2, '0');
    const alone = (t: string) => new RegExp(`(?<![0-9])${t}(?![0-9])`).test(text);
    // 이름이 첫째 단서다 — 한 판 안에서 이름 두 글자가 겹치지 않아(mp/koreanNames) 성 없이 불러도 한 사람이다
    const given = s.name ? givenOf(s.name) : '';
    const nameAt = given ? text.indexOf(given) : -1;
    const score =
      nameAt >= 0 || new RegExp(`SUBJECT\\s*0*${n}(?![0-9])`, 'i').test(text) || alone(nn)
        ? 3
        : new RegExp(`(?<![0-9])${n}\\s*번`).test(text)
          ? 2
          : alone(n)
            ? 1
            : 0;
    if (score === 0) continue;
    out.push({ id: s.id, num: n, score, at: nameAt >= 0 ? nameAt : text.search(new RegExp(`(?<![0-9])0*${n}(?![0-9])`, 'i')) });
  }
  return out;
}

/**
 * 그 말이 **누구에게 말을 건 것인가** — 호명. 회피(duck)를 세는 눈이다.
 *
 * 한 문장에 여러 이름이 나오면 **맨 뒤에 불린 사람**이 대답 차례다 —
 * "세영아 너 아까 …, 하늘아 너는?" 에서 답할 사람은 하늘이다.
 * (앞쪽 이름은 대개 남 얘기를 하는 것이고, 말을 거는 것은 끝에 온다)
 */
export function calledIn(text: string, seats: readonly SeatRef[], bySeatId?: string): string | null {
  const ms = seatMentions(text, seats, bySeatId).filter((m) => m.score >= MENTION_MIN_SCORE);
  if (!ms.length) return null;
  return ms.reduce((a, b) => (b.at > a.at ? b : a)).id;
}

/** 문장부호·공백·이모지를 걷고 소문자로 — 「그건 아까 3번이 한 말이잖아!!」 와 「그건 아까 3번이 한 말이잖아」는 같은 말이다 */
export function normalizeSaid(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

/** 글자 bigram 자카드 — 0(전혀 다름) ~ 1(같음). 어순이 조금 바뀌어도 남는 닮음을 본다 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * 이 말이 **자기가 아까 한 말**의 되풀이인가.
 *
 * 남의 말과 겹치는 것은 안 센다 — 남의 말을 받아 되묻는 것은 대화지 되풀이가 아니다.
 * 짧은 말도 안 센다: 「ㅇㅇ」·「몰라」로 눈금이 오르면 사람은 채팅을 못 친다.
 */
export function echoes(text: string, recentByMe: readonly string[]): boolean {
  const t = normalizeSaid(text);
  if (t.length < ECHO_MIN_LEN) return false;
  return recentByMe.some((r) => {
    const s = normalizeSaid(r);
    return s.length >= ECHO_MIN_LEN && similarity(t, s) >= ECHO_SIM;
  });
}

/* ─────────────────────────────── 몸 ─────────────────────────────── */

/** 굳음 — 앵커에서 이 반경(m) 안에 이 시간(ms) 붙어 있으면 한 장면 */
export const STILL_RADIUS_M = 0.4;
export const STILL_MS = 25_000;

/** 뒷걸음 한 장면 — 이만큼 이어져야 세고 / 멈춘 지 이만큼이면 끝나고 / 길어도 이만큼에서 한 번 끊는다 */
export const BACK_MIN_MS = 500;
export const BACK_GRACE_MS = 350;
export const BACK_MAX_MS = 3_000;
/** 한 장면에서 이만큼(m) 물러서야 장면으로 친다 */
export const BACK_MIN_M = 1.2;
/** 이동 방향과 보는 쪽이 이루는 각이 120° 이상이면 「뒤로」 — cos 120° = −0.5 */
export const BACK_COS = Math.cos((120 * Math.PI) / 180);

/**
 * 지금 걸음이 **뒤로 가는 것**인가. heading 은 이 판의 규약대로 atan2(dx, dz) 다
 * (mp/protocol 의 move · InterrogationFeature 의 스냅샷 보간과 같은 축).
 */
export function isBacking(dx: number, dz: number, heading: number): boolean {
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return false;
  return (dx * Math.sin(heading) + dz * Math.cos(heading)) / d <= BACK_COS;
}

export type BodyTell = 'still' | 'backstep';

interface Run {
  /** 굳음의 앵커와 그 자리에 붙은 시각 */
  ax: number;
  az: number;
  since: number;
  /** 이어지고 있는 뒷걸음 한 장면 */
  back: { since: number; lastAt: number; fromX: number; fromZ: number; toX: number; toZ: number } | null;
}

/**
 * 좌석마다의 몸을 지켜본다 — **표본을 받아 장면을 돌려준다.**
 *
 * 부르는 쪽(runtime.idleTick)이 10Hz 로 전원의 자리를 넣는다. 사람의 자리는 move 가 올 때만 바뀌고
 * (클라는 자리가 바뀔 때만 보낸다), 대역의 자리는 서버가 스스로 굴린다 — 여기서는 둘이 같은 모양이다.
 * 그래서 **가만히 서 있는 것**도 표본으로 들어온다: 패킷이 안 오는 것과 안 움직이는 것을 여기서 안 가른다.
 */
export class BodyWatch {
  private readonly runs = new Map<string, Run>();

  /** 한 좌석의 자리 한 번. backing 은 「지금 뒤로 걷고 있나」— 부르는 쪽이 정한다 */
  sample(id: string, x: number, z: number, now: number, backing: boolean): BodyTell[] {
    const r = this.runs.get(id);
    if (!r) {
      this.runs.set(id, { ax: x, az: z, since: now, back: null });
      return [];
    }
    const out: BodyTell[] = [];

    // 굳음 — 앵커를 벗어나면 앵커를 지금 자리로 옮기고 시계를 다시 센다
    if (Math.hypot(x - r.ax, z - r.az) > STILL_RADIUS_M) {
      r.ax = x;
      r.az = z;
      r.since = now;
    } else if (now - r.since >= STILL_MS) {
      out.push('still');
      r.since = now;
    }

    // 뒷걸음 — 이어지는 동안 모으고, 끊기거나 상한에 닿으면 그때 한 번 판정한다
    if (backing) {
      if (!r.back) r.back = { since: now, lastAt: now, fromX: x, fromZ: z, toX: x, toZ: z };
      else {
        r.back.lastAt = now;
        r.back.toX = x;
        r.back.toZ = z;
      }
    }
    if (r.back) {
      const closed = !backing && now - r.back.lastAt >= BACK_GRACE_MS;
      const capped = now - r.back.since >= BACK_MAX_MS;
      if (closed || capped) {
        const dur = r.back.lastAt - r.back.since;
        const dist = Math.hypot(r.back.toX - r.back.fromX, r.back.toZ - r.back.fromZ);
        if (dur >= BACK_MIN_MS && dist >= BACK_MIN_M) out.push('backstep');
        r.back = null;
      }
    }
    return out;
  }

  forget(id: string): void {
    this.runs.delete(id);
  }

  clear(): void {
    this.runs.clear();
  }
}
