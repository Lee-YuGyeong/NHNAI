/**
 * 방 하나에 얹히는 것들 — 개체와 벽과 트리거. WorldScene 의 children 으로 들어간다.
 *
 * 배경(맵)은 world2/map 이 그리고, 이야기는 scenario2.ts 가, 생김새는 cast.ts + wear.ts 가 쥔다.
 * **여기는 그것들을 잇기만 한다** — 어느 방에 누가 어디에 서 있고, 어느 벽을 들여다볼 수 있는가.
 *
 * 자리를 코드에 박아 둔 이유: 이 시나리오의 개체는 순찰하지 않는다. **서 있는 자리가 곧 그 개체가 누구인지다** —
 * 벽화 앞에 오래 서 있는 것과 문만 보는 것과 등을 벽에 붙인 것은 말을 걸기 전에 이미 다른 것이다 (cast 의 stance).
 * 기획서가 「자세는 10m 밖에서 읽는 정보」라고 못 박은 자리가 여기다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import * as THREE from 'three';

import { MAPS2 } from '@/world2/map';
import { ARCHIVE_PATH } from '@/world2/map/archive';
import { CENTRAL2_CORE, CENTRAL2_DOORS, CHECK_SPOTS } from '@/world2/map/central2';
import { CORRIDOR2_EXIT } from '@/world2/map/corridor';
import { REST_DOZE_SPOT, REST_WEST_WALL } from '@/world2/map/rest';
import { WINDOW, WINDOW_ROOM, WINDOW_SEER_SPOT, WINDOW_STAND } from '@/world2/map/window';
import { WORK, WORK_012_SPOT, WORK_063_SPOT, WORK_MEMORIAL } from '@/world2/map/work';

import { ArchiveWall } from './ArchiveWall';
import { attitude } from './attitude';
import { Console2 } from './Console2';
import { CoreLight } from './CoreLight';
import { Executioner } from './Executioner';
import { MURAL_OF, Murals } from './Murals';
import { Scrawl } from './Scrawl';
import { execution } from './execution';
import { furnace } from './furnace';
import { CENTRAL2_HALL_POST, patrol } from './patrol';
import type { Look } from './cast';
import { Unit, type UnitPlace } from './Unit';
import { scenario2, type Room } from './scenario2';

/*
 * ★ 배회하던 이름 없는 여섯(bg-cor-1·2 · bg-rest-1·2 · bg-work-1·2)은 걷어낸 그대로다
 *   (2026-09-03 사용자: 「계획서에 없던 로봇 개체는 일단 없애줘」). 대본 · 배역표 · 레벨 설계가 이름을 적은 것만 선다.
 *
 * ★ 다만 레벨 설계의 「개체가 스무 남짓」(휴게)은 **채웠다** — 벽을 따라 선 열여섯(REST_CROWD)이 그것이다.
 *   그리고 2026-09-03 에 그 열여섯에게 **배역이 생겼다** (사용자: 「왜 시나리오2에서 복도를 제외하고 다른객체한테
 *   왜 말할수없지?」 — cast.ts 의 restCrowd). 배역이 생겼다는 것은 셋을 뜻한다:
 *     ① 몸을 여기서 안 만든다 — look 을 안 넘기면 Unit 이 units.def(id) 에서 가져온다 (Unit.tsx 의 `def?.look ?? place.look`)
 *     ② **말이 걸린다** — 다만 명부(ROOM_UNITS)가 아니라 scenario2 의 addressable 이 이것들을 든다
 *     ③ 그래도 이름과 대사는 안 지어냈다 — 이름표는 「개체」, voice 는 「…….」 하나이고 문장은 모델이 짓는다
 */

/** 헤딩은 「그 점을 본다」로만 적는다 — 각도를 손으로 적으면 방을 옮길 때마다 하나씩 어긋난다 */
const look = (fromX: number, fromZ: number, toX: number, toZ: number) => Math.atan2(toX - fromX, toZ - fromZ);

/** 창이 걸린 벽면 — 리더도 밖을 본 것도 이쪽을 본다 */
const WIN_X = WINDOW_ROOM.profile.wallX;
/** 중앙 시설의 문 ① — 들어온 문. 검문 앞줄은 이 문을 본다: 들어서는 것마다 번호를 물을 것들이다 */
const DOOR1 = CENTRAL2_DOORS.d1;

/**
 * 서 있는 자리 — **서로 6 m 이상 떼어 놓는다** (레벨 설계 05: 「한 개체에게 건 말이 옆으로 안 새게」).
 * 말 걸기 반경이 2.6 m 라 그 두 배 이상이면 반경이 안 겹치고, 그래야 내가 누구에게 말한 건지가 판에 하나로 정해진다.
 * 시험(tests/features/world2)이 이 간격을 지킨다 — 자리를 옮기면 거기서 걸린다.
 *
 * ★ 밀도 규칙 (2026-09-03, 사람이 지나갈 수 있어야 한다): 서 있는 개체의 중심은 벽에서 ≥ 0.75 m, 서로 ≥ 6 m, 스폰에서 ≥ 2.4 m.
 *   걷는 선은 서로 ≥ 1.4 m(엿듣기 쌍은 정확히 1.4), 방의 문→문 직선에서 비켜 둔다(예외: 휴게의 A-201 — 가운데가 그 개체의 자리다).
 *   걷는 것의 첫 자리는 스폰에서 ≥ 2.4 m 이고 첫 걸음은 스폰에서 멀어지는 쪽, 배경의 꼭짓점은 스폰에서 ≥ 1.6 m.
 *   벽·상자 안으로는 patrol 이 못 딛게 막는다(solid) — 자리표는 그 밖에서 사람과 개체 둘이 한 z 에 있어도 폭이 남게 놓는다.
 */
/**
 * 대체 개체의 몸 — 열의 어느 것도 아니다(cast.ts 에 없다). 마모가 얕은 새 몸이라 「이름을 모르는 게」가 눈으로도 맞는다.
 * 몸은 wear.bodyOf 가 wear 값으로 빌려 온다 — 그래서 asset 을 안 적는다.
 */
const SUB_LOOK: Look = { wear: 'whole', grade: 1, repair: 'none', face: 'stock', stance: 'idle' };

/**
 * 휴게 구역의 배경 열여섯 — 벽을 따라 선다 (가운데는 비워 둔다).
 * 서쪽·동쪽 단 앞에 여섯씩, 먼 끝 벽에 넷. 서로 3.6 m, 이름 있는 다섯과 3.2 m 넘게 떨어져 있다.
 *
 * ★ **몸은 이제 여기서 안 만든다** (2026-09-03). 예전에는 이 파일이 닳은 자리 여섯 벌(CROWD_WEAR)을 들고
 *   자리마다 돌려 줬는데, 그 열여섯에게 배역이 생기면서(cast.ts 의 restCrowd) 외형이 **두 군데**에 적히게 됐다.
 *   이 파일에 남으면 배역표의 look 과 화면의 look 이 조용히 갈라진다 — 「외형표와 성격표는 한 벌이어야 한다」는
 *   cast.ts 의 전제가 깨지는 자리다. 그래서 자리(x · z · 보는 방향)만 여기 두고 몸은 배역표가 든다:
 *   `look` 을 안 넘기면 Unit 이 units.def(id) 에서 가져온다.
 */
/** 벽을 따라선 열여섯 자리 — [x, z, 보는 방향]. 벽 쪽 것은 방 안을, 먼 끝의 넷은 들어온 쪽을 본다 */
const CROWD_SPOTS: readonly (readonly [number, number, number])[] = [
  [-9.8, -11.0, Math.PI / 2], [-9.8, -7.4, Math.PI / 2], [-9.8, -3.8, Math.PI / 2],
  [-9.8, -0.2, Math.PI / 2], [-9.8, 3.4, Math.PI / 2], [-9.8, 7.0, Math.PI / 2],
  [9.8, -11.0, -Math.PI / 2], [9.8, -7.4, -Math.PI / 2], [9.8, -3.8, -Math.PI / 2],
  [9.8, -0.2, -Math.PI / 2], [9.8, 3.4, -Math.PI / 2], [9.8, 7.0, -Math.PI / 2],
  [-5.2, -14.2, 0], [-1.6, -14.2, 0], [2.0, -14.2, 0], [5.6, -14.2, 0],
];
/** id 는 배역표(cast.ts 의 restCrowd)가 쓰는 것과 **글자 그대로** 같아야 units.def 가 붙는다 */
const REST_CROWD: readonly UnitPlace[] = CROWD_SPOTS.map(([x, z, heading], i) => ({
  id: `bg-rest-${i + 1}`,
  x,
  z,
  heading,
}));

const PLACES: Record<Room, readonly UnitPlace[]> = {
  /*
   * 복도 10 × 40 m · L 자 — 서 있는 넷(6 m 남짓씩, 꺾임을 돌아). 그 중 하나는 **사람**이고 겉으로는 구별이 안 된다.
   * 다섯째는 서 있지 않는다: 순찰하는 UNIT-21 이고, 자리가 없어서 **멈추지 않는다** (patrol.ts).
   * 서 있는 넷은 벽에서 0.75~1.0 비켜 선다 (방이 넓어져 서로 10 m 넘게 떨어졌다) — 안 그러면 순찰이 그 앞에서 영영 멎는다(YIELD).
   */
  corridor: [
    // 그냥 서 있다 (진입부, 단말 곁). 스폰(0, 2.4)에서 4.3 — 들어서면 왼쪽 벽에 붙은 것이 먼저 보인다
    { id: 'ally-timid', x: -4.25, z: 3.0, heading: Math.PI },
    // 자기가 그린 벽 곁 (carry) — 첫 다리 오른쪽 벽. 그림(z −5.7~−4.1)과 다음 장(−3.2~−2.1) 사이의 빈 벽 앞에서 비스듬히 제 그림을 본다:
    // 그림 정중앙 앞에 서면 몸이 그림을 가려 정면 2.5 m 에서 읽히지 않는다. z 는 몸(반지름 0.42)이 두 그림의 폭 밖에 드는 자리.
    // 손끝에 안료가 남아 있다
    { id: 'u137', x: 4.25, z: -5.6, heading: look(4.25, -5.6, MURAL_OF.carry.x, MURAL_OF.carry.z) },
    // 벽화 danger 앞 — 꺾임을 돌아 둘째 다리 안쪽 벽(z −7)에서 1 m. 뒤에서 보면 어깨가 굽은 게 먼저 보인다
    { id: 'u104', x: 12.75, z: -13.0, heading: look(12.75, -13.0, MURAL_OF.danger.x, MURAL_OF.danger.z) },
    // 꺾임의 바깥 귀퉁이(서·북 벽에서 0.75)에서 나가는 문만 본다. 되묻는 법이 없는 것
    { id: 'u089', x: -4.25, z: -21.25, heading: look(-4.25, -21.25, CORRIDOR2_EXIT.x, CORRIDOR2_EXIT.z) },
    /*
     * ★ 총 든 것은 여기 없다 (2026-09-03 사용자). 레벨 설계 03 의 「순찰 40 초 왕복」은 이 방에서 뺐다 —
     * 첫 방은 읽고 묻는 법을 배우는 자리라 걷는 총이 화면에 있으면 그 배움이 안 된다. UNIT-21 은 안쪽에서 처음 만난다
     */
    // 배회하던 둘(D6)이 있던 자리 — 이름이 기획서에 없어 걷어냈다. 엿듣기(overhear.ts)가 기대던 쌍이 이것이었다
  ],
  /*
   * 휴게 구역 24 × 28 m — **네 귀퉁이와 한가운데**. 귀퉁이 넷은 벽에서 1 m 안팎, 서로 12 m 넘게.
   * 가운데를 잡은 것이 열하루째인 개체다: 「중앙에 서 있는 것이 곧 눈에 띄는 것」인데 그걸 아직 모른다.
   */
  rest: [
    /*
     * 자는 것은 **갈망형 A-104** 다 — 쉬고 싶어 하는 개체가 쉬는 방에 오면 한 번은 눕는다. 가장 안쪽 구석, 벽 단이 꺾이는 모서리에 머리를 박고
     * (레벨 설계 05: 「일부러 찾아가야 보이는 자리」 · 휴게 배역 A-104 · A-201). 복도의 그림 앞에도 서 있던 그 개체다 — 방을 옮겨 온다(원칙 6).
     * 손끝(A-118)은 여기 없다: 그 카드가 「쉬지 못한다」고 적었고 길이 복도 → 중앙 → 줄이라, 중앙 시설 홀에 서 있다 (아래 central2)
     */
    { id: 'u104', x: REST_DOZE_SPOT.x, z: REST_DOZE_SPOT.z, heading: look(REST_DOZE_SPOT.x, REST_DOZE_SPOT.z, -8, -10), pose: 'doze' },
    // 문만 본다 (나가는 문 쪽)
    { id: 'u089', x: 9.5, z: -15.0, heading: Math.PI },
    // 밖을 본 것 — 아무것도 없는 서쪽 벽에 코를 박고 선다 (레벨 설계 04: 「저긴 벽인데」라고 생각하게). 그 벽은 rest.tsx 가 일부러 비워 뒀다
    { id: 'seer', x: REST_WEST_WALL.x, z: REST_WEST_WALL.z, heading: -Math.PI / 2 },
    // 그냥 서 있는 하나 — 스폰(0, 9.6)에서 9.6
    { id: 'ally-hard', x: 9.5, z: 11.0, heading: Math.PI },
    // 배치된 지 열하루. 가운뎃줄을 서성인다 — 자리는 patrol 이 준다
    { id: 'u201', x: 0, z: -6.0 },
    /*
     * 그리고 **배경 열여섯** — 레벨 설계의 「스무 개체가 전부 본다」를 채운다 (2026-09-03 사용자: 「로봇은 얼마 없어」).
     * 한때 「이름 없는 것을 지어내느니 비워 둔다」로 걷어냈는데, 그 결과가 24 × 28 m 홀에 다섯이었다.
     *
     * ★ **이제 말이 걸린다** (2026-09-03 사용자: 「복도처럼 다른구역에서도 말을 걸수있게」). 그래도
     *   방 명부(ROOM_UNITS)에는 **안 올린다** — 명부는 「누가 그 값을 치르나」의 목록이고(목격자 · 개입 · 도주 ·
     *   대신 나섬 · 조각), 배경이 끼면 휴게에서 한 마디의 조각 대상이 5 에서 21 이 되고 patrol 의 named 가 켜져
     *   자리 간격이 3.2 → 6 m 로 뛰어 이 3.6 m 자리표가 통째로 위반이 된다. 말이 걸리는 목록은 scenario2 의
     *   **addressable** 이 따로 든다 (명부 + CROWD_UNITS). 그 갈라짐이 이 변경의 뼈대다.
     * ★ 이름도 대사도 안 지어낸다 — 이름표는 「개체」이고 voice 는 「…….」 하나다 (문장은 모델이 짓는다).
     * ★ 자리는 **벽을 따라서만**: 가운데가 비어 있어야 「중앙에 서 있는 것이 곧 눈에 띄는 것」이 성립한다 (레벨 설계 03).
     *   그중 먼 끝 벽의 양 끝 둘(bg-rest-13 · 16)만 이따금 벽을 떠난다 — 걸음표는 patrol 의 BEATS.rest 에 있다.
     * ★ 몸은 배역표가 든다. wear.bodyOf 가 닳은 자리로 GLB 를 빌려 오므로 GLB 는 한 장도 안 늘어난다.
     */
    ...REST_CROWD,
  ],
  /*
   * 작업 구역 10 × 34 m — 라인 한 방향, 끝이 소각로. 내 작업 위치(z = 0)에서 불까지 26 m.
   * 긴 방이라 이 방이 가장 많이 움직인다: 순찰 하나가 방 전체를 오가고 배경 둘이 라인을 따라 나른다.
   */
  work: [
    // 라인 최선두 — 벨트 머리의 덮개 옆, 가장 무거운 것이 처음 올라오는 자리. 벨트를 본다
    { id: 'u012', x: WORK_012_SPOT.x, z: WORK_012_SPOT.z, heading: look(WORK_012_SPOT.x, WORK_012_SPOT.z, -2.3, WORK_012_SPOT.z - 0.2) },
    // 소각로 목구멍 바로 옆 벽에 등을 붙이고 라인 위쪽을 본다. 플레이어가 오른쪽 통로로 뛰면 그 앞을 지나간다
    { id: 'u063', x: WORK_063_SPOT.x, z: WORK_063_SPOT.z, heading: look(WORK_063_SPOT.x, WORK_063_SPOT.z, 1.4, -14) },
    /*
     * 열하루째 — 라인 가운데 서서 **순서를 기다린다.** 소각로가 부르면(furnace) 불 쪽으로 걷는 것이 이 개체다 (v8 THE_FURNACE):
     * 이름도 사연도 없던 배경이 하던 걸음을, 휴게 구역에서 말을 걸어 본 그 개체가 한다. 붙잡으면 그 자리에 선다 (Unit.tsx)
     */
    { id: 'u201', x: 0.6, z: -15, heading: Math.PI, pose: 'fire' },
    // 하루 종일 걷는다 — 자리는 patrol 이 준다. 첫 자리는 라인 머리에서 여섯 걸음 밖(스폰 (2, 4.4)에서 4.0), 선은 기다리는 A-201 에서 1.8 밖(BEATS.work)
    { id: 'guard21', x: 2.4, z: 0.4 },
    /*
     * 대체 개체 — **이름이 없다.** 열하루째를 붙잡으면 라인은 안 멈추고 다른 것이 들어간다 (v8 THE_FURNACE:
     * 「투입 취소. 대체 개체 배정.」 · 나 (속마음) 「이름을 모르는 게 들어갔다.」). 대본이 부르기 전에는 몸이 안 보이고
     * (Unit 의 unseen), 명부에도 없다 — 말을 걸 수도, 목격자가 될 수도 없는 **몸 하나**다.
     */
    { id: 'sub', x: 0.6, z: -9.5, heading: Math.PI, pose: 'fire-sub', look: SUB_LOOK },
    /*
     * ★ 「대체 개체」(v8 THE_FURNACE: 「투입 취소. 대체 개체 배정.」)의 **몸이 지금 없다** — 그 걸음을 걷던 bg-work-1 이 걷어낸 것 중 하나다.
     *   SYSTEM 의 그 줄은 그대로 나가고 벽의 금도 그대로 열여섯이 되지만(furnace), 대신 걸어 들어가는 것이 화면에 안 보인다.
     *   배선(furnace.substitute → scenario2.substituteWalkActive → Unit 의 pose 'fire-sub')은 살려 뒀다: 이름 있는 몸을 붙이면 그날로 다시 걷는다
     */
  ],
  // 자기 그림이 수백 장 걸린 벽 앞(바깥 벽 쪽 1.1, 벽에서 1.15). 이 방에 대사는 없지만 이 개체는 여기 있다 — 그리고 오간다
  archive: [{ id: 'u137', ...ARCHIVE_PATH.point(22, -1.1) }],
  /*
   * 5 × 5 m. 리더와 나 — 그리고 밖을 본 것. 물러설 데가 없어야 30 초짜리 정적이 값을 한다.
   * 둘은 3.4 m 다: 6 m 규칙이 이 방에서만 **일부러** 깨진다 — 창을 찾은 것이 밖을 본 것이라(대본 v8 WINDOW_SEER) 둘 다 명부에 있고
   * 말을 걸 수 있다. 시험(scenario2.test)이 이 방을 6 m 검사에서만 빼 둔 이유가 그것이다. 휴게에서 빈 벽을 보던 자세 그대로다 (window.tsx).
   */
  window: [
    { id: 'leader', x: WINDOW_STAND.x, z: WINDOW_STAND.z, heading: look(WINDOW_STAND.x, WINDOW_STAND.z, WIN_X, WINDOW.z) },
    { id: 'seer', x: WINDOW_SEER_SPOT.x, z: WINDOW_SEER_SPOT.z, heading: look(WINDOW_SEER_SPOT.x, WINDOW_SEER_SPOT.z, WIN_X, WINDOW.z) },
  ],
  /*
   * 중앙 시설 지름 26 m — 고정은 넷이다: 순찰과 검문 앞줄 둘, 그리고 홀의 손끝(A-118). 앞줄은 벽 쪽 검문 지점(CHECK_SPOTS)에 서서 문 ① 을 본다 —
   * 들어서는 것마다 번호를 물을 것들이라 문을 보고 있어야 「저기가 검문이다」가 대사 없이 읽힌다 (레벨 설계 05).
   * 재회 슬롯 둘 · 씨앗 슬롯 둘은 여기 없다: 그 자리에 누가 서는지는 앞 두 방에서 정해지고, scenario2 가 `extra` 로 넘긴다 (아래).
   */
  central2: [
    { id: 'bg-c2-044', x: CHECK_SPOTS[0].x, z: CHECK_SPOTS[0].z, heading: look(CHECK_SPOTS[0].x, CHECK_SPOTS[0].z, DOOR1.x, DOOR1.z) },
    { id: 'bg-c2-128', x: CHECK_SPOTS[1].x, z: CHECK_SPOTS[1].z, heading: look(CHECK_SPOTS[1].x, CHECK_SPOTS[1].z, DOOR1.x, DOOR1.z) },
    // 문 ① 안쪽 벽을 따라 돈다 — 자리는 patrol 이 준다 (BEATS.central2)
    { id: 'guard21', x: -9, z: 2.6 },
    /*
     * 손끝이 닳은 것 — 휴게에서 못 쉬고 먼저 와서 홀 −x 쪽에 서서 코어를 본다. 줄에 설 차례를 기다리는 몸이라 벽 그늘도 코어권도 아닌 홀이다:
     * 검문 앞줄에서 9 m 는 「줄 뒤」로 읽히고, 재회·씨앗 슬롯에서 3.2 m 밖이라 거기 세워질 것들과 반경이 안 겹친다 (자리는 patrol.CENTRAL2_HALL_POST)
     */
    { id: 'u118', x: CENTRAL2_HALL_POST.x, z: CENTRAL2_HALL_POST.z, heading: look(CENTRAL2_HALL_POST.x, CENTRAL2_HALL_POST.z, CENTRAL2_CORE.x, CENTRAL2_CORE.z) },
    /*
     * 홀의 배경 다섯 (2026-09-03 사용자: 「중앙 시설에도 로봇이 많아야」) — 코어 **뒤쪽** 반(z −14 ~ −20.5)에 선다. 앞쪽 반은 검문 앞줄 · 재회 · 씨앗 · 순찰 자리가 이미 쓴다.
     * 서 있는 것끼리 **전부 6 m 밖**(말 반경이 안 겹친다 — 시험이 쥔다): 뒷줄 셋(x −9 · −1.5 · 6.5)과 그 앞 둘(x ±4.5). 전부 코어를 본다 — 이 방에서 볼 것은 그것뿐이다
     */
    ...[
      { id: 'bg-c2-061', x: -4.5, z: -14.0 },
      { id: 'bg-c2-152', x: 4.5, z: -14.0 },
      { id: 'bg-c2-093', x: -9.0, z: -19.5 },
      { id: 'bg-c2-207', x: -1.5, z: -19.5 },
      { id: 'bg-c2-215', x: 6.5, z: -20.5 },
    ].map((p) => ({ ...p, heading: look(p.x, p.z, CENTRAL2_CORE.x, CENTRAL2_CORE.z) })),
    /* 옆문 ③ ④ 의 총 든 개체 둘 — 문(z −10.5) 곁에 서서 홀을 본다. 손끝(u118 · z −6.8)과 6 m 를 두려고 문보다 2.5 m 뒤다. 락다운에 여기서 내려온다 (scenario2 HOLD_CHECKS) */
    { id: 'guard22', x: -11.6, z: -13.0, heading: look(-11.6, -13.0, CENTRAL2_CORE.x, CENTRAL2_CORE.z) },
    { id: 'guard23', x: 11.6, z: -13.0, heading: look(11.6, -13.0, CENTRAL2_CORE.x, CENTRAL2_CORE.z) },
  ],
};

/** 시험이 읽는다 — 자리표를 두 군데 적지 않으려고 내보낸다 */
export const UNIT_PLACES = PLACES;

/**
 * 개체의 발이 벽·상자 안인가 — 그 방의 resolveColliders 가 발을 밀어내면 「안」이다 (patrol.reset 의 solid).
 * 발 높이를 −1 로 준다: 사람은 낮은 턱(STEP_UP 0.55)을 넘지만 개체는 바닥 높이를 모르고 걸으므로 벨트·좌대도 벽으로 친다.
 * 밀려난 거리 0.03 m — resolveCollisions 는 겹친 만큼만 밀어내니 그보다 작으면 스친 것이다
 */
const SOLID_EPS = 0.03;
function solidOf(room: Room): (x: number, z: number) => boolean {
  const resolve = MAPS2[room].resolveColliders;
  const foot = new THREE.Vector3();
  return (x, z) => {
    foot.set(x, -1, z);
    resolve(foot, -1);
    return Math.hypot(foot.x - x, foot.z - z) > SOLID_EPS;
  };
}

/**
 * 작업 구역 측벽의 memorial — 복도에서 열다섯을 센 그 그림. 소각로가 끝나면(막았든 안 막았든) 금이 **열여섯**이 된다 (D16):
 * 누가 그었는지는 안 보여 준다. 방(work.tsx)은 자리만 주고 수는 여기서 센다 — Room2Scene 이 저장소 알림마다 다시 그리므로
 * furnace 가 풀리는 순간의 대사가 곧 이 그림을 다시 그리는 신호다. 기록 복도 한가운데의 열여섯(ArchiveWall)과 같은 판이다
 */
function WorkMemorial() {
  const sixteen = furnace.resolved();
  return (
    <group name="작업 구역의 그림">
      <Scrawl
        d={{ kind: 'memorial', side: WORK_MEMORIAL.side, z: WORK_MEMORIAL.z, y: WORK_MEMORIAL.y, w: WORK_MEMORIAL.w, tilt: 0.02 }}
        seed={11}
        wallX={WORK.profile.wallX}
        lift={WORK_MEMORIAL.lift}
        ticks={sixteen ? 16 : 15}
      />
    </group>
  );
}

/** 내 자리를 프레임마다 이야기에 넘긴다 — 곁의 개체·가만히 있기·나가는 자리가 전부 여기서 갈린다 */
function Tracker({ room }: { room: Room }) {
  const camera = useThree((s) => s.camera);
  const last = useRef({ x: 0, z: 0, set: false });
  const fwd = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const { x, z } = camera.position;
    const l = last.current;
    // 「움직이는 중인가」는 입력이 아니라 **실제로 나아간 거리**로 센다. 벽에 대고 눌러도 가만히 있는 것은 가만히 있는 것이다
    const moved = l.set ? Math.hypot(x - l.x, z - l.z) : 0;
    l.x = x;
    l.z = z;
    l.set = true;
    /*
     * 보는 방향 — Unit·patrol 의 heading 규약으로 넘긴다: θ 가 보는 방향은 (sin θ, cos θ). 카메라의 yaw(WorldScene: atan2(−dx, −dz))와는
     * 부호가 반대라 각을 그대로 넘기면 어긋난다 — 정면 벡터에서 다시 잰다. 중앙 시설의 굉음(PROTOCOL)이 이걸로 「돌아봤나」를 본다.
     */
    camera.getWorldDirection(fwd.current);
    const yaw = Math.atan2(fwd.current.x, fwd.current.z);
    /*
     * 돌아다니는 것들을 먼저 옮기고 그다음에 이야기에 넘긴다 — 순서가 반대면 곁의 상대가 한 프레임 늦는다.
     * 집행자가 배치된 뒤로는 **전부 멎는다**: 그 장면의 힘은 아무도 안 움직이는 데서 나온다 (execution.ts).
     */
    patrol.freeze(execution.get().phase !== 'none');
    patrol.tick(dt, { x, z });
    // 태도는 순찰이 준 자리 **위에** 얹는다 — patrol 뒤, 이야기 앞. 집행·물음 중의 정지는 attitude 가 스스로 본다 (attitude.ts 머리말)
    attitude.tick(dt, { x, z });
    // 어느 방의 카메라인지도 넘긴다 — 방을 옮기는 프레임에 앞 방의 Tracker 가 한 번 더 돌면 이야기는 그 자리를 버린다 (scenario2.track 의 ★)
    scenario2.track(x, z, dt, moved > dt * 0.25, yaw, room);
  });

  return null;
}


/**
 * 저장소가 알릴 때마다 다시 그린다 — Hud2 와 같은 이유로 useSyncExternalStore 를 안 쓴다:
 * scenario2 는 같은 객체를 고쳐 쓰므로 스냅숏 비교가 늘 같다고 나온다.
 */
function useStore(subscribe: (fn: () => void) => () => void): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribe(bump), [subscribe]);
}

export function Room2Scene({ room }: { room: Room }) {
  useStore(scenario2.subscribe);
  /*
   * 슬롯에 선 것들 — 자리표(PLACES)는 방이 고정한 자리고, 이것은 **이야기가 이 판에만 세운 자리**다
   * (레벨 설계 07 재회·씨앗 슬롯: 앞 방에서 원장이 생긴 개체를 scenario2 가 다음 방에 먼저 세운다).
   * 둘을 합쳐서 patrol 에 올려야 6 m 판정이 슬롯의 것까지 본다 — 안 그러면 순찰이 재회 개체 옆에 가서 선다.
   */
  const extra = scenario2.get().extra;
  // 참조가 아니라 내용으로 센다 — 저장소가 배열을 갈아 끼우든 고쳐 쓰든 같은 자리면 다시 세우지 않는다
  const extraKey = extra.map((e) => `${e.id}@${e.x},${e.z}`).join('|');
  // 이 방에서 돌아다니는 것들을 세운다 — 방이 바뀌거나 슬롯이 바뀌면 자리도 처음부터 (patrol.ts). 벽·상자는 이 방의 충돌로 막는다
  useMemo(() => patrol.reset(room, [...PLACES[room], ...extra], { solid: solidOf(room) }), [room, extraKey]);

  return (
    <group name={`시나리오 2 · ${room}`}>
      {PLACES[room].map((p) => (
        <Unit key={p.id} place={p} />
      ))}
      {extra.map((p) => (
        <Unit key={p.id} place={p} />
      ))}
      {room === 'corridor' ? <Murals /> : null}
      {room === 'work' ? <WorkMemorial /> : null}
      {room === 'archive' ? <ArchiveWall /> : null}
      {/* 코어의 빛과 출력 콘솔 — 국면(밝음·락다운·어둠)에 따라 방의 밝기가 바뀌는 유일한 방 (central2.ts) */}
      {room === 'central2' ? (
        <>
          <CoreLight />
          <Console2 />
        </>
      ) : null}
      {/* 걸어오는 것 — 의심도가 60 을 넘으면 이 방에 배치된다 (execution.ts) */}
      <Executioner room={room} />
      <Tracker room={room} />
    </group>
  );
}
