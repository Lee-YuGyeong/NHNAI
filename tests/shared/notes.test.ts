// @vitest-environment jsdom
/**
 * 관찰 수첩의 저장소 — **적은 것이 안 사라진다**는 약속을 지킨다.
 *
 * 화면(NotePad)이 아니라 규칙만 본다:
 *   · 빈 줄·공백만 있는 줄은 안 적힌다 (수첩이 빈 줄로 차면 못 읽는다)
 *   · 여러 줄을 붙여 넣어도 한 줄로 편다 — 이 판은 한 줄 목록이다
 *   · 상한을 넘으면 **표식 없는 오래된 줄부터** 밀린다 (표식은 "다시 볼 것"이라는 뜻이다)
 *   · 브라우저에 남고, 다시 읽으면 그대로 돌아온다
 *   · 저장소가 막혀 있어도 이번 판 동안은 멀쩡히 적힌다
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTES_KEY,
  NOTES_MAX,
  NOTES_OPEN_KEY,
  NOTE_MAX_LEN,
  addNote,
  capNotes,
  clearNotes,
  editNote,
  getNotes,
  notesOpen,
  parseNotes,
  reloadNotes,
  reloadNotesOpen,
  removeNote,
  setNotesOpen,
  subscribeNotes,
  toggleNoteMark,
  trimNoteText,
  type Note,
} from '@/shared/notes';

const note = (id: string, mark = false): Note => ({ id, text: id, room: '복도', ts: 1, mark });

beforeEach(() => {
  localStorage.clear();
  reloadNotes();
  reloadNotesOpen();
});

describe('한 줄로 편다', () => {
  it('앞뒤 공백을 턴다', () => {
    expect(trimNoteText('  A62-024 대답이 늦다  ')).toBe('A62-024 대답이 늦다');
  });

  it('줄바꿈과 연속 공백은 공백 하나가 된다 — 붙여 넣어도 한 줄이다', () => {
    expect(trimNoteText('첫 줄\n\n둘째    줄')).toBe('첫 줄 둘째 줄');
  });

  it('빈 줄은 빈 문자열이다', () => {
    expect(trimNoteText('   \n  ')).toBe('');
  });

  it('상한에서 자른다', () => {
    expect(trimNoteText('가'.repeat(NOTE_MAX_LEN + 40))).toHaveLength(NOTE_MAX_LEN);
  });
});

describe('적기', () => {
  it('적으면 목록 맨 뒤에 붙는다 — 시간순이다', () => {
    addNote('첫째', '복도');
    addNote('둘째', '검증실');
    expect(getNotes().map((n) => n.text)).toEqual(['첫째', '둘째']);
    expect(getNotes()[1].room).toBe('검증실');
  });

  it('빈 줄은 안 적힌다', () => {
    expect(addNote('   ')).toBeNull();
    expect(getNotes()).toHaveLength(0);
  });

  it('지우고, 표식을 켜고 끈다', () => {
    const a = addNote('의심스럽다')!;
    toggleNoteMark(a.id);
    expect(getNotes()[0].mark).toBe(true);
    toggleNoteMark(a.id);
    expect(getNotes()[0].mark).toBe(false);
    removeNote(a.id);
    expect(getNotes()).toHaveLength(0);
  });

  it('고쳐 적는다 — 빈 줄로 고치면 지운 것이다', () => {
    const a = addNote('오타')!;
    editNote(a.id, '고침');
    expect(getNotes()[0].text).toBe('고침');
    editNote(a.id, '  ');
    expect(getNotes()).toHaveLength(0);
  });

  it('없는 줄을 건드려도 아무 일이 없다', () => {
    addNote('하나');
    const before = getNotes();
    removeNote('없는id');
    toggleNoteMark('없는id');
    editNote('없는id', '뭐든');
    expect(getNotes()).toBe(before); // 같은 배열 — 화면이 다시 안 그려진다
  });
});

describe('상한', () => {
  it('표식 없는 오래된 줄부터 밀린다', () => {
    const list = [note('a'), note('b', true), note('c'), note('d')];
    expect(capNotes(list, 2).map((n) => n.id)).toEqual(['b', 'd']);
  });

  it('표식뿐이면 그때는 오래된 것부터 민다', () => {
    const list = [note('a', true), note('b', true), note('c', true)];
    expect(capNotes(list, 2).map((n) => n.id)).toEqual(['b', 'c']);
  });

  it('상한 안이면 그대로다', () => {
    const list = [note('a'), note('b')];
    expect(capNotes(list, 5).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('적다 보면 상한에서 멈춘다', () => {
    for (let i = 0; i < NOTES_MAX + 5; i += 1) addNote(`줄 ${i}`);
    expect(getNotes()).toHaveLength(NOTES_MAX);
    expect(getNotes()[NOTES_MAX - 1].text).toBe(`줄 ${NOTES_MAX + 4}`);
  });
});

describe('브라우저에 남는다', () => {
  it('적은 것이 다시 읽어도 그대로다', () => {
    addNote('A62-024 는 눈을 안 깜빡인다', '중앙 시설');
    reloadNotes();
    expect(getNotes()[0].text).toBe('A62-024 는 눈을 안 깜빡인다');
    expect(getNotes()[0].room).toBe('중앙 시설');
  });

  it('비우면 저장소에서도 빈다', () => {
    addNote('하나');
    clearNotes();
    reloadNotes();
    expect(getNotes()).toHaveLength(0);
  });

  it('남의 쓰레기가 들어 있어도 화면이 안 죽는다', () => {
    expect(parseNotes('{{망가진 json')).toEqual([]);
    expect(parseNotes(JSON.stringify({ 배열이아님: 1 }))).toEqual([]);
    const mixed = parseNotes(JSON.stringify([null, 3, { text: '  살아남는다  ' }, { text: '   ' }]));
    expect(mixed).toHaveLength(1);
    expect(mixed[0]).toMatchObject({ text: '살아남는다', mark: false });
    expect(typeof mixed[0].id).toBe('string');
  });

  it('저장소가 막혀 있어도 이번 판에서는 적힌다 — 그리고 다음 줄이 앞 줄을 안 지운다', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('막힘');
    });
    expect(() => addNote('그래도 적힌다')).not.toThrow();
    expect(getNotes()[0].text).toBe('그래도 적힌다');
    /*
     * 쓰기는 막혔는데 읽기는 되는 브라우저 — 고칠 때마다 저장소를 다시 읽으면
     * **빈 저장소가 이번 판의 수첩을 덮는다.** 한 번 거절당한 뒤로는 저장소를 안 믿어야 한다.
     */
    addNote('두 번째도 적힌다');
    expect(getNotes().map((n) => n.text)).toEqual(['그래도 적힌다', '두 번째도 적힌다']);
    spy.mockRestore();
  });
});

describe('탭이 둘일 때', () => {
  /** 다른 탭이 저장소를 고친 상황을 만든다 — 저쪽이 쓴 값을 넣고 storage 이벤트를 울린다 */
  function otherTabWrote(list: Array<Partial<Note>>) {
    const rows = list.map((n, i) => ({ id: `x${i}`, text: `줄 ${i}`, room: '복도', ts: 1000 + i, mark: false, ...n }));
    localStorage.setItem(NOTES_KEY, JSON.stringify(rows));
    window.dispatchEvent(new StorageEvent('storage', { key: NOTES_KEY, newValue: JSON.stringify(rows) }));
  }

  it('다른 탭이 적으면 이 탭도 따라 읽는다', () => {
    const seen = vi.fn();
    const off = subscribeNotes(seen);
    otherTabWrote([{ text: '저쪽에서 적은 줄' }]);
    expect(getNotes().map((n) => n.text)).toEqual(['저쪽에서 적은 줄']);
    expect(seen).toHaveBeenCalled();
    off();
  });

  it('저쪽 줄을 안 지우고 그 위에 얹는다 — 마지막에 쓴 쪽이 다 이기면 안 된다', () => {
    const off = subscribeNotes(() => {});
    addNote('내가 먼저 적은 줄', '복도');
    // 저쪽 탭이 (내 줄까지 든 채로) 제 줄을 하나 더 적었다 — 이 탭은 아직 그걸 모른다
    const mine = JSON.parse(localStorage.getItem(NOTES_KEY)!) as Note[];
    localStorage.setItem(NOTES_KEY, JSON.stringify([...mine, { id: 'y1', text: '저쪽 줄', room: '검증실', ts: 2000, mark: false }]));
    // 이 탭이 이어서 적는다 — 저쪽 줄이 살아 있어야 한다
    addNote('내가 나중에 적은 줄', '복도');
    expect(getNotes().map((n) => n.text)).toEqual(['내가 먼저 적은 줄', '저쪽 줄', '내가 나중에 적은 줄']);
    off();
  });

  it('여닫힘은 안 따라간다 — 저건 저 탭 화면의 상태다', () => {
    const off = subscribeNotes(() => {});
    setNotesOpen(true);
    localStorage.setItem(NOTES_OPEN_KEY, 'shut');
    window.dispatchEvent(new StorageEvent('storage', { key: NOTES_OPEN_KEY, newValue: 'shut' }));
    expect(notesOpen()).toBe(true);
    off();
  });

  it('아무도 안 보고 있으면 듣지 않는다 — 마지막 구독자가 떠나면 뗀다', () => {
    const off = subscribeNotes(() => {});
    off();
    otherTabWrote([{ text: '아무도 안 듣는 줄' }]);
    expect(getNotes()).toHaveLength(0); // 기억은 그대로 (다시 구독하면 그때 읽는다)
  });
});

describe('구독', () => {
  it('적을 때마다 알린다 — 안 바뀌면 안 알린다', () => {
    const seen = vi.fn();
    const off = subscribeNotes(seen);
    addNote('하나');
    expect(seen).toHaveBeenCalledTimes(1);
    addNote('  '); // 안 적힌다
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    addNote('둘');
    expect(seen).toHaveBeenCalledTimes(1); // 뗀 뒤로는 안 온다
  });
});

describe('여닫힘', () => {
  it('접고 편 것이 남는다', () => {
    setNotesOpen(false);
    expect(localStorage.getItem(NOTES_OPEN_KEY)).toBe('shut');
    reloadNotesOpen();
    expect(notesOpen()).toBe(false);
    setNotesOpen(true);
    reloadNotesOpen();
    expect(notesOpen()).toBe(true);
  });

  it('좁은 화면에서는 처음부터 접혀 있다 — 3D 방을 가리지 않게', () => {
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    reloadNotesOpen();
    expect(notesOpen()).toBe(false);
    spy.mockRestore();
  });

  it('넓은 화면에서는 펴 둔다 — 접혀 있으면 수첩이 있다는 걸 아무도 모른다', () => {
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    reloadNotesOpen();
    expect(notesOpen()).toBe(true);
    spy.mockRestore();
  });
});

describe('저장 자리', () => {
  it('키는 wih: 아래다 — 다른 설정과 같은 자리', () => {
    addNote('하나');
    expect(NOTES_KEY).toBe('wih:notes');
    expect(localStorage.getItem(NOTES_KEY)).toContain('하나');
  });
});
