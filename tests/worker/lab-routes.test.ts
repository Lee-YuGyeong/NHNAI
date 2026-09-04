/**
 * 화면이 부르는 API 경로가 배포 워커에도 있는지.
 *
 * 로컬은 vite 플러그인이(구독), 배포는 워커가(API 키) 같은 화면을 먹인다.
 * 워커에 경로가 없으면 **로컬에서는 멀쩡한데 배포본에서만 그 화면이 죽는다** —
 * 눈으로는 안 보이고 배포하고 나서야 드러나는 종류의 어긋남이다.
 *
 * 개발 서버와 단순 대칭을 보지 않고 **화면이 부르는 경로**를 기준으로 삼는다.
 * 개발 서버에만 남은 경로는 죽은 경로일 뿐이라 워커에 없어도 된다 —
 * 실제로 구 아레나 잔재(/api/lab/program·trial)가 그렇게 떠 있었고, 이 테스트가 그걸 찾아냈다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LAB_PATH = /'(\/api\/lab\/[a-z]+)'/g;

/** 한 파일에 박힌 '/api/lab/…' 문자열 */
function pathsIn(file: string): Set<string> {
  const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  return new Set([...src.matchAll(LAB_PATH)].map((m) => m[1]));
}

/** src 전체를 훑어 화면이 실제로 부르는 경로를 모은다 */
function pathsCalledByScreens(): Set<string> {
  const root = new URL('../../src/', import.meta.url);
  const out = new Set<string>();
  for (const name of readdirSync(root, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(name)) continue;
    const src = readFileSync(new URL(name, root), 'utf8');
    for (const m of src.matchAll(LAB_PATH)) out.add(m[1]);
  }
  return out;
}

const called = pathsCalledByScreens();
const worker = pathsIn('worker/src/index.ts');
const dev = pathsIn('tools/vite-lab.ts');

/** 아직 워커로 못 옮긴 경로 — 배포하면 이 경로를 쓰는 화면이 죽는다 */
const NOT_YET = new Set<string>();

describe('/api/lab 경로', () => {
  it('훑기가 살아 있다 — 화면이 부르는 경로를 여러 개 찾는다', () => {
    expect(called.size).toBeGreaterThan(1);
    expect(called.has('/api/lab/act')).toBe(true);
  });

  it('화면이 부르는 경로는 개발 서버에 다 있다 (로컬에서 안 돌면 여기서 잡힌다)', () => {
    expect([...called].filter((p) => !dev.has(p))).toEqual([]);
  });

  it('화면이 부르는 경로는 워커에도 있다 — 아직 못 옮긴 것만 예외', () => {
    expect([...called].filter((p) => !worker.has(p) && !NOT_YET.has(p))).toEqual([]);
  });

  it('예외 목록이 낡지 않았다 — 옮긴 경로는 목록에서 빼야 한다', () => {
    expect([...NOT_YET].filter((p) => worker.has(p))).toEqual([]);
  });

  it('워커에 아무도 안 부르는 경로를 두지 않는다', () => {
    expect([...worker].filter((p) => !called.has(p))).toEqual([]);
  });
});
