/**
 * 메인 로비 — 방 만들기 / 코드 입장. humanish 의 app/main/lobby.tsx 흐름을 이식한 것.
 *
 * 원작과 다른 점 하나: **로그인이 없다.** 원작은 이 화면을 RequireLogin 으로 감쌌지만
 * (humanish/components/require-login.tsx), 지금은 테스트 단계라 게스트 닉네임(localStorage)으로
 * 바로 논다. 나중에 계정이 생기면 이 화면만 게이트 뒤로 옮기면 된다 — 흐름은 그대로다.
 *
 * 방 만들기가 서버 호출이 아닌 이유: 워커에 "방 생성" API 가 없다. 같은 코드를 친
 * 사람끼리 같은 DO 인스턴스로 모일 뿐이다 (worker/src/index.ts 의 idFromName).
 * 그래서 코드 4자리를 뽑아 월드 주소로 보내는 것이 곧 방 만들기다 —
 * 입장 주소(/world?code=…&nick=…)는 그대로 공유 링크가 된다.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackToRoot } from '@/shared/BackToRoot';
import { randomRoomCode, saveGuestNick } from '@/shared/guest';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
// '@/world' 등록부가 아니라 constants 를 직접 읽는다 — 로비가 three.js 까지 끌고 오지 않게.
import { NICK_MAX_LEN, ROOM_CODE_RE } from '@/world/mp/constants';
// 시행 목록은 순수 데이터다 — quick.ts·oral.ts 는 three 를 안 끌어온다 (로비가 3D 를 안 받게 하는 원칙 그대로)
import { QUICK_GAMES } from '@/lab/quick';
import { ORAL_GAMES } from '@/lab/oral';
import { mainActions, mainSelectors } from './mainSlice';

export function MainFeature() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const nickname = useAppSelector(mainSelectors.selectNickname);
  const joinCode = useAppSelector(mainSelectors.selectJoinCode);
  const [error, setError] = useState<string | null>(null);

  /** 만들든 코드로 들어가든 같은 길 — 닉네임을 남기고 월드 주소로 간다 */
  const enterWorld = (code: string) => {
    const nick = nickname.trim();
    if (!nick) {
      setError('닉네임을 입력하라');
      return;
    }
    if (!ROOM_CODE_RE.test(code)) {
      setError('방 코드는 숫자 1~6자리');
      return;
    }
    saveGuestNick(nick);
    navigate(`/world?code=${code}&nick=${encodeURIComponent(nick)}`);
  };

  /**
   * 물리 미니게임(진짜 서버 권위 멀티플레이) 테스트용 문 — 지금은 정지선(PR1)뿐이다.
   * /trial 은 닉네임을 URL 이 아니라 shared/guest.ts(localStorage)로 읽으므로 여기서 먼저 저장해 둔다.
   * 위의 방 코드 입력칸을 그대로 재사용한다 — 같은 코드를 두 탭에 치면 같은 방(RoomDO)에서 만난다.
   */
  const enterTrial = (game: 'stopline' | 'fall') => {
    const nick = nickname.trim();
    if (!nick) {
      setError('닉네임을 입력하라');
      return;
    }
    const code = joinCode.trim() || randomRoomCode();
    saveGuestNick(nick);
    navigate(`/trial?code=${code}&game=${game}`);
  };

  return (
    <main style={{ padding: 32, maxWidth: 420, display: 'grid', gap: 20 }}>
      <BackToRoot />
      {/* 이 화면에서 제일 먼저 보이는 것 — 아래의 낡은 흐름보다 이 문이 먼저다 (2026-08-30 사용자 지시) */}
      <LobbyDoor onEnter={() => navigate('/intro')} />
      <header>
        <h2 style={{ margin: '0 0 4px' }}>메인 로비</h2>
        <p style={{ margin: 0, color: '#888', fontSize: 13 }}>로그인 없음 — 닉네임만 정하면 바로 들어간다.</p>
      </header>


      <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
        게스트 닉네임
        <input
          value={nickname}
          maxLength={NICK_MAX_LEN}
          placeholder="예: 요원-3721"
          onChange={(e) => dispatch(mainActions.setNickname(e.target.value))}
        />
      </label>

      <section style={{ display: 'grid', gap: 8 }}>
        <button type="button" style={{ padding: 12 }} onClick={() => enterWorld(randomRoomCode())}>
          방 만들기
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enterWorld(joinCode.trim());
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            value={joinCode}
            inputMode="numeric"
            maxLength={6}
            placeholder="방 코드 (숫자)"
            style={{ flex: 1 }}
            onChange={(e) => dispatch(mainActions.setJoinCode(e.target.value.replace(/\D/g, '')))}
          />
          <button type="submit">코드로 입장</button>
        </form>
        {error ? <p style={{ margin: 0, color: '#d2796a', fontSize: 13 }}>{error}</p> : null}
        <p style={{ margin: 0, color: '#666', fontSize: 12, lineHeight: 1.6 }}>
          만든 방의 코드를 알려주면 같은 창고에서 만난다. 입장한 뒤의 주소(/world?code=…)를 그대로 보내도 된다.
        </p>
      </section>

      <TrialListPanel />
      <PhysicsTrialPanel onEnter={enterTrial} />
      <FriendsPanel />
      <LobbyChatPanel />
    </main>
  );
}

/* ── 구역으로 가는 문 ── */

/** 모따기 — 왼쪽 위와 오른쪽 아래를 깎는다. 로비의 판(.bl-edge)과 같은 각이다 */
const DOOR_CUT = 'polygon(0 12px, 12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)';

/**
 * 로비로 가는 문 — **이 화면의 첫 칸이다** (2026-08-30 사용자: "버튼 새로 만들어줘 / 제일 위에").
 *
 * ┌─ 앞에 있던 것 ───────────────────────────────────────────────────────────┐
 * │ 「게임 로비 · 대기방 → / 방 목록 · 좌석 · 준비 · 게임 시작 (새 디자인)」  │
 * │ 이 라벨은 **개발 메모**였다. 「(새 디자인)」 은 만든 사람만 아는 말이고,  │
 * │ 나머지도 기능을 나열한 것이라 무엇이 열리는지는 알려 줘도 **어디로 가는   │
 * │ 지**는 말하지 않는다. 그 사이 저쪽은 브리핑이 앞에 선 한 줄이 되었다 —    │
 * │ 표식 → 브리핑 → 배역 → 진행 → 입장. 문에 적을 말도 그것이어야 한다.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 생김새를 **로비에서 가져온다** — 모따기한 남색 판에 청록 1px 테. 문을 열기 전에
 *   문 너머의 색이 먼저 보여야, 눌렀을 때 화면이 갈아끼워진 것처럼 보이지 않는다.
 *   다만 lobby.css 를 끌어오지는 않는다 (그 파일은 .bl 안에서만 도는 1600줄이다) —
 *   테 한 겹은 **판 두 장**으로 낸다: 바깥이 청록으로 꽉 차고 안쪽이 1px 들어와 남색을
 *   덮는다. 같은 clip-path 라 대각선 자리에도 선이 남는다 (.bl-edge 가 하는 일과 같다).
 *
 * ★ data-sfx="clank" — 방으로 들어가는 소리다. 로비 목록의 방 한 줄과 같은 소리를 내야
 *   같은 문으로 읽힌다 (shared/sfx.ts).
 */
function LobbyDoor({ onEnter }: { onEnter: () => void }) {
  const [lit, setLit] = useState(false);
  return (
    <button
      type="button"
      data-sfx="clank"
      onClick={onEnter}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      style={{
        // 바깥 겹 = 테 색. 안쪽 겹이 1px 들어와 남색을 덮는다
        padding: 1,
        border: 0,
        borderRadius: 0,
        clipPath: DOOR_CUT,
        background: lit
          ? 'linear-gradient(180deg, rgba(160, 232, 255, 1), rgba(111, 211, 255, 0.55))'
          : 'linear-gradient(180deg, rgba(111, 211, 255, 0.72), rgba(63, 143, 194, 0.34))',
        boxShadow: lit ? '0 0 34px -10px rgba(111, 211, 255, 0.75)' : '0 14px 30px -18px rgba(0, 0, 0, 0.95)',
        cursor: 'pointer',
        transition: 'background 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      <span
        style={{
          display: 'grid',
          gap: 5,
          padding: '15px 16px 14px',
          clipPath: DOOR_CUT,
          background: 'linear-gradient(180deg, rgba(10, 26, 44, 0.96), rgba(4, 16, 28, 0.98))',
          textAlign: 'left',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: 9.5, letterSpacing: '0.2em', color: '#4e6f88' }}>
          SECTOR 2098 // ENTRY
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: '#f2f8ff' }}>구역 입장</span>
          {/* 화살표는 켜질 때만 앞으로 나온다 — 문이 열리는 쪽을 가리킨다 */}
          <span aria-hidden style={{ fontSize: 15, color: '#6fd3ff', transform: lit ? 'translateX(3px)' : 'none', transition: 'transform 0.18s ease' }}>
            →
          </span>
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.6, color: '#83a8c2' }}>브리핑 → 방 목록 → 대기방 → 게임 시작</span>
      </span>
    </button>
  );
}

/* ── 시행 목록 ── */

/**
 * 시행 목록 — 아레나(/arena)에서 걸 수 있는 판을 **여기서만 훑어본다.**
 * 아레나 첫 화면은 「게임 시작」 버튼 하나로 비웠다 (사용자 결정 2026-08-29) — 목록을 그 자리에서 잃지 않게 로비로 옮긴 것이다.
 * 여기서는 **고르지 않는다.** 판은 아레나 안의 상태(개체·좌표·기록)가 있어야 서므로, 이 화면은 읽기 전용 카탈로그다.
 *   ⚡ execute — 어긋나면 즉시 폐기 · 👁 suspect — 어긋나면 의심도가 오른다 · 🗣 즉답 — 몸이 아니라 답으로 가르는 판
 */
function TrialListPanel() {
  const navigate = useNavigate();
  const rows: { key: string; icon: string; title: string; hint: string }[] = [
    ...QUICK_GAMES.map((g) => ({ key: `q:${g.id}`, icon: g.stakes === 'execute' ? '⚡' : '👁', title: g.title, hint: g.hint })),
    ...ORAL_GAMES.map((g) => ({ key: `o:${g.id}`, icon: '🗣', title: g.title, hint: g.hint })),
  ];
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h3 style={{ margin: 0, fontSize: 13, color: '#999' }}>검사 목록 ({rows.length})</h3>
      <p style={{ margin: 0, color: '#666', fontSize: 12, lineHeight: 1.6 }}>
        아레나에서 걸 수 있는 판이다. ⚡ 어긋나면 즉시 폐기 · 👁 의심도가 오른다 · 🗣 보고 바로 답하는 판.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {rows.map((r) => (
          <li key={r.key} style={{ fontSize: 13, color: '#bbb', lineHeight: 1.5 }}>
            {r.icon} <b style={{ color: '#ddd' }}>{r.title}</b>
            <span style={{ color: '#777' }}> — {r.hint}</span>
          </li>
        ))}
      </ul>
      <button type="button" style={{ padding: 8, justifySelf: 'start' }} onClick={() => navigate('/arena')}>
        아레나로 가기
      </button>
    </section>
  );
}

/**
 * 물리 미니게임(worker/src/trial/) 테스트 문 — TrialListPanel(아레나 카탈로그)과는 다른 시스템이다.
 * 지금은 정지선 하나뿐이라 목록이 아니라 버튼 하나로 둔다 — 게임이 늘면 그때 목록으로 바꾼다.
 */
function PhysicsTrialPanel({ onEnter }: { onEnter: (game: 'stopline' | 'fall') => void }) {
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h3 style={{ margin: 0, fontSize: 13, color: '#999' }}>물리 미니게임 (테스트)</h3>
      <p style={{ margin: 0, color: '#666', fontSize: 12, lineHeight: 1.6 }}>
        진짜 서버 권위 멀티플레이 — 심문소 홀 안에서 1인칭으로. 위 방 코드로 여러 탭을 열면 같은 방에서 같이 한다.
        정지선(마찰 · 관성) · 낙하 생존(중력). 색 사냥(빛 · 색)은 아직.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ padding: 8 }} onClick={() => onEnter('stopline')}>
          정지선 테스트
        </button>
        <button type="button" style={{ padding: 8 }} onClick={() => onEnter('fall')}>
          낙하 생존 테스트
        </button>
      </div>
    </section>
  );
}

/* ── 아래는 목업 — humanish app/main/mock-lobby.ts 이식. 아직 뒷받침할 데이터가 없어 화면에만 있다 ── */

type Friend = { name: string; state: '대기 중' | '게임 중' | '오프라인'; detail?: string };

const FRIENDS: Friend[] = [
  { name: 'Yuri_Gaming', state: '대기 중' },
  { name: 'King_Bot', state: '게임 중', detail: '12:40' },
  { name: 'Ghost_User', state: '오프라인' },
];

const FRIEND_COLOR: Record<Friend['state'], string> = {
  '대기 중': '#d4a373',
  '게임 중': '#d2796a',
  오프라인: '#666',
};

// 목업 문구라도 게임 규칙을 말하지 않는다. AI·인간 수를 숫자로 적으면 그게 곧 안내문이
// 된다 (원작 mock-lobby.ts 가 남긴 주의 — PLANNING §3 I 규칙들과 같은 결).
const LOBBY_CHAT: { user: string; message: string }[] = [
  { user: 'User_99', message: '같이 하실 분?' },
  { user: 'Bot_A', message: '방금 기계 연기 오졌음ㅋㅋㅋ' },
  { user: 'Master', message: '이번 판 진짜 못 걸러내겠던데요' },
  { user: 'Spy_X', message: '님들 방 드가셈' },
];

function FriendsPanel() {
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h3 style={{ margin: 0, fontSize: 13, color: '#999' }}>접속한 요원 (목업)</h3>
      {FRIENDS.map((f) => (
        <p key={f.name} style={{ margin: 0, fontSize: 13, color: FRIEND_COLOR[f.state] }}>
          ● {f.name} — {f.state}
          {f.detail ? ` (${f.detail})` : ''}
        </p>
      ))}
    </section>
  );
}

function LobbyChatPanel() {
  return (
    <section style={{ display: 'grid', gap: 4 }}>
      <h3 style={{ margin: 0, fontSize: 13, color: '#999' }}>로비 채팅 (목업)</h3>
      {LOBBY_CHAT.map((c) => (
        <p key={c.user} style={{ margin: 0, fontSize: 13, color: '#aaa' }}>
          <span style={{ fontWeight: 700, color: '#d4a373' }}>{c.user}</span> {c.message}
        </p>
      ))}
    </section>
  );
}
