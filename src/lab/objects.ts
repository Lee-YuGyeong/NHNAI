/**
 * 격납고 홀 오브젝트 카탈로그 — 리더가 **실제로 놓여 있는 물건**을 게임에 쓸 수 있게 한다.
 * 무대 1 · 콘솔 16 · 컨테이너 6.
 *
 * 좌표를 옮겨 적지 않는다. 창고 3D 맵(격납고 홀)의 충돌 데이터(warehouse/layout.ts)에서 **그대로 끌어온다** —
 * 무대·콘솔을 옮기면 이 목록도 같이 움직이고, 리더가 가리킨 자리와 실제로 막히는 자리가 어긋나지 않는다.
 * (2026-08-30 사용자 결정: 게임 시작 테스트(/interrogation)의 배경을 심문소 → 창고 3D 맵으로. 게임은 그대로, 맵만 바뀌었다.)
 *
 * layout.ts 는 three 를 끌어오지 않는 순수 파일이라 워커에 번들돼도 안전하다.
 */

// ★ 상대 경로로 쓴다. vite 는 **설정 파일을 번들할 때 @ 별칭을 적용하지 않는다** —
// 이 파일이 개발 서버 플러그인(tools/vite-lab)에서 끌려 들어오므로 별칭을 쓰면 설정 로드가 통째로 실패한다.
import { CARGOS, COLLIDERS, CONSOLE_BAYS, RIB_ZS, STEPS } from '../world/map/warehouse/layout';
import type { Collider } from '../world/mp/collide';

export interface WorldObject {
  /** 리더가 부르는 이름 */
  id: string;
  kind: '무대' | '콘솔' | '컨테이너';
  x: number;
  z: number;
  /** 윗면 높이(m) */
  top: number;
  /** 올라설 수 있는가 — 점프로 닿는 높이인가 */
  mountable: boolean;
  /** 발판 반폭·반깊이 */
  hw: number;
  hd: number;
}

/** 점프해서 올라설 수 있는 최대 높이. 이보다 높으면 벽 취급이다 */
const MOUNT_LIMIT = 1.35;

/**
 * COLLIDERS 는 [벽 4 · 무대 1 · 계단 3 · 리브 14 · 콘솔 16 · 컨테이너 6] 순서다 (layout.ts 참고).
 * 벽·리브는 물건이 아니다. 계단은 무대의 일부라 무대 발자국에 합친다 — 따로 두면 "계단1 앞에 서라" 같은 지시가 나오고,
 * 배회하는 개체가 계단 위를 바닥인 줄 알고 지나간다.
 */
const WALLS = 4;
const STAGE_AT = WALLS;
const STEPS_AT = STAGE_AT + 1;
const CONSOLES_AT = STEPS_AT + STEPS.n + RIB_ZS.length * 2;
/** 컨테이너는 콘솔 뒤 — layout.ts 가 **맨 뒤에** 덧붙인다. 그 파일에서 중간에 끼우면 여기가 통째로 밀린다 */
const CARGOS_AT = CONSOLES_AT + CONSOLE_BAYS.length * 2;

function entry(c: Collider, kind: WorldObject['kind'], id: string, hd = c.hd): WorldObject {
  return {
    id,
    kind,
    x: Number(c.x.toFixed(2)),
    z: Number(c.z.toFixed(2)),
    top: c.top,
    mountable: c.top <= MOUNT_LIMIT,
    hw: c.hw,
    hd: Number(hd.toFixed(2)),
  };
}

function build(): WorldObject[] {
  const out: WorldObject[] = [];
  const stage = COLLIDERS[STAGE_AT];
  if (stage) {
    // 무대 발자국을 앞 계단 끝까지 늘인다 (중심은 그대로 — 링 조명 아래가 "무대 위"다). 뒤로도 같이 늘지만 거긴 벽이다
    const steps = COLLIDERS.slice(STEPS_AT, STEPS_AT + STEPS.n);
    const front = Math.max(stage.z + stage.hd, ...steps.map((s) => s.z + s.hd));
    // 하나뿐인 물건에는 번호를 붙이지 않는다 — 리더가 "무대1" 이라고 부르면 어색하다
    out.push(entry(stage, '무대', '무대', front - stage.z));
  }
  const consoles = COLLIDERS.slice(CONSOLES_AT, CONSOLES_AT + CONSOLE_BAYS.length * 2);
  consoles.forEach((c, i) => out.push(entry(c, '콘솔', `콘솔${i + 1}`)));
  /*
   * 홀 바닥의 화물 컨테이너 — 리더가 **홀 한가운데를 가리킬 말**이다. 여태 카탈로그는 무대 하나와
   * 옆벽 콘솔 16개뿐이라, 판이 벌어지는 자리에는 이름이 붙은 물건이 하나도 없었다.
   * 1단(윗면 0.9m)은 mountable 로 잡히고 2·3단은 벽으로 잡힌다 — 높이는 layout.ts 가 정한다.
   */
  const cargos = COLLIDERS.slice(CARGOS_AT, CARGOS_AT + CARGOS.length);
  cargos.forEach((c, i) => out.push(entry(c, '컨테이너', `컨테이너${i + 1}`)));
  return out;
}

export const OBJECTS: WorldObject[] = build();

export function findObject(id: string): WorldObject | undefined {
  return OBJECTS.find((o) => o.id === id);
}

/** 리더 프롬프트에 넣을 목록 */
export function objectTable(): string {
  return OBJECTS.map(
    (o) => `  ${o.id}  (${o.x}, ${o.z})  윗면 ${o.top}m  ${o.mountable ? '올라설 수 있다' : '못 올라간다 — 벽 취급'}`,
  ).join('\n');
}

/**
 * 그 오브젝트를 목표로 삼았을 때 실제로 서야 하는 자리.
 *  - 올라서기(mount): 가구 윗면 한가운데
 *  - 앞에 서기(stand): 찾아오는 쪽(from) 가장자리 바로 앞 (가구에 막히지 않는 자리)
 *
 * 발자국(x·z·hw·hd)만 보는 순수 기하라 창고·복도 어느 카탈로그의 오브젝트든 받는다.
 */
export function targetSpot(
  o: Pick<WorldObject, 'x' | 'z' | 'hw' | 'hd'>,
  mode: 'mount' | 'stand',
  from: { x: number; z: number },
): { x: number; z: number } {
  if (mode === 'mount') return { x: o.x, z: o.z };
  const dx = from.x - o.x;
  const dz = from.z - o.z;
  const len = Math.hypot(dx, dz) || 1;
  const pad = Math.max(o.hw, o.hd) + 0.7;
  return { x: Number((o.x + (dx / len) * pad).toFixed(2)), z: Number((o.z + (dz / len) * pad).toFixed(2)) };
}
