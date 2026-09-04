/**
 * 가짜 AudioContext — 시험이 **소리를 만들었는지**만 셀 수 있게 세워 두는 것.
 *
 * jsdom 에는 WebAudio 가 없다. 그래서 소리 배선을 시험하려면 이만큼은 있어야 하는데,
 * 여기서 재는 것은 **몇 개가 울기 시작하고 멎었나**뿐이다 — 어떤 파형인지는 코드가 답할
 * 질문이 아니다 (tests/shared/sfx.test.ts 머리말과 같은 선).
 */

/** 울기 시작한 것 · 멎은 것의 수, 가짜 시계, 그리고 문맥이 깨어 있나 */
export const heard = { started: 0, stopped: 0, now: 0, state: 'running' };

class Param {
  value = 0;
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  connect(next: unknown) { return next; }
  disconnect() {}
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  type = '';
  frequency = new Param();
  start() { heard.started += 1; }
  stop() { heard.stopped += 1; }
}

export class FakeAudioContext {
  get state() { return heard.state; }
  sampleRate = 48000;
  destination = new Node();
  get currentTime() { return heard.now; }
  resume() { return Promise.resolve(); }
  createGain() { return Object.assign(new Node(), { gain: new Param() }); }
  createBiquadFilter() { return Object.assign(new Node(), { type: '', frequency: new Param(), Q: new Param() }); }
  createDynamicsCompressor() {
    return Object.assign(new Node(), {
      threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(),
    });
  }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return new Source(); }
  createOscillator() { return new Source(); }
}

/** 이 시험 파일에서는 소리가 난다고 치자 */
export function installFakeAudio(): void {
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
}

/** 한 조작이 몇 개를 울리고 몇 개를 멎게 했나. 시계를 한 칸 밀어 앞 소리의 간격 제한을 넘긴다 */
export function counting(fn: () => void): { started: number; stopped: number } {
  heard.now += 1;
  heard.started = 0;
  heard.stopped = 0;
  fn();
  return { started: heard.started, stopped: heard.stopped };
}
