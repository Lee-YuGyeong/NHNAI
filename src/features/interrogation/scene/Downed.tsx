/**
 * 처형당한 몸 — **총을 맞은 그 자리에서 발을 축으로 넘어간다.**
 *
 * 2026-09-05 사용자: "로봇 총쏨 → 나 맞고 쓰러짐 → 패배 보여줌 이 순서로." 여태 이 홀에서는 격리된 몸이
 * 세 발을 맞고도 선 채로 그냥 지워졌다 — 총성은 나는데 아무것도 넘어가지 않았고, 내가 맞을 때는 그마저도
 * 안 보였다 (끝 화면이 같은 순간에 덮었다, executionerStore 머리말).
 *
 * 이 부품은 **자리를 안 건드린다.** 아바타 그룹은 이미 발이 원점이므로(SeatAvatar · SelfAvatar 의 group),
 * 그 안에 이 그룹 하나를 끼워 회전만 얹으면 발을 축으로 쓰러지는 나무가 된다. 자리(x·z)는 그대로 두는
 * 것이 규칙이다 — /arena 가 처형 행진을 걷어 내며 정한 그것이다 (2026-09-03 사용자: "나 죽을때 내가
 * 있던 자리에서 쓰러지잖아").
 *
 * ★ **총알이 민 쪽으로 넘어간다.** 총은 늘 무대(0, STAGE_Z)에서 온다. 그 방향은 월드 기준이고 이 그룹은
 *   이미 heading 만큼 돌아간 아바타 안이라, 월드 각에서 heading 을 빼 **몸 기준**으로 옮겨 쓴다.
 *   축은 넘어가는 방향과 직각인 수평축이다 — (0,1,0) 을 (dx,0,dz) 쪽으로 눕히는 축은 (dz,0,−dx).
 * ★ 클립은 안 건드린다. 군인 GLB 넷에는 쓰러지는 클립이 없고(SoldierAvatar 머리말), 있는 클립을 억지로
 *   골라 쓰면 몸마다 다른 그림이 나온다. 서 있는 자세 그대로 넘어가는 편이 넷이 같다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { STAGE_Z } from '@/world/map/govcenter/layout';
import { CHASE_LOOK_Y } from './chase';
import { executioner, FALL_MS } from './executionerStore';

/** 다 넘어간 각 — 90° 에서 조금 못 미친다. 넘기면 머리 쪽이 바닥 아래로 파고든다 (/arena 의 down 도 88° 다) */
const FALL_ANGLE = Math.PI / 2 - 0.04;
/**
 * 다 넘어간 몸을 들어 올리는 높이(m).
 *
 * **발을 축으로 돌리면 뼈대가 바닥 면에 눕는다** — 뼈는 몸 한가운데를 지나므로 그 자세는 몸의 아래 절반이
 * 바닥에 묻힌 그림이다 (2026-09-05 헤드리스 실측: 눕고 나면 군화 코만 남고 몸이 안 보였다).
 * 몸통 두께의 절반만큼 들어 올려야 바닥에 **놓인다**. /arena 의 로봇(RobotAvatar.down)이 lift 0.14 를
 * 키 0.98 에 쓰는 것과 같은 값이다 — 여기 키(1.72)로 옮기면 0.245.
 *
 * k² 로 든다: 기우는 동안에는 발이 바닥에 붙어 있고, 다 넘어가는 마지막에만 몸이 떠오른다.
 */
const LIE_Y = 0.245;

/** 죽음 시점 — 카메라가 물러나는 거리(m) · 올라가는 높이(m) · 시선이 짚는 몸의 지점(발에서 m, 높이 m) */
const CAM_BACK = 1.7;
const CAM_RISE = 0.75;
const CAM_AIM = 0.85;
const CAM_AIM_Y = 0.35;
/** 서 있을 때 추격 카메라가 짚는 지점 (chase.placeChaseCamera) — 여기서 출발해야 시점이 안 튄다 */
const CHASE_AIM = -0.6;

export interface DownedProps {
  /** 이 몸의 좌석 id — 없으면(로비) 넘어질 일도 없다 */
  id: string | null;
  /** 프레임마다 묻는 지금 자리와 heading — 총이 오는 각을 몸 기준으로 옮기는 데 쓴다 */
  getPose: () => { x: number; z: number; heading: number };
  children: ReactNode;
}

export function Downed({ id, getPose, children }: DownedProps) {
  const group = useRef<THREE.Group>(null);
  const axis = useMemo(() => new THREE.Vector3(), []);
  /** 지난 프레임에 얹은 것이 있나 — 서 있는 몸에 매 프레임 항등 회전을 쓰지 않으려고 */
  const laid = useRef(false);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const at = id ? executioner.downAt(id) : 0;
    if (!at) {
      if (laid.current) {
        g.quaternion.identity();
        g.position.y = 0;
        laid.current = false;
      }
      return;
    }
    const t = Math.min(1, Math.max(0, (performance.now() - at) / FALL_MS));
    // 처음엔 천천히 꺾이다 마지막에 바닥으로 떨어진다 — 총에 맞은 몸이 무릎부터 접히는 결
    const k = 1 - (1 - t) ** 3;
    const pose = getPose();
    const push = Math.atan2(pose.x - 0, pose.z - STAGE_Z) - pose.heading;
    axis.set(Math.cos(push), 0, -Math.sin(push));
    g.quaternion.setFromAxisAngle(axis, FALL_ANGLE * k);
    g.position.y = LIE_Y * k * k;
    laid.current = true;
  });

  return <group ref={group}>{children}</group>;
}

/**
 * 처형당한 나 — **쓰러진 내 몸을 내려다보는 카메라.**
 *
 * 3인칭이라 내 몸은 카메라 1.9m 앞에 서 있는데(chase.ts), 총알은 무대에서 오므로 그 몸은 **카메라 쪽으로**
 * 넘어온다. 그러면 눕는 순간 몸이 화면 아래로 빠져나가 사라진다 — 헤드리스로 재 보니 넘어지는 1.1초가
 * 통째로 빈 바닥이었다. 「나 맞고 쓰러짐」을 보여 주겠다면서 정작 그 그림만 없는 셈이다.
 *
 * 그래서 넘어가는 동안 카메라가 **뒤로 물러나며 조금 올라서고, 시선을 바닥의 몸으로 내린다.**
 * /arena 에서 1인칭 눈높이가 바닥까지 내려가던 것(Collapse)과 같은 뜻을 3인칭으로 옮긴 것이다.
 *
 * ★ 리그가 놓은 카메라 **위에 얹는다** — 그래서 리그(FreeRig · StopRig · DiscRig)보다 **뒤에** 서야 한다
 *   (HallScene 의 자리). 자리를 직접 다시 계산하지 않고 이미 놓인 카메라에서 몸 쪽 방향만 잰다.
 * ★ 다 넘어간 뒤에도 계속 얹는다 — 리그는 멈춘 자리를 프레임마다 다시 놓으므로, 한 번만 얹으면 다음
 *   프레임에 원래 자리로 돌아간다.
 */
export function DeathCam({ id, getPose }: { id: string | null; getPose: () => { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const at = id ? executioner.downAt(id) : 0;
    if (!at) return;
    const t = Math.min(1, Math.max(0, (performance.now() - at) / FALL_MS));
    /*
     * 몸이 꺾이는 결(1−(1−t)³, 처음이 빠르다)을 카메라가 그대로 쓰면 **시점이 툭 끊긴다** — 첫 100ms 에
     * 이미 4분의 1 이 돌아 있어서 서 있던 어깨너머 시점이 내려다보는 시점으로 순간이동한다.
     * 카메라만 부드러운 결(smoothstep)로 간다: 처음엔 거의 안 움직이고 가운데서 넘어간다.
     */
    const k = t * t * (3 - 2 * t);
    const b = getPose();
    let ux = camera.position.x - b.x;
    let uz = camera.position.z - b.z;
    const len = Math.hypot(ux, uz);
    if (len < 0.1) return; // 카메라가 몸 위에 겹쳐 있다 — 물러날 방향을 못 잰다
    ux /= len;
    uz /= len;
    camera.position.set(b.x + ux * (len + CAM_BACK * k), camera.position.y + CAM_RISE * k, b.z + uz * (len + CAM_BACK * k));
    // 시선은 **서 있을 때 짚던 자리에서 출발한다** (k=0 이면 리그가 놓은 그 시점 그대로다) — 발이 축이라
    // 몸은 카메라 쪽으로 눕고, 시선은 그 사이를 따라 내려간다
    const aim = CHASE_AIM + (CAM_AIM - CHASE_AIM) * k;
    camera.lookAt(b.x + ux * aim, CHASE_LOOK_Y + (CAM_AIM_Y - CHASE_LOOK_Y) * k, b.z + uz * aim);
  });
  return null;
}
