/**
 * 무장 심문 AI 의 자세 — 코드로 만든 애니메이션 (idle · walk · run · aim/shoot).
 *
 * Tripo 자동 리그(biped v2.5)는 뼈 **위치**는 맞지만 이름표(Left/Right·팔/다리)가 뒤섞여 프리셋 리타겟이 절반의 뼈만, 그것도
 * 거꾸로 움직인다 (2026-08-30, A 포즈·T 포즈 둘 다 확인). 그래서 이름을 믿지 않고 **바인드 포즈(T 포즈)의 위치**로 사슬을 찾는다:
 *   발 = 말단 뼈 중 가장 낮은 둘, 엉덩이 = 두 발의 공통 조상, 손 = 말단 뼈 중 좌우로 가장 먼 둘, 위팔 = 부모가 몸통 가까이 있는 첫 뼈,
 *   머리 = 가장 높은 뼈. (Tripo 루트 뼈는 바닥 높이에 있어 "가장 낮은 뼈"로 잡으면 안 된다 — 말단만 본다)
 *
 * 뼈는 "바인드 기준 모델축 회전 Δ" 로 움직인다 — 모델 공간은 앞 +x · 위 +y · 오른쪽 +z (Tripo text-to-model 출력이 +x 를 본다):
 *   local = bindLocal · (bindRel⁻¹ · Δ · bindRel)      bindRel 은 루트 기준 바인드 회전
 * 부모·자식이 다 Δ 를 받으면 자식의 최종 회전은 Δ부모 · Δ자식 · bind 다. 그래서 겉 그룹의 heading 이 돌아도 Δ 는 늘 모델 기준이고,
 * 자세 사이는 뼈마다 slerp 로 넘어간다 (급전환 없음).
 *
 * 조준은 2뼈 IK — 손 목표점(어깨 기준·키 비율)과 팔꿈치 방향(pole)으로 위팔·아래팔 방향을 풀고, 손목은 총열 방향에 맞춘 "쥐기" 기저로 놓는다.
 * 소총(enforcer_rifle.glb: 길이 1 · 총구 +z · 위 +y · 손잡이 아래)은 오른손 뼈의 자식 — 쥐기 기저와 소총 기저의 관계는 상수라
 * 어느 자세에서든 손잡이가 손 안에 있고 총열은 오른손의 '총열 축' 을 따른다 (조준이 아니면 아래팔 방향 = 총구 아래로 든 저자세).
 */

import * as THREE from 'three';

export type PoseMode = 'idle' | 'walk' | 'run' | 'aim' | 'angry';

export interface PoseState {
  mode: PoseMode;
  /** 마지막 발사 시각(performance.now) — 반동 */
  shotAt?: number;
  /**
   * 지금 나아가는 속도 — **모델 단위** 기준 초당 거리. 걸음 빠르기를 여기에 맞춘다. 없으면 POSE 의 기본 cadence.
   * 이게 없으면 경비가 0.85m/s 로 미끄러지면서 다리는 2.1걸음/s 로 놀아 종종거리는 모델 워킹이 된다 (2026-08-30 사용자: "위압감이 없어")
   */
  speed?: number;
}

interface Bind {
  local: THREE.Quaternion;
  rel: THREE.Quaternion;
  relInv: THREE.Quaternion;
  /** 루트 기준 바인드 위치 */
  pos: THREE.Vector3;
}

export interface Rig {
  bones: THREE.Bone[];
  bind: Map<THREE.Bone, Bind>;
  hips: THREE.Bone;
  /** 엉덩이 바로 위 몸통 뼈 (앞으로 기울기) */
  torso: THREE.Bone | null;
  head: THREE.Bone | null;
  /** [허벅지, 정강이, 발, …] */
  legL: THREE.Bone[];
  legR: THREE.Bone[];
  /** [위팔, 아래팔, 손] — 손이 없으면 아래팔이 끝 */
  armL: THREE.Bone[];
  armR: THREE.Bone[];
  /**
   * 손가락 뼈와 그 굽힘 축 — **있는 리그만**. 심문 AI 리그엔 손가락 뼈가 없어 빈 배열이고(대신 curlHands 가 정점을 굽는다),
   * 리더(최종보스) 리그엔 손마다 서너 마디가 있어 매 프레임 접어 준다 (2026-09-01).
   */
  fingers: FingerCurl[];
  /** 뼈대 높이(모델 단위) — 오프셋의 기준 */
  height: number;
}

/** 손가락 한 마디 — 바인드에서 잰 굽힘 축(모델축). 이 축으로 POSE.curl.finger 만큼 돌리면 손바닥 쪽으로 말린다 */
export interface FingerCurl {
  bone: THREE.Bone;
  axis: THREE.Vector3;
}

/** 사람의 자연스러운 걸음 한 점 — 다리길이 대비 속도 1.4/s 에서 0.93주기/s(≈1.9걸음/s). 여기서 √속도로 늘린다 */
const NAT_CADENCE = 0.93;
const NAT_U = 1.4;

const DOWN = new THREE.Vector3(0, -1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const D2R = Math.PI / 180;

/** 루트(root) 기준 위치·회전으로 사슬을 찾는다. 못 찾으면 null (경고를 찍는다) */
export function buildRig(root: THREE.Object3D): Rig | null {
  const bones: THREE.Bone[] = [];
  const rel = new Map<THREE.Object3D, THREE.Quaternion>();
  const pos = new Map<THREE.Object3D, THREE.Vector3>();
  const walk = (o: THREE.Object3D, q: THREE.Quaternion, p: THREE.Vector3) => {
    for (const c of o.children) {
      const cq = q.clone().multiply(c.quaternion);
      const cp = c.position.clone().multiply(o.scale).applyQuaternion(q).add(p);
      rel.set(c, cq);
      pos.set(c, cp);
      if ((c as THREE.Bone).isBone) bones.push(c as THREE.Bone);
      walk(c, cq, cp);
    }
  };
  walk(root, new THREE.Quaternion(), new THREE.Vector3());
  if (bones.length < 8) return fail(`뼈가 ${bones.length}개뿐`);

  const y = (b: THREE.Object3D) => pos.get(b)!.y;
  const z = (b: THREE.Object3D) => pos.get(b)!.z;
  const isAncestor = (a: THREE.Object3D, b: THREE.Object3D) => {
    for (let p = b.parent; p; p = p.parent) if (p === a) return true;
    return false;
  };
  const related = (a: THREE.Object3D, b: THREE.Object3D) => a === b || isAncestor(a, b) || isAncestor(b, a);
  const top = Math.max(...bones.map(y));
  const bottom = Math.min(...bones.map(y));
  const height = Math.max(1e-3, top - bottom);

  // 발 — 말단 뼈 중 가장 낮은 것과, 그와 혈연이 없고 반대편(z 부호)인 다음 것
  // ★ 부모가 뼈인 말단만 본다. Tripo 는 뼈대 트리 **밖에** 'neutral_bone' 같은 외톨이 뼈를 하나 남기는데, 그게 발보다 낮으면
  //   발로 잡혀 "두 발의 공통 조상" 이 없어 탐색이 통째로 실패한다 (2026-09-01 리더 리그에서 겪었다)
  const leaves = bones.filter((b) => !b.children.some((c) => (c as THREE.Bone).isBone) && (b.parent as THREE.Bone | null)?.isBone);
  const byY = [...leaves].sort((a, b) => y(a) - y(b));
  const footA = byY[0];
  const footB = byY.find((b) => !related(b, footA) && Math.sign(z(b)) !== Math.sign(z(footA))) ?? byY.find((b) => !related(b, footA));
  if (!footB) return fail('두 번째 발을 못 찾았다');
  // 엉덩이 — 두 발의 가장 가까운 공통 조상(뼈)
  const ancestors = (b: THREE.Object3D) => {
    const out: THREE.Object3D[] = [];
    for (let p = b.parent; p; p = p.parent) out.push(p);
    return out;
  };
  const ancA = ancestors(footA);
  const hips = ancestors(footB).find((p) => (p as THREE.Bone).isBone && ancA.includes(p)) as THREE.Bone | undefined;
  if (!hips) return fail('엉덩이(두 발의 공통 조상)를 못 찾았다');
  const chainDown = (foot: THREE.Object3D): THREE.Bone[] => {
    const out: THREE.Bone[] = [];
    for (let p: THREE.Object3D | null = foot; p && p !== hips; p = p.parent) if ((p as THREE.Bone).isBone) out.unshift(p as THREE.Bone);
    return out;
  };
  const legA = chainDown(footA);
  const legB = chainDown(footB);
  // 오른쪽 = +z (앞 +x, 위 +y 의 오른손 좌표)
  const [legL, legR] = z(footA) < z(footB) ? [legA, legB] : [legB, legA];

  // 손 — 다리를 뺀 말단 뼈 중 좌우(z)로 가장 먼 둘. 위팔 = 부모가 몸통(|z| 작음) 가까이 있는 첫 뼈
  const legBones = new Set<THREE.Object3D>([...legA, ...legB]);
  const byZ = leaves.filter((b) => !legBones.has(b)).sort((a, b) => Math.abs(z(b)) - Math.abs(z(a)));
  const handA = byZ[0];
  const handB = byZ.find((b) => !related(b, handA) && Math.sign(z(b)) !== Math.sign(z(handA)));
  if (!handB) return fail('두 번째 손을 못 찾았다');
  const NEAR = 0.075 * height;
  const armOf = (hand: THREE.Object3D): THREE.Bone[] => {
    const chain: THREE.Bone[] = [];
    for (let p: THREE.Object3D | null = hand; p && (p as THREE.Bone).isBone; p = p.parent) {
      chain.unshift(p as THREE.Bone);
      if (p.parent && Math.abs(z(p.parent)) < NEAR) break;
    }
    return chain;
  };
  const armA = armOf(handA);
  const armB = armOf(handB);
  if (armA.length < 3 || armB.length < 3) return fail('팔 사슬이 짧다 (위팔·아래팔·손이 필요)');
  // 손가락 뼈가 있는 리그는 사슬이 손목보다 길게 잡힌다 — 팔은 [위팔·아래팔·손목] 세 마디까지다 (손가락은 아래에서 따로)
  armA.length = 3;
  armB.length = 3;
  const [armL, armR] = z(handA) < z(handB) ? [armA, armB] : [armB, armA];

  // 머리 — 가장 높은 뼈. 몸통 — 엉덩이에서 머리로 가는 길의 첫 뼈
  const head = [...bones].sort((a, b) => y(b) - y(a))[0];
  let torso: THREE.Bone | null = null;
  for (let p: THREE.Object3D | null = head; p; p = p.parent) {
    if (p.parent === hips) {
      torso = p as THREE.Bone;
      break;
    }
  }

  // 손가락 — 손목 아래로 달린 뼈들. 마디마다 "이 마디가 뻗은 쪽" 을 손바닥 쪽(모델 아래)으로 돌리는 축을 미리 잰다
  const fingers: FingerCurl[] = [];
  for (const arm of [armL, armR]) {
    const hand = arm[2];
    hand.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone || b === hand || !b.parent) return;
      const child = b.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
      const dir = child ? pos.get(child)!.clone().sub(pos.get(b)!) : pos.get(b)!.clone().sub(pos.get(b.parent)!);
      if (dir.lengthSq() < 1e-10) return;
      const axis = new THREE.Vector3().crossVectors(dir.normalize(), DOWN);
      if (axis.lengthSq() < 1e-8) return;
      fingers.push({ bone: b, axis: axis.normalize() });
    });
  }

  const bind = new Map<THREE.Bone, Bind>();
  for (const b of bones) {
    const r = rel.get(b)!;
    bind.set(b, { local: b.quaternion.clone(), rel: r.clone(), relInv: r.clone().invert(), pos: pos.get(b)!.clone() });
  }
  return { bones, bind, hips, torso, head, legL, legR, armL, armR, fingers, height };
}

/** 자세 파라미터 — 스크린샷(scratchpad pose-sheet)으로 맞춘 값. 각도는 도(°), 길이는 키 비율 */
/**
 * 자세 파라미터 — 스크린샷(scratchpad pose-sheet)으로 맞춘 값. 각도는 도(°), 길이는 키 비율(H = 뼈대 높이).
 *
 * ★ 이 리그의 팔은 짧다 — 위팔 0.175H + 아래팔 0.146H = 닿는 거리 0.32H, 어깨 간격 0.26H. 손 목표를 그보다 멀리 두면
 *   IK 가 팔을 쭉 펴 버려 좀비처럼 보인다 (2026-08-30 저녁 사용자: 걷기·파지가 어색). 그래서 소총 파지는 두 손을 따로 찍지 않고
 *   **오른손 자리 + 총열 방향 + 두 손 간격** 으로 정한다 (carry). 왼손 = 오른손 + 간격·총열. 어느 값이든 어깨에서 0.30H 안이어야 한다.
 */
export const POSE = {
  /**
   * 서 있기 — 걷기와 같은 저자세 캐리에 숨(breath: 두 손이 오르내리는 폭, 키 비율)·몸통 흔들림·둘러보기만.
   * 다리는 walk 과 같은 이유로 모은다(splay 음수 + lift) — 안 그러면 걸음을 멈출 때마다 발이 25cm 씩 벌어졌다 놓인다
   */
  idle: { sway: 1.5, look: 8, breath: 0.004, splay: -5, lift: 0.009 },
  /**
   * 걷기 — 다리는 흔들고 발목이 발을 수평으로 되돌린다(발끝 밀기 toe·발뒤꿈치 닿기 heel), 골반은 좌우로 흔들리며 걸음에 맞춰 돈다(pelvis),
   * 몸통은 반대로 돈다(twist). 소총은 **저자세(muzzle down)**: 오른손이 가슴 앞 손잡이, 왼손은 아래로 늘어져 앞 손잡이, 총열은 앞·아래(≈50°)·왼쪽, 개머리판은 오른어깨 앞.
   *   (팔이 짧아 두 손을 허리 높이에 두면 왼손이 안 닿는다 — 오른손을 가슴에 두고 총열을 세워 왼손이 닿게 한 값)
   *   handR   오른손 목표 — 오른어깨 기준 (앞, 위, 오른쪽)·키 비율, 어깨의 현재 방향(몸통 회전 뒤)에서
   *   barrel  총열 방향 (모델축, 정규화 안 해도 됨) · spacing 두 손 간격(키 비율) · pole 팔꿈치가 향할 쪽
   *   bob     골반 위아래(두 걸음에 한 번) · sway 좌우 · pelvis 골반 회전 · twist 몸통 반대 회전
   *
   * ★ splay 는 **음수다**. 이 리그의 바인드(T 포즈) 자체가 다리를 벌리고 서 있어서 — 엉덩이 사이 0.232m 인데 발 사이가 0.50m
   *   (키 2.05 기준, 다리가 바깥으로 ≈8.6°) — 양수 splay 를 더하면 발이 0.66m 까지 벌어져 뒤뚱거린다
   *   (2026-08-31 사용자: "발 사이가 너무 벌어져 있으니 정자세 걸음으로"). 음수로 그 벌어짐을 되돌려 발 사이를 엉덩이 너비쯤(≈0.25m)에 둔다.
   *   다리를 모으면 그만큼 키가 서므로 발이 바닥을 파고든다 — lift(키 비율)로 골반을 그만큼 올려 되돌린다 (파고드는 깊이는 예전과 같게)
   */
  walk: {
    cadence: 0.75,
    thigh: 30,
    knee: 34,
    toe: 18,
    heel: 12,
    lean: 4,
    bob: 0.016,
    sway: 0.01,
    pelvis: 3,
    twist: 5,
    splay: -7,
    toeOut: 3,
    lift: 0.018,
    scan: 7,
    /** 자연스러운 박자보다 얼마나 느리고 크게 딛나 — 1 보다 크면 군인의 의도된 걸음(성큼) */
    march: 1.18,
    carry: { handR: [0.15, -0.05, -0.12] as const, barrel: [0.45, -0.55, -0.7] as const, spacing: 0.13, poleR: [-0.4, -1, 0.7] as const, poleL: [0.3, -0.6, -0.8] as const },
    /** 걸을 때 소총이 출렁이는 폭(키 비율) */
    rock: 0.006,
  },
  run: {
    cadence: 1.5,
    thigh: 46,
    knee: 72,
    toe: 30,
    heel: 8,
    lean: 11,
    bob: 0.018,
    sway: 0.006,
    pelvis: 6,
    twist: 8,
    splay: -8,
    toeOut: 2,
    lift: 0.017,
    scan: 0,
    march: 1,
    /** 달릴 땐 소총을 더 높이 몸에 붙여(port arms) 든다 */
    carry: { handR: [0.15, -0.02, -0.12] as const, barrel: [0.55, -0.42, -0.72] as const, spacing: 0.13, poleR: [-0.4, -1, 0.7] as const, poleL: [0.3, -0.6, -0.8] as const },
    rock: 0.01,
  },
  aim: {
    /**
     * 사격 자세 — 몸통을 오른쪽으로 크게 비틀어(blade 45°) 왼어깨를 앞에 두고, 오른손은 **모델축**으로 오른어깨 앞 0.20H(팔이 짧아 이만큼은 내밀어야
     * 총이 가슴에서 떨어진다) — 개머리판(손잡이 뒤 0.18H)이 어깨 홈에 들어오고 총열은 모델 정면(+x): 겉 그룹 heading 이 플레이어를 향하므로 총구가 곧 플레이어.
     * 왼손은 총열 앞 손잡이. 비튼 몸통 덕에 왼팔이 가슴을 가로지르지 않고 앞으로 뻗는다 (2026-08-30 저녁, top 뷰로 확인).
     */
    blade: 45,
    carry: { handR: [0.15, -0.02, -0.06] as const, barrel: [1, 0, 0] as const, spacing: 0.15, poleR: [-0.2, -1, 0.6] as const, poleL: [0, -1, -0.3] as const, model: true },
    lean: 4,
    /** 사격 스탠스 — 왼발 앞·오른발 뒤(허벅지 각), 무릎은 살짝 굽힌다 */
    stance: { front: 12, back: 8, knee: 9 },
    recoilMs: 170,
    /**
     * 반동 — 두 손이 뒤로 밀리는 거리(키 비율)·총구가 들리는 각·몸통이 뒤로 젖혀지는 각.
     * 2026-08-31 사용자("화력 임팩트를 더 세게"): 0.03·5°·0 → 0.055·10°·3.5°. 한 발마다 몸 전체가 뒤로 밀린다
     */
    recoilBack: 0.055,
    recoilUp: 10,
    recoilLean: 3.5,
  },
  /**
   * 분노 — 무대 위의 리더(features/warehouse/LeaderRobot)만 쓴다. 경비는 이 모드를 부르지 않는다.
   * 총구를 앞·위로 30° 치켜들어 들이대고, 몸통은 뒤로 젖히고 머리를 든다. 몸 전체가 잔떨림(shake·rock)으로 떤다.
   *
   * ★ 두 손을 **머리 높이로 올리지 않는다.** 처음엔 총을 머리 위로 세웠는데 (raise 0.1 · barrel 거의 +y), 이 몸은 어깨 갑주가
   *   커서 위팔을 많이 돌리면 갑주가 팔과 머리를 통째로 삼킨다 (2026-09-01 자세 시트에서 확인). 팔은 가슴 높이에 두고
   *   **총열 각도만** 올려 성난 모양을 만든다. barrel 은 수직에 가까우면 안 된다 — carry() 의 up = Y − barrel(barrel·Y) 가 0 이 된다.
   * ★ 그리고 총열을 **앞(+x)으로 세우면 안 된다.** 보는 사람은 무대 정면에 있어서 앞으로 든 총이 얼굴을 그대로 가린다
   *   (첫 판 barrel [0.85,0.5,−0.15] 이 그랬다). 옆으로(모델 −z, 화면 오른쪽) 비스듬히 들면 머리와 총이 실루엣에 같이 남는다.
   *   반대쪽(+z)으로 들면 왼손이 몸을 가로질러 0.40H 를 뻗어야 해서 팔이 곧게 펴진다 — 어느 쪽으로 드는지가 왼팔을 정한다.
   */
  angry: {
    lean: -10,
    head: -14,
    look: 5,
    splay: -3,
    lift: 0.006,
    /** 잔떨림 — 몸통 각(°)·두 손 높이(키 비율)·초당 흔들림 */
    shake: 2.6,
    rock: 0.008,
    tremorHz: 12,
    /** 두 손을 함께 들어올리는 높이(키 비율) — 가슴 언저리를 넘지 않는다 */
    raise: 0.02,
    carry: { handR: [0.14, 0.04, -0.06] as const, barrel: [0.2, 0.6, -0.77] as const, spacing: 0.14, poleR: [-0.3, -1, 0.6] as const, poleL: [0.1, -1, -0.4] as const, model: true },
  },
  /**
   * 소총 — 손잡이 중심(소총 좌표, 길이 1 기준)과 손 안에서의 자리(palm: 기준 총 좌표 = 총의 왼쪽·위·총열, 키 비율).
   *
   * ★ 이 리그의 손에는 **손가락 뼈가 없다** — 편 손 그대로다. 그래서 "쥐다" 는 손가락이 총을 **관통**해야 성립한다.
   *   손 메시는 손목에서 손가락 방향으로 0.145H 뻗고 한가운데(무게중심)가 0.078H 다 (2026-08-30 측정). 쥐기 기저에서 손가락 방향은
   *   기준 좌표로 (0, −cos30, +sin30) 이므로 손잡이를 그 선 위 0.072H 쯤에 두면 손가락 사이를 지난다. 예전 값(0,−0.015,0.045)은
   *   손가락 선에서 55° 벗어나 있어 총이 편 손 **옆**에 떠 있었다 (사용자 스크린샷: "총을 쥐고있지도 않은데 총이 떠 있다").
   *   x 0.018 은 손잡이 두께의 절반 — 오른손은 손잡이의 오른쪽 면에 붙는다.
   * palmL 은 왼손이 총열을 받치는 점이 총열선에서 (총의 오른쪽, 아래) 로 얼마나 떨어지나. handL 은 그 점에서 손목까지 —
   *   왼손 손가락은 총구 쪽을 보므로 손목을 손 길이(0.072H)만큼 뒤에 둬야 총열이 손바닥 한가운데를 지난다
   */
  rifle: { len: 0.42, grip: [0, 0.05, -0.07] as const, palm: [0.018, -0.062, 0.036] as const, palmL: [0.01, 0.02] as const, handL: 0.072, tiltR: 30, tiltL: 12 },
  /**
   * 손가락 굽히기 — 손목에서 start(키 비율) 넘게 떨어진 손 정점을 손바닥 쪽으로 최대 angle 도까지 말아 굽힌다.
   * 로드할 때 지오메트리에 **한 번** 구워 넣는 모양이라 어느 자세에서도 손가락이 손잡이를 감싼다 (curlHands).
   */
  curl: {
    start: 0.05,
    angle: 70,
    /** 손가락 **뼈**가 있는 리그(리더)는 정점을 굽는 대신 마디마다 이만큼 접는다 — 세 마디면 합쳐 100° 쯤 */
    finger: 34,
  },
  /** 한 자세에서 다음 자세로 가는 속도(1/s) */
  blend: 9,
} as const;

/* ─────────────────────────────── 손가락 굽히기 (로드 때 한 번) ─────────────────────────────── */

/**
 * 이 리그의 손에는 **손가락 뼈가 없다** — Tripo 자동 리그가 손을 하나의 뼈로 잡아 T 포즈의 편 손 그대로 굳어 있다.
 * 그래서 자세를 아무리 맞춰도 "쥔" 손이 안 나온다 (2026-08-30 사용자: "총을 쥐고있지도 않은데 총이 떠 있다").
 * 뼈를 늘리는 대신 **정점을 굽는다**: 손 뼈에 실린 정점을 뼈 국소 공간으로 옮겨, 손목에서 start 넘게 떨어진 만큼
 * 손바닥 쪽으로 점점 더 돌린다(굽힘 변형). 손목 언저리는 0도라 손등과 이어지는 자리가 매끄럽다.
 *
 * 지오메트리는 인스턴스끼리 공유하므로(SkeletonUtils.clone) 손 이름표를 지오메트리에 남겨 **딱 한 번만** 굽는다.
 * 되돌리려면 이 호출만 지우면 된다 — 자산은 그대로다.
 */
export function curlHands(rig: Rig, root: THREE.Object3D): void {
  curlHand(rig, root, rig.armR[rig.armR.length - 1]);
  curlHand(rig, root, rig.armL[rig.armL.length - 1]);
}

/** 이 정점이 이 뼈에 실린 무게 */
function boneWeight(si: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, sw: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, bone: number): number {
  let w = 0;
  if (si.getX(i) === bone) w = Math.max(w, sw.getX(i));
  if (si.getY(i) === bone) w = Math.max(w, sw.getY(i));
  if (si.getZ(i) === bone) w = Math.max(w, sw.getZ(i));
  if (si.getW(i) === bone) w = Math.max(w, sw.getW(i));
  return w;
}

function curlHand(rig: Rig, root: THREE.Object3D, hand: THREE.Bone): void {
  const bindHand = rig.bind.get(hand);
  if (!bindHand) return;
  // 손가락 뼈가 있는 리그는 뼈로 접는다 (EnforcerPoser.update) — 정점을 굽지 않는다
  if (hand.children.some((c) => (c as THREE.Bone).isBone)) return;
  // 손바닥이 보는 쪽 — T 포즈에서 두 손 다 아래(−y)를 본다. 그걸 뼈 국소로
  const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(bindHand.relInv).normalize();
  const start = POSE.curl.start * rig.height;
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
    const bone = mesh.skeleton.bones.indexOf(hand);
    if (bone < 0) return;
    const geo = mesh.geometry;
    const done = (geo.userData.curledHands ??= {}) as Record<string, boolean>;
    if (done[hand.name]) return;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    if (!pos || !si || !sw) return;
    const toBone = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[bone]).multiply(mesh.bindMatrix);
    const fromBone = toBone.clone().invert();
    const qTo = new THREE.Quaternion().setFromRotationMatrix(toBone);
    const qFrom = qTo.clone().invert();
    // 손 정점 모으기 — 무게가 실린 것만. 손가락 축은 그 점들의 무게중심 방향이다
    const ids: number[] = [];
    const pts: THREE.Vector3[] = [];
    const centroid = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (boneWeight(si, sw, i, bone) < 0.5) continue;
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toBone);
      ids.push(i);
      pts.push(p);
      centroid.add(p);
    }
    if (ids.length < 32) return;
    centroid.divideScalar(ids.length);
    const finger = centroid.clone().normalize();
    const len = Math.max(...pts.map((p) => p.dot(finger)));
    if (len <= start + 1e-4) return;
    // 손가락 끝을 손바닥 쪽으로 — 축은 손가락×손바닥, 회전 중심은 손가락 축 위 start
    const axis = new THREE.Vector3().crossVectors(finger, palm).normalize();
    const pivot = finger.clone().multiplyScalar(start);
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k];
      const p = pts[k];
      const t = Math.min(1, Math.max(0, (p.dot(finger) - start) / (len - start)));
      if (t <= 0) continue;
      q.setFromAxisAngle(axis, t * POSE.curl.angle * D2R);
      v.copy(p).sub(pivot).applyQuaternion(q).add(pivot).applyMatrix4(fromBone);
      pos.setXYZ(i, v.x, v.y, v.z);
      if (nrm) {
        n.fromBufferAttribute(nrm, i).applyQuaternion(qTo).applyQuaternion(q).applyQuaternion(qFrom).normalize();
        nrm.setXYZ(i, n.x, n.y, n.z);
      }
    }
    pos.needsUpdate = true;
    if (nrm) nrm.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    done[hand.name] = true;
  });
}

/** 소총 파지 한 벌 — handR 은 오른어깨의 지금 자리 기준 (앞, 위, 오른쪽)·키 비율. model 이면 모델축으로(몸통이 돌아도 총은 정면), 아니면 어깨의 현재 방향으로(총이 몸통을 따라 돈다) */
type Carry = { handR: readonly [number, number, number]; barrel: readonly [number, number, number]; spacing: number; poleR: readonly [number, number, number]; poleL: readonly [number, number, number]; model?: boolean };

const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

/** 모델축 회전 — 도 단위 */
function rot(axis: THREE.Vector3, deg: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axis, deg * D2R);
}

/** 세 축 이미지를 열로 하는 회전 */
function basis(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(x, y, z));
}

/**
 * 오른손 "쥐기" 기저 — T 포즈 손(엄지 +x·손바닥 −y·손가락 +z)의 엄지가 총열을, 손바닥이 총의 왼쪽(몸 안쪽)을 보게.
 * 그러면 손가락은 손잡이를 따라 아래로 감긴다. 오른손은 손잡이의 **오른쪽**에 붙는다 (총열 +z·위 +y 면 +x 가 총의 왼쪽 — right = barrel×up).
 */
function gripR(barrel: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const right = v1.crossVectors(barrel, up).normalize();
  const q = basis(barrel, right, v2.crossVectors(barrel, right));
  // 손가락 뼈가 없어 손은 편 채다 — 손가락이 곧장 아래가 아니라 앞·아래로 기울면 손잡이를 감싸는 것처럼 읽힌다 (손바닥 법선 = 총의 오른쪽 축으로 돌린다)
  return q.premultiply(new THREE.Quaternion().setFromAxisAngle(right, POSE.rifle.tiltR * D2R));
}

/**
 * 왼손(앞 손잡이) — 손바닥이 위로 총열 아래를 받치고, **손가락은 총구 쪽**을 따라간다. 엄지는 총의 오른쪽.
 * (예전엔 손가락을 총의 왼쪽으로 뻗게 두었는데, 조준처럼 총열이 수평이면 편 손이 총 옆으로 튀어나와 아무것도 안 쥔 것처럼 보였다 — 2026-08-30)
 * tiltL 만큼 손가락 끝을 들어 총열 위로 감기는 것처럼.
 */
function gripL(barrel: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const right = v1.crossVectors(barrel, up).normalize();
  const q = basis(right, v2.copy(up).negate(), barrel);
  return q.premultiply(new THREE.Quaternion().setFromAxisAngle(right, POSE.rifle.tiltL * D2R));
}

/** 왼손 손가락이 향하는 쪽(모델축) — 손목을 손 길이만큼 뒤에 두려고 쓴다 */
function fingersL(barrel: THREE.Vector3, up: THREE.Vector3): THREE.Vector3 {
  return Z.clone().applyQuaternion(gripL(barrel, up));
}

/** 소총 기저 — 소총의 +z 가 총열, +y 가 위 */
function rifleBasis(barrel: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  return basis(v1.crossVectors(up, barrel).normalize(), up, barrel);
}

/**
 * 총의 크기와 손잡이 — 총마다 다르다. len 은 키 대비 총 길이, grip 은 총 좌표(길이 1, +z 총열·+y 위)에서 손잡이 중심.
 * 기본값은 심문 AI 의 소총(POSE.rifle) — 리더의 대형 캐논은 제 값을 넘긴다 (features/warehouse/LeaderRobot).
 */
export interface RifleSpec {
  len: number;
  grip: readonly [number, number, number];
}

/**
 * 소총을 오른손에 — 쥐기 기저(canonical: 총열 +z·위 +y)와 소총 기저의 관계는 상수다.
 *   손의 루트 기준 회전 = Δgrip · bindRel  →  소총 local 회전 = (Δgrip · bindRel)⁻¹ · Q소총
 * 위치는 손잡이 중심(POSE.rifle.grip · len)이 손 원점(+palm 조정)에 오게. 크기도 여기서 준다.
 */
export function attachRifle(rig: Rig, rifle: THREE.Object3D, spec: RifleSpec = POSE.rifle): void {
  const hand = rig.armR[rig.armR.length - 1];
  const b = rig.bind.get(hand)!;
  const H = rig.height;
  const handRel = gripR(Z, Y).multiply(b.rel).invert();
  const qRifle = rifleBasis(Z, Y);
  rifle.quaternion.copy(handRel).multiply(qRifle);
  const grip = new THREE.Vector3().fromArray(spec.grip).multiplyScalar(spec.len * H).applyQuaternion(qRifle);
  const palm = new THREE.Vector3().fromArray(POSE.rifle.palm).multiplyScalar(H);
  rifle.position.copy(palm).sub(grip).applyQuaternion(handRel);
  rifle.scale.setScalar(spec.len * H);
  hand.add(rifle);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export class EnforcerPoser {
  private readonly target = new Map<THREE.Bone, THREE.Quaternion>();
  private phase = 0;
  private time = 0;
  /** 이번 프레임에 각 뼈에 준 Δ (자식 Δ 계산용) */
  private readonly delta = new Map<THREE.Bone, THREE.Quaternion>();
  /** 골반(루트 뼈)의 바인드 local 위치와 이번 프레임의 오프셋(모델축) — 걸음의 위아래·좌우 흔들림 */
  private readonly hipsBind: THREE.Vector3;
  private readonly hipsOffset = new THREE.Vector3();

  constructor(private readonly rig: Rig) {
    for (const b of rig.bones) {
      this.target.set(b, rig.bind.get(b)!.local.clone());
      this.delta.set(b, new THREE.Quaternion());
    }
    this.hipsBind = rig.hips.position.clone();
  }

  /** dt 초 진행 — 목표 자세를 만들고 뼈를 그쪽으로 slerp */
  update(dt: number, state: PoseState, now = performance.now()): void {
    const rig = this.rig;
    this.time += dt;
    for (const b of rig.bones) {
      this.target.get(b)!.copy(rig.bind.get(b)!.local);
      this.delta.get(b)!.identity();
    }
    this.hipsOffset.set(0, 0, 0);

    if (state.mode === 'walk' || state.mode === 'run') this.gait(state.mode === 'run' ? POSE.run : POSE.walk, dt, state.speed);
    else if (state.mode === 'aim') this.aim(now - (state.shotAt ?? -Infinity));
    else if (state.mode === 'angry') this.angry();
    else this.idle();

    // 손가락은 자세와 무관하게 늘 감싼 모양 — 손가락 뼈가 있는 리그만 (없으면 빈 배열이고 curlHands 가 정점을 굽는다)
    for (const f of rig.fingers) this.set(f.bone, rot(f.axis, POSE.curl.finger));

    const k = 1 - Math.exp(-dt * POSE.blend);
    for (const b of rig.bones) b.quaternion.slerp(this.target.get(b)!, k);
    v1.copy(this.hipsBind).add(this.hipsOffset);
    rig.hips.position.lerp(v1, k);
  }

  /** Δ(모델축 회전)들을 순서대로 적용 — 첫 것이 먼저 */
  private set(bone: THREE.Bone | undefined, ...deltas: THREE.Quaternion[]): void {
    if (!bone) return;
    const b = this.rig.bind.get(bone)!;
    q1.identity();
    for (const d of deltas) q1.premultiply(d);
    this.delta.get(bone)!.copy(q1);
    q2.copy(b.relInv).multiply(q1).multiply(b.rel);
    this.target.get(bone)!.copy(b.local).multiply(q2);
  }

  /**
   * 이 뼈의 지금 자리와 조상들의 Δ 곱 (루트 기준, 모델축) — 조상(골반·몸통)이 돌아간 만큼 어깨가 옮겨진 것을 IK 가 알아야
   * 손이 제자리에 온다. 뼈 b 의 최종 회전 = (조상 Δ 곱)·Δb·bindRel, 자리 = 부모 자리 + (부모까지의 Δ 곱)·(bind 차)
   */
  private frameOf(bone: THREE.Bone): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    const path: THREE.Bone[] = [];
    for (let p: THREE.Object3D | null = bone; p && (p as THREE.Bone).isBone; p = p.parent) path.unshift(p as THREE.Bone);
    const bind = this.rig.bind;
    const rot = new THREE.Quaternion();
    const pos = bind.get(path[0])!.pos.clone().add(this.hipsOffset);
    for (let i = 1; i < path.length; i++) {
      rot.multiply(this.delta.get(path[i - 1])!);
      pos.add(v3.subVectors(bind.get(path[i])!.pos, bind.get(path[i - 1])!.pos).applyQuaternion(rot));
    }
    return { pos, rot };
  }

  /** 팔 사슬의 조상·위팔·아래팔 Δ 를 합친 것 — 손의 최종 회전 = Δ조상 · Δ위팔 · Δ아래팔 · Δ손 · bind */
  private armDelta(arm: THREE.Bone[]): THREE.Quaternion {
    return this.frameOf(arm[0]).rot.multiply(this.delta.get(arm[0])!).multiply(this.delta.get(arm[1])!);
  }

  /** 오른손은 늘 소총을 쥔다 — 총열을 barrel 로, 소총 위를 up 으로 (모델축) */
  private holdRifle(barrel: THREE.Vector3, up: THREE.Vector3): void {
    const arm = this.rig.armR;
    const want = gripR(barrel, up);
    this.set(arm[2], this.armDelta(arm).invert().multiply(want));
  }

  private idle(): void {
    const { torso, head, legL, legR, height: H } = this.rig;
    const p = POSE.idle;
    const t = this.time;
    // 다리를 모으고(바인드가 벌어져 있다 — POSE.walk 의 ★) 모은 만큼 골반을 올린다
    this.set(legR[0], rot(X, -p.splay));
    this.set(legL[0], rot(X, p.splay));
    this.hipsOffset.set(0, p.lift * H, 0);
    // 몸통·머리 먼저 — 팔의 조상이라 armDelta 가 읽는다. 서 있을 때도 소총은 두 손으로 저자세 (2026-08-30 사용자: 총을 늘어뜨리지 말고 들고 응시)
    this.set(torso ?? undefined, rot(X, p.sway * Math.sin(t * 0.9)));
    this.set(head ?? undefined, rot(Y, p.look * Math.sin(t * 0.45)));
    this.carry(POSE.walk.carry, p.breath * Math.sin(t * 1.3), 0, 0);
  }


  /**
   * 걸음 빠르기와 보폭 — **실제로 나아가는 속도에서 뽑는다**. 안 그러면 0.85m/s 로 미끄러지는 경비가 2.1걸음/s 로 다리를 놀려
   * 종종거리는 모델 워킹이 된다 (2026-08-30 사용자: "위압감이 없어").
   *
   * 걷기 물리: 보폭도 박자도 속도와 함께 는다 — 박자 ∝ √속도. 다리 길이로 정규화한 속도 u = speed/다리길이 (1/s) 는
   * 모형 크기와 무관하므로 사람 기준 한 점(u 1.4 에서 0.93주기/s ≈ 1.9걸음/s)을 잡고 거기서 늘린다.
   * march 는 그 자연스러운 값보다 **얼마나 느리고 크게 딛나** — 군인의 의도된 걸음은 종종거리지 않는다.
   * 보폭은 POSE.thigh 가 상한이고, 실제 허벅지 각은 보폭에서 거꾸로 푼다 (2·다리길이·sinθ = 보폭).
   */
  private gaitOf(p: typeof POSE.walk | typeof POSE.run, speed?: number): { cadence: number; thigh: number; k: number } {
    const bind = this.rig.bind;
    const legLen = Math.abs(bind.get(this.rig.legR[0])!.pos.y - bind.get(this.rig.legR[2])!.pos.y);
    const maxStride = 2 * legLen * Math.sin(p.thigh * D2R);
    // 속도를 안 주면 POSE 의 기본 박자. **0 을 주면 0** 이다 — 멈춰 선 몸이 성큼성큼 제자리걸음을 하지 않게.
    // NaN·Infinity 도 "안 준 것" 으로 본다 — 그 한 값이 여기를 지나면 걸음 위상이 NaN 이 되고 뼈가 전부 NaN 이라 **몸이 사라진다**
    if (speed === undefined || !Number.isFinite(speed) || legLen < 1e-4) return { cadence: p.cadence, thigh: p.thigh, k: 1 };
    if (speed < 1e-3) return { cadence: 0, thigh: 0, k: 0 };
    const u = speed / legLen;
    const cad0 = (NAT_CADENCE * Math.sqrt(u / NAT_U)) / p.march;
    let cadence = Math.min(2.4, Math.max(0.3, cad0));
    let stride = speed / (2 * cadence);
    if (stride > maxStride) {
      stride = maxStride;
      cadence = Math.min(2.6, speed / (2 * stride));
    }
    const thigh = Math.asin(Math.min(0.95, stride / (2 * legLen))) / D2R;
    return { cadence, thigh, k: Math.min(1.2, Math.max(0.45, thigh / p.thigh)) };
  }

  /**
   * 걷기·달리기. 위상 ph: sin>0 이면 오른다리가 앞. 무릎은 다리가 뒤에서 앞으로 넘어올 때(cos>0, 흔드는 다리) 접힌다.
   * 발목: 허벅지·무릎 회전을 되돌려 발을 수평 가까이 두고(안 그러면 발끝이 하늘을 본다), 뒤로 밀 때(뒷다리, 흔들기 직전) 발끝을 내리고
   * 앞에 닿을 때 발끝을 든다. 골반은 좌우로 흔들리고(디딤다리 쪽) 앞 다리 쪽이 앞으로 돌며, 몸통은 반대로 돈다.
   */
  private gait(p: typeof POSE.walk | typeof POSE.run, dt: number, speed?: number): void {
    const { legL, legR, torso, head, hips, height: H } = this.rig;
    const g = this.gaitOf(p, speed);
    this.phase += dt * g.cadence * Math.PI * 2;
    // 위상이 한 번이라도 더러워지면 그 뒤 모든 프레임의 뼈가 NaN 이다 — 여기서 끊는다
    if (!Number.isFinite(this.phase)) this.phase = 0;
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const kneeR = Math.max(0, c);
    const kneeL = Math.max(0, -c);
    // 발끝 밀기(toe-off): 다리가 뒤에 있고 흔들기 직전 — 오른발은 ph ≈ 3π/2 조금 전, 왼발은 반 바퀴 뒤
    const toeR = p.toe * g.k * clamp01(-Math.sin(ph + 0.6));
    const toeL = p.toe * g.k * clamp01(Math.sin(ph + 0.6));
    // 발뒤꿈치 닿기: 다리가 가장 앞일 때 발끝을 든다
    const heelR = p.heel * g.k * clamp01(Math.sin(ph - 0.3)) ** 2;
    const heelL = p.heel * g.k * clamp01(-Math.sin(ph - 0.3)) ** 2;
    const thighR = g.thigh * s;
    const thighL = -g.thigh * s;
    const kR = -p.knee * g.k * kneeR;
    const kL = -p.knee * g.k * kneeL;
    // 골반 — 위아래(두 걸음에 한 번, 다리가 교차할 때 가장 높다), 좌우(디딤다리 쪽으로), 앞다리 쪽이 앞으로
    // 골반 높이 — 다리를 모은 만큼(lift) 올려 두고, 거기서 걸음마다 내려앉는다(bob)
    this.hipsOffset.set(0, (p.lift + (Math.cos(ph * 2) * 0.5 - 0.5) * p.bob * g.k) * H, -Math.sin(ph) * p.sway * H);
    this.set(hips, rot(Y, p.pelvis * g.k * s));
    // 다리를 조금 벌리고(splay) 발끝을 밖으로(toeOut) — 한 줄 위를 걷는 모델 워킹이 아니라 어깨너비로 딛는 군인 걸음
    this.set(legR[0], rot(Z, thighR), rot(X, -p.splay));
    this.set(legL[0], rot(Z, thighL), rot(X, p.splay));
    this.set(legR[1], rot(Z, kR));
    this.set(legL[1], rot(Z, kL));
    this.set(legR[2], rot(Z, -(thighR + kR) * 0.85 - toeR + heelR), rot(Y, p.toeOut));
    this.set(legL[2], rot(Z, -(thighL + kL) * 0.85 - toeL + heelL), rot(Y, -p.toeOut));
    // 몸통 — 앞으로 기울고 골반과 반대로 돈다 (어깨는 골반 반대)
    this.set(torso ?? undefined, rot(Z, -p.lean), rot(Y, -(p.pelvis + p.twist) * g.k * s));
    // 순찰하며 천천히 좌우를 훑는다 — 걸음보다 훨씬 느리게 (달릴 땐 0)
    if (p.scan > 0) this.set(head ?? undefined, rot(Y, p.scan * Math.sin(this.time * 0.5)));
    // 두 손은 소총을 쥔 채 — 걸음마다 살짝 출렁인다 (두 걸음에 한 번)
    const rock = Math.sin(ph * 2) * p.rock * g.k;
    this.carry(p.carry, rock, 0, 0);
  }

  /**
   * 두 손으로 소총을 쥔다 — 오른손 목표(오른어깨 기준·키 비율, 어깨의 현재 방향에서)와 총열 방향(모델축)·손 간격으로 왼손 자리를 정하고,
   * 각 팔은 자기 어깨의 현재 좌표계에서 IK 로 푼다. 손목은 총열에 맞춘 쥐기.
   *   lift 두 손을 함께 올리는 값(키 비율) · back 총열 뒤로 미는 값(반동) · pitchUp 총구 드는 각(반동)
   */
  private carry(c: Carry, lift: number, back: number, pitchUp: number): void {
    const { armL, armR, height: H } = this.rig;
    const fR = this.frameOf(armR[0]);
    const barrel = new THREE.Vector3().fromArray(c.barrel).normalize();
    if (pitchUp !== 0) barrel.applyQuaternion(rot(Z, pitchUp));
    const off = new THREE.Vector3().fromArray(c.handR).multiplyScalar(H);
    if (!c.model) off.applyQuaternion(fR.rot);
    const tR = off.add(fR.pos);
    tR.y += lift * H;
    if (back > 0) tR.addScaledVector(barrel, -back * H);
    const up = Y.clone().sub(barrel.clone().multiplyScalar(barrel.dot(Y))).normalize();
    const right = new THREE.Vector3().crossVectors(barrel, up).normalize();
    // 손잡이가 놓이는 자리 — 오른손목에서 palm(기준 총 좌표: 총의 왼쪽·위·총열) 만큼. attachRifle 이 소총을 여기에 붙인다
    const grip = tR
      .clone()
      .addScaledVector(right, -POSE.rifle.palm[0] * H)
      .addScaledVector(up, POSE.rifle.palm[1] * H)
      .addScaledVector(barrel, POSE.rifle.palm[2] * H);
    // 왼손이 총열을 받치는 점 — 손잡이에서 총열을 따라 spacing 앞, 거기서 총의 오른쪽 palmL[0]·아래 palmL[1]
    const holdL = grip.clone().addScaledVector(barrel, c.spacing * H).addScaledVector(right, POSE.rifle.palmL[0] * H).addScaledVector(up, -POSE.rifle.palmL[1] * H);
    // 왼손목은 거기서 **손가락 방향으로 손 길이만큼 뒤** — 그래야 총열이 손바닥 한가운데를 지난다 (손가락 뼈가 없어 관통이 곧 파지다)
    const tL = holdL.addScaledVector(fingersL(barrel, up), -POSE.rifle.handL * H);
    this.ikTo(armR, tR, new THREE.Vector3().fromArray(c.poleR));
    this.ikTo(armL, tL, new THREE.Vector3().fromArray(c.poleL));
    this.holdRifle(barrel, up);
    this.set(armL[2], this.armDelta(armL).invert().multiply(gripL(barrel, up)));
  }

  private aim(shotAge: number): void {
    const { torso, head, legL, legR } = this.rig;
    const p = POSE.aim;
    const k = shotAge < p.recoilMs ? 1 - shotAge / p.recoilMs : 0;
    // 스탠스 — 왼발 앞, 오른발 뒤, 무릎 살짝. 발목은 발을 수평으로 되돌린다
    const st = p.stance;
    this.set(legL[0], rot(Z, st.front));
    this.set(legR[0], rot(Z, -st.back));
    this.set(legL[1], rot(Z, -st.knee));
    this.set(legR[1], rot(Z, -st.knee));
    this.set(legL[2], rot(Z, -(st.front - st.knee)));
    this.set(legR[2], rot(Z, st.back + st.knee));
    // 몸통을 오른쪽으로 비틀어 왼어깨를 앞에 (bladed) — 머리는 되돌려 총열 쪽을 본다. 쏘는 순간엔 몸통이 뒤로 젖혀진다
    this.set(torso ?? undefined, rot(Z, -p.lean + p.recoilLean * k), rot(Y, -p.blade));
    this.set(head ?? undefined, rot(Y, p.blade * 0.9), rot(Z, -4));
    // 반동 — 두 손이 총열 방향으로 뒤로 밀리고 총구가 들린다
    this.carry(p.carry, 0, p.recoilBack * k, p.recoilUp * k);
  }

  /**
   * 분노 — 총을 대각선 위로 치켜들고 몸통을 젖힌다. 리더(무대 위)만 부른다.
   * 다리는 idle 처럼 모아 두고(바인드가 벌어져 있다), 몸통·머리·두 손이 같은 떨림(tremor)을 탄다.
   */
  private angry(): void {
    const { torso, head, legL, legR, height: H } = this.rig;
    const p = POSE.angry;
    const t = this.time;
    const tremor = Math.sin(t * p.tremorHz);
    this.set(legR[0], rot(X, -p.splay));
    this.set(legL[0], rot(X, p.splay));
    this.hipsOffset.set(0, p.lift * H, 0);
    // 몸통·머리 먼저 — 팔의 조상이라 armDelta 가 읽는다
    this.set(torso ?? undefined, rot(Z, -p.lean + tremor * p.shake), rot(Y, p.look * Math.sin(t * 1.7)));
    this.set(head ?? undefined, rot(Z, p.head), rot(Y, -p.look * Math.sin(t * 1.7)));
    this.carry(p.carry, p.raise + tremor * p.rock, 0, 0);
  }

  /** 모델 공간의 목표·pole 을 어깨의 현재 좌표계(조상 Δ 를 벗긴)로 옮겨 IK */
  private ikTo(arm: THREE.Bone[], target: THREE.Vector3, pole: THREE.Vector3): void {
    const f = this.frameOf(arm[0]);
    const inv = f.rot.clone().invert();
    const t = target.clone().sub(f.pos).applyQuaternion(inv).add(this.rig.bind.get(arm[0])!.pos);
    this.ik(arm, t, pole.clone().applyQuaternion(inv));
  }

  /** 2뼈 IK — 손이 target(어깨 좌표계, 바인드 기준) 에 닿게 위팔·아래팔 Δ 를 준다. pole 은 팔꿈치가 향할 쪽 */
  private ik(arm: THREE.Bone[], target: THREE.Vector3, pole: THREE.Vector3): void {
    const { bind } = this.rig;
    const s = bind.get(arm[0])!.pos;
    const e = bind.get(arm[1])!.pos;
    const h = bind.get(arm[2])!.pos;
    const l1 = s.distanceTo(e);
    const l2 = e.distanceTo(h);
    const dir = new THREE.Vector3().subVectors(target, s);
    const d = Math.min(dir.length(), (l1 + l2) * 0.995);
    dir.normalize();
    const cos = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const sin = Math.sqrt(1 - cos * cos);
    const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (side.lengthSq() < 1e-8) side.copy(Y).sub(dir.clone().multiplyScalar(Y.dot(dir)));
    side.normalize();
    const elbow = s.clone().addScaledVector(dir, l1 * cos).addScaledVector(side, l1 * sin);
    const upperWant = elbow.clone().sub(s).normalize();
    const foreWant = target.clone().sub(elbow).normalize();
    const upperBind = e.clone().sub(s).normalize();
    const foreBind = h.clone().sub(e).normalize();
    const dU = new THREE.Quaternion().setFromUnitVectors(upperBind, upperWant);
    // 아래팔: Δ위팔·Δ아래팔·foreBind = foreWant  →  Δ아래팔 = Δ위팔⁻¹ · R(Δ위팔·foreBind → foreWant) · Δ위팔
    const foreAfterUpper = foreBind.clone().applyQuaternion(dU);
    const fix = new THREE.Quaternion().setFromUnitVectors(foreAfterUpper, foreWant);
    const dF = dU.clone().invert().multiply(fix).multiply(dU);
    this.set(arm[0], dU);
    this.set(arm[1], dF);
  }
}

function fail(why: string): null {
  console.warn(`[enforcerPose] 리그 탐색 실패 — ${why}`);
  return null;
}
