/** 60fps 로 바뀌는 값은 Redux 대신 여기(가변 Map)에. useFrame 에서 읽는다. */
export interface Transform { x: number; y: number; z: number; ry: number }

const transforms = new Map<string, Transform>();

export const worldState = {
  set(id: string, t: Transform) { transforms.set(id, t); },
  get(id: string) { return transforms.get(id); },
  remove(id: string) { transforms.delete(id); },
};
