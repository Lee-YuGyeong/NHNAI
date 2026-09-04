/**
 * 감시 AI 에이전트 — 복도·중앙 시설에 서너 명만 있다. 순찰(직선 오가기 또는 코어 둘레 궤도)하다가:
 *   - interrogation.ts 가 나를 지목하면 플레이어 앞 1.9m 로 걸어가 서서 추궁한다 (질문·판정은 interrogation.ts)
 *   - 의심도 60 을 넘으면(scan.ts) 지목된 놈이 다가와 서서 **패턴 스캔** — 플레이어가 몇 초를 가만히 견뎌야 한다
 *   - 의심도 80 을 넘으면 순찰하던 개체도 하던 일을 멈추고 **나를 본다** (suspicion.STARE_AT)
 *   - 추궁 뒤 의심이 높으면(watch) 플레이어 3.2m 뒤를 따라다니며 감시한다 — 의심이 내려가면 순찰로 돌아간다
 *   - 챕터가 시설을 멈추면(frozen) 서고, staring 이면 플레이어를 본다, sealed 면 경비 자리로 행군한다
 *   - 챕터 2(chapter2.ts): 0번은 검문 경비 — guardTarget 으로 걸어가 서고(닿으면 guardArrived), 이동 명령(march)이면 post 로 간다
 *   - 의심도 100(enforcerStore.unit === 나): 총 든 경비가 순찰을 끊고 달려와 조준·사격, 판정 뒤 순찰로 복귀 (2026-08-30 — 새 몸이 나오지 않는다)
 * 걸음은 직선이 아니다 — 코어 같은 금지 구역(avoid)은 부딪히기 전에 돌고, 벽에 닿으면 그 면을 따라 비껴 간다 (walk.ts).
 * 서버에 없는 내 화면의 연출이다. 몸은 RobotAvatar(참가자 아바타와 같은 모델) 또는 EnforcerBody(총 든 로봇, spec.armed).
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { BODY_R, bystanders } from '@/world/mp/bystanders';
import { health, SHOT_DAMAGE } from '@/world/mp/health';
import type { AnimState } from '@/world/mp/protocol';
import { STARE_AT, suspicion } from '@/world/mp/suspicion';

import { chapter1 } from './chapter1';
import { chapter2 } from './chapter2';
import { EnforcerBody } from './Enforcer';
import type { PoseMode } from './enforcerPose';
import { enforcer, SHOOT_MS } from './enforcerStore';
import { interrogation } from './interrogation';
import { scan } from './scan';
import { SLIDE_S, STUCK_MPS, STUCK_STOP, STUCK_TURN, contactSlide, steerAround, type Zone } from './walk';

/** 총 든 경비의 키(m) — 참가자(1.72)보다 크지만 출동하는 심문 AI(2.3)만큼은 아니다 */
const GUARD_HEIGHT = 2.05;
/** 사수로 나설 때 — 달리는 속도, 사격 거리, 발사 간격 (Enforcer.tsx 와 같은 감각) */
const RUN = 4.8;
const SHOOT_OFF = 4.2;
const SHOT_EVERY_MS = 320;

export interface AgentSpec {
  /** 총 든 로봇(EnforcerBody)인가 — 아니면 참가자와 같은 로봇 아바타. 총 든 로봇만 의심도 100 의 사수가 된다 */
  armed?: boolean;
  /** 직선 순찰 — (x0,z0)↔(x1,z1) */
  line?: { x0: number; z0: number; x1: number; z1: number; speed: number; phase: number };
  /** 궤도 순찰 — 중심·반지름·각속도(rad/s)·시작 위상 */
  orbit?: { cx: number; cz: number; r: number; speed: number; phase: number };
  /** 봉쇄 자리 (챕터 sealed) */
  guard?: { x: number; z: number };
  /** 이동 명령(chapter2 march) 뒤 서는 자리와 향할 방향(heading) */
  post?: { x: number; z: number; heading: number };
  /** 붙박이 자리 (챕터 3 재검실) — 여기 서서 **플레이어를 계속 본다**. 순찰하지 않는다 */
  stand?: { x: number; z: number };
}

const STAND_OFF = 1.9;
/** 이만큼은 나아가고 있어야 걷는 자세다 — 그 아래는 선다 (제자리 걸음 금지) */
const MOVING_MPS = 0.22;
/** 목표에 "닿았다" 고 볼 여유(m) — 걸음이 남은 거리에 점근해 도착 판정이 영영 안 나는 것을 막는다 (walkTo 의 ★) */
const ARRIVE_EPS = 1e-3;
const WATCH_OFF = 3.2;
const WALK = 1.8;
/** 플레이어 몸 반지름(m) — LocalRig 가 경비 밖으로 밀려날 때와 같은 값 */
const PLAYER_R = 0.45;

const _cam = new THREE.Vector3();
const _hit = new THREE.Vector3();

/**
 * body — 몸. 'robot' 은 참가자와 같은 아바타(RobotAvatar), 'armed' 는 총 든 경비(EnforcerBody — 중앙 시설, 사용자 요구 2026-08-30).
 * 총 든 경비는 걸을 때 소총을 두 손으로 쥔 저자세로 걷는다 (enforcerPose.ts)
 */
export function AgentRobot({ spec, index, body = 'robot', resolve, avoid }: { spec: AgentSpec; index: number; body?: 'robot' | 'armed'; resolve?: (p: THREE.Vector3, feetY: number) => void; avoid?: readonly Zone[] }) {
  /**
   * 센서에게 나를 가리키는 이름. 한 화면에는 한 맵만 서므로 순번이면 갈린다
   * (복도 둘·중앙 셋이 같이 뜨는 일은 없다 — 라우트가 다르다).
   */
  const id = `agent:${index}`;
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const st = useRef({
    // 붙박이(stand)는 처음부터 그 자리에 서 있다 — 순찰 경로가 없다
    x: spec.orbit ? spec.orbit.cx + Math.cos(spec.orbit.phase) * spec.orbit.r : spec.stand ? spec.stand.x : spec.line!.x0 + (spec.line!.x1 - spec.line!.x0) * spec.line!.phase,
    z: spec.orbit ? spec.orbit.cz + Math.sin(spec.orbit.phase) * spec.orbit.r : spec.stand ? spec.stand.z : spec.line!.z0 + (spec.line!.z1 - spec.line!.z0) * spec.line!.phase,
    a: spec.orbit?.phase ?? 0,
    dir: 1,
    heading: 0,
    anim: 'idle' as AnimState,
    /** 사수로 나섰을 때의 자세(run·aim). null 이면 걷기/서기 */
    pose: null as PoseMode | null,
    lastShot: 0,
    /** 실제로 나아가는 속도(m/s) — 총 든 경비의 걸음 빠르기가 여기 맞춰진다 */
    speed: 0,
    /** 걸으려는데 못 나아간 시간(초) */
    stuck: 0,
    px: NaN,
    pz: NaN,
    /** 이번 프레임에 가려던 방향 — 벽에 닿았을 때 어느 쪽으로 비낄지 여기서 고른다 (walk.ts) */
    aimX: 0,
    aimZ: 0,
    /** 벽에 닿아 따라 걷는 방향과 남은 시간 */
    slideX: 0,
    slideZ: 0,
    slide: 0,
    /** 정면으로 막혔을 때 도는 쪽 — 몸마다 갈라 둔다 */
    side: (index % 2 ? 1 : -1) as 1 | -1,
  });
  const getAnim = useMemo(() => () => st.current.anim, []);
  const grounded = useMemo(() => () => false, []);
  const getMode = useMemo(() => (): PoseMode => st.current.pose ?? (st.current.anim === 'walk' ? 'walk' : 'idle'), []);
  const getSpeed = useMemo(() => () => st.current.speed, []);
  /** 내가 사수일 때만 총구 섬광 */
  const getFlashAt = useMemo(
    () => () => {
      const e = enforcer.get();
      return e.phase === 'shoot' && e.unit === index ? e.flashAt : -Infinity;
    },
    [index],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    const g = group.current;
    if (!g) return;
    const ch = chapter1.get();
    const iq = interrogation.get();
    let anim: AnimState = 'idle';
    let want = s.heading;

    /**
     * 목표 점으로 걷는다. 닿으면 true.
     * 직선이 아니다 — 코어 같은 금지 구역(avoid)은 부딪히기 전에 접선으로 돌고, 벽에 닿아 비껴 걷는 중(slide)이면 그쪽으로 간다 (walk.ts)
     */
    const walkTo = (tx: number, tz: number, stop: number): boolean => {
      const dx = tx - s.x;
      const dz = tz - s.z;
      const d = Math.hypot(dx, dz);
      want = Math.atan2(dx, dz);
      /*
       * ★ 여유(ARRIVE_EPS) 없이 `d <= stop` 으로 물으면 **영원히 못 닿는다**. 걸음은 남은 거리를 한 번에 다 지우지 않고
       *   `min(d − stop, 속도·dt)` 씩 줄이므로 d 는 stop 에 **점근**하는데, 마지막에 제곱근 반올림으로 stop 보다 티끌만큼 크게
       *   떨어지면 그 뒤로는 걸음이 1e-16 이라 자리도 안 바뀌고 도착 판정도 안 난다 — 직선 순찰이 끝점 0.15m 앞에서
       *   방향을 못 틀고 굳어 버렸다 (2026-09-01 사용자: "이동은 안 하고 걷는 애니메이션만 나오는 로봇이 많다").
       */
      if (d <= stop + ARRIVE_EPS) {
        s.slide = 0;
        return true;
      }
      const aim = steerAround(s.x, s.z, tx, tz, avoid, s.side);
      s.aimX = aim.dx;
      s.aimZ = aim.dz;
      const ux = s.slide > 0 ? s.slideX : aim.dx;
      const uz = s.slide > 0 ? s.slideZ : aim.dz;
      const step = Math.min(d - stop, WALK * dt);
      s.x += ux * step;
      s.z += uz * step;
      want = Math.atan2(ux, uz);
      anim = 'walk';
      return false;
    };

    _cam.copy(camera.position);
    const mine = iq.unit === index;
    const c2 = chapter2.get();
    const active2 = c2.phase !== 'idle' && c2.phase !== 'done';
    const e = enforcer.get();
    const sc = scan.get();
    const shooter = body === 'armed' && e.unit === index && e.phase !== 'idle';
    s.pose = null;

    if (shooter) {
      /*
       * 의심도 100 — 순찰을 끊고 **내가** 쏜다 (2026-08-30 사용자: 새 로봇이 나오지 말고 돌아다니던 총 든 로봇이 나를 보고 쏴야 한다).
       * 달려와 SHOOT_OFF 에 서서 조준·사격 → 판정 동안 조준한 채 → leave 면 곧장 순찰로 돌아간다(아래 궤도/직선 복귀가 걸어서 데려간다)
       */
      if (e.phase === 'run') {
        s.pose = 'run';
        const dx = _cam.x - s.x;
        const dz = _cam.z - s.z;
        const d = Math.hypot(dx, dz);
        want = Math.atan2(dx, dz);
        if (d <= SHOOT_OFF) enforcer.arrived();
        else {
          // 달려올 때도 코어를 돌아온다 — 사수가 코어에 붙어 제자리 뛰기를 하면 판이 멈춘다
          const aim = steerAround(s.x, s.z, _cam.x, _cam.z, avoid, s.side);
          s.aimX = aim.dx;
          s.aimZ = aim.dz;
          const ux = s.slide > 0 ? s.slideX : aim.dx;
          const uz = s.slide > 0 ? s.slideZ : aim.dz;
          const step = Math.min(d - SHOOT_OFF, RUN * dt);
          s.x += ux * step;
          s.z += uz * step;
          want = Math.atan2(ux, uz);
          anim = 'walk';
        }
      } else if (e.phase === 'shoot' || e.phase === 'verdict') {
        s.pose = 'aim';
        want = Math.atan2(_cam.x - s.x, _cam.z - s.z);
        const now = performance.now();
        if (e.phase === 'shoot' && now - s.lastShot > SHOT_EVERY_MS && now - e.flashAt < SHOOT_MS) {
          s.lastShot = now;
          enforcer.flash();
          // 한 발마다 맞는다 — 체력이 다 닳으면 쓰러진다 (health → DamageHud·Downed·DefeatHud)
          health.hit(SHOT_DAMAGE, '피격', now);
        }
      } else {
        enforcer.left();
      }
    } else if (sc.unit === index && (sc.phase === 'approach' || sc.phase === 'scan')) {
      // 패턴 스캔 — 앞에 가서 서고, 훑는 동안 계속 본다. 견디는 건 플레이어 몫이다 (scan.ts)
      const there = walkTo(_cam.x, _cam.z, STAND_OFF);
      want = Math.atan2(_cam.x - s.x, _cam.z - s.z);
      if (there && sc.phase === 'approach') scan.arrived();
    } else if (spec.stand) {
      // 재검실의 검증관 — 검증대 뒤 붙박이. 자리를 잡으면 그 뒤로는 계속 나를 본다 (챕터 3)
      if (walkTo(spec.stand.x, spec.stand.z, 0.15)) want = Math.atan2(_cam.x - s.x, _cam.z - s.z);
    } else if (active2 && index === 0 && c2.guardTarget) {
      // 검문 경비 — 지목된 자리(또는 플레이어 앞)로 가서 선다. 플레이어면 계속 바라본다
      const t = c2.guardTarget === 'player' ? { x: _cam.x, z: _cam.z } : c2.guardTarget;
      const stop = c2.guardTarget === 'player' ? STAND_OFF : 1.1;
      if (walkTo(t.x, t.z, stop)) {
        want = Math.atan2(t.x - s.x, t.z - s.z);
        chapter2.guardArrived();
      }
    } else if (active2 && c2.march && spec.post) {
      if (walkTo(spec.post.x, spec.post.z, 0.15)) want = spec.post.heading;
    } else if (ch.sealed && spec.guard) {
      if (walkTo(spec.guard.x, spec.guard.z, 0.15)) want = spec.guard.z < 0 ? 0 : Math.PI;
    } else if (ch.frozen) {
      if (ch.staring) want = Math.atan2(_cam.x - s.x, _cam.z - s.z);
    } else if (mine && iq.phase !== 'idle' && iq.phase !== 'done') {
      // 추궁 — 앞에 가서 선다. 서 있는 동안엔 플레이어를 계속 본다
      interrogation.track(_cam.x, _cam.z, false);
      const there = walkTo(_cam.x, _cam.z, STAND_OFF);
      if (there && iq.phase === 'approach') interrogation.track(_cam.x, _cam.z, true);
    } else if (iq.watch === index) {
      // 감시 — 조금 떨어져 따라다닌다
      walkTo(_cam.x, _cam.z, WATCH_OFF);
    } else if (spec.orbit) {
      s.a += spec.orbit.speed * dt;
      const nx = spec.orbit.cx + Math.cos(s.a) * spec.orbit.r;
      const nz = spec.orbit.cz + Math.sin(s.a) * spec.orbit.r;
      // 감시·추궁에서 돌아올 땐 궤도로 걸어 복귀
      if (Math.hypot(nx - s.x, nz - s.z) > 0.6) walkTo(nx, nz, 0.1);
      else {
        want = Math.atan2(nx - s.x, nz - s.z);
        s.x = nx;
        s.z = nz;
        anim = 'walk';
      }
    } else if (spec.line) {
      const tx = s.dir > 0 ? spec.line.x1 : spec.line.x0;
      const tz = s.dir > 0 ? spec.line.z1 : spec.line.z0;
      if (walkTo(tx, tz, 0.15)) s.dir *= -1;
    }

    // 의심도 80 — 시설이 나를 지목한다. 순찰하던 개체도 하던 일을 멈추고 나를 본다 (2026-08-30 사용자: 게이지가 오르면 세계가 달라져야 한다)
    if (!shooter && !active2 && !ch.frozen && suspicion.get().value >= STARE_AT) {
      want = Math.atan2(_cam.x - s.x, _cam.z - s.z);
      anim = 'idle';
    }
    let dh = want - s.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    s.heading += dh * Math.min(1, dt * 6);
    // 몸끼리 안 겹친다 — 다른 개체(경비)와 플레이어 밖으로 밀려난다 (사용자: 로봇끼리 통과하면 안 된다, 2026-08-30)
    const sep = bystanders.pushOut(s.x, s.z, BODY_R, id);
    s.x = sep.x;
    s.z = sep.z;
    const pdx = s.x - _cam.x;
    const pdz = s.z - _cam.z;
    const pd = Math.hypot(pdx, pdz);
    const pmin = BODY_R + PLAYER_R;
    if (pd < pmin && pd > 1e-4) {
      s.x += (pdx / pd) * (pmin - pd);
      s.z += (pdz / pd) * (pmin - pd);
    }
    // 벽·가구 밖으로 — 플레이어와 같은 충돌판을 쓴다 (사용자: "벽을 향해 계속 걷는다")
    if (resolve) {
      const bx = s.x;
      const bz = s.z;
      _hit.set(s.x, 0, s.z);
      resolve(_hit, 0);
      s.x = _hit.x;
      s.z = _hit.z;
      // 밀려났다 = 벽·가구에 닿았다. 접촉면을 따라 옆으로 비껴 걸어 모서리를 돌아 나간다 (walk.ts)
      const nx = s.x - bx;
      const nz = s.z - bz;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-4 && anim === 'walk') {
        const t = contactSlide(nx / nl, nz / nl, s.aimX, s.aimZ, s.slide > 0 ? { x: s.slideX, z: s.slideZ } : null, s.side);
        s.slideX = t.x;
        s.slideZ = t.z;
        s.slide = SLIDE_S;
      } else s.slide = Math.max(0, s.slide - dt);
    }
    /*
     * 실제로 나아간 거리로 속도를 낸다 — 고정 박자로 걸으면 0.85m/s 순찰이 종종거리는 모델 워킹이 된다.
     * ★ dt 가 0 인 프레임(브라우저가 performance.now 를 100µs 로 뭉개면 첫 프레임이 그렇게 온다)에 나누면 0/0 = NaN 이고,
     *   한 번 NaN 이 되면 지수 평활이 영원히 NaN 이다 — 그러면 아래의 **제자리 걸음 금지**(speed < MOVING_MPS)도, 막힘 판정도
     *   비교가 전부 false 라 통과해 버리고, 총 든 경비는 자세 엔진(enforcerPose)이 NaN 회전을 받아 **몸이 통째로 사라진다**
     *   (2026-09-01 사용자: "중앙 시설 총 든 로봇이 안 보인다 · 제자리에서 걷기만 하는 로봇이 많다" — 둘 다 여기서 났다).
     */
    if (!Number.isFinite(s.px)) {
      s.px = s.x;
      s.pz = s.z;
    }
    if (dt > 1e-4) s.speed += (Math.hypot(s.x - s.px, s.z - s.pz) / dt - s.speed) * Math.min(1, dt * 8);
    if (!Number.isFinite(s.speed)) s.speed = 0;
    s.px = s.x;
    s.pz = s.z;
    /*
     * **제자리 걸음 금지** (2026-09-01 사용자: "멈춰서 한곳을 계속 걷는 애니메이션을 돌리는 부분"). 걷는 자세는 의도가 아니라
     * **실제로 나아간 속도**로 정한다 — 벽·다른 몸·플레이어에 눌려 못 나아가면 그 프레임부터 선다. 걸음이 붙는 데 0.2초쯤
     * 걸리는 건(속도가 부드럽게 오른다) 오히려 자연스럽다 — 서 있다가 발을 떼는 모습이 된다.
     *
     * 막힘은 **보이는 자세가 아니라 의도**로 센다 (walking). 자세로 세면 위의 한 줄이 이미 'idle' 로 바꿔 놓은 뒤라
     * `anim === 'walk' && speed < STUCK_MPS` 는 STUCK_MPS(0.15) < MOVING_MPS(0.22) 라서 **영영 참이 안 되고**,
     * 벽을 향해 걷던 몸이 돌아 나오지 못한 채 그 자리에 굳는다.
     */
    const walking = anim === 'walk';
    if (walking && s.speed < MOVING_MPS) anim = 'idle';
    s.stuck = walking && s.speed < STUCK_MPS ? s.stuck + dt : 0;
    if (s.stuck > STUCK_STOP) {
      anim = 'idle';
      if (s.stuck > STUCK_TURN) {
        if (spec.line) s.dir *= -1;
        // 순찰이 아닌 목표(검문 자리·재배치·추격)라면 방향을 못 튼다 — 비껴 걷는 쪽을 뒤집어 반대로 돌아 나간다
        s.side = (s.side * -1) as 1 | -1;
        s.slideX = -s.slideX;
        s.slideZ = -s.slideZ;
        s.stuck = 0;
      }
    }
    s.anim = anim;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;
    /*
     * 내가 여기 있다고 알린다 — 의심도 센서가 "곁에 누가 있나"를 여기서 본다(mp/bystanders).
     * 이걸 안 하면 나는 **센서에게 보이지 않는다**: 사람이 나를 아무리 쳐다봐도, 나를 보며
     * 물러서도 의심도가 안 오른다. 인트로가 가르치는 셋 중 둘이 나 때문에 죽는다.
     * (원격 명부에 안 얹는 이유는 bystanders.ts 에 적어 뒀다 — 그쪽은 방 사정으로 비워진다)
     */
    bystanders.set(id, s.x, s.z, s.heading);
  });

  // 장면을 떠나면 자리도 거둔다 — 맵을 옮겼는데 앞 맵의 경비가 남아 있으면 허공이 의심을 만든다
  useEffect(() => () => bystanders.drop(id), [id]);

  return (
    <group ref={group}>
      {body === 'armed' ? <EnforcerBody getMode={getMode} getFlashAt={getFlashAt} getSpeed={getSpeed} height={GUARD_HEIGHT} /> : <RobotAvatar getAnim={getAnim} getAirborne={grounded} />}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[body === 'armed' ? 0.44 : 0.34, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}
