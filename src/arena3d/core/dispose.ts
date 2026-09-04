import type { Object3D } from 'three';

/** 씬에서 뗀 오브젝트의 geometry/material 해제 */
export function disposeObject3D(root: Object3D) {
  root.traverse((o) => {
    const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
  });
  root.removeFromParent();
}
