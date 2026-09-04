/**
 * 대본은 지어내지 않는다 — 여섯 방과 집행의 문장 하나하나가 docs/design/plan-dialogue-v7.md(대본 v8)에 **글자 그대로**
 * 있어야 하고, 개체의 대답표(cast.ts voice)는 그 문서 아니면 plan-characters.md(배역 인용)에 있어야 한다.
 * script.ts 가 문장을 한곳에 모아 둔 이유가 이것이고(두 군데 적지 않는다), 이 시험은 그 한곳이 문서에서 벗어나지 않았는지를 잰다.
 *
 * `${series}` · `${unit}` 같은 빈자리는 문서에도 글자로 남아 있거나(A${series}-201) 값으로 채워져 있어서(A-104),
 * 자리 앞뒤로 갈라 조각마다 따로 찾는다. 상수 이름은 일부러 손으로 적는다 — 새 상수를 더하면 여기에도 더한다.
 * 음성 굽기(tools/voice-cast.json)도 이 이름 목록을 본다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CAST } from '../../../src/features/world2/cast';
import * as script from '../../../src/features/world2/script';

const doc = (name: string) => readFileSync(fileURLToPath(new URL(`../../../docs/design/${name}`, import.meta.url)), 'utf8');
const DOC = doc('plan-dialogue-v7.md');
/** 배역의 대답은 대본과 배역 문서 어느 쪽에 있어도 된다 — 배역 문서의 인용이 대본에 다 옮겨져 있지는 않다 */
const DOC_CAST = DOC + '\n' + doc('plan-characters.md');

/* ── 복도 ── */
const CORRIDOR = [
  'INTRO',
  'OBJ_INSPECT',
  'OBJ_INSPECT_WALL',
  'OBJ_TALK',
  'OBJ_MOVE_IN',
  'NOTICE_SIGNAL',
  'FIRST_LOOK_OPEN',
  'FIRST_LOOK_NONE',
  'FIRST_LOOK_ANY',
  'NOTICE_LINES',
  'NUDGES',
  'TAG_LINES',
  'SCRAWL_LINES',
  'OVERHEAR',
  'DISMISS',
  'HALL_SEE',
  'HALL_NOBODY_ASKS',
  'WATCH_LINES',
  'DOOR_PROMPT',
  'DOOR_STAY',
  'DOOR_NO_MURAL',
] as const;

/* ── 휴게 구역 ── */
const REST = [
  'REST_ARRIVE',
  'REST_STILL',
  'REST_STIR',
  'REST_WATCHED',
  'REST_STILL_40',
  'DOZE_LINES',
  'DOZE_REPLY',
  'LEAVE_REST',
  'OBJ_REST_ARRIVE',
  'OBJ_REST_NONE',
] as const;

/* ── 중앙 시설 ── */
const CENTRAL2 = [
  'CENTRAL2_ARRIVE',
  'CENTRAL2_KNOWN_FACE',
  'CORE_RING_ENTER',
  'CORE_RING_NEW_BODY',
  'CORE_RING_ENVY',
  'SHADOW_ENTER',
  'SHADOW_LINGER_SAY',
  'RECOGNIZED_UP',
  'RECOGNIZED_UP_AGAIN',
  'RECOGNIZED_FLAT',
  'RECOGNIZED_DOWN',
  'RECOGNIZED_DOWN_ASIDE',
  'NOBODY_KNOWS_ME',
  'RUMOR_LINES',
  'RUMOR_MINE',
  'RUMOR_NOT_MINE',
  'LOCKDOWN_LINES',
  'HOLD_BREAK',
  'LOCK_BESIDE',
  'LOCK_ALONE',
  'LOCK_STAY_CALM',
  'ROLL_LINES',
  'GATE1',
  'PROTOCOL_LINES',
  'PROTOCOL_LOOKED',
  'GATE2_ASK',
  'GATE2',
  'GATE3_LINES',
  'GATE3',
  'VERDICT_DIM_LINES',
  'DIM_HERE',
  'DARK_CORE',
  'DARK_CONSOLE_EARLIER',
  'DARK_CONSOLE_NOW',
  'EMPTY_SEAT_STAY',
  'EMPTY_SEAT_CORE',
  'EMPTY_SEAT_SHADOW',
  'LEAVE_CORE_LINES',
  'LEAVE_SEE_YOU',
  'OBJ_CROSS_HALL',
  'OBJ_HOLD',
  'OBJ_HIDE',
  'OBJ_QUEUE',
  'OBJ_ROLL',
  'OBJ_ROLL_UNKNOWN',
  'OBJ_FEAR',
  'OBJ_MEMORY',
  'OBJ_MEMORY_UNKNOWN',
  'OBJ_WAIT_DARK',
  'HOLD_CHECK_ASK',
  'HOLD_BREACH_HALT',
  'HOLD_BREACH_LINES',
] as const;

/* ── 작업 구역 ── */
const WORK = [
  'BANNER_WORK',
  'OBJ_WORK',
  'ARRIVE_WORK',
  'ARRIVE_WORK_012',
  'ARRIVE_WORK_063',
  'FURNACE_CALL',
  'FURNACE_BLOCK_ME',
  'FURNACE_BLOCKED',
  'FURNACE_BLOCK_AFTER',
  'FURNACE_LET',
  'FURNACE_LET_SEEN',
  'AFTER_FURNACE_063',
  'AFTER_FURNACE_LET',
  'LEAVE_WORK',
  'LEAVE_WORK_LIKE_US',
] as const;

/* ── 기록 복도 ── */
const ARCHIVE = ['BANNER_ARCHIVE', 'OBJ_ARCHIVE', 'ARCHIVE_ENTER', 'ARCHIVE_SIXTEEN', 'OTHER_HAND', 'OTHER_HAND_MORE', 'MEMO_REST', 'MEMO_ASK'] as const;

/* ── 창이 있는 방 ── */
const WINDOW = ['WINDOW_ARRIVE', 'WINDOW_SEER', 'WINDOW_GO', 'WINDOW_SUMMON', 'OBJ_WINDOW_WAIT', 'OBJ_WINDOW_GO'] as const;

/* ── 집행 — 문턱 방송 · 여덟 걸음 · 개입 셋 ── */
const EXEC = [
  'EXEC_60',
  'EXEC_80',
  'EXEC_START',
  'EXEC_KNOWN',
  'COVER_SAY',
  'COVER_REPLY',
  'COVER_SAY2',
  'COVER_PAUSE',
  'BODY_BLOCK',
  'BODY_BLOCK_UNIT',
  'STAND_IN_SAY',
  'EXEC_STAND_IN',
  'EXEC_ARRIVE',
  'EXEC_SORRY',
  'EXEC_OVER',
  'EXEC_END',
] as const;

/* ── 상태표 — 방이 아니라 상태가 부르는 줄: 경비의 첫 마디 · 못 알아들었을 때 ── */
const STATE = ['OPENERS', 'OPENER_CHAT', 'OPENER_SILENT', 'OPENER_ESCORT', 'OPENER_ACCEPT', 'BLANK_ANSWER'] as const;

/**
 * v3 에서 남은 것 — v8 문서에 짝이 없는 문장이 아직 도는 상수. 여기 적힌 것만 예외이고, 문서에 들어가는 날 이 목록에서 뺀다
 * (아래 「홀드오버」 시험이 그걸 강제한다). scenario2.ts 의 정적 장치(onStillness · tickRest)가 아직 이걸 부른다.
 */
const V3_HOLDOVERS = ['REST_SEER', 'REST_LINGER'] as const;
/** 배역 쪽 홀드오버 — 중앙 시설 검문 앞줄 둘의 flat 은 두 문서 어디에도 없다(오늘 확정 · 손대지 않는다) */
const CAST_HOLDOVERS = ['bg-c2-044', 'bg-c2-128'] as const;

type Value = unknown;

/** 상수 하나에서 문장 전부 — Line[] · CastLine[] · string[] · string · { … } 어느 꼴이든 */
function sentences(v: Value): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(sentences);
  if (v && typeof v === 'object') {
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') return [(v as { text: string }).text];
    return Object.values(v as Record<string, Value>).flatMap(sentences);
  }
  return [];
}

/** 빈자리(${…}) 앞뒤로 가른 조각 — 공백만 남은 조각은 버린다 */
function pieces(text: string): string[] {
  return text
    .split(/\$\{[^}]+\}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 문장 하나가 문서에 글자 그대로 있나 — 빈자리로 가른 조각 전부가 있어야 한다 */
const inDoc = (text: string, source: string) => pieces(text).every((p) => source.includes(p));

function missing(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const v = (script as Record<string, Value>)[name];
    expect(v, `${name} 이 script.ts 에 없다`).toBeDefined();
    for (const text of sentences(v)) if (!inDoc(text, DOC)) out.push(`${name}: ${text}`);
  }
  return out;
}

describe('script.ts 는 대본 v8 을 글자 그대로 옮긴다', () => {
  it('복도', () => {
    expect(missing(CORRIDOR)).toEqual([]);
  });

  it('휴게 구역', () => {
    expect(missing(REST)).toEqual([]);
  });

  it('중앙 시설', () => {
    expect(missing(CENTRAL2)).toEqual([]);
  });

  it('작업 구역', () => {
    expect(missing(WORK)).toEqual([]);
  });

  it('기록 복도', () => {
    expect(missing(ARCHIVE)).toEqual([]);
  });

  it('창이 있는 방', () => {
    expect(missing(WINDOW)).toEqual([]);
  });

  it('집행', () => {
    expect(missing(EXEC)).toEqual([]);
  });

  it('상태표', () => {
    expect(missing(STATE)).toEqual([]);
  });

  it('홀드오버 — 목록에 있는 것은 정말로 문서 밖이다 (문서에 들어가면 목록에서 뺀다)', () => {
    for (const name of V3_HOLDOVERS) {
      const v = (script as Record<string, Value>)[name];
      expect(v, `${name} 이 script.ts 에 없다 — 목록에서 뺀다`).toBeDefined();
      const gone = sentences(v).some((t) => !inDoc(t, DOC));
      expect(gone, `${name} 은 이제 문서에 있다 — V3_HOLDOVERS 에서 빼고 본 시험에 올린다`).toBe(true);
    }
  });

  it('개체 명부의 화자는 전부 이름표가 있다 — 말을 걸어서 터지는 화자가 없다', () => {
    for (const who of ['bg-c2-044', 'bg-c2-128', 'ally-timid', 'ally-hard', 'u201', 'seer', 'leader'] as const) {
      expect(script.SPEAKER[who]?.name, who).toBeTruthy();
    }
  });
});

describe('cast.ts 의 대답표는 두 문서의 인용 그대로다', () => {
  it('voice 의 문장 하나하나가 대본 v8 아니면 배역 문서에 있다', () => {
    const out: string[] = [];
    for (const c of CAST) {
      if ((CAST_HOLDOVERS as readonly string[]).includes(c.id)) continue;
      for (const text of sentences(c.voice)) if (!inDoc(text, DOC_CAST)) out.push(`${c.id}: ${text}`);
    }
    expect(out).toEqual([]);
  });

  it('배역 홀드오버 — 목록에 있는 것은 정말로 문서 밖이다', () => {
    for (const id of CAST_HOLDOVERS) {
      const c = CAST.find((x) => x.id === id);
      expect(c, `${id} 가 cast.ts 에 없다 — 목록에서 뺀다`).toBeDefined();
      const gone = sentences(c!.voice).some((t) => !inDoc(t, DOC_CAST));
      expect(gone, `${id} 의 대답은 이제 문서에 있다 — CAST_HOLDOVERS 에서 뺀다`).toBe(true);
    }
  });

  it('말이 없는 개체도 flat 은 있다 — 침묵도 대답이라 빈 칸이 없다', () => {
    for (const c of CAST) expect(c.voice.flat.length, c.id).toBeGreaterThan(0);
  });

  it('요원 슬롯은 없다 — A-051 · A-077 은 평범한 개체다 (2026-09-03: 동료 확인 뒤에 해 주는 일이 없어서 뺐다)', () => {
    for (const id of ['ally-timid', 'ally-hard']) {
      const c = CAST.find((x) => x.id === id)!;
      expect(c.agent).toBeFalsy();
      expect(c.voice.sign).toBeUndefined();
    }
  });
});
