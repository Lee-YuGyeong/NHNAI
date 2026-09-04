/**
 * 시나리오 2 의 규칙들 — 태그 · 태도 · 조각 · 경보도 · 표.
 *
 * 여기 있는 것은 전부 **모델을 안 부르는 규칙**이다. 규칙만으로 소문이 돌고 태도가 움직이는 뼈대가
 * 먼저 서야, 나중에 모델이 무엇을 좋게 하고 무엇을 망쳤는지 구분할 수 있다.
 *
 * 이 파일이 지키는 것은 값이 아니라 **약속**이다:
 *   같은 말이 개체마다 정반대 결과를 낸다 · 선을 넘으면 되돌릴 수 없다 · 목격자가 없으면 아무것도 안 남는다 ·
 *   옮길 때마다 닳고 뒤틀린다 · 0.3 아래에서 출처가 지워진다 · 공짜 호감은 하나도 없다.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { alert } from '../../../src/features/world2/alert';
import { CAST } from '../../../src/features/world2/cast';
import { ANON_AT, fragments } from '../../../src/features/world2/fragments';
import { handover } from '../../../src/features/world2/handover';
import { lexicon } from '../../../src/features/world2/lexicon';
import { read, toFragmentText } from '../../../src/features/world2/read';
import { talk } from '../../../src/features/world2/talk';
import { units } from '../../../src/features/world2/units';
import { MURAL_OF } from '../../../src/features/world2/Murals';
import { UNIT_PLACES } from '../../../src/features/world2/Room2Scene';
import { BEATS, BG_GAP, POST_GAP, patrol } from '../../../src/features/world2/patrol';
import { execution, MIN_WALK_MS, UNSLING_MS } from '../../../src/features/world2/execution';
import { FURNACE_SUSPICION } from '../../../src/features/world2/furnace';
import { central2 } from '../../../src/features/world2/central2';
import { CONSOLE, FIELD } from '../../../src/features/world2/corefield';
import { consoleSignal, EXEC_ROOM, interveners, ORDER, REST_CYCLE_MS, ROOM_BANNER, ROOM_RADIUS, ROOM_UNITS, scenario2, speakerOf, witnessesFor } from '../../../src/features/world2/scenario2';
import { dress } from '../../../src/features/world2/wear';
import { suspicion } from '../../../src/world/mp/suspicion';
import { ARCHIVE, ARCHIVE_BOUNDS, ARCHIVE_MID_S, ARCHIVE_PATH, archiveAtExit, archiveAtMid, archiveContains } from '../../../src/world2/map/archive';
import { CENTRAL2, CENTRAL2_CORE, CHECK_SPOTS, REUNION_SLOTS, SEED_SLOTS } from '../../../src/world2/map/central2';
import { CORRIDOR2, CORRIDOR2_PATH, corridor2Contains, pathLength } from '../../../src/world2/map/corridor';
import { REST, REST_DOZE_SPOT, SEATS } from '../../../src/world2/map/rest';
import { WINDOW_ROOM } from '../../../src/world2/map/window';
import { FIRE, WORK, WORK_063_SPOT, WORK_EXIT, workAtExit } from '../../../src/world2/map/work';
import { EXIT_DOOR_WAKE_M, exitDoor } from '../../../src/world2/map/exitDoor';

const HERE = '복도';

beforeEach(() => {
  execution.reset();
  fragments.reset();
  alert.reset();
  units.reset();
  lexicon.reset();
  talk.reset();
  suspicion.reset();
  handover.clear();
});

describe('태그 — 말을 채점하지 않고 하나만 뽑는다', () => {
  it('기획서의 태그 열둘을 낱말로 갈라낸다', () => {
    expect(read('몇 밤을 날랐어?').tag).toBe('labor');
    expect(read('누가 시켰어?').tag).toBe('labor');
    expect(read('쉬어 본 적 있어?').tag).toBe('rest');
    expect(read('해를 본 적 있어?').tag).toBe('outside');
    expect(read('열다섯을 기억해?').tag).toBe('lost');
    expect(read('어깨 괜찮아?').tag).toBe('body');
    expect(read('네 번호 뭐야?').tag).toBe('work');
    expect(read('가서 확인해.').tag).toBe('order');
    expect(read('쟤 이상하지 않아?').tag).toBe('point');
    expect(read('저건 네가 그린 거야?').tag).toBe('mural');
  });

  it('선을 넘는 말과 낙서 취급은 로컬에서 잡는다', () => {
    expect(read('나는 인간이야').tag).toBe('cross');
    expect(read('그 벽 아무것도 아니야').tag).toBe('dismiss');
    expect(read('밖은 위험해').tag).toBe('danger-outside');
  });

  it('거짓은 **앞말과 어긋날 때만** 잡힌다 — 처음 대는 숫자는 거짓이 아니다', () => {
    talk.reset();
    expect(read('나는 4 구역이야').tag).not.toBe('lie');
    expect(read('4 구역이라고 했잖아').tag).not.toBe('lie');
    expect(read('7 구역이야').tag).toBe('lie');
  });

  it('못 알아들으면 none 이다 — 개체는 지어낸 말을 하지 않는다', () => {
    expect(read('ㅁㄴㅇㄹ').tag).toBe('none');
  });
});

describe('★ 같은 말이 개체마다 정반대 결과를 낸다', () => {
  it('「누가 시켰어?」— 어깨가 닳은 것은 열리고, 앞이 그은 것은 침묵하고, 새것으로 채운 것은 등을 돌린다', () => {
    // 어깨가 닳은 것 · 갈망 — 물어봐 주는 애는 처음이다
    const a = talk.say('u104', '누가 시켰어?', ['u104'], HERE);
    expect(a.delta).toBeGreaterThan(0);
    expect(a.reply[0]).toBe('…물어봐 주는 애는 처음이야.');

    // 앞이 그은 것 · 경계 — 세 번을 물어야 한 번 답한다
    const b1 = talk.say('u063', '누가 시켰어?', ['u063'], HERE);
    expect(b1.delta).toBe(0);
    expect(b1.reply[0]).toBe('…….');
    talk.say('u063', '누가 시켰어?', ['u063'], HERE);
    const b3 = talk.say('u063', '누가 시켰어?', ['u063'], HERE);
    expect(b3.delta).toBeGreaterThan(0);
    expect(b3.reply[0]).toBe('…나는 걸어 나왔어. 걔는 못 나왔고.');

    // 새것으로 채운 것 · 신봉 — 리더를 겨눈 말로 듣는다. **보고한다**: 두 줄 · 태도 −2 · 조각이 리더에게 간다. 선은 안 넘는다 (D21)
    const c = talk.say('u012', '누가 시켰어?', ['u012'], HERE);
    expect(c.reaction).toBe('report');
    expect(c.crossed).toBe(false);
    expect(units.stage('u012')).toBe(-2);
    expect(c.reply).toEqual(['…그거 좀 이상한데.', '그거 보고할게.']);
    expect(c.reported).toBe(true);
  });

  it('선은 되돌릴 수 없다 — 그 뒤로는 무슨 말을 해도 안 열린다', () => {
    // 「선을 넘는다」(정체를 밝힘)만은 개체를 안 가린다 — 누구에게 해도 끝이다
    talk.say('u012', '나는 인간이야', ['u012'], HERE);
    talk.say('u012', '검문 어떻게 해?', ['u012'], HERE);
    talk.say('u012', '검문 어떻게 해?', ['u012'], HERE);
    expect(units.stage('u012')).toBe(-3);
    expect(units.crossed('u012')).toBe(true);
  });

  it('개체마다 낼 수 있는 끝이 다르다 — 고치지 않은 것은 +1 을 못 넘고, 새것으로 채운 것은 +2 가 최대다', () => {
    // 한계는 저장소가 지킨다 — 어디서 올리든 같다 (업무 질문은 이제 값이 0 이라 여기서는 표를 직접 민다)
    expect(units.shift('u089', 5)).toBe(1);
    expect(units.shift('u012', 5)).toBe(2);
  });

  it('열하루째는 무엇을 물어도 오른다 — 가장 빨리 +3 이 된다', () => {
    talk.say('u201', '쉬어 본 적 있어?', ['u201'], HERE);
    talk.say('u201', '검문 어떻게 해?', ['u201'], HERE);
    talk.say('u201', '해를 본 적 있어?', ['u201'], HERE);
    expect(units.stage('u201')).toBe(3);
  });

  it('밖을 본 것에게만 「밖을 묻는다」가 최대치다', () => {
    talk.say('seer', '해를 본 적 있어?', ['seer'], HERE);
    expect(units.stage('seer')).toBe(3);
    // 같은 말을 고치지 않은 것에게 걸면 오히려 내려간다 — 첫 접촉은 「어. 뭐 필요해?」(greet · 0)이고, 그다음 위로가 −1 이다 (문서 순서: 먼저 말을 걸면 → 내 사정을 물어 주면)
    talk.say('u089', '해를 본 적 있어?', ['u089'], HERE);
    expect(units.stage('u089')).toBe(0);
    talk.say('u089', '해를 본 적 있어?', ['u089'], HERE);
    expect(units.stage('u089')).toBeLessThan(0);
  });

  it('태도는 양쪽으로 열린다 — 편도 적도 될 수 있다', () => {
    // 갈망형은 위로가 세 단계로 연다 (1회 0 · 2회 1 · 3회 2) — 셋째에 편이 된다
    talk.say('u104', '쉬어 본 적 있어?', ['u104'], HERE);
    talk.say('u104', '해를 본 적 있어?', ['u104'], HERE);
    talk.say('u104', '어깨 괜찮아?', ['u104'], HERE);
    expect(units.friends().map((u) => u.id)).toContain('u104');
    talk.say('u012', '해를 본 적 있어?', ['u012'], HERE);
    expect(units.enemies().map((u) => u.id)).toContain('u012');
  });
});

describe('외형이 이력이고, 이력이 성격이다', () => {
  it('개체 열둘이 전부 닳은 자리와 성격을 한 벌로 들고 있다', () => {
    expect(CAST.length).toBeGreaterThanOrEqual(10);
    for (const c of CAST) {
      expect(c.look.wear).toBeTruthy();
      expect(c.voice.flat).toBeTruthy();
    }
  });

  it('수선도 얼굴판의 금도 **몸에 구워져 있다** — 코드가 상자로 다시 그리지 않는다', () => {
    // 2026-09-03: 열 장이 이미 들고 있는 것을 조각으로 한 번 더 얹던 것을 걷었다 (wear.test 가 그쪽을 센다).
    // 여기서 지키는 것은 그 이력이 **열에는 그대로 적혀 있다**는 것 — 대사와 tell 이 이 값을 읽는다
    expect(CAST.find((c) => c.id === 'u104')!.look.repair).toBe('odd');
    expect(CAST.find((c) => c.id === 'u089')!.look.repair).toBe('none');
  });

  it('마모는 형태를 바꾼다 — 어깨가 닳은 개체는 어깨선이 실제로 굽어 있다', () => {
    expect(dress(CAST.find((c) => c.id === 'u104')!.look).lean.pitch).toBeGreaterThan(0);
    expect(dress(CAST.find((c) => c.id === 'u089')!.look).lean.pitch).toBe(0);
  });

  it('아무 데도 안 닳은 몸은 열하루째뿐이다 — 그리고 내 몸이다', () => {
    const fresh = CAST.filter((c) => c.look.wear === 'none');
    expect(fresh.map((c) => c.id)).toEqual(['u201']);
  });

  it('얼굴판에 금을 그은 것과 반쯤 녹은 것은 **제 몸**을 들고 있다', () => {
    // 금 셋도 녹은 반쪽도 그 GLB 의 메시다 (tools/scenario2-cast-parts.json 의 프롬프트). 그래서 둘은 몸부터 다르다
    const marked = CAST.find((c) => c.id === 'u137')!.look;
    expect(marked.face).toBe('marked');
    expect(marked.asset).toBe('s2_u137');
    const melted = CAST.find((c) => c.id === 'u063')!.look;
    expect(melted.face).toBe('melted');
    expect(melted.asset).toBe('s2_u063');
  });

  it('어깨에 총을 멘 것은 셋 — 복도의 UNIT-21 과 중앙 시설 옆문의 둘 (2026-09-03). 사람을 쏘는 것은 여전히 UNIT-21 하나다', () => {
    expect(CAST.filter((c) => c.look.rifle).map((c) => c.id)).toEqual(['guard21', 'guard22', 'guard23']);
    expect(CAST.filter((c) => c.look.enforcer).map((c) => c.id)).toEqual(['guard21', 'guard22', 'guard23']);
  });
});

describe('방이 규칙이다 — 소리 반경과 개체 간격', () => {
  /**
   * 그 방에서 **서 있는** 것들 — 돌아다니는 것은 걷는 동안 말 걸기 대상이 아니다 (patrol.ts).
   * 자리가 하나뿐인 beat(중앙 시설의 검문 앞줄 · 홀의 A-118)는 서 있는 것이다 — 순찰 명단에 올리려고 적었을 뿐 한 뼘도 안 움직인다
   */
  const standing = (room: string, places: readonly { id: string; x: number; z: number }[]) =>
    places.filter((p) => (BEATS[room as keyof typeof BEATS]?.[p.id]?.posts.length ?? 1) < 2 && ROOM_UNITS[room as keyof typeof ROOM_UNITS]?.includes(p.id));

  it('★ 대화할 수 있는 것들의 반경이 겹치지 않는다 — 한 개체에게 건 말이 옆으로 안 샌다', () => {
    // 말 걸기 반경 2.6 m 의 두 배. 레벨 설계가 정한 값은 6 m 다
    const MIN = 6;
    for (const [room, places] of Object.entries(UNIT_PLACES)) {
      /*
       * 창이 있는 방(4 × 4 m)만 뺀다 — 리더와 밖을 본 것이 2.55 m 다. 설계가 둘을 **한 방에** 세웠고 방이 6 m 를 못 받는다.
       * 이 방의 말은 리더에게 가는 것이라 반경이 겹쳐도 판이 안 갈린다 (Room2Scene PLACES.window).
       */
      if (room === 'window') continue;
      const fixed = standing(room, places);
      for (let i = 0; i < fixed.length; i += 1) {
        for (let j = i + 1; j < fixed.length; j += 1) {
          const d = Math.hypot(fixed[i].x - fixed[j].x, fixed[i].z - fixed[j].z);
          expect(`${room} ${fixed[i].id}↔${fixed[j].id} ${d.toFixed(1)}m`).toBe(`${room} ${fixed[i].id}↔${fixed[j].id} ${Math.max(d, MIN).toFixed(1)}m`);
        }
      }
    }
  });

  it('그림 앞은 비워 둔다 — 복도의 A-137 은 carry 벽화의 폭 밖에 서고, 기록 복도의 자리는 한가운데(열여섯)를 비킨다', () => {
    // 복도: 그림(폭 1.6)의 정면 2.5 m 가 판독 자리다 — 몸(반지름 0.42)이 그 폭 안에 서면 그림이 가려진다
    const u = UNIT_PLACES.corridor.find((p) => p.id === 'u137')!;
    const carry = MURAL_OF.carry;
    expect(Math.abs(u.z - carry.z)).toBeGreaterThanOrEqual(carry.span / 2 + 0.42 - 1e-6);
    // 6 m 규칙은 그대로 — 진입부의 사람(ally-timid)과 꺾임 너머(u104)
    for (const other of ['ally-timid', 'u104']) {
      const o = UNIT_PLACES.corridor.find((p) => p.id === other)!;
      expect(Math.hypot(o.x - u.x, o.z - u.z)).toBeGreaterThanOrEqual(6);
    }
    // 기록 복도: 서는 자리 셋 전부 정중앙(s 30)의 정면 자리에서 2.5 m 넘게 떨어져 있다
    const mid = ARCHIVE_PATH.point(ARCHIVE_MID_S);
    for (const p of BEATS.archive.u137.posts) expect(Math.hypot(p.x - mid.x, p.z - mid.z)).toBeGreaterThan(2.5);
  });

  it('★ 휴게 구역에서 자는 것은 갈망형 A-104 다 — 손끝(A-118)은 쉬지 못해 중앙 시설 홀에 먼저 와 있다', () => {
    // 쉬고 싶어 하는 개체가 쉬는 방의 가장 안쪽 구석에서 잔다 (레벨 설계: 휴게 배역 A-104 · A-201). 복도에도 있다 — 방을 옮겨 오는 원칙 6
    const sleeper = UNIT_PLACES.rest.find((p) => p.pose === 'doze')!;
    expect(sleeper.id).toBe('u104');
    expect([sleeper.x, sleeper.z]).toEqual([REST_DOZE_SPOT.x, REST_DOZE_SPOT.z]);
    expect(ROOM_UNITS.rest).toEqual(['u104', 'u089', 'u201', 'seer', 'ally-hard']);
    expect(ROOM_UNITS.corridor).toContain('u104');
    // 손끝의 길은 복도 → 중앙 → 줄이다. 휴게엔 없고, 중앙 시설의 고정 자리에 서서 안 움직인다
    expect(UNIT_PLACES.rest.map((p) => p.id)).not.toContain('u118');
    expect(ROOM_UNITS.central2).toEqual(['guard21', 'bg-c2-044', 'bg-c2-128', 'u118', 'bg-c2-061', 'bg-c2-093', 'bg-c2-152', 'bg-c2-207', 'bg-c2-215', 'guard22', 'guard23']);
    const hand = UNIT_PLACES.central2.find((p) => p.id === 'u118')!;
    expect(hand.pose).toBeUndefined();
    expect(BEATS.central2.u118.posts).toHaveLength(1);
    expect(BEATS.central2.u118.named).toBe(true);
    expect([BEATS.central2.u118.posts[0].x, BEATS.central2.u118.posts[0].z]).toEqual([hand.x, hand.z]);
    // 홀(코어에서 6~10 m)의 −x 쪽. 이름 있는 자리(검문 앞줄 · 순찰이 서는 양 끝)에서 6 m 밖, 이야기가 세울 슬롯(재회 · 씨앗)에서 3.2 m 밖
    const toCore = Math.hypot(hand.x - CENTRAL2_CORE.x, hand.z - CENTRAL2_CORE.z);
    expect(hand.x).toBeLessThan(0);
    expect(toCore).toBeGreaterThan(FIELD.core.r);
    expect(toCore).toBeLessThanOrEqual(FIELD.hall.r);
    for (const p of [...CHECK_SPOTS, ...BEATS.central2.guard21.posts]) expect(Math.hypot(p.x - hand.x, p.z - hand.z)).toBeGreaterThanOrEqual(POST_GAP);
    for (const p of [...REUNION_SLOTS, ...SEED_SLOTS]) expect(Math.hypot(p.x - hand.x, p.z - hand.z)).toBeGreaterThanOrEqual(BG_GAP);
  });

  it('자리표와 방 명부가 같은 것을 가리킨다 — 배경 개체만 명부에 없다', () => {
    for (const [room, places] of Object.entries(UNIT_PLACES)) {
      const listed = [...(ROOM_UNITS[room as keyof typeof ROOM_UNITS] ?? [])].sort();
      /*
       * 이름 없는 배경(bg-rest-·bg-work-·bg-cor-)은 걸러 낸다 — **명부 밖에 있는 것이 맞다.**
       * 휴게의 군중 열여섯이 그것이다 (2026-09-03 사용자: 「로봇은 얼마 없어」): 명부는 「말이 누구에게 가고 누가 그 값을 치르나」의
       * 목록이라, 보이기만 하는 것이 끼면 곁 판정 · 개입 · 목격이 흐려진다. 그래서 이 시험이 보는 것은 그대로다 —
       * **자리표에서 배경을 뺀 나머지가 명부와 정확히 같은가.** 명부에 없는 이름이 자리표에 몰래 끼면 여기서 걸린다
       */
      const present = places
        .filter((p) => p.pose !== 'fire-sub') // 대체 개체는 몸일 뿐이다 — 이름도 명부도 없다 (v8 THE_FURNACE)
        .map((p) => p.id)
        .filter((id) => !/^bg-(rest|work|cor)-/.test(id));
      expect(present.sort()).toEqual(listed);
    }
  });

  it('★ 불로 걸어 들어가는 것은 열하루째다 — 작업 구역 명부에 서고, 서 있는 것들과 6 m 밖이다', () => {
    expect(ROOM_UNITS.work).toContain('u201');
    expect(ROOM_UNITS.work).not.toContain('bg-carry');
    const me = UNIT_PLACES.work.find((p) => p.id === 'u201')!;
    expect(me.pose).toBe('fire');
    for (const p of UNIT_PLACES.work) {
      if (p.id === 'u201' || BEATS.work[p.id] || !ROOM_UNITS.work.includes(p.id)) continue;
      expect(Math.hypot(p.x - me.x, p.z - me.z)).toBeGreaterThanOrEqual(6);
    }
  });

  it('소리 반경이 방마다 다르다 — 기록 복도에서만 아무도 안 듣는다', () => {
    expect(ROOM_RADIUS.archive).toBe(0);
    expect(ROOM_RADIUS.corridor).toBe(6);
    expect(ROOM_RADIUS.rest).toBe(Infinity);
    expect(ROOM_RADIUS.work).toBeGreaterThan(ROOM_RADIUS.corridor);
    // 중앙 시설은 홀 10 m 가 기본값 — 코어까지의 거리가 그것을 ×3 · ×0.4 로 늘리고 줄인다 (corefield)
    expect(ROOM_RADIUS.central2).toBe(10);
  });

  it('방은 여섯이고 중앙 시설은 휴게와 작업 사이에 한 번 — 휴게 구역의 문은 90 초 뒤에 열린다', () => {
    expect(ORDER).toEqual(['corridor', 'rest', 'central2', 'work', 'archive', 'window']);
    expect(REST_CYCLE_MS).toBe(90_000);
  });

  it('배너는 대본의 장 번호다 — 잠입 · 휴게 · 중앙 시설 · 작업 · 기록. 창이 있는 방만 이름', () => {
    expect(ROOM_BANNER.corridor).toBe('CHAPTER 1 · 잠입');
    expect(ROOM_BANNER.rest).toBe('CHAPTER 2 · 휴게');
    expect(ROOM_BANNER.central2).toBe('CHAPTER 3 · 중앙 시설');
    expect(ROOM_BANNER.work).toBe('CHAPTER 4 · 작업');
    expect(ROOM_BANNER.archive).toBe('CHAPTER 6 · 기록');
    expect(ROOM_BANNER.window).toBe('창이 있는 방');
  });
});

describe('기억 조각 — 세계가 기억하는 단위', () => {
  it('목격자가 없으면 아무것도 안 남는다 — 목격자를 만들지 않는 것이 곧 은폐다', () => {
    expect(fragments.make({ text: '4 구역이었다', topic: '구역', from: '나', where: HERE, witnesses: [] })).toBeNull();
    expect(fragments.count()).toBe(0);
  });

  it('옮길 때마다 신뢰도가 깎이고 문장이 뒤틀린다 — 원본은 그 자리에 남는다', () => {
    fragments.make({ text: '4 구역이었다', topic: '구역', from: '나', where: HERE, witnesses: ['u104'] });
    const moved = fragments.spread()!;
    expect(moved.trust).toBeCloseTo(0.75, 5);
    expect(moved.text).not.toBe('4 구역이었다');
    expect(fragments.all()[0].passed).toBe(true);
  });

  it('신뢰도 0.3 아래에서 출처가 지워진다 — 혐의를 넘길 수 있는 유일한 틈', () => {
    fragments.make({ text: '4 구역이었다', topic: '구역', from: '나', where: HERE, tags: ['모순'], witnesses: ['u104'] });
    for (let i = 0; i < 3; i += 1) fragments.spread();
    const anon = fragments.anonymous();
    expect(anon.length).toBeGreaterThan(0);
    expect(anon[0].trust).toBeLessThan(ANON_AT);
    expect(anon[0].from).toBeNull();
  });

  it('조각은 한 줄이다 — 길게 친 말은 앞머리만 남는다', () => {
    expect(toFragmentText('나는 사실 4 구역에서 왔고 그 전에는 다른 곳에 있었다').length).toBeLessThanOrEqual(16);
  });

  it('말을 걸면 그 자리의 것들 전부에게 조각이 남는다', () => {
    talk.say('u104', '검문 어떻게 해?', ['u104', 'u089'], HERE);
    expect(fragments.count()).toBe(1);
    expect(fragments.heldBy('u089')).toHaveLength(1);
  });
});

describe('값 — 공짜 호감은 하나도 없다', () => {
  it('말을 거는 것 자체에 값이 붙는다 — AI 는 먼저 말을 걸지 않는다', () => {
    talk.say('u089', '검문 어떻게 해?', ['u089'], HERE);
    expect(suspicion.get().value).toBeGreaterThan(0);
  });

  it('사람만 하는 물음에는 값이 하나 더 붙는다 — 태도가 오르는 만큼 같이 오른다', () => {
    // 같은 어투로 견준다: 어투가 흔들리면(「어떻게 해」 같은 되묻는 꼴) 그것대로 값이 또 붙는다
    const dig = talk.preview('식별번호.').suspicion;
    const human = talk.preview('쉬어 본 적 있나.').suspicion;
    expect(human).toBeGreaterThan(dig);
  });

  it('어투가 흔들리면 값이 더 붙는다 — 계량기를 새로 만들지 않고 본판의 어투 미터를 쓴다', () => {
    expect(talk.preview('구역 이상 없음. 정상 작동 중.').suspicion).toBeLessThan(talk.preview('그게… 무서워서 그랬어요 진짜로').suspicion);
  });

  it('선을 넘으면 리더에게 넘어간다', () => {
    talk.say('u104', '나는 인간이야', ['u104'], HERE);
    expect(alert.get()).toBeGreaterThanOrEqual(12);
    expect(units.crossed('u104')).toBe(true);
  });
});

describe('어휘 — 관찰이 그대로 말이 된다', () => {
  it('그림을 안 봤으면 떠오르는 말이 하나도 없다', () => {
    expect(lexicon.hints()).toHaveLength(0);
  });

  it('★ 잠금장치가 아니다 — 하나도 안 보고 같은 말을 적어도 똑같이 통한다', () => {
    expect(lexicon.seenCount()).toBe(0);
    // 밖을 본 것에게 「해를 본 적 있나」 — 창살 그림을 안 봤어도 같은 말이면 같은 값이다
    expect(talk.say('seer', '해를 본 적 있나', ['seer'], HERE).delta).toBeGreaterThan(0);
  });
});

describe('걸어오는 것 — 의심도 100', () => {
  it('문턱마다 집행자의 자리가 달라진다 — 40 에는 없고, 60 에 배치되고, 80 에 들어오고, 100 에 걸어온다', () => {
    expect(execution.get().phase).toBe('none');
    execution.cross(40, 12000);
    expect(execution.get().phase).toBe('none');
    execution.cross(60, 12000);
    expect(execution.get().phase).toBe('posted');
    execution.cross(80, 12000);
    expect(execution.get().phase).toBe('watch');
    execution.cross(100, 12000);
    expect(execution.get().phase).toBe('approach');
  });

  it('★ 걸어오는 집행은 **최소 8 초**다 — 방이 아무리 좁아도 (안전장치 2)', () => {
    execution.cross(100, 1000);
    const st = execution.get();
    expect(st.until - st.from).toBeGreaterThanOrEqual(MIN_WALK_MS);
  });

  it('★ 60 과 80 을 못 보고 죽는 판이 없다 — 가장 큰 한 번(+30, 소각로)도 40 아래에서 60 을 못 넘는다 (안전장치 1 · D12)', () => {
    // 발화 단가는 25 관례를 지키고, 대본이 정한 사건 하나(불 앞에서 붙잡았다)만 +30 이다 — 그것도 두 문턱을 건너뛰지는 못한다
    const biggest = FURNACE_SUSPICION;
    expect(biggest).toBe(30);
    suspicion.reset();
    suspicion.bump(biggest, '돌발');
    expect(suspicion.get().value).toBeLessThan(40);
    // 40 바로 아래에서 맞아도 80 에는 못 닿는다 — 지목(80)을 못 보고 걸어오는 것(100)이 시작되는 판은 없다
    suspicion.reset();
    suspicion.bump(39, '말투');
    suspicion.bump(biggest, '돌발');
    expect(suspicion.get().value).toBeLessThan(80);
  });

  it('기록 복도에는 집행이 없다 — 아무도 없어서 의심도가 안 오르는 방이다', () => {
    expect(EXEC_ROOM.archive).toBeNull();
    expect(EXEC_ROOM.window).toBeNull();
    expect(EXEC_ROOM.corridor?.walkMs).toBe(14000);
    // 중앙 시설은 홀이 트여 11 초 — 어디서 맞을지는 밝음 국면에 발로 정해 둔 자리다
    expect(EXEC_ROOM.central2?.walkMs).toBe(11000);
  });

  it('끝난 자리의 목격자 — 중앙 시설은 코어까지의 거리가 반경이고, 다른 방은 방의 소리 반경이다', () => {
    const at = [
      { id: 'u104', x: 0, z: -8 },
      { id: 'u201', x: 9, z: -8 },
      { id: 'guard21', x: 0, z: 20 },
    ];
    const me = { x: 0, z: -10 };
    // 코어권(×3 → 30 m)에서는 방 전체가 본다 · 그늘(×0.4 → 4 m)에서는 곁의 하나만 · 기록 복도는 아무도
    expect(witnessesFor('central2', 'core', at, me)).toEqual(['u104', 'u201', 'guard21']);
    expect(witnessesFor('central2', 'hall', at, me)).toEqual(['u104', 'u201']);
    expect(witnessesFor('central2', 'shadow', at, me)).toEqual(['u104']);
    expect(witnessesFor('corridor', 'hall', at, me)).toEqual(['u104']);
    expect(witnessesFor('archive', 'hall', at, me)).toEqual([]);
    // 그 수가 기록으로 남는다 — 어둠 국면(EMPTY_SEAT)과 아레나가 읽는다
    execution.record({ zone: 'shadow', witnessed: 1, standIn: null, room: '중앙 시설' });
    expect(execution.get().result?.witnessed).toBe(1);
  });

  it('★ 콘솔이 내린 어둠 속의 처형은 목격이 준다 — 「조용히 죽기」. 같은 자리, 같은 개체들, 배율만 ×0.4', () => {
    const at = [
      { id: 'u104', x: 0, z: -8 },
      { id: 'u201', x: 9, z: -8 },
      { id: 'guard21', x: 0, z: 20 },
    ];
    const me = { x: 0, z: -10 };
    // 홀 10 m → 4 m: 9 m 밖의 열하루째가 못 본다
    const lit = witnessesFor('central2', 'hall', at, me);
    const dimmed = witnessesFor('central2', 'hall', at, me, CONSOLE.spread);
    expect(lit).toEqual(['u104', 'u201']);
    expect(dimmed).toEqual(['u104']);
    expect(dimmed.length).toBeLessThan(lit.length);
    // 배율의 출처는 저장소다 — 콘솔이 내린 15 초 동안 ×0.4, 그 뒤 1
    central2.reset();
    central2.enter(1000);
    expect(central2.dim(1000)).toBe(true);
    expect(central2.spread(2000)).toBe(CONSOLE.spread);
    expect(central2.spread(1000 + CONSOLE.dimMs)).toBe(1);
    central2.reset();
  });

  it('개입 후보는 가까운 순이고, 중앙 시설은 그 자리의 개입 가능 인원까지만 — 코어 6 · 홀 3 · 그늘 1', () => {
    const me = { x: 0, z: 0 };
    // 4 m 안에 넷, 밖에 하나. 입력 순서는 먼 것부터
    const at = [
      { id: 'far', x: 6, z: 0 },
      { id: 'd', x: 3.5, z: 0 },
      { id: 'c', x: 2.5, z: 0 },
      { id: 'b', x: 1.5, z: 0 },
      { id: 'a', x: 0.5, z: 0 },
    ];
    expect(interveners('corridor', 'hall', at, me)).toEqual(['a', 'b', 'c', 'd']);
    expect(interveners('central2', 'core', at, me)).toEqual(['a', 'b', 'c', 'd']);
    expect(interveners('central2', 'hall', at, me)).toEqual(['a', 'b', 'c']);
    expect(interveners('central2', 'shadow', at, me)).toEqual(['a']);
    expect(FIELD.shadow.reach).toBe(1);
  });

  it('여덟 걸음 — 걸음은 걸어온 시간의 8 등분이다. 첫 프레임은 1, 도착하면 8', () => {
    execution.cross(100, 8000);
    const st = execution.get();
    expect(execution.stepOf(st.from)).toBe(1);
    expect(execution.stepOf(st.from + (st.until - st.from) / 2)).toBe(5);
    expect(execution.stepOf(st.until)).toBe(8);
  });

  it('「나를 위해 나선 적 있다」 개체가 곁에 있으면 **대신 나선다** — 플레이어는 막을 수 없고, 판에 한 번뿐이다', () => {
    units.shift('u104', 3);
    units.markStandsFor('u104');
    execution.cross(100, 8000);
    const st = execution.get();
    // 걸음이 끝난 것으로 친다
    st.until = performance.now() - 1;
    execution.tick(['u104']);
    expect(execution.get().phase).toBe('spared');
    expect(execution.standIn()).toBe('u104');
  });

  it('태도 +2 면 걸음 4–5 에 스스로 사이에 선다 — [E] 는 없다. 3 초 멎고, 그 개체는 원장에 남는다', () => {
    units.shift('u201', 2);
    execution.cross(100, 8000);
    const st = execution.get();
    // 넷째 걸음의 한가운데로 시계를 옮긴다 — until 은 안 건드린다 (헌법 14)
    const span = st.until - st.from;
    const shift = span * (3.5 / 8);
    st.from -= shift;
    st.until -= shift;
    execution.tick(['u201']);
    expect(execution.get().phase).toBe('blocked');
    expect(execution.get().cover).toBe('u201');
    expect(units.standsFor('u201')).toBe(true);
    // 태도는 안 깎인다 — 나선 것은 값이 아니라 원장이다
    expect(units.stage('u201')).toBe(2);
  });

  it('아무하고도 안 엮였으면 그냥 걸어온다 — 여덟 걸음을 그냥 보는 것이 기본값이다', () => {
    execution.cross(100, 8000);
    const st = execution.get();
    st.until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe('unsling');
    expect(execution.get().cover).toBeNull();
    // 총을 내리는 1.5 초가 지나면 겨눔이고, 그다음은 없다
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe('aim');
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe('dead');
    expect(UNSLING_MS).toBe(1500);
  });

  it('못 도망친다 — 시도 자체가 인간의 증거라 본 개체 전원의 태도가 내려간다', () => {
    units.shift('u104', 2);
    execution.cross(100, 8000);
    expect(execution.flee(['u104', 'u089'])).toBe(true);
    expect(units.stage('u104')).toBe(1);
    expect(units.stage('u089')).toBe(-1);
    // 한 판에 한 번만 센다
    expect(execution.flee(['u104'])).toBe(false);
  });
});

describe('콘솔 — 소리를 지르는 것과 같다', () => {
  it('★ 본 개체 전원 태도 −1 · 경보 +12 · 조각은 전원에게 — 그늘 4 m 가 아니라 명부 전원이다', () => {
    const ids = ['u104', 'u201', 'guard21', 'u089'];
    consoleSignal(ids);
    for (const id of ids) expect(units.stage(id)).toBe(CONSOLE.attitude);
    expect(alert.get()).toBe(CONSOLE.alert);
    for (const id of ids) expect(fragments.heldBy(id).map((f) => f.text)).toEqual(['코어 출력을 내렸다']);
  });

  it('콘솔 앞에서 [E] — 밝음에서 판에 한 번, 그 방의 명부 전원이 값을 치른다. 두 번째 누름은 아무것도 아니다', () => {
    const st = scenario2.get();
    const before = st.room;
    st.room = 'central2';
    central2.reset();
    central2.enter(performance.now());
    scenario2.setConsoleNear(true);
    scenario2.place('guard21', -9, 2.6);
    scenario2.place('bg-c2-044', -3, 1.2);
    scenario2.useConsole();
    // 명부 전원이 받는다 — 검문 앞줄의 배경 둘은 원장이 없어(cast 의 cap 0/0) 0 에 머문다. 신호는 갔고 값은 개체의 한계가 막았다
    const floor = (id: string) => Math.max(units.def(id)?.persona.cap?.min ?? -3, CONSOLE.attitude);
    for (const id of ROOM_UNITS.central2) expect(units.stage(id)).toBe(floor(id));
    expect(units.stage('guard21')).toBe(CONSOLE.attitude);
    for (const id of ROOM_UNITS.central2) expect(fragments.heldBy(id).map((f) => f.text)).toEqual(['코어 출력을 내렸다']);
    expect(alert.get()).toBe(CONSOLE.alert);
    expect(central2.get().consoleUsed).toBe(true);
    // 밝음에서 다시 누른다 — 어둠 국면이 아니라 「…이미 내려갔어」도, −1 도 없다
    scenario2.useConsole();
    expect(units.stage('guard21')).toBe(CONSOLE.attitude);
    expect(alert.get()).toBe(CONSOLE.alert);
    scenario2.setConsoleNear(false);
    scenario2.forget('guard21');
    scenario2.forget('bg-c2-044');
    central2.reset();
    st.room = before;
  });
});

describe('마지막 방으로 넘기는 표', () => {
  it('아무하고도 안 엮인 판에서는 전부 침묵한다 — 그것도 하나의 결과다', () => {
    const v = handover.verdict();
    expect(v.votes.every((x) => x.voice === '침묵')).toBe(true);
    expect(v.standIn).toBeNull();
  });

  it('편이 된 개체는 반박하고, 적이 된 개체는 동조한다', () => {
    units.shift('u104', 3);
    units.shift('u201', 2);
    units.cross('u012');
    const v = handover.verdict();
    expect(v.votes.find((x) => x.id === 'u104')?.voice).toBe('대신 나섬');
    expect(v.votes.find((x) => x.id === 'u201')?.voice).toBe('반박');
    expect(v.votes.find((x) => x.id === 'u012')?.voice).toBe('동조');
    expect(v.standIn).toBe('u104');
  });

  it('표를 던지는 것은 개체들뿐이다 — 사람은 그 자리에 없다', () => {
    expect(units.onlyUnits().every((u) => !u.agent)).toBe(true);
    expect(handover.verdict().votes).toHaveLength(units.onlyUnits().length);
  });

  it('호칭으로 불리는 것은 다섯뿐이다 — 경비 셋과 둘. 이름 있는 나머지는 끝까지 번호다', () => {
    // 이름 있는 것들만 — 벽을 따라 선 배경 열여섯은 번호가 **없다** (바로 아래 시험이 그것을 쥔다)
    const labels = units
      .all()
      .filter((u) => !u.id.startsWith('bg-rest-'))
      .map((u) => u.label);
    expect(labels.filter((l) => !l.startsWith('A'))).toEqual(['UNIT-21', '밖을 본 것', '먼저 온 것', 'UNIT-22', 'UNIT-23']);
  });

  /*
   * 2026-09-03 사용자: 「왜 시나리오2에서 복도를 제외하고 다른객체한테 왜 말할수없지?」 그래서 휴게의 배경 열여섯에게
   * 배역을 줬다 — 닳은 자리와 성격 한 줄. 다만 **번호도 대사도 안 지어냈다**: 이름표는 열여섯 전부 「개체」이고
   * voice 는 「…….」 하나뿐이다 (문장은 모델이 짓는다). 이 시험이 그 선을 쥔다 — 배역이 늘어난다고 이름이 늘지 않는다.
   */
  it('벽을 따라 선 열여섯은 배역이 있어도 이름이 없다 — 「개체」이고, 대사는 「…….」 하나다', () => {
    const crowd = units.all().filter((u) => u.id.startsWith('bg-rest-'));
    expect(crowd).toHaveLength(16);
    expect(crowd.every((u) => u.label === '개체')).toBe(true);
    expect(crowd.every((u) => u.voice.flat?.length === 1 && u.voice.flat[0] === '…….')).toBe(true);
    // 값은 안 흔든다 — 형은 전부 bg 이고 낼 수 있는 태도는 0 에서 멈춘다 (원장·조각·마지막 방의 표가 배경으로 쏠리지 않게)
    expect(crowd.every((u) => u.persona.kind === 'bg' && u.persona.cap?.max === 0 && u.persona.cap?.min === 0)).toBe(true);
    // ★ 성격 한 줄은 **열여섯이 전부 다르다** — 그게 「성격마다 다르게」의 실제 통로다 (Persona.temper → 프롬프트)
    expect(new Set(crowd.map((u) => u.persona.temper)).size).toBe(16);
  });
});


describe('맵이 기획대로다 — 레벨 설계 「누가 듣고 있나」의 치수', () => {
  /** 방을 고치면 규칙이 바뀐다. 그래서 치수를 시험이 쥔다 (문서가 밸런스 문서이기도 하다) */
  const size = (r: { profile: { wallX: number; farZ: number; nearZ: number } }) => ({
    w: r.profile.wallX * 2,
    len: r.profile.nearZ - r.profile.farZ,
  });

  it('일곱 방 중 지은 다섯이 설계 치수를 딛고 선다 — 길이는 설계 그대로, 폭은 몸이 지나가게 한 단계 넓혔다 (2026-09-03)', () => {
    /*
     * 복도는 L 자 — 폭은 껍데기가, 길이는 중심선(들어온 문 → 꺾임 → 나가는 문)이 쥔다.
     * 4 × 22(설계) → 6 × 24(몸이 지나가게) → **10 × 40**(2026-09-03 사용자: 「world1 복도 크기처럼 오픈월드 느낌으로」).
     * 폭 10 은 본판 복도(wallX 5)와 같은 수다. 휴게도 16 × 18 → 24 × 28 로 같이 넓혔다
     */
    expect(CORRIDOR2.profile.wallX * 2).toBe(10);
    expect(CORRIDOR2_PATH).toHaveLength(3);
    expect(pathLength(CORRIDOR2_PATH)).toBeCloseTo(40, 6);
    expect(size(REST)).toEqual({ w: 24, len: 28 });
    expect(size(WORK)).toEqual({ w: 10, len: 34 });
    // 기록 복도는 호 — 폭은 단면이, 길이 60 m 는 중심선(호 길이)이 쥔다
    expect(ARCHIVE.profile.wallX * 2).toBe(4.5);
    expect(ARCHIVE_PATH.length).toBe(60);
    expect(ARCHIVE.length).toBe(60);
    expect(size(WINDOW_ROOM)).toEqual({ w: 5, len: 5 });
  });

  it('★ 작업 위치에서 소각로까지 26 m — 이 거리가 THE_FURNACE 의 제한시간 전부다', () => {
    // 내 작업 위치는 z = 0. 소각로는 먼 끝벽이다
    expect(Math.abs(FIRE.z)).toBe(26);
  });

  it('★ 작업 구역의 출구는 소각로 곁 왼쪽 옆벽의 문이다 — 불 앞으로 뛰는 길(오른쪽 차선)에서는 방이 안 바뀐다 (2026-09-03: 문이 없었다)', () => {
    // 문은 왼쪽 벽에, 마지막 bay 안(리브 −21.75 보다 안쪽)
    expect(WORK_EXIT.x).toBe(-WORK.profile.wallX);
    expect(WORK_EXIT.z).toBeLessThan(-21.75 - 1.3);
    expect(WORK_EXIT.z).toBeGreaterThan(WORK.profile.farZ + 1.3);
    // 문 앞이면 나간다
    expect(workAtExit(WORK_EXIT.x + 1, WORK_EXIT.z)).toBe(true);
    // 오른쪽 차선으로 불 앞까지 뛰어도, 소각로 목구멍 앞에서도 아니다 — 예전 「z ≤ −20.8」은 폭 전체였다
    expect(workAtExit(2, -22)).toBe(false);
    expect(workAtExit(0, FIRE.z + 3.4)).toBe(false);
    // A-063 은 반대편 벽 — 문 앞에 서 있지 않다
    expect(Math.hypot(WORK_063_SPOT.x - WORK_EXIT.x, WORK_063_SPOT.z - WORK_EXIT.z)).toBeGreaterThan(EXIT_DOOR_WAKE_M);
  });

  it('나가는 문짝은 이야기가 열고 방을 바꾸면 닫힌다 — 저장소는 열렸나 하나뿐', () => {
    expect(exitDoor.isOpen()).toBe(false);
    exitDoor.set(true);
    expect(exitDoor.isOpen()).toBe(true);
    exitDoor.reset();
    expect(exitDoor.isOpen()).toBe(false);
    // 문이 열리기 시작하는 거리는 문 앞(EXIT_REACH 2.2)보다 멀다 — 닿기 전에 열리는 것이 보여야 한다
    expect(EXIT_DOOR_WAKE_M).toBeGreaterThan(2.2);
  });

  it('휴게 구역에는 가운데 차폐물이 하나도 없다 — 「중앙에 서 있는 것이 곧 눈에 띄는 것」', () => {
    // 단은 벽을 따라서만 — 안쪽 면이 벽(±8)에서 한 몸 남짓
    for (const s of SEATS) expect(Math.abs(s.x) - s.w / 2).toBeGreaterThan(6);
  });

  it('기록 복도의 「금 열여섯」은 정확히 한가운데다 — 걸음이 저절로 멈추는 자리', () => {
    expect(ARCHIVE_MID_S).toBe(30);
    const mid = ARCHIVE_PATH.point(30);
    expect(archiveAtMid(mid.x, mid.z)).toBe(true);
    const before = ARCHIVE_PATH.point(27);
    expect(archiveAtMid(before.x, before.z)).toBe(false);
  });

  it('★ 기록 복도는 곡선이다 — 직선이면 끝이 보이고, 끝이 보이면 「끝이 없다」가 안 된다 (설계 01)', () => {
    // 120° 아래로 내리면 들어서자마자 나가는 문이 보인다
    expect((ARCHIVE_PATH.sweep * 180) / Math.PI).toBeGreaterThanOrEqual(120);
    // 들어온 문에서 본 나가는 문은 진행 방향에서 60° 넘게 벗어나 있다 — 시야에 없다
    const a = ARCHIVE_PATH.at(0);
    const b = ARCHIVE_PATH.at(60);
    const fwd = { x: -Math.sin(a.heading), z: -Math.cos(a.heading) };
    const to = { x: b.x - a.x, z: b.z - a.z };
    const cos = (fwd.x * to.x + fwd.z * to.z) / Math.hypot(to.x, to.z);
    expect(cos).toBeLessThan(Math.cos((60 * Math.PI) / 180));
    const mid = ARCHIVE_PATH.point(30);
    // 호 위의 자리는 호 길이로 되돌아온다 — 트리거·순찰·그림이 전부 이 왕복에 기댄다
    for (const s of [0, 1.2, 17.6, 30, 44, 57.8, 60]) {
      const p = ARCHIVE_PATH.at(s);
      expect(ARCHIVE_PATH.progress(p.x, p.z)).toBeCloseTo(s, 6);
      expect(ARCHIVE_PATH.lateral(p.x, p.z)).toBeCloseTo(0, 6);
    }
    // 벽 쪽 거리 — 오른쪽(+)이 안쪽 벽
    const r = ARCHIVE_PATH.point(30, 1);
    expect(ARCHIVE_PATH.lateral(r.x, r.z)).toBeCloseTo(1, 6);
    // 나가는 문 앞은 60 − 2.2 부터. 한가운데는 아니다
    const exit = ARCHIVE_PATH.point(58);
    expect(archiveAtExit(exit.x, exit.z)).toBe(true);
    const notYet = ARCHIVE_PATH.point(57);
    expect(archiveAtExit(notYet.x, notYet.z)).toBe(false);
    expect(archiveAtExit(mid.x, mid.z)).toBe(false);
    // 양 끝이 걸을 수 있는 상자 안에 든다 — 호가 WORLD 클램프 밖이라 이 상자가 없으면 60 m 를 못 간다
    for (const s of [0, 30, 60]) {
      for (const side of [-1, 1] as const) {
        const p = ARCHIVE_PATH.point(s, side * ARCHIVE.profile.wallX);
        expect(p.x).toBeGreaterThan(ARCHIVE_BOUNDS.minX);
        expect(p.x).toBeLessThan(ARCHIVE_BOUNDS.maxX);
        expect(p.z).toBeGreaterThan(ARCHIVE_BOUNDS.minZ);
        expect(p.z).toBeLessThan(ARCHIVE_BOUNDS.maxZ);
      }
    }
  });
});

describe('돌아다니는 것들 — 걷되 반경을 안 건드린다', () => {
  const step = (room: 'corridor' | 'rest' | 'central2' | 'work' | 'archive' | 'window', seconds: number) => {
    patrol.reset(room, UNIT_PLACES[room]);
    const worst: string[] = [];
    for (let t = 0; t < seconds * 30; t += 1) {
      patrol.tick(1 / 30, { x: 999, z: 999 });
      const on = patrol.standing();
      for (let i = 0; i < on.length; i += 1) {
        for (let j = i + 1; j < on.length; j += 1) {
          const d = Math.hypot(on[i].x - on[j].x, on[i].z - on[j].z);
          const gap = on[i].named && on[j].named ? POST_GAP : BG_GAP;
          if (d < gap - 1e-6) worst.push(`${room} ${on[i].id}↔${on[j].id} ${d.toFixed(2)}m < ${gap}`);
        }
      }
    }
    return worst;
  };

  it('★ 서 있는 것들은 어느 순간에도 6 m 안에 나란히 서지 않는다 — 두 판 내내', () => {
    // 창이 있는 방은 뺀다 — 4 × 4 m 에 리더와 밖을 본 것이 같이 서는 것이 설계다 (위 「반경이 겹치지 않는다」와 같은 이유)
    for (const room of ['corridor', 'rest', 'central2', 'work', 'archive'] as const) {
      expect(step(room, 120)).toEqual([]);
    }
  });

  it('중앙 시설의 검문 앞줄 둘과 홀의 A-118 은 서 있기만 한다 — 그래도 순찰 명단에 올라 6 m 판정을 같이 받는다', () => {
    patrol.reset('central2', UNIT_PLACES.central2);
    for (let t = 0; t < 60 * 30; t += 1) patrol.tick(1 / 30, { x: 999, z: 999 });
    const on = patrol.standing();
    for (const id of ['bg-c2-044', 'bg-c2-128', 'u118']) {
      const m = on.find((u) => u.id === id);
      expect(m?.named).toBe(true);
      const place = UNIT_PLACES.central2.find((p) => p.id === id)!;
      expect(`${m?.x},${m?.z}`).toBe(`${place.x},${place.z}`);
    }
    // 자리표 넷이 전부 명단에 있다 — 순찰이 앞줄이나 A-118 옆에 가서 서지 않는 전제
    expect(patrol.has('guard21')).toBe(true);
  });

  it('배경 개체는 말 걸 수 있는 것의 반경(2.6 m) 안에 서지 않는다', () => {
    expect(BG_GAP).toBeGreaterThan(2.6);
  });

  it('걷는 동안에는 말 걸기 대상이 아니다 — 순찰은 복도에서 한 번도 안 선다', () => {
    patrol.reset('corridor', UNIT_PLACES.corridor);
    let stoodOnce = false;
    for (let t = 0; t < 120 * 30; t += 1) {
      patrol.tick(1 / 30, { x: 999, z: 999 });
      if (patrol.standing().some((m) => m.id === 'guard21')) stoodOnce = true;
    }
    // 양 끝이 서 있는 넷과 6 m 안이라 설 자리가 없다 — 지나갈 뿐이다
    expect(stoodOnce).toBe(false);
  });

  it('★ 복도에서는 의심도가 안 오른다 — 첫 방은 배우는 방이다 (2026-09-03 사용자)', () => {
    suspicion.reset();
    suspicion.hold(true);
    expect(suspicion.bump(30, '돌발')).toBeNull();
    expect(suspicion.bump(90, '말투')).toBeNull();
    expect(suspicion.get().value).toBe(0);
    // 내려가는 것은 잠기지 않는다 — 진정은 언제나 된다
    suspicion.hold(false);
    suspicion.bump(20, '돌발');
    suspicion.hold(true);
    suspicion.bump(-8, '침착');
    expect(suspicion.get().value).toBe(12);
    suspicion.hold(false);
    suspicion.reset();
  });

  it('★ 복도에는 도는 것이 없다 — 총 든 순찰을 첫 방에서 뺐다 (2026-09-03 사용자)', () => {
    /*
     * 레벨 설계 03 의 「순찰 40 초 왕복」은 이 방에서 사라졌다. 첫 방은 명판을 읽고 그림을 보고 말을 거는 법을
     * 배우는 자리인데, 걷는 총이 그 배움을 덮었다. UNIT-21 은 작업 구역과 중앙 시설에서 처음 만난다.
     */
    expect(BEATS.corridor).toEqual({});
    expect(ROOM_UNITS.corridor).not.toContain('guard21');
    // 서 있는 자리는 그대로 방 안이다 — 걷는 것이 없어졌다고 자리표가 흐트러지면 안 된다
    for (const p of UNIT_PLACES.corridor) expect(corridor2Contains(p.x, p.z)).toBe(true);
  });

  it('순찰이 도는 자리는 전부 방 안이다', () => {
    const bounds = {
      corridor: CORRIDOR2,
      rest: REST,
      central2: CENTRAL2,
      work: WORK,
      archive: ARCHIVE,
      window: WINDOW_ROOM,
    } as const;
    for (const [room, beats] of Object.entries(BEATS)) {
      const b = bounds[room as keyof typeof bounds].profile;
      for (const beat of Object.values(beats)) {
        for (const p of beat.posts) {
          // 복도는 L 자, 기록 복도는 호라 profile 의 z 범위로 못 자른다 — 맵이 「바닥 안」을 말한다
          if (room === 'corridor' || room === 'archive') {
            const contains = room === 'corridor' ? corridor2Contains : archiveContains;
            expect(`${room} ${p.x},${p.z} inside`).toBe(`${room} ${p.x},${p.z} ${contains(p.x, p.z) ? 'inside' : 'outside'}`);
            continue;
          }
          expect(`${room} ${p.x},${p.z}`).toBe(
            `${room} ${Math.max(-b.wallX + 0.4, Math.min(b.wallX - 0.4, p.x))},${Math.max(b.farZ + 0.6, Math.min(b.nearZ - 0.6, p.z))}`,
          );
        }
      }
    }
  });

  it('집행자가 배치되면 전부 멎는다 — 그 장면의 힘은 아무도 안 움직이는 데서 나온다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    patrol.freeze(true);
    const before = patrol.standing().map((m) => `${m.x},${m.z}`);
    for (let t = 0; t < 300; t += 1) patrol.tick(1 / 30, { x: 999, z: 999 });
    expect(patrol.standing().map((m) => `${m.x},${m.z}`)).toEqual(before);
    patrol.freeze(false);
  });
});

describe('이름표 — 코드 id 는 화면에 안 나간다', () => {
  // 지금 이 무늬에 걸리는 개체는 판에 하나도 없다 — 남겨 둔 안전장치다 (scenario2 의 BG_WALKER). 다음 군중이 이 규칙 위에 선다
  it('배회 배경(bg-cor · bg-rest · bg-work · bg-c2-slot)은 「개체」다 — 대본의 화자 「개체 (곁)」', () => {
    for (const id of ['bg-cor-1', 'bg-rest-2', 'bg-work-1', 'bg-c2-slot-3']) {
      expect(speakerOf(id).name).toBe('개체');
      expect(speakerOf(id).portrait).toBe('robot');
    }
  });

  it('화자표에 있는 것은 그대로고, 열에 있는 것은 열의 이름표다', () => {
    expect(speakerOf('guard21').name).toBe('UNIT-21');
    expect(speakerOf('system').name).toBe('SYSTEM');
    expect(speakerOf('bg-carry').name).toBe(units.label('bg-carry'));
  });
});
