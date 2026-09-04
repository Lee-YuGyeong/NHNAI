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

/** T 한 번 — 창구는 window 에 붙어 있다 (DialogueBox 의 SKIP_KEY) */
function pressT(target: Window | HTMLElement = window) {
  act(() => { fireEvent.keyDown(target, { code: 'KeyT', key: 't' }); });
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
 * 대화 스킵 — **T** (2026-09-02 사용자). 상자를 클릭하는 것과 같은 일을 하되 소리도 같이 끊는다.
 * 여기서 보려는 것은 「누른 것이 먹히는가」와 **「먹히면 안 되는 자리에서 안 먹히는가」** 둘 다다 —
 * 자판 창구는 window 에 붙어 있어서, 막는 곳을 하나 빠뜨리면 글을 치다 대사가 넘어간다.
 */
describe('T 로 넘긴다', () => {
  const LONG = '이 문장은 아직 다 찍히지 않았다.';

  it('찍는 중이면 문장을 끝까지 보여준다 — 한 번 더 누를 것이 남아 있어야 한다', () => {
    const { show, wait, onScreen } = box();
    show([line(LONG)]);
    wait(PER_CHAR); // 몇 글자만 찍혔다
    expect(onScreen(LONG)).toBe(false);

    pressT();
    expect(onScreen(LONG)).toBe(true);
  });

  it('다 찍혔으면 다음 줄로 넘어간다 — 머무름을 기다리지 않는다', () => {
    const { show, typeOut, onScreen } = box();
    show([line(SHORT), line('다음 줄이다.', 1)]);
    typeOut(SHORT);

    pressT();
    typeOut('다음 줄이다.'); // 넘어간 자리에서 둘째 줄이 찍히기 시작한다
    expect(onScreen(SHORT)).toBe(false);
    expect(onScreen('다음 줄이다.')).toBe(true);
  });

  it('넘길 때 소리도 끊는다 — 글자만 넘어가면 앞 줄의 목소리가 다음 줄을 붙잡는다', () => {
    const { show, wait } = box();
    show([line(LONG)]);
    wait(PER_CHAR);
    pressT();
    expect(voiceLines.stop).toHaveBeenCalled();
  });

  it('다 찍힌 줄을 넘길 때 대본 쪽도 같이 당겨 달라 부른다 (onSkip) — 상자만 넘기면 정적만 남는다', () => {
    const onSkip = vi.fn();
    const view = render(<DialogueBox messages={[]} selfId={null} touch={false} onSkip={onSkip} />);
    const show = (msgs: ChatLine[]) =>
      act(() => { view.rerender(<DialogueBox messages={msgs} selfId={null} touch={false} onSkip={onSkip} />); });
    show([line(SHORT)]);
    for (let i = 0; i < SHORT.length; i += 1) act(() => { vi.advanceTimersByTime(PER_CHAR); });

    pressT();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('찍는 중에 누른 한 번은 문장을 끝낼 뿐 — 대본은 아직 안 부른다', () => {
    /*
     * 여기서 대본을 당기면 누를 때마다 이야기가 저 앞으로 달아난다: 상자는 아직 이 문장을 찍고 있는데
     * 대사에 맞춰 둔 연출(조명·정지)만 먼저 지나간다. 클릭이 하던 차례 그대로 — 끝내고, 그다음에 넘긴다.
     */
    const onSkip = vi.fn();
    const view = render(<DialogueBox messages={[]} selfId={null} touch={false} onSkip={onSkip} />);
    act(() => { view.rerender(<DialogueBox messages={[line(LONG)]} selfId={null} touch={false} onSkip={onSkip} />); });
    act(() => { vi.advanceTimersByTime(PER_CHAR); });

    pressT();
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.queryByText(LONG)).not.toBeNull(); // 문장은 끝까지 보여 준다

    pressT(); // 두 번째가 넘기는 손이다
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('띄운 줄이 없으면 아무 일도 안 한다 — 빈 화면에서 누른 T 는 그냥 T 다', () => {
    const onSkip = vi.fn();
    render(<DialogueBox messages={[]} selfId={null} touch={false} onSkip={onSkip} />);
    pressT();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('입력줄에 친 「t」는 넘기지 않는다 — 창구가 window 라 여기서 안 막으면 글을 치다 대사가 날아간다', () => {
    const { show, wait, onScreen } = box();
    show([line(LONG)]);
    wait(PER_CHAR);

    const input = document.createElement('input');
    document.body.appendChild(input);
    pressT(input);
    expect(onScreen(LONG)).toBe(false);
    input.remove();
  });

  it('넘길 줄이 없으면 곧바로 사라진다 — 여운(1.8초)은 저절로 끝난 대사의 몫이다', () => {
    // 2026-09-02 사용자: 다 나온 자막에서 한 번 더 누르면 말풍선이 끝나고 없어져야 한다.
    // 저절로 끝난 대사는 잠깐 남아 여운이 되지만, 넘긴 대사에 그 1.8초는 그대로 답답함이다
    const { show, typeOut, onScreen } = box();
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(onScreen(SHORT)).toBe(true);

    pressT();
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

  it('상자를 눌러 넘길 때도 곧바로 사라진다 — 손으로 넘긴 것은 다 같다', () => {
    const { show, typeOut, onScreen } = box();
    show([line(SHORT)]);
    typeOut(SHORT);

    act(() => { screen.getByLabelText('대사 건너뛰기 (T)').click(); });
    expect(onScreen(SHORT)).toBe(false);
  });

  it('오른쪽 아래 단추도 같은 한 칸이다 — 폰에는 T 가 없다', () => {
    const { show, wait, onScreen } = box();
    show([line(LONG)]);
    wait(PER_CHAR);

    act(() => { screen.getByLabelText('대사 건너뛰기 (T)').click(); });
    expect(onScreen(LONG)).toBe(true);
  });

  it('단추를 눌러도 한 칸만 넘어간다 — 상자 클릭까지 겹치면 두 칸이다', () => {
    const { show, typeOut, onScreen } = box();
    show([line(SHORT), line('둘째 줄.', 1), line('셋째 줄.', 2)]);
    typeOut(SHORT);

    act(() => { screen.getByLabelText('대사 건너뛰기 (T)').click(); });
    typeOut('둘째 줄.');
    expect(onScreen('둘째 줄.')).toBe(true);
  });

  it('소리를 바깥에서 내는 화면이라도 끊을 손잡이(onSkip)를 주면 넘어간다 — 검증실이 그렇다', () => {
    // 리더의 방송은 상자가 못 끊는다. 대신 화면이 broadcastSkip 을 onSkip 으로 준다 (ArenaFeature).
    const onSkip = vi.fn();
    const view = render(<DialogueBox messages={[]} selfId={null} touch={false} speaking onSkip={onSkip} />);
    const show = (msgs: ChatLine[]) =>
      act(() => { view.rerender(<DialogueBox messages={msgs} selfId={null} touch={false} speaking onSkip={onSkip} />); });
    show([line(SHORT)]);
    for (let i = 0; i < SHORT.length; i += 1) act(() => { vi.advanceTimersByTime(PER_CHAR); });

    expect(screen.queryByLabelText('대사 건너뛰기 (T)')).not.toBeNull();
    pressT();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('소리를 바깥에서 내는데 손잡이도 없으면 단추를 안 단다 — 눌러도 못 끊는 목소리다', () => {
    const { show, typeOut } = box(true);
    show([line(SHORT)]);
    typeOut(SHORT);
    expect(screen.queryByLabelText('대사 건너뛰기 (T)')).toBeNull();
  });

  it('소리를 바깥에서 내는 화면(speaking)은 T 를 안 받는다 — 상자가 못 끊는 목소리다', () => {
    // 자막만 넘어가면 리더는 앞 줄을 계속 읽는다. 그 화면들은 클릭으로 넘기는 것도 이미 막아 두었다
    const { show, wait, onScreen } = box(true);
    show([line(LONG)]);
    wait(PER_CHAR);
    pressT();
    expect(onScreen(LONG)).toBe(false);
  });
});
