// @vitest-environment jsdom
/**
 * 관찰 수첩의 판 — **게임을 안 건드린다**는 약속이 이 파일의 절반이다.
 *
 * 이 판은 3D 방 위에 얹힌다. 방들의 창구(WASD·E·P·Space·Enter·Esc)는 전부 window 에 붙어 있어서,
 * 수첩에 글을 치는 동안 그 키가 새어 나가면 메모하다 지목을 하고 점프를 한다.
 * 그래서 여기서 지키는 것은 두 가지다:
 *   ① 수첩이 제 할 일을 한다 (적기 · 표식 · 지우기 · 고쳐 적기 · 방 표시)
 *   ② 수첩 안에서 난 키는 **수첩 밖으로 안 나간다**
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIND_AT, NOTES_KEY_CODE, NotePad, filterNotes } from '@/shared/NotePad';
import { NOTES_MAX, addNote, getNotes, reloadNotes, reloadNotesOpen, setNotesOpen } from '@/shared/notes';

/** 판을 편 채로 띄운다 — 대부분의 시험은 펼친 판을 본다 */
function open(props: { room?: string; touch?: boolean } = {}) {
  setNotesOpen(true);
  return render(<NotePad {...props} />);
}

const input = () => screen.getByLabelText('수첩에 한 줄 적기') as HTMLInputElement;

/** 칸에 치고 Enter — 적는 손 그대로 */
function jot(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.submit(input().closest('form')!);
}

beforeEach(() => {
  localStorage.clear();
  reloadNotes();
  reloadNotesOpen();
});

describe('여닫기', () => {
  it('접혀 있으면 「메모」 단추만 있다', () => {
    setNotesOpen(false);
    render(<NotePad />);
    expect(screen.getByTitle('관찰 수첩 (M)')).toBeInTheDocument();
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('접힌 단추에는 할 일이 아니라 **이름**이 적힌다 — 그 화면에 수첩은 안 보인다', () => {
    setNotesOpen(false);
    render(<NotePad />);
    expect(screen.getByText('메모')).toBeInTheDocument();
    expect(screen.queryByText('펴기')).not.toBeInTheDocument();
  });

  it('접힌 자리에 몇 줄 있는지 적힌다 — 접어 둬도 알 수 있게', () => {
    addNote('하나');
    addNote('둘');
    setNotesOpen(false);
    const { container } = render(<NotePad />);
    expect(container.querySelector('.np-stub')).toHaveTextContent('2');
  });

  it('「메모」를 누르면 펴진다', () => {
    setNotesOpen(false);
    render(<NotePad />);
    fireEvent.click(screen.getByTitle('관찰 수첩 (M)'));
    expect(screen.getByLabelText('수첩에 한 줄 적기')).toBeInTheDocument();
  });

  /*
   * **[메모]는 [접기]가 서 있던 그 점에 선다** (2026-09-02 사용자 요청).
   *
   * jsdom 에는 배치가 없어서 좌표로는 못 잰다. 대신 그 좌표를 만드는 **조건**을 지킨다:
   * 두 단추가 같은 부품(.np-btn)이고, 저마다 제 줄의 **마지막 칸**이며, 두 줄이 같은 자리·
   * 같은 폭·같은 여백 변수를 쓴다 (notepad.css 의 --np-right/--np-top/--np-w/--np-head-pad).
   * 앞의 둘을 여기서 지키고, 마지막 하나는 값이 CSS 에 한 벌뿐이라 어긋날 자리가 없다.
   */
  it('「메모」가 「접기」와 같은 부품이고, 같은 줄 끝에 선다 — 그래서 같은 점이다', () => {
    addNote('하나');
    const openView = open();
    const shut = screen.getByLabelText('관찰 수첩 접기 (M)');
    const headRow = shut.parentElement!;
    expect(headRow).toHaveClass('np-head');
    expect(headRow.lastElementChild).toBe(shut); // 자리를 정하는 것은 「줄의 마지막 칸」이다
    expect(shut).toHaveClass('np-btn');
    openView.unmount();

    setNotesOpen(false);
    render(<NotePad />);
    const reopen = screen.getByLabelText('관찰 수첩 펴기 (M)');
    const stubRow = reopen.parentElement!;
    expect(stubRow).toHaveClass('np-stub');
    expect(stubRow.lastElementChild).toBe(reopen);
    expect(reopen).toHaveClass('np-btn'); // 같은 부품 = 같은 크기·같은 여백
  });

  /*
   * 걷는 중에는 이 단추를 못 누른다 — 마우스가 시야에 잠겨 있다. 그러니 단추가 할 일은
   * 눌리는 것이 아니라 **어느 키를 누르면 되는지 말해 주는 것**이다.
   */
  it('두 단추가 자판 이름을 달고 있다 — 「M | 메모」 · 「M | 접기」', () => {
    setNotesOpen(false);
    const shutView = render(<NotePad />);
    const reopen = screen.getByLabelText('관찰 수첩 펴기 (M)');
    expect(reopen).toHaveClass('np-btn--key');
    expect(reopen.querySelector('b')).toHaveTextContent('M');
    expect(reopen).toHaveTextContent('메모');
    shutView.unmount();

    open();
    const shut = screen.getByLabelText('관찰 수첩 접기 (M)');
    expect(shut).toHaveClass('np-btn--key');
    expect(shut.querySelector('b')).toHaveTextContent('M');
    expect(shut).toHaveTextContent('접기');
  });

  /*
   * ★ **자판이 본체다** (2026-09-02 사용자: "wasd로 움직이면서 메모 버튼을 누를 수가 없는 거니까").
   *   1인칭이라 마우스는 시야에 잠겨 있고, 손은 WASD 에 얹혀 있다. 화면 구석의 단추는 Esc 로
   *   잠금을 풀어야 눌리므로 걷는 중에는 없는 물건이다. 그래서 M 이 먼저고 단추는 그 표시다.
   */
  it('M 으로 열고 닫는다', () => {
    setNotesOpen(false);
    render(<NotePad />);
    fireEvent.keyDown(window, { code: NOTES_KEY_CODE });
    expect(screen.getByLabelText('수첩에 한 줄 적기')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: NOTES_KEY_CODE });
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('걷는 키는 안 가로챈다 — 이 판의 자판은 M 하나뿐이다', () => {
    setNotesOpen(false);
    render(<NotePad />);
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyN', 'Space', 'KeyE', 'KeyT']) {
      fireEvent.keyDown(window, { code });
    }
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('다른 칸에 치는 m 은 수첩을 열지 않는다', () => {
    setNotesOpen(false);
    render(
      <>
        <input aria-label="채팅" />
        <NotePad />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('채팅'), { code: NOTES_KEY_CODE });
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('Ctrl·Cmd 가 얹힌 M 은 브라우저 것이다', () => {
    setNotesOpen(false);
    render(<NotePad />);
    fireEvent.keyDown(window, { code: NOTES_KEY_CODE, metaKey: true });
    fireEvent.keyDown(window, { code: NOTES_KEY_CODE, ctrlKey: true });
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  /*
   * ★ **치던 손이 자판만으로 빠져나올 수 있어야 한다** (2026-09-03 사용자 신고:
   *   "m으로 닫으려니까 타자에 m만 계속 쳐져"). M 으로 열면 커서가 칸에 들어오고, 그 칸에서
   *   M 은 글자다 — 글 치는 손에서 자판을 뺏을 수는 없다. 그래서 닫는 길은 Enter 다:
   *   적을 것이 있으면 적고, 없으면 같은 Enter 가 접는다 (본판 입력줄과 같은 문법).
   */
  it('빈 칸에서 Enter 를 치면 접힌다 — 자판에서 손을 안 떼고 나간다', () => {
    open();
    fireEvent.submit(input().closest('form')!);
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('공백만 친 칸도 빈 칸이다', () => {
    open();
    fireEvent.change(input(), { target: { value: '   ' } });
    fireEvent.submit(input().closest('form')!);
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
    expect(getNotes()).toHaveLength(0);
  });

  it('글이 있으면 Enter 는 적기만 한다 — 적자마자 닫히면 두 줄을 못 적는다', () => {
    open({ room: '복도' });
    jot('한 줄 적는다');
    expect(screen.getByLabelText('수첩에 한 줄 적기')).toBeInTheDocument();
    expect(getNotes()).toHaveLength(1);
    // 이어서 한 줄 더 — 그리고 빈 Enter 로 나간다
    jot('두 줄째');
    expect(getNotes()).toHaveLength(2);
    fireEvent.submit(input().closest('form')!);
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('칸에 친 M 은 글자다 — 수첩이 안 닫힌다', () => {
    open();
    fireEvent.keyDown(input(), { code: NOTES_KEY_CODE, key: 'm' });
    expect(screen.getByLabelText('수첩에 한 줄 적기')).toBeInTheDocument();
  });

  it('칸 밖이면 M 이 다시 닫는 키다', () => {
    open();
    input().blur();
    fireEvent.keyDown(window, { code: NOTES_KEY_CODE });
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });

  it('칸에서 Esc 를 누르면 접힌다', () => {
    open();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument();
  });
});

describe('적기', () => {
  it('적으면 목록에 서고, 그 방 이름이 같이 붙는다', () => {
    open({ room: '복도' });
    jot('A62-024 대답이 반 박자 늦다');
    expect(screen.getByText('A62-024 대답이 반 박자 늦다')).toBeInTheDocument();
    expect(screen.getByText('복도')).toBeInTheDocument();
    expect(input().value).toBe(''); // 칸은 비워진다 — 다음 줄을 바로 친다
  });

  it('빈 줄은 안 적힌다', () => {
    open();
    jot('   ');
    expect(getNotes()).toHaveLength(0);
  });

  it('앞 방에서 적은 것이 뒷방에서도 그대로 보인다 — 수첩은 한 권이다', () => {
    addNote('격납문 옆 단말 번호 7', '복도');
    open({ room: '검증실' });
    expect(screen.getByText('격납문 옆 단말 번호 7')).toBeInTheDocument();
    expect(screen.getByText('복도')).toBeInTheDocument(); // 적은 자리는 그 방으로 남는다
  });
});

describe('어디서 적었나', () => {
  it('같은 방에서 이어 적으면 방 이름은 한 번만 선다', () => {
    addNote('첫째', '복도');
    addNote('둘째', '복도');
    addNote('셋째', '복도');
    open();
    expect(screen.getAllByText('복도')).toHaveLength(1);
  });

  it('방이 바뀌면 그 자리에 다시 선다 — 이 판이 답할 질문은 「어디서 들었더라」다', () => {
    addNote('복도에서', '복도');
    addNote('검증실에서', '검증실');
    addNote('또 복도에서', '복도');
    const { container } = open();
    // 세 이정표가 적은 순서대로 서 있다 (복도 → 검증실 → 복도)
    expect([...container.querySelectorAll('.np-where')].map((el) => el.textContent)).toEqual([
      '복도',
      '검증실',
      '복도',
    ]);
  });

  it('방을 모르고 적은 줄에는 이정표가 없다', () => {
    addNote('어디선가');
    const { container } = open();
    expect(container.querySelector('.np-where')).toBeNull();
  });
});

describe('줄 다루기', () => {
  it('표식을 켜고 끈다', () => {
    addNote('이 말은 앞이랑 다르다', '중앙 시설');
    open();
    fireEvent.click(screen.getByTitle('표식 켜기 — 다시 볼 줄'));
    expect(getNotes()[0].mark).toBe(true);
    fireEvent.click(screen.getByTitle('표식 끄기'));
    expect(getNotes()[0].mark).toBe(false);
  });

  it('지운다', () => {
    addNote('오타');
    open();
    fireEvent.click(screen.getByTitle('지우기'));
    expect(getNotes()).toHaveLength(0);
  });

  it('글을 누르면 그 자리가 칸이 되고, 고친 것이 남는다', () => {
    addNote('A62-24', '복도');
    open();
    fireEvent.click(screen.getByText('A62-24'));
    const box = screen.getByDisplayValue('A62-24');
    fireEvent.change(box, { target: { value: 'A62-024' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.blur(box);
    expect(getNotes()[0].text).toBe('A62-024');
  });

  it('고치다 Esc 를 누르면 무른다', () => {
    addNote('그대로', '복도');
    open();
    fireEvent.click(screen.getByText('그대로'));
    const box = screen.getByDisplayValue('그대로');
    fireEvent.change(box, { target: { value: '엉뚱하게' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(getNotes()[0].text).toBe('그대로');
  });

  it('비움은 두 번 눌러야 한다 — 한 번에 지워지면 그건 사고다', () => {
    addNote('하나');
    addNote('둘');
    open();
    fireEvent.click(screen.getByText('비움'));
    expect(getNotes()).toHaveLength(2);
    fireEvent.click(screen.getByText('정말?'));
    expect(getNotes()).toHaveLength(0);
  });
});

describe('거르기 — 줄이 쌓였을 때 찾는 길', () => {
  /** 찾는 칸이 설 만큼 적는다 */
  function fill(n = FIND_AT) {
    for (let i = 0; i < n; i += 1) addNote(`줄 ${i}`, i % 2 ? '검증실' : '복도');
  }

  it('규칙만 — 적은 말과 방 이름 둘 다에서 찾는다', () => {
    const rows = [
      { id: 'a', text: '눈을 안 깜빡인다', room: '복도', ts: 1, mark: false },
      { id: 'b', text: '대답이 늦다', room: '재검실', ts: 2, mark: true },
    ];
    expect(filterNotes(rows, '깜빡', false).map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(rows, '재검', false).map((n) => n.id)).toEqual(['b']); // 방 이름으로도
    expect(filterNotes(rows, '', true).map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(rows, '대답', true).map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(rows, '', false)).toBe(rows); // 거를 것이 없으면 같은 배열 그대로
  });

  it('몇 줄 안 되면 찾는 칸이 안 선다 — 한눈에 다 보이는데 적을 자리만 좁힌다', () => {
    fill(FIND_AT - 1);
    open();
    expect(screen.queryByLabelText('수첩에서 찾기')).not.toBeInTheDocument();
  });

  it('줄이 쌓이면 찾는 칸이 선다', () => {
    fill();
    open();
    expect(screen.getByLabelText('수첩에서 찾기')).toBeInTheDocument();
  });

  it('찾으면 그 줄만 남고, 몇 줄이 가려졌는지 적힌다', () => {
    fill();
    open();
    fireEvent.change(screen.getByLabelText('수첩에서 찾기'), { target: { value: '줄 3' } });
    expect(screen.getByText('줄 3')).toBeInTheDocument();
    expect(screen.queryByText('줄 0')).not.toBeInTheDocument();
    expect(screen.getByText(`1/${FIND_AT}`)).toBeInTheDocument();
  });

  it('표식만 보기를 켜면 표식 찍은 줄만 남는다', () => {
    fill();
    open();
    fireEvent.click(screen.getAllByTitle('표식 켜기 — 다시 볼 줄')[2]);
    fireEvent.click(screen.getByTitle('표식 찍은 줄만 보기'));
    expect(screen.getByText('줄 2')).toBeInTheDocument();
    expect(screen.queryByText('줄 1')).not.toBeInTheDocument();
  });

  it('아무것도 안 걸리면 그렇게 말한다 — 지운 줄 알고 놀라지 않게', () => {
    fill();
    open();
    fireEvent.change(screen.getByLabelText('수첩에서 찾기'), { target: { value: '없는말' } });
    expect(screen.getByText(/찾은 줄이 없다/)).toBeInTheDocument();
  });

  it('찾는 칸의 Esc 는 찾던 글자부터 무른다 — 한 번에 판까지 접으면 찾던 자리를 잃는다', () => {
    fill();
    open();
    const box = screen.getByLabelText('수첩에서 찾기');
    fireEvent.change(box, { target: { value: '줄 3' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.getByLabelText('수첩에서 찾기')).toHaveValue(''); // 판은 그대로 펴져 있다
    fireEvent.keyDown(screen.getByLabelText('수첩에서 찾기'), { key: 'Escape' });
    expect(screen.queryByLabelText('수첩에 한 줄 적기')).not.toBeInTheDocument(); // 그다음에야 접힌다
  });

  it('접으면 거르던 것이 풀린다 — 다시 폈을 때 반만 보이면 그게 사고다', () => {
    fill();
    open();
    fireEvent.change(screen.getByLabelText('수첩에서 찾기'), { target: { value: '줄 3' } });
    act(() => setNotesOpen(false));
    act(() => setNotesOpen(true));
    expect(screen.getByLabelText('수첩에서 찾기')).toHaveValue('');
    expect(screen.getByText('줄 0')).toBeInTheDocument();
  });
});

describe('게임을 안 건드린다', () => {
  const spy = vi.fn();
  beforeEach(() => {
    spy.mockClear();
    window.addEventListener('keydown', spy);
  });
  afterEach(() => window.removeEventListener('keydown', spy));

  it('칸 안에서 친 키는 방으로 안 나간다 — E·Space·Enter 전부', () => {
    open();
    for (const code of ['KeyE', 'KeyP', 'Space', 'Enter', 'KeyW']) {
      fireEvent.keyDown(input(), { code, key: code === 'Space' ? ' ' : 'a' });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('찾는 칸의 키도 방으로 안 나간다', () => {
    for (let i = 0; i < FIND_AT; i += 1) addNote(`줄 ${i}`, '복도');
    open();
    fireEvent.keyDown(screen.getByLabelText('수첩에서 찾기'), { code: 'KeyE' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('고쳐 적는 칸도 마찬가지다', () => {
    addNote('한 줄');
    open();
    fireEvent.click(screen.getByText('한 줄'));
    fireEvent.keyDown(screen.getByDisplayValue('한 줄'), { code: 'KeyE' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('수첩 밖의 키는 그대로 방으로 간다 — 걷는 키를 가로채지 않는다', () => {
    open();
    fireEvent.keyDown(window, { code: 'KeyW' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('아래 한 줄은 지금 듣는 키를 말한다', () => {
  /*
   * 손잡이가 자리마다 다르다 — 칸 안에서는 M 이 글자고 Enter 가 닫는 키인데, 칸 밖에서는
   * M 이 닫는 키다. 한 문장으로 고정하면 그중 둘은 늘 거짓말이고, 사용자는 안 듣는 키를
   * 계속 누르게 된다 (2026-09-03 신고가 정확히 그 자리였다).
   */
  it('칸 밖이면 M 을 말한다', () => {
    open({ room: '복도' });
    expect(screen.getByText(/M 여닫기/)).toBeInTheDocument();
  });

  it('빈 칸에 커서가 있으면 **나가는 문**을 말한다 — M 은 글자라는 것까지', () => {
    open();
    fireEvent.focus(input());
    expect(screen.getByText(/빈 줄 ENTER 로 접는다/)).toBeInTheDocument();
    expect(screen.getByText(/M 은 글자다/)).toBeInTheDocument();
  });

  it('치고 있으면 그 Enter 가 적는다고 말한다', () => {
    open();
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: '적는 중' } });
    expect(screen.getByText('ENTER 로 적는다')).toBeInTheDocument();
  });
});

describe('차 갈 때', () => {
  it('자리가 얼마 안 남으면 밀려난다는 것을 미리 말한다 — 말없이 사라지면 안 된다', () => {
    for (let i = 0; i < NOTES_MAX - 3; i += 1) addNote(`줄 ${i}`, '복도');
    open();
    expect(screen.getByText(/자리 3줄/)).toBeInTheDocument();
    expect(screen.queryByText(/M 여닫기/)).not.toBeInTheDocument();
  });

  it('치는 중에는 상한 경고가 나가는 문을 안 가린다', () => {
    for (let i = 0; i < NOTES_MAX - 3; i += 1) addNote(`줄 ${i}`, '복도');
    open();
    fireEvent.focus(input());
    expect(screen.getByText(/빈 줄 ENTER 로 접는다/)).toBeInTheDocument();
    expect(screen.queryByText(/자리 3줄/)).not.toBeInTheDocument();
  });
});

describe('자리', () => {
  it('펴지면 뿌리에 표가 남는다 — 글로 된 방이 이걸 보고 폭을 줄인다', () => {
    const view = open();
    expect(document.documentElement.dataset.notepad).toBe('open');
    act(() => setNotesOpen(false));
    expect(document.documentElement.dataset.notepad).toBe('shut');
    view.unmount();
    expect(document.documentElement.dataset.notepad).toBeUndefined(); // 떠나면 지운다
  });

  it('폰에서는 판이 위에서 멎는다 — 아래는 조이스틱 자리다', () => {
    const { container } = open({ touch: true });
    expect(container.querySelector('.np')).toHaveClass('np--touch');
  });

  it('빈 수첩에는 무엇을 적는 자리인지 적혀 있다', () => {
    open();
    const empty = screen.getByText(/방을 옮겨도 따라온다/);
    expect(within(empty).getByText('방을 옮겨도 따라온다.')).toBeInTheDocument();
  });
});
