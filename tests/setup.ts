/**
 * 테스트 공통 준비 — humanish 의 tests/setup.ts 이식.
 *
 * @testing-library/jest-dom 의 matcher(toBeInTheDocument 등)를 붙인다.
 * node 환경 파일에서도 import 되지만 matcher 를 등록만 할 뿐이라 문제되지 않는다.
 *
 * (원작에 있던 next/navigation 목은 여기 없다 — 이 프로젝트는 react-router 라서,
 *  라우터가 필요한 컴포넌트 테스트는 MemoryRouter 로 감싸면 된다.)
 */
import '@testing-library/jest-dom/vitest';

/*
 * localStorage 를 되살린다 — **jsdom 이 만든 것을 vitest 가 못 넘겨주는 자리**다.
 *
 * Node 22 부터 전역 `localStorage` 가 (실험 기능으로) 이름만 먼저 자리를 잡는다. vitest 의 jsdom
 * 환경은 전역에 이미 있는 이름은 덮지 않으므로, jsdom 의 진짜 저장소가 `globalThis` 로 안 넘어온다 —
 * 그 결과 시험 안에서는 `localStorage` 도 `window.localStorage` 도 undefined 다
 * (Node 는 `--localstorage-file` 이 없다는 경고만 한 줄 낸다).
 *
 * 브라우저에서는 멀쩡히 도는 코드가 시험에서만 죽는 것이라, 여기서 같은 계약의 저장소를 하나 끼운다.
 * **없을 때만** 끼운다 — Node·jsdom 이 제 것을 주기 시작하면 이 자리는 저절로 비켜난다.
 * 시험 사이의 정리는 각 파일의 `localStorage.clear()` 가 하던 그대로다.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>();
  const store: Storage = {
    get length() {
      return mem.size;
    },
    key: (i: number) => [...mem.keys()][i] ?? null,
    getItem: (k: string) => (mem.has(String(k)) ? (mem.get(String(k)) as string) : null),
    setItem: (k: string, v: string) => void mem.set(String(k), String(v)),
    removeItem: (k: string) => void mem.delete(String(k)),
    clear: () => mem.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: store, configurable: true, writable: true });
}
