/**
 * 인계 기록 — 재검실(챕터 3)에서 인지 검증실(/interrogation)로 **무엇이 넘어오는가**.
 *
 * 여기가 틀리면 이야기가 문턱에서 끊긴다. 세 장을 지나온 사람이 아무것도 안 들고 검증실에 서거나,
 * 반대로 주소만 직접 연 사람 앞에 있지도 않았던 재검 판정이 적혀 나온다.
 *
 * 이어받는 의심도(carrySuspicion)는 특히 좁게 잠근다 — 이 값은 화면에만 뜨는 게 아니라 검증실
 * 리더가 나를 보는 출발선이라, 크면 앞 장이 판을 이어 주는 게 아니라 **끝내 버린다**.
 */
import { describe, expect, it } from 'vitest';
import {
  CARRY_CAP,
  HANDOVER_MIN_MS,
  NOTE_LINES,
  arrivalLine,
  buildHandover,
  buildStoryCast,
  carrySuspicion,
  roomArrival,
  storyCast,
  type HandoverInput,
} from '@/features/arena/handover';

const base: HandoverInput = {
  unit: 'A38-091',
  unitKnown: true,
  sector: 4,
  suspicion: 0,
  syncLow: false,
  verdict: null,
  rounds: 0,
  peers: [],
  entries: [],
};

const say = (scene: string, text: string) => ({ kind: 'say' as const, scene, text });
const note = (scene: string, text: string) => ({ kind: 'note' as const, scene, text });

describe('이어받는 의심도', () => {
  it('0 이면 이어받을 것이 없다 — 주소를 직접 연 길이 여기다', () => {
    expect(carrySuspicion(0)).toBe(0);
  });

  it('앞 장의 값에 따라 커진다 — 사람처럼 군 사람일수록 굳은 눈으로 본다', () => {
    expect(carrySuspicion(20)).toBeLessThan(carrySuspicion(60));
    expect(carrySuspicion(60)).toBeLessThan(carrySuspicion(100));
  });

  it('그대로 넘기지는 않는다 — 앞 장이 판을 이어 줄 뿐, 끝내지는 못한다', () => {
    // 눈금 끝까지 갔던 사람도 폐기선(100)은커녕 리더의 주시선(hotAt 70)에도 한참 못 미친 채 시작한다
    expect(carrySuspicion(100)).toBeLessThanOrEqual(CARRY_CAP);
    expect(CARRY_CAP).toBeLessThan(70);
  });

  it('상한 위로는 안 올라간다', () => {
    expect(carrySuspicion(400)).toBe(CARRY_CAP);
  });

  it('음수는 0 이다 — 저장소가 0 밑으로 안 내려가지만 값에 기대지 않는다', () => {
    expect(carrySuspicion(-30)).toBe(0);
  });
});

describe('인계 기록', () => {
  it('주소를 직접 열면 앞 장이 없다 — 없는 판정을 지어내지 않는다', () => {
    const h = buildHandover(base);
    expect(h.fromChapter).toBe(false);
    expect(h.verdict).toBeNull();
    expect(h.notes).toEqual([]);
    expect(h.lastSaid).toBeNull();
    expect(h.carried).toBe(0);
  });

  it('재검 판정이 있으면 앞 장을 지나온 것이다', () => {
    const h = buildHandover({ ...base, verdict: 'pass', rounds: 3 });
    expect(h.fromChapter).toBe(true);
    expect(h.verdict?.key).toBe('pass');
    expect(h.verdict?.grave).toBe(false);
    expect(h.rounds).toBe(3);
  });

  it('사격 판정은 붉게 적는다 — 쏘고도 이관되는 길이 있다 (chapter3 의 leave)', () => {
    const h = buildHandover({ ...base, verdict: 'fire', rounds: 2 });
    expect(h.verdict?.key).toBe('fire');
    expect(h.verdict?.grave).toBe(true);
  });

  it('기록만 있고 판정이 없어도 앞 장을 지나온 것이다 — 절차를 안 마치고 이관된 길', () => {
    const h = buildHandover({ ...base, entries: [say('복도', '이상 없음')] });
    expect(h.fromChapter).toBe(true);
    expect(h.verdict).toBeNull();
  });

  it('마지막으로 한 말을 들고 온다 — 이 방은 그 말을 기억한 채 나를 맞는다', () => {
    const h = buildHandover({
      ...base,
      entries: [say('복도', '4 구역'), note('중앙 시설', '명판을 읽음'), say('재검실', '기억나지 않는다')],
    });
    expect(h.lastSaid).toEqual({ scene: '재검실', text: '기억나지 않는다' });
  });

  it('관측은 최근 것이 위, 정해진 줄 수까지만 — 넘치면 읽기 전에 막이 걷힌다', () => {
    const many = Array.from({ length: NOTE_LINES + 4 }, (_, i) => note('재검실', `관측 ${i}`));
    const h = buildHandover({ ...base, entries: many });
    expect(h.notes).toHaveLength(NOTE_LINES);
    expect(h.notes[0].text).toBe(`관측 ${NOTE_LINES + 3}`);
    // 내가 한 말은 관측 줄에 섞이지 않는다 — 시설이 본 것과 내가 한 말은 다른 칸이다
    expect(h.notes.every((n) => n.text.startsWith('관측'))).toBe(true);
  });

  it('말이 하나도 없어도 관측은 다 채운다 — 두 칸이 서로를 안 막는다', () => {
    const h = buildHandover({ ...base, entries: [note('복도', 'ㄱ'), note('복도', 'ㄴ')] });
    expect(h.lastSaid).toBeNull();
    expect(h.notes).toHaveLength(2);
  });

  it('위장 상태는 무대 HUD 와 같은 낱말을 쓴다 (features/world/cover)', () => {
    expect(buildHandover({ ...base, suspicion: 10 }).cover.text).toBe('위장 유지');
    expect(buildHandover({ ...base, suspicion: 40 }).cover.text).toBe('주시됨');
    expect(buildHandover({ ...base, suspicion: 65 }).cover.text).toBe('추적 중');
    expect(buildHandover({ ...base, suspicion: 90 }).cover.text).toBe('노출 직전');
    expect(buildHandover({ ...base, suspicion: 10, syncLow: true }).cover.text).toBe('동기화 이탈');
  });

  it('화면에 적는 의심도는 정수다 — 게이지 옆 숫자가 62.5% 로 나오지 않게', () => {
    expect(buildHandover({ ...base, suspicion: 62.5 }).suspicion).toBe(63);
  });

  it('이 몸의 번호를 그대로 들고 간다 — 명판을 안 읽었어도 시설은 알고 있다', () => {
    const h = buildHandover({ ...base, unit: 'A38-137', unitKnown: false, sector: 2 });
    expect(h.unit).toBe('A38-137');
    expect(h.unitKnown).toBe(false);
    expect(h.sector).toBe(2);
  });
});

describe('막을 들고 있는 시간', () => {
  it('한 프레임 번쩍이고 사라지지 않는다 — 읽을 수 없는 화면은 없는 화면이다', () => {
    expect(HANDOVER_MIN_MS).toBeGreaterThanOrEqual(3000);
  });

  it('그렇다고 앞 방의 암전·배너(6.2초)만큼 길지는 않다 — 문턱이 장면보다 길면 안 된다', () => {
    expect(HANDOVER_MIN_MS).toBeLessThan(6200);
  });
});

/**
 * 방에 서는 이름 — 서류에 적힌 번호가 문 안쪽에서도 같은 번호여야 한다.
 *
 * 여기가 틀리면 세 장을 지나며 외운 내 번호가 마지막 방에서만 남이 되고, 줄에서 먼저
 * 문으로 걸어 들어간 개체가 그 문 안쪽에 없다. 판이 안 깨지므로 눈으로만 걸린다 — 그래서 여기서 잠근다.
 */
describe('방에 서는 이름들', () => {
  const POOL = Array.from({ length: 20 }, (_, i) => `A38-${String(i + 2).padStart(3, '0')}`);

  it('내 번호는 앞 장에서 들고 온 그대로다 — 마지막 칸이 나다', () => {
    const cast = buildStoryCast('A38-091', [], POOL, 6);
    expect(cast).toHaveLength(6);
    expect(cast[cast.length - 1]).toBe('A38-091');
  });

  it('줄에서 먼저 들어간 개체가 이 방에 서 있다 — 그 문 안쪽이 여기다', () => {
    const cast = buildStoryCast('A38-091', ['A38-206', 'A38-072'], POOL, 6);
    expect(cast).toContain('A38-206');
    expect(cast).toContain('A38-072');
  });

  it('같은 번호가 두 몸에 붙지 않는다 — 호명이 엉뚱한 개체를 집는다', () => {
    const cast = buildStoryCast('A38-091', ['A38-206', 'A38-206', 'A38-091'], POOL, 6);
    expect(new Set(cast).size).toBe(cast.length);
  });

  it('정원을 넘겨 받아도 방은 정원대로다 — 남는 개체는 안 세운다', () => {
    const many = Array.from({ length: 9 }, (_, i) => `A38-${300 + i}`);
    expect(buildStoryCast('A38-091', many, POOL, 6)).toHaveLength(6);
  });

  it('줄까지 못 가고 끌려간 판은 이름 풀로만 채운다 — 못 본 개체를 세우지 않는다', () => {
    const cast = buildStoryCast('A38-091', [], POOL, 6);
    expect(cast.slice(0, -1).every((n) => POOL.includes(n))).toBe(true);
  });

  it('기록이 아예 없으면 안 뽑는다 — 판이 여태처럼 이름 여섯을 뽑는다 (로비에서 판만 열기)', () => {
    expect(storyCast(null, 6)).toBeNull();
  });

  /*
   * `/interrogation?from=central` 주소를 직접 열면 서류는 뜨는데(「이관 기록 없음」) 앞 장은 없다.
   * 그래도 서류에 적힌 번호와 왼쪽 위 판의 번호는 같아야 한다 — 막이 걷히는 사이에 한 몸이
   * 번호를 갈아입으면 안 된다 (handover 의 storyCast ★).
   */
  it('앞 장을 안 지나온 서류라도 내 번호는 그대로다 — 선입 개체만 안 세운다', () => {
    const record = buildHandover({ ...base, unit: 'A38-137', peers: ['A38-206'] });
    expect(record.fromChapter).toBe(false);
    const cast = storyCast(record, 6)!;
    expect(cast[cast.length - 1]).toBe('A38-137');
    expect(cast).not.toContain('A38-206');
    expect(new Set(cast).size).toBe(6);
  });

  it('앞 장을 지나왔으면 그 기록의 번호로 뽑는다', () => {
    const record = buildHandover({ ...base, unit: 'A38-063', verdict: 'pass', peers: ['A38-206'] });
    const cast = storyCast(record, 6)!;
    expect(cast[cast.length - 1]).toBe('A38-063');
    expect(cast).toContain('A38-206');
  });
});

/**
 * 도착 접수 — 앞 방의 「인지 검증실로 이동」을 받아서 닫는 한 줄.
 * 인계 화면을 안 읽고 넘긴 사람에게는 이 문장이 앞 장을 잇는 전부라, 서류가 적은 것을 그대로 불러야 한다.
 */
describe('도착 접수 방송', () => {
  it('앞 장이 없으면 여태의 그 줄이다 — 없는 이야기를 지어내지 않는다', () => {
    expect(arrivalLine(null, 38, 6)).toBe('인지 검증실. 모델 A-38 개체 6, 도착 확인.');
    expect(arrivalLine(buildHandover(base), 38, 6)).toContain('도착 확인');
  });

  it('내 번호를 부른다 — 방금 이관된 것은 나 하나다', () => {
    const line = arrivalLine(buildHandover({ ...base, unit: 'A38-091', verdict: 'pass' }), 38, 6);
    expect(line).toContain('A38-091');
  });

  it('재검 판정이 무엇이었는지 소리로도 나온다', () => {
    expect(arrivalLine(buildHandover({ ...base, verdict: 'pass' }), 38, 6)).toContain('방면');
    expect(arrivalLine(buildHandover({ ...base, verdict: 'fire' }), 38, 6)).toContain('사격');
    // 절차를 안 마치고 이관된 길 — 판정 칸이 비어 있어도 문장이 서야 한다
    expect(arrivalLine(buildHandover({ ...base, entries: [say('복도', 'ㄱ')] }), 38, 6)).toContain('미완');
  });

  it('이어받은 의심을 부른다 — 서류의 +N 과 같은 값이어야 한다', () => {
    const record = buildHandover({ ...base, verdict: 'pass', suspicion: 60 });
    expect(arrivalLine(record, 38, 6)).toContain(String(record.carried));
    expect(arrivalLine(buildHandover({ ...base, verdict: 'pass' }), 38, 6)).toContain('선행 의심 없음');
  });
});

describe('방에게 넘기는 앞 장', () => {
  it('앞 장을 안 지나왔으면 넘길 것이 없다 — 없는 이야기를 방에 심지 않는다', () => {
    expect(roomArrival(null)).toBeNull();
    expect(roomArrival(buildHandover(base))).toBeNull();
  });

  it('줄에서 먼저 들어간 번호와 재검 판정을 넘긴다', () => {
    const record = buildHandover({ ...base, verdict: 'pass', peers: ['A38-206', 'A38-072'] });
    expect(roomArrival(record)).toEqual({ peers: ['A38-206', 'A38-072'], verdict: 'pass' });
  });

  it('사격 판정도 그대로 넘어간다', () => {
    const record = buildHandover({ ...base, verdict: 'fire' });
    expect(roomArrival(record)?.verdict).toBe('fire');
  });

  /*
   * 이 시험이 이 파일에서 제일 중요하다. 서류에 적힌 내 번호가 방에게 넘어가면 개체들이 첫 마디에
   * 나를 부른다 — 「방금 재검 갔다 온 A38-091, 너부터」. 판이 열리기 전에 답이 나와 버린다.
   */
  it('**이관된 개체의 번호는 안 넘어간다** — 방이 첫 마디에 나를 부르면 판이 끝난다', () => {
    const record = buildHandover({
      ...base,
      verdict: 'pass',
      peers: ['A38-206'],
      entries: [say('재검실', '4 구역에서 왔다'), note('재검실', '재검을 통과함')],
    });
    const arrival = roomArrival(record);
    expect(JSON.stringify(arrival)).not.toContain(base.unit);
    // 내가 한 말도, 시설이 적은 관측도 안 간다 — 그것도 나를 가리킨다
    expect(JSON.stringify(arrival)).not.toContain('4 구역');
    expect(JSON.stringify(arrival)).not.toContain('재검을 통과함');
  });

  it('넘긴 뒤에 만져도 서류가 안 바뀐다 — 베껴서 준다', () => {
    const record = buildHandover({ ...base, verdict: 'pass', peers: ['A38-206'] });
    roomArrival(record)!.peers.push('A38-999');
    expect(record.peers).toEqual(['A38-206']);
  });
});
