// @vitest-environment jsdom
/**
 * 대화창이 한 줄을 **언제 놓아주는가**.
 *
 * 두 화면이 같은 상자를 쓰는데 목소리가 서로 다르다:
 * - `/world` 는 미리 뽑아 둔 클립이라 길이를 안다 (voice.ts).
 * - 심문소(/interrogation)의 리더는 그 자리에서 합성돼 길이를 **미리 알 수 없다**. 그래서
 *   "아직 말하는 중인가"(speaking)로만 알 수 있다.
 *
 * 여기서 틀리면 두 방향으로 깨진다 — 안 붙잡으면 자막이 소리보다 먼저 사라지고,
 * 잘못 붙잡으면 상자가 영영 안 넘어가 대화가 멈춘다. 양쪽 다 세워 둔다.
 *
 * voice.ts 는 통째로 가짜다. 진짜는 fetch·AudioContext 를 쓰는데 여기서 보려는 것은
 * **상자가 언제 넘어가는가** 뿐이다.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueBox } from '@/features/world/DialogueBox';
import { voiceLines } from '@/features/world/voice';
import type { ChatLine } from '@/features/world/worldSlice';

vi.mock('@/features/world/voice', () => ({
  voiceLines: {
    // 클립 없음 = /world 의 대본 밖 문장과 같은 상태. 글자 기준으로만 넘어간다
    play: vi.fn(() => Promise.resolve(null)),
    prefetch: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    durationOf: vi.fn(() => undefined),
  },
}));

beforeEach(() => {
  vi.mocked(voiceLines.play).mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const line = (text: string, n = 0): ChatLine => ({ key: `k${n}`, id: 'A-1', nickname: 'A-1', text, ts: 0 });

/** 한 글자에 타이머 하나 — 가장 긴 간격(구두점 뒤 170ms)만큼씩 민다 */
const PER_CHAR = 170;
/** 다 찍힌 뒤 머무는 시간의 바닥 */
const HOLD_MIN = 2_600;
/** 줄이 비면 이만큼 더 보이다 사라진다 — **넘어간 것과 사라진 것은 다르다** */
const LINGER = 1_800;
/** 소리가 멎은 뒤 두는 말끝 여유 */
const TAIL = 450;

const SHORT = '정렬한다.';

/** 상자를 한 번 누른다 — 넘기는 손은 이것 하나다 (DialogueBox 의 onClick) */
function clickBox() {
  const el = document.querySelector('.dlg__box');
  if (!el) throw new Error('상자가 화면에 없다');
  act(() => { fireEvent.click(el); });
}

function box(speaking?: boolean) {
  // 마운트 때 이미 있던 기록은 기준선으로 삼아 건너뛰므로(DialogueBox), 빈 상태로 먼저 띄운다
  const view = render(<DialogueBox messages={[]} selfId={null} touch={false} speaking={speaking} />);
  const show = (msgs: ChatLine[], nowSpeaking = speaking) =>
    act(() => { view.rerender(<DialogueBox messages={msgs} selfId={null} touch={false} speaking={nowSpeaking} />); });
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  /**
   * 다 찍힐 때까지 민다. **한 번에 밀면 안 된다** — 다음 글자의 타이머는 이번 글자가
   * 그려진 뒤 효과에서 걸리는데, advanceTimersByTime 한 번 안에서는 React 가 그릴 틈이 없다.
   * 머무름은 마지막 글자가 그려진 뒤에야 걸리므로 여기서 축나지 않는다.
   */
  const typeOut = (text: string) => { for (let i = 0; i < text.length; i += 1) wait(PER_CHAR); };
  const onScreen = (text: string) => screen.queryByText(text) !== null;
  return { show, wait, typeOut, onScreen };
}

describe('/world — speaking 을 안 주면 예전 그대로다', () => {
  it('글자 기준 시간이 지나면 스스로 넘어간다', () => {
    // 챕터 대본이 이 시간에 조명·정지를 맞춰 둔다 (chapter1.ts). 여기가 바뀌면 연출이 어긋난다
    const { show, wait, typeOut, onScreen } = box();
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(onScreen(SHORT)).toBe(true);

    wait(HOLD_MIN + LINGER + 100);
    expect(onScreen(SHORT)).toBe(false);
  });
});

describe('소리를 누가 내는가', () => {
  it('/world 는 상자가 클립을 튼다', () => {
    const { show, typeOut } = box();
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(voiceLines.play).toHaveBeenCalledWith('A-1', SHORT, false);
  });

  it('speaking 을 주면 클립을 틀지 않는다 — 같은 문장이 두 목소리로 겹친다', () => {
    /*
     * 심문소는 리더 목소리를 제가 낸다(features/tts). 상자가 클립까지 틀면 겹친다.
     * 지금 안 겹치는 것은 이름이 한 글자 어긋나서일 뿐이다 — 리더는 'A-1', 음성 명부에는
     * 'A-01'. 누가 이름을 맞추는 순간 겹치므로, 우연 말고 규칙이 막게 한다.
     */
    const { show, typeOut } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(voiceLines.play).not.toHaveBeenCalled();
  });
});

describe('/interrogation — 소리가 끝날 때까지 붙잡는다', () => {
  it('아직 읽는 중이면 머무름이 지나도 안 넘어간다 — 자막이 소리보다 먼저 사라지던 것', () => {
    const { show, wait, typeOut, onScreen } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);

    // 글자 기준으로는 진작 지났다. 165자 방송이면 이 격차가 13.6초까지 벌어진다
    wait(HOLD_MIN * 4);
    expect(onScreen(SHORT)).toBe(true);
  });

  it('다 읽으면 놓아준다 — 붙잡기만 하면 대화가 영영 멈춘다', () => {
    const { show, wait, typeOut, onScreen } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);
    wait(HOLD_MIN + 100);
    expect(onScreen(SHORT)).toBe(true);

    show([line(SHORT)], false); // 낭독 끝
    wait(TAIL + LINGER + 100);
    expect(onScreen(SHORT)).toBe(false);
  });

  it('붙잡혀 있던 만큼 머무름을 다시 세지 않는다 — 줄 하나가 몇 배로 늘어난다', () => {
    // speaking 이 바뀔 때마다 효과가 다시 도는데, 그때마다 처음부터 머물면 상자가 계속 밀린다.
    // 위 시험은 "언젠가 넘어간다"까지만 보므로, 그 언젠가가 **곧**인지는 여기서 본다
    const { show, wait, typeOut, onScreen } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);
    wait(HOLD_MIN * 3); // 머무름은 이 사이에 다 지났다

    show([line(SHORT)], false);
    // 제대로면 말끝 여유 + 사라짐 = 2.25초. 머무름을 처음부터 다시 세면 4.4초라 여기서 안 사라진다
    wait(TAIL + LINGER + 350);
    expect(onScreen(SHORT)).toBe(false);
  });

  it('소리가 머무름보다 먼저 끝나면 읽을 시간은 지킨다 — 눈으로 읽기 전에 사라지면 안 된다', () => {
    const { show, wait, typeOut, onScreen } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);

    show([line(SHORT)], false); // 소리가 짧게 끝났다 — 머무름은 아직 한참 남았다
    wait(HOLD_MIN - 500);
    expect(onScreen(SHORT)).toBe(true);

    wait(500 + LINGER + 100); // 남은 머무름 + 사라짐
    expect(onScreen(SHORT)).toBe(false);
  });

  it('다음 줄이 서 있으면 읽는 중이어도 넘어간다 — 안 그러면 자막이 소리를 못 따라간다', () => {
    // 상자는 "지금 읽고 있는 문장"만 받는다(selectBroadcastNow). 둘째 줄이 왔다는 것은
    // 소리도 이미 그리로 넘어갔다는 뜻이라, 여기서 붙잡으면 자막만 뒤처진다
    const { show, wait, typeOut, onScreen } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);

    show([line(SHORT), line('다음 줄이다.', 1)]);
    wait(HOLD_MIN + 100);
    typeOut('다음 줄이다.');

    expect(onScreen(SHORT)).toBe(false);
    expect(onScreen('다음 줄이다.')).toBe(true);
  });
});

/*
 * 검문소 프롤로그 — 바로 위와 **반대쪽**이다.
 *
 * 저기(검증실 리더 방송)는 소리가 주인이라 상자가 "지금 읽는 문장"만 받아 쫓아간다. 여기는 상자가
 * 주인이다: 대본 열세 줄을 한꺼번에 받아 두고(InterrogationFeature 의 setPrologue) 한 줄씩 띄우며
 * onLine 으로 알리면, 바깥이 그 줄을 읽고 speaking 으로 답한다. 그러니 뒤에 줄이 서 있어도
 * 지금 나는 소리는 **이 줄**이고, 줄 길이를 보고 넘어가면 안 된다.
 *
 * 한 번 이걸로 깨졌다 (2026-09-05 사용자: 「말이 긴 경우에는 끊고 다음 말이 들어와」) — 붙잡는 조건이
 * 「줄이 비었을 때만」이라 프롤로그는 첫 줄부터 큐가 차 있어 한 번도 안 붙잡혔다.
 */
describe('/interrogation 프롤로그 — 상자가 주인이면 줄이 서 있어도 붙잡는다', () => {
  function paced(speaking: boolean, voiceMs?: number) {
    const onLine = vi.fn();
    const props = (messages: ChatLine[], nowSpeaking: boolean) => ({
      messages,
      selfId: null,
      touch: false,
      speaking: nowSpeaking,
      onLine,
      voiceMsOf: voiceMs === undefined ? undefined : () => voiceMs,
    });
    const view = render(<DialogueBox {...props([], speaking)} />);
    const show = (msgs: ChatLine[], nowSpeaking = speaking) =>
      act(() => { view.rerender(<DialogueBox {...props(msgs, nowSpeaking)} />); });
    const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    const typeOut = (text: string) => { for (let i = 0; i < text.length; i += 1) wait(PER_CHAR); };
    const onScreen = (text: string) => screen.queryByText(text) !== null;
    return { show, wait, typeOut, onScreen, onLine };
  }

  /** 프롤로그가 건네는 모양 — 대본 전체가 한 번에 온다 */
  const SCRIPT = [line(SHORT), line('다음 줄이다.', 1), line('그 다음 줄이다.', 2)];

  it('뒤에 줄이 서 있어도 다 읽을 때까지 안 넘어간다 — 긴 줄이 잘리던 것', () => {
    const { show, wait, typeOut, onScreen } = paced(true);
    show(SCRIPT);
    typeOut(SHORT);
    wait(HOLD_MIN * 4); // 글자로 잰 머무름은 진작 지났다 — 그래도 소리가 아직이다
    expect(onScreen(SHORT)).toBe(true);
    expect(onScreen('다음 줄이다.')).toBe(false);
  });

  it('다 읽으면 그때 넘어간다 — 붙잡기만 하면 대본이 영영 멈춘다', () => {
    const { show, wait, typeOut, onScreen } = paced(true);
    show(SCRIPT);
    typeOut(SHORT);
    wait(HOLD_MIN * 4);
    show(SCRIPT, false); // 소리가 멎었다
    wait(TAIL + 100);
    typeOut('다음 줄이다.');
    expect(onScreen(SHORT)).toBe(false);
    expect(onScreen('다음 줄이다.')).toBe(true);
  });

  it('뜬 줄의 열쇠를 알린다 — 바깥은 이걸로 어느 줄을 읽을지 안다', () => {
    const { show, onLine } = paced(true);
    show(SCRIPT);
    // 붙잡혀 있으니 첫 줄 하나뿐이다 — 한꺼번에 받았다고 세 줄을 다 읽어 버리면 대사가 겹친다
    expect(onLine.mock.calls.map((c) => c[0])).toEqual(['k0']);
  });

  it('소리 길이를 알면 그 길이에 맞춰 찍고 머문다 — 다 찍힌 글을 보며 소리만 기다리지 않게', () => {
    // 글자로만 재면 이 줄은 머무름(2.6초)+여운(1.8초)이면 사라진다. 소리가 8초라고 알려 주면 안 사라진다
    const { show, wait, typeOut, onScreen } = paced(false, 8_000);
    show([line(SHORT)]);
    typeOut(SHORT);
    wait(HOLD_MIN + LINGER + 200);
    expect(onScreen(SHORT)).toBe(true);
  });
});

/**
 * 소리가 귀에 닿기까지의 늦음 (2026-09-05 사용자: 「관리자뿐 아니라 다들 조금씩 늦게 시작해」).
 *
 * `src.start()` 는 곧바로 돌아오지만 소리는 오디오 장치를 다 지나야 들린다 — 블루투스면 그게
 * 150~300ms 다. 그동안 자막만 굴러가면 **전부가 조금씩 늦게 시작하는 것처럼** 들린다.
 * 한 사람만이 아니라 전부라는 것이 이 값의 지문이고, 그래서 줄이 아니라 **첫 글자**에 얹는다.
 */
describe('/interrogation 프롤로그 — 자막을 소리가 닿는 때에 연다', () => {
  const LAG = 300;
  function lagged(voiceMs: number | undefined, voiceLagMs: number) {
    const props = (messages: ChatLine[]) => ({
      messages,
      selfId: null,
      touch: false,
      speaking: true,
      onLine: () => {},
      voiceMsOf: voiceMs === undefined ? undefined : () => voiceMs,
      voiceLagMs,
    });
    const view = render(<DialogueBox {...props([])} />);
    const show = (msgs: ChatLine[]) => act(() => { view.rerender(<DialogueBox {...props(msgs)} />); });
    const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    const onScreen = (text: string) => screen.queryByText(text) !== null;
    return { show, wait, onScreen };
  }

  it('첫 글자가 늦음만큼 늦게 찍힌다 — 그 사이에 소리가 스피커까지 간다', () => {
    const { show, wait, onScreen } = lagged(8_000, LAG);
    show([line(SHORT)]);
    // 늦음이 지나기 전에는 한 글자도 안 찍힌다 (글자 간격은 아무리 커도 PER_CHAR 안쪽이다)
    wait(PER_CHAR);
    expect(onScreen(SHORT[0])).toBe(false);
    wait(LAG);
    expect(onScreen(SHORT[0])).toBe(true);
  });

  /** 첫 글자에만 얹는다 — 글자마다 얹으면 한 줄이 늦음의 글자 수 배로 늘어난다 */
  it('둘째 글자부터는 안 늦춘다 — 줄이 통째로 늘어지면 안 된다', () => {
    const { show, wait, onScreen } = lagged(8_000, LAG);
    show([line(SHORT)]);
    wait(LAG + PER_CHAR); // 첫 글자
    wait(PER_CHAR); // 둘째 글자 — 여기서 또 늦추면 아직 안 나온다
    expect(onScreen(SHORT.slice(0, 2))).toBe(true);
  });

  /** 소리가 없는 줄(지문·클립 못 받음)은 기다릴 소리가 없다 — 늦추면 그냥 빈 화면이다 */
  it('소리 길이를 모르는 줄은 안 늦춘다 — 맞출 소리가 없다', () => {
    const { show, wait, onScreen } = lagged(undefined, LAG);
    show([line(SHORT)]);
    wait(PER_CHAR);
    expect(onScreen(SHORT[0])).toBe(true);
  });

  it('안 주면 예전 그대로다 — /world · /lab 의 호출부는 안 늦춰진다', () => {
    const { show, wait, onScreen } = lagged(8_000, 0);
    show([line(SHORT)]);
    wait(PER_CHAR);
    expect(onScreen(SHORT[0])).toBe(true);
  });
});

/*
 * 넘기는 손은 **상자를 누르는 것 하나다.** 찍는 중이면 그 문장을 끝까지 보여주고,
 * 다 찍혔으면 다음 줄로 간다 — 비주얼 노벨이 늘 하던 그것이다.
 *
 * 여기서 같이 세워 두는 것은 **넘긴 것과 저절로 끝난 것의 차이**다: 손으로 넘긴 줄에는
 * 여운(1.8초)을 안 두고 곧바로 치운다. 그 둘이 섞이면 넘겨도 안 넘어간 것처럼 보인다.
 */
describe('상자를 눌러 넘긴다', () => {
  const LONG = '이 문장은 아직 다 찍히지 않았다.';

  it('찍는 중이면 문장을 끝까지 보여준다 — 한 번 더 누를 것이 남아 있어야 한다', () => {
    const { show, wait, onScreen } = box();
    show([line(LONG)]);
    wait(PER_CHAR); // 몇 글자만 찍혔다
    expect(onScreen(LONG)).toBe(false);

    clickBox();
    expect(onScreen(LONG)).toBe(true);
  });

  it('다 찍혔으면 다음 줄로 넘어간다 — 머무름을 기다리지 않는다', () => {
    const { show, typeOut, onScreen } = box();
    show([line(SHORT), line('다음 줄이다.', 1)]);
    typeOut(SHORT);

    clickBox();
    typeOut('다음 줄이다.'); // 넘어간 자리에서 둘째 줄이 찍히기 시작한다
    expect(onScreen(SHORT)).toBe(false);
    expect(onScreen('다음 줄이다.')).toBe(true);
  });

  it('넘길 줄이 없으면 곧바로 사라진다 — 여운(1.8초)은 저절로 끝난 대사의 몫이다', () => {
    // 저절로 끝난 대사는 잠깐 남아 여운이 되지만, 넘긴 대사에 그 1.8초는 그대로 답답함이다
    const { show, typeOut, onScreen } = box();
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(onScreen(SHORT)).toBe(true);

    clickBox();
    expect(onScreen(SHORT)).toBe(false); // 시간을 안 밀었는데도 사라졌다
  });

  it('저절로 끝난 대사는 여전히 여운을 둔다 — 넘긴 것과 끝난 것은 다르다', () => {
    const { show, wait, typeOut, onScreen } = box();
    show([line(SHORT)]);
    typeOut(SHORT);

    wait(HOLD_MIN + 100); // 머무름이 지나 스스로 넘어갔다
    expect(onScreen(SHORT)).toBe(true); // 아직 여운 중이다
    wait(LINGER + 100);
    expect(onScreen(SHORT)).toBe(false);
  });

  it('넘기는 단추를 따로 달지 않는다 — 대사는 상자를 눌러야만 넘어간다', () => {
    const { show, typeOut } = box();
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(document.querySelector('.dlg__skip')).toBeNull();
  });
});
