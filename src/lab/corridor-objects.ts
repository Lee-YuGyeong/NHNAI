/**
 * 복도 오브젝트 카탈로그 — 리더가 **복도 맵에 실제로 놓여 있는 물건**을 게임에 쓸 수 있게 한다.
 *
 * objects.ts(창고판)와 같은 방식이다: 좌표를 옮겨 적지 않고 물리(충돌) 데이터에서
 * **그대로 끌어온다** — 배치(map/corridor/layout.ts)를 고치면 collide.ts 를 거쳐 이 목록도
 * 같이 움직이고, 리더가 가리킨 자리와 실제로 막히는 자리가 어긋나지 않는다.
 * GLB 는 화면에 그리는 용도일 뿐이라 여기서는 보지 않는다.
 *
 * world/mp/collide.ts·constants.ts 는 순수 계산이라 워커에 번들돼도 안전하다.
 *
 * 창고판과 다른 점:
 *  - 리브(격벽 아치 다리)는 top 이 점프보다 높아 "벽 취급"이다 — 앞에 세우는 랜드마크로만 쓴다.
 *  - 콘솔(발치 장비함, top 0.85)은 점프로 올라설 수 있다 — 복도에서 유일하게 오를 수 있는 것.
 *    (2026-08-29 SF 복도로 재구성하며 기둥·화분이 리브·콘솔로 바뀌었다.)
 */

// ★ 상대 경로로 쓴다 — objects.ts 와 같은 이유 (vite 설정 번들은 @ 별칭을 적용하지 않는다).
import { BOUNDS, COLLIDERS, type Collider } from '../world/mp/collide';
import { JUMP_MAX_Y } from '../world/mp/constants';

/** 리더 프롬프트에 넣을 복도 좌표계 — 벽 안쪽 면까지 */
export const CORRIDOR = BOUNDS;

export interface CorridorObject {
  /** 리더가 부르는 이름 */
  id: string;
  kind: '리브' | '콘솔';
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

/** COLLIDERS 맨 앞의 벽 4개 — 물건이 아니라 건너뛴다 (collide.ts 주석의 그룹 순서) */
const WALL_COUNT = 4;

/** 벽 다음부터 이 순서로 들어 있다 (collide.ts 주석의 그룹 순서) */
const GROUPS: { kind: CorridorObject['kind']; count: number }[] = [
  { kind: '리브', count: 16 },
  { kind: '콘솔', count: 14 },
];

function build(): CorridorObject[] {
  const out: CorridorObject[] = [];
  const seq: Record<string, number> = {};
  let i = WALL_COUNT;
  for (const { kind, count } of GROUPS) {
    for (let n = 0; n < count; n += 1) {
      const c: Collider | undefined = COLLIDERS[i++];
      if (!c) continue;
      seq[kind] = (seq[kind] ?? 0) + 1;
      out.push({
        id: `${kind}${seq[kind]}`,
        kind,
        x: Number(c.x.toFixed(2)),
        z: Number(c.z.toFixed(2)),
        top: c.top,
        mountable: c.top <= JUMP_MAX_Y,
        hw: c.hw,
        hd: c.hd,
      });
    }
  }
  return out;
}

export const OBJECTS: CorridorObject[] = build();

export function findObject(id: string): CorridorObject | undefined {
  return OBJECTS.find((o) => o.id === id);
}

/** 리더 프롬프트에 넣을 목록 */
export function objectTable(): string {
  return OBJECTS.map((o) => {
    const stand = o.mountable ? '올라설 수 있다' : '못 올라간다 — 벽 취급';
    return `  ${o.id}  (${o.x}, ${o.z})  윗면 ${o.top}m  ${stand}`;
  }).join('\n');
}

/** 목표 자리 계산은 발자국만 보는 순수 기하라 창고판 것을 그대로 쓴다 */
export { targetSpot } from './objects';
