/**
 * 관찰 수첩 — 방마다 **오른쪽**에 서는 판. 왼쪽으로 대화가 흐르면, 오른쪽에는 내가 적는다.
 *
 * ┌─ 이 판이 답하는 질문 ────────────────────────────────────────────────────┐
 * │ "이 말을 내가 어디서 들었더라."                                            │
 * │ 그래서 줄마다 **어느 방에서 적었는지**와 시각이 붙는다. 복도에서 적은        │
 * │ 식별번호를 검증실에서 그대로 읽는 것이 이 판의 전부다 (shared/notes.ts).    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ **포인터 잠금을 안 건드린다.** 입력줄(WorldFeature 의 Enter)과 같은 규칙이다 — 잠금은
 *   마우스만 잡지 자판은 안 잡으므로, N 을 눌러 그 자리에서 치고 Enter 로 넣고 다시 걷는다.
 *   여기서 잠금을 풀면 수첩을 열 때마다 커서가 튀어나와 걷는 흐름이 끊긴다. 표식·지우기처럼
 *   손이 필요한 일은 어차피 Esc 로 멈춘 뒤에 하는 일이다.
 *
 * ★ 게임의 키를 **가로채지 않는다.** 칸 안에서 난 키는 여기서 멈춘다(stopPropagation) —
 *   방들의 창구(WASD·E·P·Space·Enter·Esc)는 전부 window 에 붙어 있어서, 안 막으면 수첩에
 *   'e' 를 치는 것이 지목이 되고 space 가 점프가 된다. 반대로 방 쪽은 이미 INPUT/TEXTAREA 에서
 *   오는 키를 거른다 — 두 겹으로 막는다.
 *
 * ★ 서버에 안 보낸다. 판정·방송·다른 사람에게 한 글자도 안 간다 — 이건 내 수첩이다.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  NOTES_MAX,
  NOTE_MAX_LEN,
  addNote,
  clearNotes,
  editNote,
  getNotes,
  notesOpen,
  removeNote,
  setNotesOpen,
  subscribeNotes,
  toggleNoteMark,
  type Note,
} from './notes';
import './notepad.css';

const EMPTY: readonly Note[] = [];

/**
 * 이 줄 수부터 **찾는 칸**이 선다. 다섯 줄까지는 한눈에 다 보이므로 거를 것이 없고,
 * 칸만 서면 적을 자리를 그만큼 좁힌다.
 */
/**
 * 수첩을 여닫는 자판 — **M**.
 *
 * ★ 왜 자판인가 (2026-09-02 사용자: "wasd로 움직이면서 메모 버튼을 누를 수가 없는 거니까").
 *   이 게임은 1인칭이고 손은 WASD 에 얹혀 있다. 마우스는 시야에 잠겨 있어서 화면 구석의 단추는
 *   **누를 수 있는 물건이 아니다** — 누르려면 Esc 로 잠금을 풀고 커서를 찾아가야 하고, 그러면
 *   걷던 흐름이 끊긴다. 그래서 이 판의 손잡이는 자판이 본체고, 단추는 그 자판을 **적어 두는 자리**다
 *   (대화창의 「T | SKIP」과 같은 결정 — features/world/DialogueBox 의 SKIP_KEY).
 *
 * ★ 왜 N 이 아니라 M 인가: 「메모」의 첫 자다. e.code 로 읽으므로 한글 자판이 켜져 있어도 같은 자리다.
 *   이 저장소에서 M 을 쓰는 다른 창구는 없다 (W A S D · Space · Enter · Esc · E · Q · P · T · 1 · 2).
 */
export const NOTES_KEY_CODE = 'KeyM';
/** 단추에 적히는 자판 이름 — 위 상수에서 뽑는다 (두 군데에 손으로 적으면 반드시 어긋난다) */
export const NOTES_KEY_LABEL = NOTES_KEY_CODE.slice(3);

export const FIND_AT = 6;

/** 자리가 이만큼 남으면 아래에 말해 준다 — 밀려나는 것은 **말없이** 일어나면 안 된다 */
export const FULL_AT = 10;

/**
 * 걸러 보기 — 표식 찍은 줄만, 그리고 글자로 찾기.
 *
 * 찾는 글자는 **적은 말과 방 이름 둘 다**를 본다: "재검실에서 뭐라고 했더라" 가 이 판에서
 * 제일 자주 나오는 물음이라, 방 이름으로도 걸려야 한다. 순수 함수라 시험이 여기만 본다.
 */
export function filterNotes(list: readonly Note[], find: string, markOnly: boolean): readonly Note[] {
  const q = find.trim().toLowerCase();
  if (!q && !markOnly) return list; // 거를 것이 없으면 같은 배열 그대로 (헛되이 다시 그리지 않는다)
  return list.filter((n) => {
    if (markOnly && !n.mark) return false;
    if (!q) return true;
    return n.text.toLowerCase().includes(q) || n.room.toLowerCase().includes(q);
  });
}

/** 글 치는 칸에서 온 키인가 — 방들의 창구가 쓰는 것과 같은 잣대 */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true;
}

/** 12:04 — 초까지는 안 적는다. 이 판에서 필요한 건 "언제쯤"이다 */
function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface NotePadProps {
  /** 지금 이 방의 이름 — 적는 줄에 그대로 붙는다 (「복도」·「검증실」…). 없으면 방 표시가 빠진다 */
  room?: string;
  /** 폰인가 — 아래에 조이스틱·말하기 단추가 서므로 판이 그만큼 위에서 멎는다 */
  touch?: boolean;
}

export function NotePad({ room = '', touch = false }: NotePadProps) {
  const notes = useSyncExternalStore(subscribeNotes, getNotes, () => EMPTY);
  const open = useSyncExternalStore(subscribeNotes, notesOpen, () => false);

  const [draft, setDraft] = useState('');
  /** 고쳐 적는 중인 줄 — 줄을 누르면 그 자리가 칸이 된다 */
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  /** 「비움」은 두 번 눌러야 한다 — window.confirm 은 이 화면의 말투가 아니고, 잠금까지 흔든다 */
  const [armed, setArmed] = useState(false);
  /**
   * 적는 칸에 커서가 있나 — **아래 안내가 이걸 본다.**
   *
   * 손잡이가 자리마다 다르기 때문이다: 칸 안에서는 M 이 글자고 Enter 가 닫는 키인데,
   * 칸 밖에서는 M 이 닫는 키다. 안내가 한 문장으로 고정돼 있으면 그중 하나는 늘 거짓말이고,
   * 사용자는 안 듣는 키를 계속 누르게 된다 (2026-09-03 신고가 정확히 그 자리였다).
   */
  const [writing, setWriting] = useState(false);
  /** 찾는 글자 · 표식만 보기 — 화면 안의 상태다. 무엇을 보고 있었는지는 안 남긴다 (접으면 풀린다) */
  const [find, setFind] = useState('');
  const [markOnly, setMarkOnly] = useState(false);

  const inRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 자판으로 열었나 — 그때만 칸으로 손을 옮긴다 (폰에서 손잡이를 누른 것만으로 키보드가 올라오면 방이 가린다) */
  const focusNext = useRef(false);
  /**
   * 고치던 것을 물렀나 (Esc).
   *
   * ★ 무르는 것은 **칸을 닫는 것만으로 안 된다** — 칸을 닫으면 blur 가 나고, 저장은 그 blur 가 한다
   *   (칸 밖을 눌러도 저장돼야 하므로 저장을 blur 에 걸었다). 그래서 무를 때는 여기 표를 하나
   *   세워 두고, 뒤따라오는 blur 가 그걸 보고 저장을 건너뛴다.
   */
  const abortEdit = useRef(false);

  /* ── M 으로 여닫는다 (머리말 ★) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== NOTES_KEY_CODE || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) return;
      e.preventDefault();
      focusNext.current = true;
      setNotesOpen(!notesOpen());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // iOS 는 제스처와 같은 작업 안에서 부른 focus() 만 소프트 키보드를 올린다 — layout 효과 (입력줄과 같은 수)
  useLayoutEffect(() => {
    if (!open || !focusNext.current) return;
    focusNext.current = false;
    inRef.current?.focus();
  }, [open]);

  /*
   * 수첩이 펴졌다는 표를 뿌리(<html>)에 남긴다.
   *
   * 3D 방들은 판이 화면 위에 얹히므로 아무것도 비켜 줄 필요가 없다. 하지만 **글로 된 방**
   * (구역 /lab 처럼 가운데 한 단으로 흐르는 화면)은 오른쪽 300px 가 글을 덮는다 — 그 화면들이
   * `:root[data-notepad='open']` 을 보고 제 폭을 줄인다. 판이 남의 CSS 를 안 건드리면서
   * 자리를 얻는 유일한 길이다. 떠날 때는 표를 지운다.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.notepad = open ? 'open' : 'shut';
    return () => {
      delete root.dataset.notepad;
    };
  }, [open]);

  // 새 줄은 맨 아래에 붙는다 — 적자마자 보이게 따라 내린다
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notes.length, open]);

  // 접으면 손에 들고 있던 것들을 내려놓는다 (다시 폈을 때 「정말?」이 걸려 있거나 반만 보이면 그게 사고다)
  useEffect(() => {
    if (open) return;
    setArmed(false);
    setEditing(null);
    setFind('');
    setMarkOnly(false);
  }, [open]);

  const close = useCallback(() => {
    setNotesOpen(false);
    inRef.current?.blur();
  }, []);

  /**
   * 칸에서 Enter — **적거나, 닫거나.**
   *
   * ★ 빈 칸이면 접는다 (2026-09-03 사용자 신고: "m으로 닫으려니까 타자에 m만 계속 쳐져").
   *   M 으로 열면 커서가 이 칸에 들어오는데, 그 칸에서 M 은 **글자**다 — 글을 치려는 손에서
   *   자판을 뺏을 수는 없으므로 M 은 여기서 닫는 키가 될 수 없다. 그러면 치던 손이 자판만으로
   *   빠져나올 길이 없어진다 (걷는 중에는 Esc 를 브라우저가 먼저 먹어 잠금만 풀린다).
   *
   *   그래서 **이 저장소가 이미 쓰는 문법**을 그대로 쓴다 — 본판의 한 줄 입력이
   *   「Enter 보내기 · 빈 줄이면 닫기」다 (features/world/WorldFeature 의 입력줄). 적을 것이
   *   있으면 Enter 가 적고, 적을 것이 없으면 같은 Enter 가 접는다. 손은 자판을 안 떠난다.
   */
  const submit = useCallback(() => {
    if (!draft.trim()) {
      setDraft('');
      setNotesOpen(false);
      inRef.current?.blur();
      return;
    }
    addNote(draft, room);
    setDraft('');
  }, [draft, room]);

  const marked = notes.reduce((n, x) => n + (x.mark ? 1 : 0), 0);
  const shown = useMemo(() => filterNotes(notes, find, markOnly), [notes, find, markOnly]);
  const filtering = find.trim() !== '' || markOnly;
  /** 찾는 칸을 세울 때인가 — 줄이 쌓였거나, 이미 거르고 있는 중이거나 (거르다 줄이 줄어도 칸이 안 사라지게) */
  const canFind = notes.length >= FIND_AT || filtering;

  /*
   * ── 접혀 있을 때 ──
   *
   * **[접기]가 서 있던 그 점에 [메모]가 선다** (2026-09-02 사용자 요청). 접었다 펴는 일이
   * 한 자리에서 끝나야 손이 그 점을 기억한다 — 접으러 간 곳으로 다시 가면 펴진다.
   *
   * 단추에는 **자판 이름을 같이 적는다** — 「M | 메모」 (2026-09-02 사용자 요청). 걷는 중에는
   * 이 단추를 누를 수가 없으므로(위 NOTES_KEY_CODE 머리말), 단추가 할 일은 눌리는 것이 아니라
   * **어느 키를 누르면 되는지 말해 주는 것**이다. 대화창의 「T | SKIP」과 같은 표기·같은 이유다.
   *
   * 글자는 「펴기」가 아니라 **「메모」**다 (2026-09-02 사용자: "[펴기]라고 하지 말고 메모라고").
   * 접혀 있을 때 이 단추는 **판이 하나도 안 보이는 화면에 홀로 선 유일한 표시**다 — 그러면
   * 「무엇을 펴는가」를 먼저 말해야 한다. 펼친 뒤에는 이미 수첩이 눈앞에 있으므로 그때는
   * 할 일(「접기」)을 적는 것이 맞다: 접힌 자리에는 **이름**을, 펼친 자리에는 **할 일**을.
   *
   * 그래서 이 줄은 머리줄(.np-head)과 **같은 상자**다: 같은 자리·같은 폭·같은 여백을 쓰고
   * (notepad.css 의 --np-* 변수 한 벌), 단추도 같은 .np-btn 이다. 마지막 칸이 단추라는 것까지
   * 같아서, 두 상태에서 단추의 오른쪽 위 모서리가 같은 점에 떨어진다.
   */
  if (!open) {
    return (
      <aside className={touch ? 'np np--touch' : 'np'} aria-label="관찰 수첩">
        <div className="np-stub">
          {/* 적힌 줄 수 — 접어 둬도 몇 줄인지는 보인다. 단추 **왼쪽**에 둔다: 단추 자리가 밀리면 안 된다 */}
          {notes.length > 0 ? (
            <span className={marked > 0 ? 'np-stub__n np-stub__n--mark' : 'np-stub__n'}>{notes.length}</span>
          ) : null}
          <button
            type="button"
            className="np-btn np-btn--key"
            data-sfx="open"
            title={`관찰 수첩 (${NOTES_KEY_LABEL})`}
            aria-label={`관찰 수첩 펴기 (${NOTES_KEY_LABEL})`}
            onClick={() => setNotesOpen(true)}
          >
            <b aria-hidden="true">{NOTES_KEY_LABEL}</b>
            <span>메모</span>
          </button>
        </div>
      </aside>
    );
  }

  /* ── 펼쳤을 때 ── */
  return (
    <aside className={touch ? 'np np--touch' : 'np'} aria-label="관찰 수첩">
      <div className="np-panel">
        <div className="np-head">
          <span className="np-head__t">NOTES</span>
          <span className="np-head__k">관찰 수첩</span>
          {/* 거르는 중에는 몇 줄이 가려져 있는지 적는다 — 안 적으면 지운 줄 알고 놀란다 */}
          {filtering ? (
            <span className="np-head__n">
              {shown.length}/{notes.length}
            </span>
          ) : null}
          <span className="np-head__sp" />
          {notes.length > 0 ? (
            <button
              type="button"
              className={armed ? 'np-btn np-btn--armed' : 'np-btn'}
              data-sfx={armed ? 'deny' : 'click'}
              onClick={() => {
                if (!armed) return setArmed(true);
                clearNotes();
                setArmed(false);
              }}
            >
              {armed ? '정말?' : '비움'}
            </button>
          ) : null}
          <button
            type="button"
            className="np-btn np-btn--key"
            data-sfx="close"
            title={`접기 (${NOTES_KEY_LABEL})`}
            aria-label={`관찰 수첩 접기 (${NOTES_KEY_LABEL})`}
            onClick={close}
          >
            <b aria-hidden="true">{NOTES_KEY_LABEL}</b>
            <span>접기</span>
          </button>
        </div>

        {canFind ? (
          <div className="np-find">
            <input
              className="np-find__in"
              value={find}
              maxLength={40}
              placeholder="찾기 — 적은 말 · 방 이름"
              aria-label="수첩에서 찾기"
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key !== 'Escape') return;
                e.preventDefault();
                // 찾던 글자가 있으면 그것부터 무른다 — 한 번의 Esc 가 판까지 접으면 찾던 자리를 잃는다
                if (find) setFind('');
                else close();
              }}
            />
            <button
              type="button"
              className={markOnly ? 'np-btn np-btn--on' : 'np-btn'}
              data-sfx="click"
              aria-pressed={markOnly}
              title={markOnly ? '전부 보기' : '표식 찍은 줄만 보기'}
              onClick={() => setMarkOnly((v) => !v)}
            >
              ● {marked}
            </button>
          </div>
        ) : null}

        <div className="np-list" ref={listRef}>
          {notes.length === 0 ? (
            <p className="np-empty">
              여기 적은 것은 <b>방을 옮겨도 따라온다.</b>
              <br />
              들은 번호, 어긋난 말, 이상한 대답 — 나중에 대질할 것을 적어 둔다.
              <br />
              줄을 누르면 <b>표식</b>이 켜지고, 글을 누르면 고쳐 적는다.
            </p>
          ) : shown.length === 0 ? (
            <p className="np-empty">
              {markOnly && !find.trim() ? '표식을 찍은 줄이 없다.' : <>「{find.trim()}」 로 찾은 줄이 없다.</>}
            </p>
          ) : (
            shown.map((n, i) => (
              <Fragment key={n.id}>
                {/*
                  방이 바뀌는 자리에만 방 이름을 적는다 (2026-09-02).
                  줄마다 「복도」를 반복하면 읽는 눈이 그 글자를 세느라 정작 적은 말을 못 읽는다.
                  이 판이 답할 질문은 "이 말을 **어디서** 들었더라" 하나이므로, 방 이름은
                  자리가 바뀌는 그 한 줄에만 크게 서면 된다 — 그 아래는 전부 같은 방이다.
                */}
                {n.room && n.room !== shown[i - 1]?.room ? (
                  <p className="np-where">
                    <b>{n.room}</b>
                  </p>
                ) : null}
                <div className={n.mark ? 'np-row np-row--mark' : 'np-row'}>
                <button
                  type="button"
                  className="np-dot"
                  data-sfx="click"
                  aria-pressed={n.mark}
                  aria-label={n.mark ? '표식 끄기' : '표식 켜기'}
                  title={n.mark ? '표식 끄기' : '표식 켜기 — 다시 볼 줄'}
                  onClick={() => toggleNoteMark(n.id)}
                >
                  {n.mark ? '●' : '○'}
                </button>
                <div className="np-body">
                  {editing === n.id ? (
                    <input
                      className="np-edit"
                      autoFocus
                      value={editDraft}
                      maxLength={NOTE_MAX_LEN}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => {
                        if (abortEdit.current) abortEdit.current = false; // 무른 것이다 — 고친 글은 버린다
                        else editNote(n.id, editDraft);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation(); // 이 칸의 키는 방으로 안 나간다
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                          abortEdit.current = true;
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <p
                      className="np-text"
                      title="눌러서 고쳐 적는다"
                      onClick={() => {
                        setEditing(n.id);
                        setEditDraft(n.text);
                      }}
                    >
                      {n.text}
                    </p>
                  )}
                  {/* 방 이름은 위의 구분줄이 맡는다 — 여기 남는 것은 시각뿐이다 */}
                  <p className="np-meta">{clock(n.ts)}</p>
                </div>
                <button
                  type="button"
                  className="np-x"
                  data-sfx="close"
                  aria-label="이 줄 지우기"
                  title="지우기"
                  onClick={() => removeNote(n.id)}
                >
                  ✕
                </button>
                </div>
              </Fragment>
            ))
          )}
        </div>

        <form
          className="np-foot"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inRef}
            className="np-in"
            value={draft}
            maxLength={NOTE_MAX_LEN}
            placeholder="적어 둔다… (Enter 적기 · 빈 줄이면 닫기)"
            aria-label="수첩에 한 줄 적기"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setWriting(true)}
            onBlur={() => setWriting(false)}
            onKeyDown={(e) => {
              /*
               * 이 칸의 키는 방으로 안 나간다 — 안 막으면 'e' 가 지목이 되고 space 가 점프가 된다.
               * (방들의 창구도 INPUT 을 거르지만, 두 겹으로 막는다 — 새 방이 생겼을 때 여기가 먼저 막는다)
               */
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
          {/*
            아래 한 줄 — **지금 그 자리에서 듣는 키**를 말한다. 셋 중 하나다:

            ① 치는 중이고 글이 있다  → ENTER 가 적는다
            ② 치는 중인데 칸이 비었다 → 같은 ENTER 가 접는다 (여기가 나가는 문이다)
            ③ 칸 밖이다              → M 이 여닫는다

            고정된 한 문장이면 그중 둘은 늘 거짓말이고, 사용자는 안 듣는 키를 계속 누른다.

            자리가 차 갈 때만 이 줄을 상한 경고가 가져간다 — 밀려나는 줄이 **말없이** 사라지면
            안 되기 때문이다. 단 치는 중에는 안 뺏는다: 그때 이 줄은 나가는 문을 가리키고 있다.
          */}
          {!writing && NOTES_MAX - notes.length <= FULL_AT ? (
            <span className="np-hint np-hint--full">
              자리 {Math.max(0, NOTES_MAX - notes.length)}줄 — 넘으면 표식 없는 오래된 줄부터 밀린다
            </span>
          ) : writing ? (
            <span className={draft.trim() ? 'np-hint' : 'np-hint np-hint--exit'}>
              {draft.trim() ? 'ENTER 로 적는다' : `빈 줄 ENTER 로 접는다 · ${NOTES_KEY_LABEL} 은 글자다`}
            </span>
          ) : (
            <span className="np-hint">{NOTES_KEY_LABEL} 여닫기 · ENTER 적기{room ? ` · 지금 ${room}` : ''}</span>
          )}
        </form>
      </div>
    </aside>
  );
}
