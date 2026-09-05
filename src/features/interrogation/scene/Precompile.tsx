/**
 * 이 무대의 셰이더를 **미리 링크시킨다.** 부품이 다 선 뒤 한 번.
 *
 * three 는 재질마다 셰이더 프로그램을 처음 그리는 프레임에 만든다. 링크 자체는 드라이버가 뒤에서 하지만,
 * 그 프로그램의 유니폼·어트리뷰트를 세는 순간(`getProgramParameter`) **링크가 끝날 때까지 자바스크립트가 멈춘다.**
 * 호루라기가 울리는 그 프레임이 바로 그 순간이었다 — 2026-09-05 측정으로 335ms, 처음 여는 판에서는 1.3초.
 * `gl.debug.checkShaderErrors = false`(HallScene) 로도 안 없어진다: 그건 오류 로그만 안 읽을 뿐,
 * 유니폼을 세는 일은 그대로 남는다.
 *
 * 그래서 무대가 안 보이게 서 있는 동안(HallScene 의 staged) 미리 시킨다. 40초 뒤 호루라기가 울릴 때는
 * 링크가 이미 끝나 있어서 세는 일이 안 기다린다.
 *
 * **무대마다 하나씩 둔다.** 낙하 무대 안에만 있던 시절엔 그 한 번이 그때 씬에 있던 것을 통째로 맡았는데,
 * 발판·원판·다리가 그 뒤에 서면 그것들은 아무도 안 데워 주다가 나중에 한 프레임에 몰렸다 — 2026-09-05
 * 측정에서 셰이더 링크 13 · 텍스처 27 이 한 프레임에 겹쳐 **1354ms** 동안 멈췄다. 무대마다 한 번씩이면
 * 그 일이 무대 수만큼 나뉜다. 이미 만들어 둔 프로그램은 다시 안 만든다(재질별로 캐시된다) — 그래서
 * 뒤에 부르는 쪽은 **자기 것만** 문다.
 */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * `onDone` 은 링크가 **끝난 뒤** 한 번 불린다 — 다음 무대를 그때 세우라고 (HallScene 의 staged).
 * 시계로 띄우면 앞 무대가 아직 데워지는 중에 다음이 서서 결국 한 프레임에 겹친다.
 */
export function Precompile({ onDone }: { onDone?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const told = useRef(false);
  useEffect(() => {
    let alive = true;
    void gl.compileAsync(scene, camera).then(() => {
      if (!alive || told.current) return;
      told.current = true;
      onDone?.();
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onDone]);
  return null;
}
