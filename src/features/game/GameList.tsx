/**
 * 게임 목록 (/game) — 이 줄의 **미니게임**을 한 화면에 모아 놓고, 거기서 곧장 들어간다
 * (2026-09-05 사용자: "게임 목록 따로 만들고싶은데 /game 만들어서 거기서 각자 들어가서
 * 할수있게" → "우리가 만든 미니게임 이런거 넣어야하는데?").
 *
 * ┌─ 루트 목록(/menu)과 무엇이 다른가 ──────────────────────────────────────┐
 * │ 저기는 **등록부의 그림자**다 — 라우트가 있는 화면이면 다 선다. 목소리    │
 * │ 시연판도, LLM 시험판도, 규정 실험판도. 개발하는 사람이 주소를 안 외우고  │
 * │ 화면으로 뛰기 위한 문패라 이름 한 줄이면 충분하다.                        │
 * │                                                                          │
 * │ 여기는 **판만** 선다: 들어가면 이기거나 지는 것. 그래서 이름 옆에 무엇을  │
 * │ 재는 판인지 · 한 판이 얼마나 되는지 · 서버가 무엇을 보고 판정하는지가     │
 * │ 같이 온다 (catalog.ts). 고를 수 있으려면 그만큼은 알아야 한다.            │
 * │                                                                          │
 * │ 어느 여섯인지는 사용자가 직접 골랐다 — catalog.ts 의 머리말이 그 목록이다.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 화면에 글을 더 얹지 않는다 (2026-09-05 사용자: "다 삭제해줘") ──────────┐
 * │ 한때 제목 아래에 판 전체를 설명하는 두 줄이 있었고, 목록 위에 **방 번호** │
 * │ 칸이 있었다 (직접 적어 같은 방에서 만나는 자리 + 왜 잠기는지 한 줄).      │
 * │ 둘 다 걷었다. 남은 것은 제목 하나와 문 여섯이다 — 고르러 온 화면에        │
 * │ 읽을 것을 세우면 그건 안내가 아니라 지연이다 (인트로가 /login 한 장을     │
 * │ 걷어낸 것과 같은 이유, lobby/Intro.tsx 의 enter 머리말).                  │
 * │                                                                          │
 * │ 그래서 방 번호는 이제 **묻지 않고 기본값으로 붙는다** (DEFAULT_ROOM_CODE  │
 * │ = 1234 — /world · /trial · /interrogation 이 다 같이 쓰는 그 번호).       │
 * │ 다른 방으로 가려면 주소의 ?code= 를 고친다. 칸을 도로 세우려면 이 파일에  │
 * │ 입력칸 하나와 catalog.ts 의 ROOM_CODE_RE(숫자 1~6자리)면 된다.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 옷은 인트로·로비의 **파란 콘솔** 그대로다 (lobby.css · console.tsx 의 Backdrop).
 *   /intro 에서 여기로 넘어올 때 화면이 갈아끼워진 것처럼 보이면 안 된다 — 같은 게임이다.
 */
import { Link } from 'react-router-dom';
import { AccountButton } from '@/shared/AccountButton';
import { SfxToggle } from '@/shared/SfxToggle';
import { ArrowIcon, Backdrop } from '@/features/lobby/console';
import { DEFAULT_ROOM_CODE, GAMES, type GameEntry } from './catalog';
import { GameGlyph } from './glyphs';
import './games.css';

/** 「1분」·「30초」 — 분으로 딱 떨어지면 분으로, 아니면 초로 */
function span(entry: GameEntry): string {
  const sec = Math.round(entry.ms / 1000);
  return sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`;
}

function GameCard({ entry }: { entry: GameEntry }) {
  return (
    <Link to={entry.href(DEFAULT_ROOM_CODE)} className="gm-card bl-edge" data-sfx="open">
      <span className="gm-card__art">
        <GameGlyph id={entry.id} />
      </span>
      <span className="gm-card__body">
        <span className="gm-card__name">
          <b>{entry.label}</b>
          <span className="gm-card__span">{span(entry)}</span>
        </span>
        <span className="gm-card__phys">{entry.physics}</span>
        <p className="gm-card__blurb">{entry.blurb}</p>
        {/* 카드 전체가 이미 링크라 따로 누르는 자리가 아니다 — 어디로 가는지의 신호일 뿐 */}
        <span className="gm-card__go">
          들어가기
          <ArrowIcon />
        </span>
      </span>
    </Link>
  );
}

export function GameList() {
  return (
    <div className="bl">
      <Backdrop />

      <header className="bl-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 48, minWidth: 0 }}>
          {/* 로고는 여기서 **문이다** — 인트로로 돌아가는 길 (인트로에서는 span 이라 눌리지 않는다) */}
          <Link to="/intro" className="bl-logo" style={{ textDecoration: 'none' }}>
            특수인공지능대응센터
          </Link>
          <nav className="bl-nav">
            <span className="bl-navbtn bl-navbtn--on" aria-current="page">
              게임 목록
            </span>
            <Link to="/lobby" className="bl-navbtn" style={{ textDecoration: 'none' }}>
              방 목록
            </Link>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AccountButton className="bl-navbtn" />
          <SfxToggle className="bl-navbtn" />
        </div>
      </header>

      <main className="gm">
        <h1 className="gm-lede">미니게임</h1>

        <div className="gm-grid">
          {GAMES.map((g) => (
            <GameCard key={g.id} entry={g} />
          ))}
        </div>
      </main>
    </div>
  );
}
