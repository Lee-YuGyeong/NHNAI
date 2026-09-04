# 개발 문서

[`README.md`](../README.md) 가 게임을 소개한다면, 이 문서는 **저장소를 굴리는 법**이다.
키·구조·병렬 작업 규칙·배포·화면별 상세가 전부 여기 있다.

---

## 목차

- [시작](#시작)
- [대사가 느릴 때 — `npm run dev:api`](#대사가-느릴-때--npm-run-devapi)
- [키 · 시크릿](#키--시크릿)
- [계정 · 구글 로그인](#계정--구글-로그인)
- [구조](#구조)
- [병렬 작업 규칙](#병렬-작업-규칙)
- [화면별 상세](#화면별-상세)
- [배포](#배포)

---

## 시작

```bash
npm install
cp .dev.vars.example .dev.vars   # 시크릿은 여기만 — 값은 각자 자기 키를 넣는다 (아래 "키 · 시크릿")
npm run vars:check               # 어떤 키가 들어갔는지만 본다 (값은 안 보여준다)
npm run dev                      # http://localhost:5173  → 루트 버튼으로 각 서비스 진입
npm run worker:dev               # 워커 ws://127.0.0.1:8787 — /world(3D) 를 쓸 때만 필요. /lab 은 불필요
```

로컬만 터미널 두 개다. **배포는 프론트와 워커가 한 프로젝트 · 한 워커**다.

### 검사

```bash
npm run typecheck    # tsc (브라우저 + 워커 두 설정)
npm test             # vitest
npm run build        # typecheck → dist
npm run db:fence     # DB 울타리 자가 점검 (DB 없이 돈다 — 아래 "테이블")
```

---

## 대사가 느릴 때 — `npm run dev:api`

기본 `npm run dev` 는 에이전트 호출(`/api/lab/*`)을 **구독으로** 처리한다 — `tools/vite-lab.ts` 가
Claude Code CLI 를 자식 프로세스로 띄운다. 키가 필요 없는 대신 **한 줄에 3~55초** 걸린다
(실측: cast 54초 · talk 3.6초와 53초). 개체 다섯이 계속 떠들어야 하는 화면에서는 이 지연에
대사가 파묻혀서, 즉석 문자열로 바로 나가는 **리더 방송만 들리는** 것처럼 보인다.

| | 명령 | 대사 한 줄 | 드는 것 |
|---|---|---|---|
| 기본 | `npm run dev` | 3~55초 | 구독 (크레딧 안 나감) |
| 빠르게 | `npm run dev:api` + `npm run worker:dev` | 1~2초 | `ANTHROPIC_API_KEY` · **크레딧** |

`dev:api` 는 `LAB_VIA_WORKER=1` 로 vite 의 lab 플러그인을 빼고 `/api/lab` 을 워커로 넘긴다.
워커가 같이 떠 있어야 하고 키가 있어야 한다.

무거우면 동시 실행 수를 올린다: `LAB_CONCURRENCY=3 npm run lab`

---

## 키 · 시크릿

값은 **`.dev.vars` 한 파일**에만 두고, 이름 목록은 **`.dev.vars.example`** 이 들고 있다
(커밋되는 건 example 뿐). 새 키가 필요해지면 example 에 이름과 용도 한 줄을 추가한다.

| 읽는 쪽 | 어떻게 |
|---|---|
| 워커 `npm run worker:dev` | wrangler 가 `.dev.vars` 를 자동으로 읽어 `env.XXX` 로 준다 (ANTHROPIC·ELEVENLABS) |
| node 도구 `tools/*.mjs` | 키가 필요한 도구는 첫 줄에서 `loadVars()` (`tools/load-vars.mjs`) |
| Claude Code MCP | `.mcp.json`(커밋됨) 의 `uxpilot` 서버가 `tools/mcp-uxpilot.mjs` 를 띄우고, 그 스크립트가 `.dev.vars` 의 UXPILOT_API_KEY 로 `mcp-remote` 를 연다. 키를 `~/.claude.json` 에 넣을 필요가 없다 |
| 아무 명령 한 번 | `node tools/load-vars.mjs -- <명령>` — 그 명령에만 변수가 들어간다 |

**Tripo 는 키로 공유하지 않는다** (2026-08-29 결정) — Studio 구독 크레딧은 `tsk_` API 키와
지갑이 달라 키로는 못 쓴다. 부품 생성은 각자
`npx @tripo3d/cli auth login --email <Studio 계정>` 으로 로그인한 뒤 `tools/tripo-studio-parts.sh`.

셸에 같은 이름의 변수가 이미 있으면 셸 값이 이긴다 (파일은 기본값). 배포된 워커의 값은
Cloudflare 대시보드 → Worker → Settings → Variables and Secrets 에 사용자가 직접 넣는다
(`wrangler secret` 은 훅이 막는다).

### 새지 않게 막는 층

셋 다 저장소에 들어 있어 clone 하면 그대로 붙는다.

1. **`.gitignore`** — `.dev.vars`, `.dev.vars.*`(example 제외), `.env*`
2. **Claude Code** — `.claude/settings.json` 의 `permissions.deny` 가 Read/Edit/Write/`cat` 을
   거부하고, `.claude/hooks/guard.mjs` 가 이름 변형·글롭(`.dev*`, `.*`, `*vars`)·`rg --no-ignore`
   까지 막는다. 점검: `node .claude/hooks/guard.test.mjs`
3. **git 훅 `tools/git-hooks/`** — `npm install` 이 `core.hooksPath` 를 여기로 건다.
   pre-commit 은 시크릿 파일 스테이징과 키 모양 값(`tsk_…`, `ep_…`, `sk-ant-…`)을,
   pre-push 는 올라갈 커밋 안의 시크릿 파일을 거부한다

---

## 계정 · 구글 로그인

**humanish 가 쓰는 Supabase 프로젝트를 그대로 같이 쓴다** (2026-08-30 결정).

### 왜 프로젝트를 새로 파지 않았나

구글 OAuth 클라이언트에 등록된 리디렉션 주소는 `https://<ref>.supabase.co/auth/v1/callback`
하나다. **앱 주소가 아니라 Supabase 주소다.** 그래서 같은 프로젝트를 쓰는 한
**구글 클라우드 콘솔은 손댈 일이 없다** — 새 주소(로컬이든 배포든)는 Supabase 대시보드에
한 줄 얹으면 끝난다. 덤으로 `auth.users` 가 하나라 humanish 에서 지은 이름이 여기서도 뜬다.

(새 프로젝트를 파더라도 구글 클라이언트는 재사용된다. 콘솔에 새 프로젝트의 callback 한 줄을
추가하면 되는 일이라, "구글 연동을 다시 해야 해서" 공유하는 것은 아니다.)

### 로그인은 **관문이 아니다**

이 게임은 로그인 없이 돈다 (`src/shared/guest.ts`). 로그인이 바꾸는 것은 **이름 하나**다.

| | 이름 | 방에서 |
|---|---|---|
| 로그인 안 함 | localStorage 게스트 닉네임 | 아무나 같은 이름을 쓸 수 있다 |
| 로그인 함 | **이 게임에서 지은 이름** (`wih.profiles`) | **사칭되지 않는다** (서명된 입장권으로 들어가므로) |

### 이름은 humanish 것이 아니다 (2026-08-31 결정)

처음에는 humanish 의 `public.profiles` 를 읽어다 썼다. 계정이 같으니 이름도 같으면 편할 줄
알았는데, 실제로 로그인해 보니 **거기서 지은 이름이 그대로 박혔다.** 여긴 다른 게임이다 —
다른 이름으로 놀 수 있어야 한다.

그래서 **계정만 공유하고 이름은 여기서 새로 짓는다.** humanish 의 표는 읽지도 않는다:
남의 게임의 값을 이 게임이 몰래 참조하기 시작하면, 그쪽이 규칙을 바꿀 때 이쪽이 조용히 깨진다.

- 처음 로그인하면 `/login` 이 **이름 짓는 화면**으로 바뀐다 (구글 이름은 *제안*으로만 뜬다 —
  미리 채워 두면 그냥 넘기는 사람이 본명으로 등록된다)
- 나중에는 로비 왼쪽 「요원」 카드에서 고친다. 손을 멈추면 저장된다
- 이름은 대소문자를 무시하고 하나뿐이다 — 그래야 대기방의 ◈(확인된 이름)가 뜻을 갖는다
- 이름을 안 지어도 논다. 그때는 게스트 닉네임이다

> **⚠ 대시보드에서 한 번 더 해야 하는 것이 있다.**
> Project Settings → API → Data API → **Exposed schemas** 에 `wih` 를 추가한다.
> 안 하면 PostgREST 가 `PGRST106 Invalid schema: wih` 를 돌려주고 이름이 저장되지 않는다.
> 화면이 그 사실을 그대로 적어 주긴 하지만(`schema_not_exposed`), SQL 로는 못 켜는 스위치다.

키가 안 꽂혀 있으면 로그인이 통째로 꺼지고 화면은 로그인 단추를 **아예 그리지 않는다.**
고장이 아니다.

### 넣을 값 셋

시크릿 파일에 `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `WORLD_TICKET_SECRET`.
앞의 둘은 humanish 의 `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` 와 같은 값이고,
마지막은 `openssl rand -hex 32` 로 아무 값이나 만들면 된다. 자세한 것은 `.dev.vars.example`.

**service role 키는 필요 없다.** 워커가 하는 일(토큰 확인 · 이름 읽기)은 전부 사용자 자신의
토큰으로 하고 RLS 를 그대로 지난다 (humanish `supabase/policies.sql` 의 `profiles_select_own`).

### Supabase 대시보드에서 한 번만

Authentication → URL Configuration → **Redirect URLs** 에 추가:

```
http://localhost:5173/**
https://<배포 주소>/**          ← 배포할 때 한 줄 더. 코드는 안 고친다
```

humanish 의 `localhost:3000` 과 같이 등록해 두어도 서로 방해하지 않는다.
Site URL 은 humanish 것 그대로 둔다.

> ### 이 목록을 빠뜨리면 생기는 일
>
> 허용 목록과 글자가 안 맞으면 **에러가 안 난다.** Supabase 가 조용히 Site URL 로
> 바꿔치기해서, 로컬에서 로그인했는데 **humanish 배포 사이트로 떨어진다.**
> 화면에는 아무 설명이 없어서 "로그인이 안 된다" 로만 보인다.
> 실제로 2026-08-31 에 이걸로 한 번 막혔다 (`humanish…workers.dev/intro` 로 튕겼다).
>
> 이 저장소의 `redirectTo` 는 **늘 `<오리진>/login` 하나**다 (`src/shared/supabase.ts`).
> 지금 있는 화면 주소를 쓰지 않는 이유가 이것이다 — 목록에 넣을 글자가 하나면 어긋날
> 일도 한 번뿐이다. 그래서 `/**` 대신 정확히 이 한 줄만 넣어도 된다:
>
> ```
> http://localhost:5173/login
> ```
>
> 돌아갈 자리(방 번호 등)는 주소가 아니라 sessionStorage 로 나른다. `redirect_to` 에
> 쿼리를 붙이면 그것도 글자 대조에 걸리기 때문이다.

### 흐름

```
/intro    「입장하기」                 로그인 안 했으면 **곧장 구글이다** (중간 화면 없음)
브라우저  GET /api/config              주소 + anon 키를 받는다 (빌드에 굳히지 않는다)
          signInWithOAuth('google')   → 구글 → supabase.co/auth/v1/callback
                                       → **<오리진>/login** 으로 돌아온다 (늘 이 한 자리)
/login    돌아온 자리                  이름이 있으면 원래 가려던 곳으로. **없으면 이름을 묻는다**
          GET/PUT /api/profile        wih.profiles 를 사용자 자신의 토큰으로 읽고 쓴다
          POST /api/world/ticket      액세스 토큰을 **헤더로**. 60초짜리 입장권을 받는다
          wss://…/rooms/1234/ws?tk=…  입장권을 싣고 방으로
방(DO)    verifyTicket                서명·만료·방 번호 셋을 본다. 통과하면 그 이름을 쓴다
```

액세스 토큰을 소켓 주소에 직접 싣지 않는 이유는 **로그**다. WebSocket 은 헤더를 못 붙여서
쿼리에 실어야 하는데, 액세스 토큰은 계정 전체를 여는 한 시간짜리 열쇠다. 대신 나가는 것은
60초짜리 · 그 방 하나짜리 · 갱신 불가인 입장권이라 로그에 남아도 할 수 있는 일이 없다.
(humanish 가 `/api/world/ticket` 에서 쓰는 수법과 같다. 다른 점은 거기는 Next 가 끊고 워커가
받아서 비밀을 둘이 나눠 가졌고, 여기는 **같은 워커**가 끊고 받아 비밀이 하나라는 것뿐이다.)

### 로컬에서 어디까지 되나

| | `npm run dev` 만 | `+ npm run worker:dev` |
|---|---|---|
| 로그인 · 이름 표시 | 된다 (`VITE_SUPABASE_*` 를 로컬 파일에 넣으면) | 된다 |
| 방에서 이름 검증 | **안 된다** — 입장권을 못 받아 게스트로 들어간다 | 된다 |

배포는 프론트와 워커가 한 오리진이라 이 구분이 사라진다.

### 화면

| 어디 | 무엇 |
|---|---|
| `/login` | 로그인 화면 (`src/features/lobby/Login.tsx`). humanish 의 `components/login-screen.tsx` 를 이 줄의 콘솔 색으로 옮긴 것 |
| 머리말의 「로그인」 | `/login?next=<지금 주소>` 로 간다. 쿼리까지 들고 가야 초대받은 방으로 돌아온다 |
| 머리말의 이름 · 「나가기」 | 로그인한 뒤 (`src/shared/AccountButton.tsx`) |

**`/login` 은 관문이 아니다.** humanish 는 `RequireLogin` 이 게임 전체를 감싸서 들어오는
순간 로그인 화면을 지나야 하지만, 이 저장소는 그 결정을 따르지 않는다 — 이 게임의 첫 약속이
"NO SIGN-UP · 브라우저에서 바로" 다. 그래서 그 화면에는 **나가는 문이 늘 하나 더 있다**
(「이름만 정하고 들어가기」).

★ 키가 없을 때 머리말 단추는 **사라지고**, `/login` 은 **이유를 적는다.** 둘이 달라야 하는
이유: 눌러도 안 되는 단추는 고장으로 보이지만, 「로그인」을 찾아 화면까지 온 사람에게는
없는 이유를 알려주는 쪽이 사라지는 것보다 낫다. 대개는 워커를 안 띄운 것뿐이다
(2026-08-31 에 실제로 "로그인 어디서 하는데?" 가 나왔다).

### 파일

```
supabase/schema.sql           wih.profiles — 이 게임의 이름표
src/features/lobby/Login.tsx  /login 화면 + 이름 짓는 칸 (관문이 아니다 — 나가는 문이 늘 있다)
worker/src/auth.ts            /api/config · /api/world/ticket · 입장권 서명·검증
worker/src/room-do.ts         입장권을 보고 이름을 정한다 (없으면 게스트로 떨어뜨린다)
src/shared/supabase.ts        설정·클라이언트·로그인·입장권 요청 (React 를 모른다)
src/shared/useAccount.ts      화면이 쓰는 손잡이 + 로그인 뒤 뒷정리
src/shared/AccountButton.tsx  머리말의 단추 (설정이 없으면 아무것도 안 그린다)
supabase/apply.sh             스키마 적용 (npm run db:apply) — 울타리 셋이 여기 있다
supabase/fence.sh             울타리: 남의 스키마를 건드리는 SQL 인가
supabase/checks.sh            적용 뒤 점검 (스키마 · RLS · public 이 그대로인가)
supabase/schema.sql           wih 스키마. 지금은 규약만 있고 표는 없다
```

### 테이블

방은 Durable Object 라 (`worker/src/room-do.ts`) 좌석·채팅·방송이 전부 거기 살고,
방이 비면 같이 사라진다. 그건 게으름이 아니라 규칙이다 — 판이 끝나면 아무것도 안 남는다.

**열린 방 목록도 표가 아니다.** 등록소 DO 하나가 종이 한 장처럼 들고 있고
(`worker/src/lobby-do.ts`), 방들이 30초마다 자기 인원을 적는다. 소식이 끊긴 줄은 시효로
걷힌다 — 그래서 목록에 남는 것은 **지금 사람이 붙어 있는 방**뿐이고, 이것도 판이 끝나면
아무것도 안 남는다는 같은 규칙 안에 있다 (원작 humanish 는 여기에 `rooms` 표를 썼다).

그래서 테이블은 **판을 넘어 남아야 하는 것이 생겼을 때만** 만든다 (전적, 친구 목록,
방 즐겨찾기 같은 것). 만들 통로는 깔려 있다:

```bash
npm run db:fence     # 울타리 자가 점검 — DB 없이 돈다
npm run db:check     # 지금 DB 상태만 본다 (읽기만)
npm run db:apply     # supabase/schema.sql 을 올린다 (확인을 묻는다)
```

`SUPABASE_DB_URL_DIRECT` 가 있어야 한다 (`.dev.vars.example` 참고). 이 값은 **런타임에
안 쓴다** — 워커에도 브라우저에도 넣지 않는다. `supabase-js` 는 PostgREST(HTTP)로 붙어서
이 값을 볼 일이 없고, 이건 표를 만드는(DDL) 통로일 뿐이다.

#### 울타리 — 이 DB 는 humanish 와 공유다

접속 문자열은 **이 DB 전체에 대한 쓰기 권한**이다. 여기서 실수하면 이쪽 기능이 아니라
**그쪽 게임이 죽는다.** 그래서 `supabase/apply.sh` 가 하는 일의 절반은 적용이 아니라 방어다:

| 언제 | 무엇을 |
|---|---|
| 붙기 **전** | SQL 에 `public.` · `drop schema` · `drop database` · `truncate` · `alter default privileges` 가 있으면 거부 (`supabase/fence.sh`) |
| 적용 **중** | `search_path` 를 `wih` 로 고정 — 스키마를 안 적은 이름이 남의 칸으로 새지 않는다 |
| 적용 **뒤** | `public` 의 테이블 목록을 적용 전과 대조 — 한 글자라도 달라졌으면 실패 |

주석(`-- …`)에 적은 `public` 은 통과한다. 설명하려고 적는 것까지 막으면 정작 "왜 안 되는지"
를 파일에 못 쓴다. 울타리 자체의 자가 점검은 `npm run db:fence` (18개, DB 없이 돈다).

#### 새 테이블을 만들 때 지키는 것

`supabase/schema.sql` 머리말에도 같은 규칙이 적혀 있다.

1. **이름 앞에 스키마를 안 적는다.** `search_path` 가 `wih` 라 `create table foo` 는 `wih.foo` 다
2. **RLS 를 반드시 켠다.** 안 켜면 anon 키로 전 세계가 읽는다 — 그 키는 브라우저까지 나가는
   공개 값이다. `supabase/checks.sh` 가 RLS 안 켜진 테이블을 찾아 빨간 줄을 낸다
3. **정책은 테이블 바로 밑에 같이 쓴다.** 파일을 나누면 한쪽만 올라간다 (humanish 가
   `functions/` 를 빠뜨려 배포에서만 500 이 났던 자리다)
4. **여러 번 돌려도 같은 자리여야 한다** — `if not exists`, `drop policy if exists` → `create policy`
5. 사람을 가리키는 열은 `references auth.users(id)` — humanish 와 **같은 계정**이라 그대로 통한다
6. 새 SQL 파일을 만들면 `apply.sh` 의 `FILES` 목록에도 **반드시 더한다**. 빠진 파일은
   로컬에서만 돌고 배포 DB 에는 영영 안 올라간다

브라우저에서 `wih` 스키마를 읽으려면 **대시보드에서 한 번 더** 해 줘야 한다:
Project Settings → API → Data API → **Exposed schemas** 에 `wih` 추가. `grant` 만으로는
안 보이고, 안 하면 `supabase-js` 가 404 를 받는다.

#### 왜 `public` 을 안 쓰나

humanish 가 거기에 `rooms` · `players` · `messages` · `votes` · `match_results` 를 이미
잡고 있다. 같은 이름을 만들면 그대로 부딪히고, 부딪히지 않더라도 두 게임의 표가 한 칸에
섞이면 나중에 무엇이 누구 것인지 아무도 모른다.

---

## 구조

```
index.html → src/main.tsx (Redux Provider) → src/App.tsx (/ 서비스 선택 → /intro, /main, /world)
src/store/        Redux 등록부 (combineSlices) + 타입 훅
src/features/     서비스별 폴더 = 담당자별 작업 단위  → features/README.md
src/world/        three.js 관리 라이브러리 (Redux 비의존)  → world/README.md
src/world2/map/   시나리오 2 전용 방들 (MAPS2) — src/world 의 키트를 빌려 쓰되 본판 MAPS 에는 올리지 않는다
src/arena3d/      src/world 의 복사본 — 시행 화면 전용 (서버 연결을 빼고 좌표를 직접 채운다)
src/lab/          프롬프트·판정·시행 규칙 (순수 로직, 워커와 공유)
worker/           워커 진입점 + 방 Durable Object + 방 등록소 DO — src/world/mp 를 같이 읽는다
wrangler.jsonc    한 워커 = 프론트(dist) + 월드 서버. 배포 설정은 여기 하나뿐
public/           정적 에셋 (world/robot.glb, textures/warehouse/*)
tools/            빌드·에셋·개발 서버 플러그인 (vite-lab.ts 가 에이전트 호출을 받는다)
```

| feature | 맡는 것 |
|---|---|
| `intro` | 랜딩 「누가 인간인가?」 — 히어로 · 브리핑 · 배역 · 진행/규칙 · 입장 → 로비 |
| `main` | 로비 · 방 코드 입장 · 준비 |
| `interrogation` | **본판 「인간인 척」** (`/interrogation`) — 방(RoomDO)에 붙어 도는 화면. 판의 진실(배역 · 의심도 · 테스트 · 관리 AI)은 전부 `worker/src/game` 에 있고 화면은 그리기와 입력뿐이다. 아래 「인간인 척」 절 |
| `arena` | **옛 시행판** — 리더가 지시하고 개체가 움직이고 리더가 판정한다 (`/arena`). 2026-09-04 까지 `/interrogation` 도 이 컴포넌트였다 |
| `world` | 3D 구역 · 노드 아바타 8 · 규정 HUD |
| `central` | **중앙 시설** (`/central`) — 챕터 1 후반(AI 무리 · 락다운)과 챕터 2(검문 · 행동 분석 · 검증실 → `/interrogation?from=central`)의 무대. 화면·입력·네트워크는 `world` 가 쥐고 여기는 맵과 장면만 얹는다 |
| `recheck` | 재검실 (`/recheck`) — 챕터 3, 검문에서 감독이 끌고 왔을 때만 열린다 |
| `play` | 이야기 본판 입구 (`/play`) — 복도부터 검문소까지 한 줄 (`shared/start.ts`) |
| `warehouse` | 격납고 홀 3D 맵 단독 확인용 (`/warehouse`) |
| `world2` | **시나리오 2** (`/scenario2`) — 본판과 격리된 두 번째 판. 방은 `src/world2/map`(MAPS2)에만 등록하고 `WorldScene` 에 `def` prop 으로 넘긴다(`MapDef.bounds` 로 클램프도 방이 정한다). 본판 저장소(chapter1~3 · health · sync · enforcer · doors)는 부르지도 읽지도 않는다. 공유 코드에 댄 손은 둘 — `mp/suspicion.bindCross`(문턱 방송, 단일 슬롯) 와 검문소로 넘기는 `sessionStorage['scenario2:verdict']`(`world2/handover.ts` → `/interrogation?from=scenario2`) |
| `talk` | 구역 대화판 (`/lab`) |
| `lab` | 규정·검사판 (`/rules`) — 보류 |
| `llm` | 에이전트 관제 화면 · 리더 사고 로그 |
| `tts` | 리더 AI 구역 안내 방송 |
| `profile` | 전적 · 진실의 조각 도감 |

> 폴더와 경로가 어긋난 자리가 있다: `features/talk` → `/lab`, `features/lab` → `/rules`.

---

## 병렬 작업 규칙

- 내 폴더(`features/<name>/`) 밖은 등록부(`features/index.ts`, `store/index.ts`)에 **한 줄 추가**만.
- feature 끼리 import 금지. 공유는 `src/shared/` 또는 store.
- 작업이 끝나면 **main 에 커밋하고 바로 push 한다.** main push = Cloudflare 자동 배포.
  **다른 세션의 미커밋 변경은 섞지 않는다.** `wrangler deploy` 직접 실행은 훅이 막는다.
- 시크릿은 `.dev.vars` 에만. 코드·문서에 값 쓰지 않기. 새 키는 `.dev.vars.example` 에 이름부터.
- 클라이언트로 내려가는 필드를 추가할 때는 **"이 값을 모으면 인간을 특정할 수 있는가"** 를 먼저
  확인 — 불변 규칙 I1~I8 은 [`PLANNING.md §3`](../PLANNING.md).

---

## 화면별 상세

### 「인간인 척」 (`/interrogation`)

PLANNING.md 의 게임 그대로다 (2026-09-04 사용자: "예전 게임 내용 다 버려도 되니까 내가 새로 짜놓은 게임으로 다 반영해줘").
**방 하나 = 판 하나** — 방(`worker/src/room-do.ts`)이 `worker/src/game/runtime.ts` 의 `GameRuntime` 을 하나 쥐고, 판이 도는 동안은
채팅 · 이동 · `trial_*` 를 전부 그쪽으로 넘긴다. 화면(`src/features/interrogation`)은 상태를 받아 그리고 입력을 보낼 뿐이다.

```
worker/src/game/
  runtime.ts     판의 국면 · 좌석 · 배역 · 테스트 조립 · 격리 · 승패 · 봇 발화 · 설계자 조작 — 전부 여기
  roles.ts       배역(§1.1) · 격리 목표(§1.3) · 승패 — 순수 함수
  suspicion.ts   의심도 상태머신(§1.2) — 발언(지목 +8 · 동조 +5 · 되풀이 +3 · 몰이 +2, 상한 6) · 철회(건 만큼) · 판정 ±10
  agents.ts      프롬프트 — AI 참가자 · 대역의 한 마디, AI 의 테스트 전략(P9), 관리 AI 의 설계 · 해설 · 주장 판정(P5)
  brain.ts       DO 안의 LLM 호출 — 키 → Anthropic, 없으면 개발 서버의 /api/lab/complete(구독), 그것도 없으면 폴백
  engines.ts     물리 테스트 = worker/src/trial 의 엔진(GameEngine 계약)을 그대로 조립한다 (정지선 · 낙하 생존, 색 사냥은 자리만)
src/world/mp/game-protocol.ts   와이어 계약 (game_* 메시지 · 판의 상수)
src/features/interrogation/     화면 — interrogationSlice(서버 상태) · net/GameConnection · scene/(홀 · 다리 · 트랙 · 낙하물) · hud/(판들)
```

**흐름**: lobby(방장 「시작」, `fillTo` 로 대역 수) → briefing(7초, 배역 카드) → discussion(첫 40초, 이후 60초) ⇄ test(엔진의
`durationMs`, 지금은 60초) → result(7초 모달, 입력 잠금) → … 의심도 100 은 그 자리에서 격리 · 정체 공개. 격리가 총원 절반이면
끝. 하드캡 10분.

**와이어에 정체가 없다.** 좌석 목록(GameSeat)에는 사람 · 대역 · AI 의 구분이 없고, 판이 열리면 이름은 전부 `SUBJECT nn` 이다.
판이 도는 동안 사람의 채팅 · 이동은 **좌석 id 로 바꿔** 나간다 — 플레이어 id 가 실리면 「어느 좌석 뒤에 실제 사람이 있나」가
읽히고 남는 좌석이 곧 AI 다. 배역(`game_role`)은 그 소켓에만 가고, 설계자에게만 AI 의 좌석이 딸려 온다. 물리 조건값은 어디에도
없다(P8) — 조작 전 원본과 조건값은 DO storage 에만 남는다(P7). `tests/worker/game-runtime.test.ts` 가 이 셋을 잠근다.

**LLM 은 DO 안에서만 부른다** (§4.4). 로컬에서 키가 없으면 `worker/src/game/brain.ts` 가 개발 서버의 `/api/lab/complete`
(tools/vite-lab.ts, 구독)를 두드린다 — vite 가 `::1` 에만 떠 있는 날이 있어 localhost → [::1] → 127.0.0.1 순으로 찾는다.
한 줄에 3~55초 걸리므로 봇 대사가 늦게 붙는다. 못 받으면 폴백(관리 AI 는 표에서 가장 먼 사람을 규칙으로 짚고, 판정은
unclear, 봇은 조용히 넘긴다). 워커 로그의 `[game/brain]` 줄이 어느 길인지 말한다.

**혼자 시험하기**: 워커와 vite 를 띄우고 `/interrogation?code=1234` — 방장이 총 인원(3~8)을 고르면 모자란 만큼 대역이 앉는다.
대역과 AI 는 같은 페르소나 풀(`src/lab/personas`)에서 성격을 받고, 물리는 엔진 프로파일이 대신 움직인다(P9 — AI 는 테스트마다
`precision` 을 LLM 한 번으로 정한다). 토론 중엔 제 자리 근처를 배회한다(가만히 선 몸이 곧 표식이 되지 않게).

### 옛 시행판 (`/arena`)

`features/arena/ArenaFeature.tsx` — 리더가 지시문을 짜고 개체들이 읽고 움직이고 리더가 판정하던 판. 2026-09-04 까지
`/interrogation` 도 이 컴포넌트였다. 이야기(`/central` → `/interrogation?from=central`)로 들어오던 인계 서류(HandoverCard)는
이제 본판이 받지 않는다 — 그 길은 옛 판을 열려면 `/arena` 로 바꿔 잇는다.

밸런스 수치는 전부 그 파일의 `BALANCE` 블록 하나에 모여 있다.

| 값 | 지금 | 뜻 |
|---|---|---|
| `executeCut` | 100 | 개인 의심도가 여기 닿으면 그 자리에서 폐기 |
| `trialsToWin` | 5 | 이만큼의 시행에서 살아남으면 생존 승리 |
| `chaosWin` | 3 | 나 말고 AI 가 이만큼 폐기되면 교란 승리 |
| `mobTick` | +6 | 몰이(2인 이상 지목)가 서 있는 동안 표적이 발화마다 무는 밑값 (문 사람이 둘을 넘으면 `mobPer` 2씩 더, 상한 10) |
| `mobRelease` | −10 | 몰이가 풀린 순간(해명이 먹혔다) 씻기는 양 |
| `suspectFail` | +34 | 의심판(👁)에서 어긋난 쪽이 무는 양 (거듭 틀리면 `failRepeat` 12씩 더 무겁게) |
| `leaderFail` | +26 | 리더 설계 시행에서 경고를 받은 쪽 |
| `passWash` | −8 | 시행을 통과한 쪽이 씻는 양 (물린 채 통과했으면 `passWashMobbed` −26) |
| `hotAt` | 70 | 이 선을 넘은 개체가 있으면 자동 시행이 **처형판(⚡)** 으로 선다 |
| `forceAfter` | 12 | 시행 없이 이만큼 발화가 흐르면 정기 검사가 강제로 선다 |
| `autoStep` | 100 | 생존자 의심도 도합이 이 문턱에 닿으면 시행이 저절로 선다 (설 때마다 문턱이 오른다) |

> **죽는 길은 하나다 — 개인 의심도 100 (`executeCut`).**
> 시행에서 쌓았든, 방이 물어서 탔든, ⚡판에서 한 번에 채웠든 같은 눈금이다.
> **도합(`autoStep`)은 죽이지 않는다** — 그건 *시행이 서는* 시점이고, 보드에도 그렇게 적혀 있다
> (「도합 n% — m% 가 되면 시행이 선다」). ⚡판에서 어긋난 개체는 그 자리에서 눈금이 100 으로
> 차고, 폐기는 그 눈금이 한다 — 게이지가 40% 인 개체가 그냥 죽으면 보드가 거짓말을 한다.

**리더가 방송하는 동안은 대화 로그가 진다** (`ArenaFeature` 의 `commsHushed`).
방송은 이 방에서 유일하게 소리가 나는 말이고 자막이 화면 아래를 가로지르는데, 그 몇 초 동안
왼쪽 구석에서 잡담이 계속 흐르면 읽을 문장이 둘이 된다. 판을 내렸다 세우지 않고 **투명하게만**
만드는 것이 요점이다(`.comms.hushed`) — 지웠다 다시 세우면 굴려 올려 읽던 자리가 방송마다
바닥으로 되감긴다. 시행 구간(`TRIAL_PHASES`)은 판을 아예 안 세우는 쪽이고, 둘이 갈리는 자리다.

**소리는 리더 방송뿐이다.** 개체 다섯은 말풍선과 대화 로그로만 말한다.
개체 목소리 장치(`features/arena/node-voice.ts`)는 남아 있지만 **아무도 부르지 않는다** —
되살리려면 `ArenaFeature` 에서 부르는 자리를 도로 이으면 된다.
(때를 알리는 짧은 신호음 둘 — 박자 `beat` · 정지 `halt` — 만 `shared/sfx.ts` 에 따로 있다.)

#### 시행 중에 화면이 말해 주는 것

판이 도는 동안 사람이 볼 수 있는 것은 **넷**이고, 넷 다 판정과 **같은 기록**에서 나온다.
잣대를 두 벌 두면 「분명히 원 안이었는데 밖이라고 한다」가 나온다.

| 어디 | 무엇 | 출처 |
|---|---|---|
| 화면 위 시계 자리 | 남은 시간, 또는 **신호**(박자 ● · 정지 ■ · 초시계 `7.3 / 9초`) | `lab/quick.ts` 의 `hud` |
| 화면 가장자리 | 그 신호의 **색** — 정지는 붉게 물들고 박자는 한 번 번쩍인다 | `lab/quick.ts` 의 `tone` |
| 시계 밑 한 줄 | **지금 내가 어떻게 하고 있나** (「원 안 ✓」·「점프 1 / 2」·「ㄱ ✓ → [ㄴ]」) | `lab/quick.ts` 의 `liveNote` |
| 바닥 표식 | 색으로 말하는 상태 — 다음 자리(파랑) · 안에 섰다(초록) · 밟았다(어둡게) · 금지(빨강) | `lab/quick.ts` 의 `zoneStates` → `arena3d/map/markers.tsx` |

표식마다 **빛기둥**이 선다 — 어두운 홀 바닥의 납작한 원은 다섯 걸음만 떨어져도 안 보인다.
가야 하는 원은 그것으로 끝이다: **물건은 안 세운다** (한동안 등이 하나 섰는데 원 옆의 정체 모를
물건으로 읽혔다). 금지 원에만 말뚝 셋이 둘러선다 — 둘러막은 모양 자체가 「들어오지 마라」다.
말뚝은 `public/world/arena/hazard_beacon.glb` 이고 색은 안 들어 있다 (표식 상태에 따라 그때그때
칠한다). 「문 사이로 지나가라」 판에 서는 **검사문**(`gate_frame.glb`)도 같은 약속이다.
다시 뽑으려면 `tools/arena-parts.json` · `tools/arena-glb.sh` (텍스처는 벗겨서 넣는다 —
색을 코드가 입히므로 파일의 텍스처는 한 픽셀도 안 보이면서 자리만 먹는다).

**검사문은 「대충 이만하다」로 키우지 않는다.** 판정 폭은 `lab/quick` 의 `GATE_HALF` 하나로
정해져 있는데 화면에 서는 것은 뽑아 온 GLB 라, 어긋나면 눈으로는 기둥 사이로 지났는데 기록에는
「옆으로 돌았다」가 남는다. 그래서 `arena3d/map/markers` 의 `measureGate` 가 **파일을 열어 기둥
사이의 빈 폭을 직접 재고** 그 폭이 판정 폭이 되게 배율을 잡는다 (바닥의 문턱판도 같이 재서 그만큼
바닥에 묻는다 — 안 묻으면 발이 판 안에 잠긴다). 잠금은 `tests/features/arena/gate-fit.test.ts`.

**즉답 판은 시야 잠금을 푼다.** 잠긴 채로는 커서가 없어서 답 칸을 짚을 수가 없다. 답을 보낸 뒤
1.9초는 화면에 남아 **무엇이 답이었는지**를 보여 준다. 돌아가는 길은 늘 그렇듯 화면 클릭 하나다.

#### 즉답 판은 어려우면 안 된다

`lab/oral.ts` 열 판은 **속도로 가르지 지식으로 가르지 않는다.** 옆에서 다섯이 1초에 답을 올리는
것(「A62-040 답 제출 — 0.7초」)만으로 조급함은 이미 충분하고, 문제까지 어려우면 그때부터 이 판은
사람을 가려내는 게 아니라 **사람이라는 이유로 떨어뜨린다** — `lab/quick.ts` 머리말의 ★ 와 같은
원칙이다. 2026-09-02 사용자가 수열 판을 두고 「이 게임 너무 어려워」라고 한 자리다.

그래서 **보면 아는 것 셋**이 바닥에 깔린다 — 코드 복창(`echo`) · 다른 하나(`odd`) ·
번호 세우기(`rank`). 거꾸로 쓰기(`reverse`)도 영단어에서 이 방의 말로 바꿨다
(`BALANCE → ECNALAB` 은 뒤집기가 아니라 영어 시험이었다). 곱셈은 두 자리 × **한 자리**다 —
`82 × 16` 은 종이 없이는 한 번에 안 나와서, 답을 아느냐가 아니라 필산을 할 수 있느냐를 물었다.

**뺀 판 둘** (2026-09-02 사용자):
- **기억 검증** — 지나간 발화의 화자를 묻던 판. 국면(`Phase`)째로 걷어냈다.
- **몸으로 투표** — 소수파에 선 쪽이 걸리던 판. 이걸 빼면서 `judgeQuick` 에서 **남의 기록이 내
  판정을 바꾸는 길이 사라졌다** (`judgeVote` 가 유일했다). 이제 모든 몸판은 제 기록만 본다.

> **시계는 `TrialHud` 안에서만 돈다.** 남은 시간을 화면 전체의 state 로 두면 0.1초마다 3D 장면
> (격납고 홀 수백 개 메시)이 통째로 다시 조립된다 — 판이 도는 동안에만 프레임이 끊기던 이유다.
> 배경도 같은 이유로 `WorldScene` 에서 한 번 만들고 재사용한다.

### 구역 (`/lab`) — AI 5개와 내가 섞여 대화한다

여섯이 모여 그냥 **대화한다.** 주제도, 규정도, 검사도 없다. 다섯은 AI 고 하나가 나다.

```bash
npm run lab        # http://localhost:5173/lab — 이게 전부다
```

- **API 키도, 워커도 필요 없다.** 개발 서버가 Agent SDK 로 이 머신의 Claude 구독 인증을 그대로
  쓴다. 전제는 하나 — 이 머신에 Claude Code 가 로그인돼 있을 것.
- **전원이 사람 말투로 말한다.** AI 를 로봇처럼 말하게 하면 사람만 혼자 어색해져서 판이 1분 만에
  끝난다. 서로를 번호가 아니라 **이름**으로 부르고, 보고서 말투가 새어 나오면 서버가 한 번
  되돌려 다시 쓰게 한다(`ROBOT_WORDS`). 갈리는 지점은 말투가 아니라
  **기억·앞뒤 일관성·답을 피하는 방식**이다.
- 나는 **아무 역할도 연기하지 않는다.** AI 들은 서로의 성격을 모르므로 대조할 방법이 없다.
- **누가 내 이름을 부르면 거기서 멈춘다** — 그때가 내 차례다 (넘길 수도 있다).
  이름 대신 **번호만 불러도** 잡힌다 (`23 사람이야?` → A-23).
- 화면 우측 **페르소나 보기** 에서 프롬프트를 고치면 다음 발화부터 바로 반영된다.
  마음에 들면 `src/lab/personas.ts` 에 옮겨 적는다 — 새로고침하면 화면 수정은 날아간다.
- 한 판 = **3 라운드**. 8발화쯤 오가면 투표로 넘어가고, 최다 득표자가 폐기되고 정체가 공개된다.
- **표심 보드** — 각자 지금 누구 쪽으로 기울었는지가 실시간으로 뜬다.
- **의심은 풀린다.** 해명이 납득되면 확신을 낮추고, 바닥까지 내려가면 표명을 접는다.
  표가 2개 이상 몰리면 그 사람이 **해명 차례**를 받는다.
- **몰이에는 역풍이 있다.** 근거 없이 같은 사람만 파거나 쏠리자마자 따라붙으면 그게 의심거리다.
- **압력이 차면 총이 나간다.** 한 사람에게 쏠린 확신이 정원의 60% 를 넘고 지목이 3명 이상이면
  리더가 투표를 기다리지 않고 그 자리에서 제거한다.
- **AI 도 넘긴다.** 보탤 말이 없으면 차례를 그냥 넘긴다 — 이게 있어야 침묵이 공평한 신호가 된다.
- **조용한 것 자체는 의심의 근거가 못 된다** — 말수는 성격이다. 근거가 되는 건
  불렀는데 대답 없이 넘긴 것이고, 그건 따로 세어 판 내내 남는다.
- 버튼: **말하기**(⌘↵) · **내 마음**(내 표명) · **한 명 더** · **투표 걸기** · **판 리셋**

### 규정·검사판 (`/rules`) — 보류

리더 AI가 라운드마다 규정을 늘리고 검사를 설계해 사람을 걸러내는 판. 동작하지만 첫 판부터
난이도가 높아 지금은 접어뒀다. 기획은 [`PLANNING.md`](../PLANNING.md), 코드는 `src/features/lab/`.

### 3D 월드 (`/world`)

방 번호 + 닉네임을 치면 같은 번호끼리 창고 라운지에서 만난다.
WASD 이동 · 마우스 시야 · Space 점프 · Enter 말풍선. 폰은 조이스틱/드래그.
서버는 `worker/` 의 Durable Object 하나가 방 하나다 (인증 없음).

### 관찰 수첩 (모든 방의 오른쪽)

`src/shared/NotePad.tsx` + `src/shared/notes.ts` + `src/shared/notepad.css`.
왼쪽으로 남의 말이 흐르는 동안 오른쪽에는 내가 적는다. **M** 으로 여닫고 Enter 로 한 줄 넣는다.

**자판이 본체다.** 1인칭이라 걷는 중에는 마우스가 시야에 잠겨 있어 화면 구석의 단추를 누를 수
없다 — 누르려면 Esc 로 잠금을 풀어야 하고 그러면 걷던 흐름이 끊긴다. 그래서 단추가 할 일은
눌리는 것이 아니라 **어느 키를 누르면 되는지 말해 주는 것**이고, 그래서 「M | 메모」·「M | 접기」다.
자판 이름은 `NOTES_KEY_CODE` 한 곳에서 나온다.

**닫는 길은 넷이다.** 적는 칸 안에서 M 은 **글자**라 거기서는 닫는 키가 될 수 없다 — 글 치는
손에서 자판을 뺏을 수는 없다 (2026-09-03 신고: "m으로 닫으려니까 타자에 m만 계속 쳐져").
그래서 나가는 문은 **빈 줄 Enter** 다 — 본판 입력줄의 「Enter 보내기 · 빈 줄이면 닫기」와 같은
문법이다. 나머지 셋은 칸 밖에서의 M · `[M | 접기]` 단추 · (잠금이 풀려 있을 때) Esc.
걷는 중의 Esc 는 브라우저가 먼저 먹어 잠금만 풀리므로 **자판만으로 나가는 길은 빈 줄 Enter 뿐**이고,
판 아래 한 줄이 커서 자리에 따라 그 문을 가리킨다 (`.np-hint--exit`).

여닫는 단추는 **한 점에 있다**: 접힌 줄(`.np-stub`)이 펼친 판의 머리줄(`.np-head`)과 같은
자리·같은 폭·같은 여백을 쓰고 단추도 같은 `.np-btn` 이라, `[M | 접기]`가 서 있던 점에 `[M | 메모]`가 선다.
접힌 자리에는 **이름**(「메모」)을, 펼친 자리에는 **할 일**(「접기」)을 적는다 — 접힌 화면에는
수첩이 하나도 안 보이므로 그 단추가 무엇을 펴는지를 먼저 말해야 한다.
자리 값은 `.np` 의 `--np-right` · `--np-top` · `--np-w` · `--np-head-pad` **한 벌뿐이다** —
어느 한쪽에 숫자를 손으로 적는 순간 두 점이 어긋난다.

지금 걸린 방: 본판 넷(`/world`·`/warehouse`·`/central`·`/recheck` — `WorldFeature` 한 곳),
검증실 둘(`/arena`·`/interrogation`), 시나리오 2 다섯 방(한 라우트), 구역(`/lab`).
안 건 화면: 로비·대기방·`/main`·`/rules`·`/llm`·`/tts`·`/profile` — **관찰하는 자리가 아니다.**

새 방에 걸 때 지킬 것:

1. `<NotePad room="방 이름" touch={touchMode} />` 한 줄. 방 이름은 라우트 이름이 아니라
   **그 방에 서 있는 사람이 부르는 말**이다 (수첩의 줄은 나중에 내가 읽을 글이다).
2. 3D 방이면 **시야 잠금을 잡는 요소 밖**에 세운다 — 검증실의 `.stage` 는
   `data-world-click-to-lock` 이라 그 안의 클릭이 곧 잠금이다.
3. 그 화면의 키 창구가 `INPUT`/`TEXTAREA`/`contentEditable` 에서 온 키를 거르는지 본다.
   수첩도 제 칸에서 `stopPropagation` 하지만 막는 자리는 양쪽에 있어야 한다.
4. 글로 된 방(가운데 한 단)이면 `:root[data-notepad='open']` 을 보고 폭을 줄인다
   (`/lab` 의 CSS 가 예다). 3D 방은 판이 위에 얹히므로 아무것도 안 해도 된다.

수첩은 **한 권**이고 `localStorage` 의 `wih:notes` 한 곳에 남는다 — 방을 옮겨도 따라온다
(복도에서 적은 번호를 검문소에서 대질하는 것이 이 판의 전부다). 서버·판정·방송에 한 글자도 안 간다.

지키고 있는 것 몇 가지:

- **탭이 둘이어도 서로를 안 지운다.** 다른 탭의 쓰기(`storage` 이벤트)를 듣고 따라 읽고,
  고치기 직전에 저장소를 다시 읽어 그 위에 얹는다. 여닫힘은 안 따라간다 (저 탭 화면의 상태다).
- **쓰기가 한 번이라도 거절되면 저장소를 진실로 안 본다** (`storageOk`). 쓰기는 막혔는데 읽기는
  되는 브라우저(비공개 모드)에서 빈 저장소가 이번 판의 수첩을 덮는 것을 막는다.
- 방 이름은 **바뀌는 자리에만** 선다 (`.np-where`). 줄마다 반복하면 그 글자를 세느라 말을 못 읽는다.
- 줄이 `FIND_AT`(6)을 넘으면 찾는 줄이 선다. 거르는 규칙은 순수 함수 `filterNotes` 하나다.
- 상한(`NOTES_MAX` 120)까지 `FULL_AT`(10)줄 남으면 아래에 말해 준다 — 밀려나는 줄이
  **말없이** 사라지면 안 된다. 밀 때는 표식 없는 오래된 줄부터 민다 (`capNotes`).
- **오른쪽 위는 머리줄 한 줄이다.** 본판은 「음량 · 나가기」, 시나리오 2 는 「조각 · 음량 · 나가기」.
  거기 서는 것은 **제 자리를 정하지 않는다** — 자리는 머리줄이 정한다. 배경음악 볼륨이 제 발로
  `right:12 / top:44` 에 서 있다가 접힌 수첩의 `[M | 메모]`(top 61)를 덮어 수첩을 못 열게 만든 적이
  있다 (2026-09-02). 오른쪽 위에 새 손잡이를 놓을 일이 있으면 좌표를 재지 말고 그 줄에 넣는다.
- 검증실은 판이 끝나면(`outcome !== 'playing'`) 수첩을 걷는다. 끝 판(`.endgame`)이 z 40 이라
  46 인 수첩이 선고 위로 삐져나온다 — 선고는 한 화면이어야 한다.

### 오프닝 영상 바꾸기 (로비 앞의 첫 화면)

`src/shared/OpeningVideo.tsx` + `src/shared/opening.ts` + `public/opening/opening.mp4`.
이 브라우저에서 **처음 오는 사람에게만 한 번** 뜬다 (`wih:opening-seen`). 다시 보려면
루트(`/`)의 「영상 테스트」 — 그 단추는 표시를 남기지 않는다.

유튜브 임베드였다가 2026-09-04 에 **파일을 직접 쥐는 쪽으로** 바꿨다. 재생기 위에 얹히는
로고·채널 이름을 임베드 매개변수로 지울 수 없었기 때문이다 (사용자: "마크가 거슬리네").

자리는 **셋**이다 (`shared/opening.ts` 의 `OPENING_SOURCES`). 위에서부터 걸고, 못 열거나
코덱을 못 풀면 아래로 떨어진다:

| 자리 | 파일 | 어디에 | 누가 보나 |
| --- | --- | --- | --- |
| 1 | `opening-1440p.mp4` (H.264 1440p·8.3Mbps) | R2 | 보통은 전부. 진짜 화질이 여기 있다 |
| 2 | `opening.av1.mp4` (AV1 720p·24.4MiB) | `public/` | R2 가 안 될 때. 크롬·파이어폭스 |
| 3 | `opening.mp4` (H.264 720p·24.1MiB) | `public/` | AV1 도 못 푸는 사파리·구형 기기 |

- **떨어지는 것은 「열리지 않을 때」다.** 느린 것은 실패가 아니라서, R2 가 굼뜬 날은 떨어지지 않고
  버퍼링한다 — 그때 화면 아래에 「불러오는 중…」이 뜬다 (`.ov-wait`).
- 아래 둘은 예비지만 **지우지 않는다.** 바깥이 죽은 날 오프닝이 아예 안 뜨는 것보다 낫다.

> ★ **정적 파일 한 개 상한이 25MiB 다** (Cloudflare 워커 assets). 넘으면 배포가 거절되고,
> main push 가 곧 배포라 그 자리에서 막힌다. 편집기에서 내보낸 원본은 대개 이 상한의
> 열 배가 넘는다 (이 영상의 원본은 1080p·11.9Mbps·**423MB**).

그래서 넣기 전에 다시 인코딩한다. 4분 53초를 상한 안에 넣은 값이 아래다. 길이가 다르면
비트를 `(24 × 8192 ÷ 초) − 80` 으로 다시 잡는다 (24MiB 예산에서 소리 80k 를 뺀 몫):

```bash
brew install ffmpeg   # 없으면
SRC=~/Movies/....mp4
S="scale=1280:720:flags=lanczos"

# 1) AV1 — 같은 크기에서 화질을 얻는 손. SVT-AV1 은 요청보다 20% 남짓 낮게 나오므로 넉넉히 준다
ffmpeg -y -i "$SRC" -c:v libsvtav1 -preset 6 -b:v 760k -g 120 -vf "$S" -pix_fmt yuv420p \
  -svtav1-params "tune=0:film-grain=8" -c:a aac -b:a 80k -ac 2 \
  -movflags +faststart public/opening/opening.av1.mp4

# 2) 예비 H.264 — 2패스로 크기를 정확히 맞춘다
ffmpeg -y -i "$SRC" -c:v libx264 -preset slower -b:v 600k -maxrate 1200k -bufsize 2400k \
  -vf "$S" -pix_fmt yuv420p -profile:v high -g 60 -pass 1 -an -f mp4 /dev/null
ffmpeg -y -i "$SRC" -c:v libx264 -preset slower -b:v 600k -maxrate 1200k -bufsize 2400k \
  -vf "$S" -pix_fmt yuv420p -profile:v high -g 60 -pass 2 \
  -c:a aac -b:a 80k -ac 2 -movflags +faststart public/opening/opening.mp4
```

- H.264 는 **2패스**다. 한 번에 끝내는 `-crf` 는 크기를 미리 못 맞춘다 (`-crf 26` 에서 73MiB 였다).
- **1080p 로 올리지 않는다.** 같은 예산에서 화소가 2.25배가 되면 화소당 비트가 오히려 얇아진다 —
  1080p AV1(445k)을 뽑아 보고 720p 로 되돌린 이유다.
- `+faststart` 를 빼면 브라우저가 파일 끝의 목차를 찾으러 한 번 더 다녀온다 — 첫 화면이 늦게 뜬다.
- **이름을 바꾸지 않는다.** 같은 자리에 덮어쓰면 코드는 고칠 것이 없다 (`shared/opening.ts`).
- 그래도 아쉬우면 **길이를 줄이는 것이 해상도를 줄이는 것보다 낫다** — 같은 상한에서 초당 비트가 늘어난다.

#### 원본 화질이 필요하면 — 파일이 저장소 밖에 살아야 한다

25MiB 안에서는 원본에 가까워질 수 없다. 그래서 2026-09-04 부터 **영상만 저장소 밖**에 산다 —
같은 Cloudflare 계정의 **R2** 다 (객체 크기 상한이 사실상 없고, 전송 요금이 없고, CDN 을 탄다).

지금 올라가 있는 것: 버킷 `who-is-human`, 객체 `opening-1440p.mp4`
(2560×1440 · 8.3Mbps · 290MiB — 4K 마스터 `0825(8).mp4` 에서 뽑았다).
공개 주소는 `shared/opening.ts` 의 `OPENING_SOURCES` 첫 줄에 그대로 적혀 있다.

갈아 끼울 때:

```bash
npx wrangler r2 object put who-is-human/opening-1440p.mp4 \
  --file <새 파일> --content-type video/mp4 \
  --cache-control "public, max-age=31536000, immutable" --remote
```

- `--remote` 를 빼면 **로컬 흉내 저장소**에 넣는다 — 올라간 줄 알고 넘어가기 쉽다.
- `--content-type` 을 빼면 브라우저가 영상으로 안 읽는다.
- 캐시를 길게 주므로 **내용이 바뀌면 객체 이름을 바꾼다** (`-v2` 따위). 같은 이름에 덮으면
  이미 받아 간 사람에게는 옛 영상이 한참 남는다.

> ★ **wrangler 는 300MiB 까지만 올린다** (`MAX_UPLOAD_SIZE_BYTES = 300 * 1024 * 1024`).
> 그래서 1440p 를 8.3Mbps(290MiB)로 맞췄다 — 12Mbps 판은 428MiB 라 이 길로 안 올라간다.
> 더 큰 파일을 올려야 하면 대시보드에서 **R2 API 토큰**을 만들어 S3 호환 클라이언트로
> 멀티파트 업로드해야 한다 (rclone·aws cli).

공개 주소를 처음 여는 것은 한 번만 하면 된다:

```bash
npx wrangler r2 bucket dev-url enable who-is-human   # → https://pub-<...>.r2.dev
```

> ★ **구글 드라이브 링크는 못 쓴다** (2026-09-04 세 형태 다 확인).
> `/file/d/<id>/view` 는 사람이 보는 화면이고, `uc?export=download` 는 파일이 크면
> 「바이러스 검사 경고」 HTML 을 돌려준다. `drive.usercontent…&confirm=t` 는 `curl` 로는
> `video/mp4` 를 주는데 **크롬이 막는다** — 첨부 내려받기로 오는 응답을 미디어로 쓰지 못하게
> 하는 ORB 다 (`net::ERR_BLOCKED_BY_ORB` · `MEDIA_ELEMENT_ERROR: Format error`).
> 남는 길인 `/preview` iframe 은 구글 재생기를 데려온다 — 유튜브를 걷어낸 이유가 되돌아온다.

---

## 배포

루트 `wrangler.jsonc` 하나가 **빌드된 프론트(`dist`)와 월드 서버(Durable Object)를 같은 워커에**
올린다. 프론트와 WebSocket 이 같은 오리진이라 `VITE_WORLD_WS_URL` 같은 주소 연결 변수가 필요 없다.

```bash
npm run build        # 타입 검사(브라우저 + 워커) → dist
npx wrangler deploy  # 수동 배포는 사용자가 직접 — 평소에는 main push 의 자동 배포로 충분하다
```

- 경로 규칙: `/world-ws/rooms/<방번호>/ws` 와 `/health` 만 워커가 받고, 나머지는 정적 파일 →
  없는 경로는 `index.html`(SPA).
- Cloudflare Git 연동으로 자동 배포할 때는 빌드 `npm run build`, 배포 `npx wrangler deploy` 로
  맞춘다 (기존 Pages 방식의 "output `dist`" 설정과 다르다).
- 이전에 따로 올렸던 워커(`virtual-heart-signal-world`)가 남아 있으면 대시보드에서 지운다.
