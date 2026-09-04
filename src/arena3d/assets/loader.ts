import { useGLTF } from '@react-three/drei';
import { ASSETS, type AssetId } from './manifest';

export function useAsset(id: AssetId) {
  return useGLTF(ASSETS[id].url);
}

/** 화면이 뜨기 전에 미리 받아 둔다. 남이 들어올 때 로딩이 시작되면 그 사람만 늦게 뜬다 */
export function preloadAsset(id: AssetId) {
  useGLTF.preload(ASSETS[id].url);
}
