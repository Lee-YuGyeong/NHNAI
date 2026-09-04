/**
 * 챕터 3 의 몸 — 재검실(/recheck) 안에 서 있는 것들.
 *
 * 세울 게 하나뿐이다: **검증대 뒤의 검증관**(총 든 개체). 순찰하지 않고 붙박이로 서서 나를 계속 본다
 * (AgentRobot 의 spec.stand). 사격 판정(chapter3 의 fire 무브)이 나면 이 개체가 그대로 사수가 된다 —
 * 새 몸이 문으로 들어오는 게 아니라 **묻던 놈이 쏜다** (2026-08-30 사용자 규칙, enforcerStore).
 *
 * 그리고 표식 트리거 하나. 검증대 앞 표식에 서면 문답이 시작된다 (chapter3.track).
 * 이야기·판정은 전부 features/world/chapter3.ts, 방은 world/map/recheck.tsx — 여기는 그 둘을 잇기만 한다.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { Suspense } from 'react';

import { MAPS } from '@/world/map';
import { DESK, SPOT } from '@/world/map/recheck/layout';

import { AgentRobot, type AgentSpec } from './AgentRobot';
import { chapter3 } from './chapter3';

/** 검증관 — 검증대 뒤 (대 뒷면 z −8.9 보다 뒤, 끝벽 −10 보다 앞) */
const AGENTS: AgentSpec[] = [{ armed: true, stand: { x: DESK.x, z: DESK.z - 1.05 } }];

/** 표식에 섰나 — 프레임마다 내 자리를 챕터에 넘긴다 */
function Trigger() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    chapter3.track(camera.position.x, camera.position.z, SPOT);
  });
  return null;
}

export function Chapter3Scene() {
  return (
    <group name="챕터 3 · 재검실">
      <Suspense fallback={null}>
        {AGENTS.map((a, i) => (
          /*
           * resolve — 플레이어와 같은 충돌판으로 몸을 벽·가구 밖으로 민다 (a0afd5f).
           * 붙박이라 스스로는 어디에도 안 부딪히지만, **플레이어가 밀 수 있다** (AgentRobot 의 밀어내기):
           * 검증대 뒤 0.55m 자리라 몇 번 밀면 대나 끝벽에 박힌다. 이걸 넘기면 그때마다 제자리로 밀려 나온다.
           */
          <AgentRobot spec={a} index={i} body="armed" resolve={MAPS.recheck.resolveColliders} key={i} />
        ))}
      </Suspense>
      <Trigger />
    </group>
  );
}
