/**
 * 눈 깜빡임 모프 — 눈꺼풀 뼈도 블렌드셰이프도 없는 Tripo 인체 GLB 에 **코드로 만든 모프 타깃**을 붙인다 (2026-09-04 사용자: "눈깜빡임도 넣어줘").
 *
 * 눈 자리는 기하로 찾는다 (tools/glb-simplify-lock.mjs 의 눈 띠와 같은 생각): 키 H 의 0.85~0.945 높이 띠 · 얼굴 앞면 · 코(|x| < 0.018H) 바깥.
 * 그 안에서 좌우 각각 **가장 깊이 들어간(z 작은) 정점들**이 눈구멍이다 — 눈알은 안와에 앉아 있어 이마·광대보다 안쪽이다.
 * 눈 중심 = 그 정점들의 평균. 모프 델타는 중심 반지름 r 안에서 위 눈꺼풀은 아래로, 아래 눈꺼풀은 위로 끌어 눈을 한 줄로 오므린다.
 *
 * 순수 함수 — three 를 안 끌어온다 (tools/soldier-anim-sheet.mjs 가 dev 서버로 직접 import 해 눈 중심을 눈으로 확인한다).
 */

export interface BlinkMorph {
  /** 정점마다 xyz 델타 — geometry.morphAttributes.position 에 그대로 넣는다 (영향 1 = 감은 눈) */
  delta: Float32Array;
  /** 좌·우 눈 중심 (모델 좌표) */
  eyes: [number, number, number][];
  /** 눈꺼풀이 움직이는 반지름 */
  radius: number;
}

/**
 * 몸마다 잰 눈 중심 (x, y — 모델 좌표, 키 ≈0.979). tools/soldier-eye-shot.mjs 의 정면 직교 렌더(2cm 눈금)에서 자로 읽었다 (2026-09-04).
 * 깊이(z)는 재지 않는다 — buildBlinkMorph 가 그 자리 앞면 정점 가운데 가장 깊은 곳(눈구멍)으로 맞춘다.
 * 기하로 자동 추정하는 길(가장 깊은 정점)은 관자놀이·목을 잡아 버렸다 — 표가 정답이다.
 */
export const EYES: Record<string, [number, number][]> = {
  sol_heavy_m: [[-0.021, 0.884], [0.024, 0.884]],
  sol_heavy_f: [[-0.016, 0.883], [0.025, 0.883]],
  sol_fit_f: [[-0.016, 0.89], [0.0225, 0.89]],
  sol_fit_m: [[-0.0275, 0.88], [0.016, 0.88]],
};

/**
 * 정점 속성 공간 ↔ 모델 공간. meshopt 로 줄인 GLB(KHR_mesh_quantization)는 위치를 [−1,1] 로 늘려 담고 그 되돌림을 스킨의
 * 바인드 행렬에 접어 넣는다 — 그래서 속성값은 모델 좌표가 아니다 (2026-09-04 실측: 군인은 scale 0.4895, y 오프셋 0.4895).
 * 모델 = 속성 × scale + offset. 스킨드 메시에서 뼈 하나의 matrixWorld × boneInverse 가 곧 이 변환이다 (SoldierAvatar 가 잰다).
 */
export interface AttrSpace {
  scale: number;
  offset: readonly [number, number, number];
}
export const IDENTITY_SPACE: AttrSpace = { scale: 1, offset: [0, 0, 0] };

/**
 * @param pos 정점 위치 (xyz 나열, **속성 공간**)
 * @param count 정점 수
 * @param eyesXY 눈 중심 (x, y) — **모델 공간** (EYES 표). 없으면 빈 모프
 * @param space 속성 공간 변환. 델타는 속성 공간에서 만들어지므로 셰이더가 그대로 더한다
 */
export function buildBlinkMorph(pos: ArrayLike<number>, count: number, eyesModel: readonly (readonly [number, number])[] = [], space: AttrSpace = IDENTITY_SPACE): BlinkMorph {
  const eyesXY = eyesModel.map(([x, y]): [number, number] => [(x - space.offset[0]) / space.scale, (y - space.offset[1]) / space.scale]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const H = maxY - minY;

  // 눈 중심 (x, y) 둘레 0.012H 안의 앞면 정점 가운데 가장 깊은 20% — 눈구멍의 깊이. 눈꺼풀·눈알이 그 위에 있다
  const eyes: [number, number, number][] = [];
  for (const [ex, ey] of eyesXY) {
    const near: number[] = [];
    let frontZ = -Infinity;
    for (let i = 0; i < count; i++) {
      if (Math.hypot(pos[i * 3] - ex, pos[i * 3 + 1] - ey) > 0.012 * H) continue;
      near.push(i);
      if (pos[i * 3 + 2] > frontZ) frontZ = pos[i * 3 + 2];
    }
    const front = near.filter((i) => pos[i * 3 + 2] >= frontZ - 0.03 * H);
    if (front.length === 0) continue;
    front.sort((a, b) => pos[a * 3 + 2] - pos[b * 3 + 2]);
    const deep = front.slice(0, Math.max(1, Math.floor(front.length * 0.2)));
    let cz = 0;
    for (const i of deep) cz += pos[i * 3 + 2];
    eyes.push([ex, ey, cz / deep.length]);
  }

  // 0.03H 는 눈썹까지 끌어내려 찡그림이 됐다 (정면 렌더 확인) — 눈꺼풀만 닫히는 크기
  const radius = 0.027 * H;
  const delta = new Float32Array(count * 3);
  for (const [ex, ey, ez] of eyes) {
    for (let i = 0; i < count; i++) {
      const dx = pos[i * 3] - ex;
      const dy = pos[i * 3 + 1] - ey;
      const dz = pos[i * 3 + 2] - ez;
      // 깊이 방향은 느슨하게 — 눈꺼풀은 눈알보다 앞에 있다
      const d = Math.hypot(dx, dy, dz * 0.5);
      if (d >= radius) continue;
      const t = 1 - d / radius;
      const w = t * t * (3 - 2 * t);
      // 위 눈꺼풀은 눈 중심선 조금 아래까지 내려오고, 아래 눈꺼풀은 조금 올라온다
      const toward = dy > 0 ? -dy * 0.95 - 0.002 * H : -dy * 0.4;
      delta[i * 3 + 1] += toward * w;
      // 감기면 눈꺼풀이 눈알 위로 덮이도록 살짝 앞으로
      delta[i * 3 + 2] += 0.003 * H * w;
    }
  }
  return { delta, eyes, radius };
}
