-- ═══════════════════════════════════════════════════════════════════════════
-- 이 저장소가 쓰는 표 — 전부 `wih` 스키마 안에 있다.
--
-- ┌─ 왜 스키마를 따로 파나 ─────────────────────────────────────────────────┐
-- │ 이 DB 는 humanish 와 **같은 프로젝트**다. 그쪽이 public 스키마에         │
-- │ rooms · players · messages · votes · match_results · profiles 를 이미    │
-- │ 잡고 있어서, 여기서 같은 이름을 만들면 그대로 부딪힌다. 부딪히지         │
-- │ 않더라도 두 게임의 표가 한 칸에 섞이면 나중에 무엇이 누구 것인지         │
-- │ 아무도 모른다.                                                          │
-- │                                                                        │
-- │ 그래서 이 파일은 **public 을 한 글자도 건드리지 않는다.** apply.sh 가    │
-- │ 적용 전에 이 파일에서 `public.` 을 찾아 거부하고, 적용 뒤에는 public 의  │
-- │ 표 목록이 그대로인지 대조한다.                                          │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ 표를 새로 만들 때 지키는 것 ───────────────────────────────────────────┐
-- │ 1. 이름 앞에 스키마를 안 적는다. apply.sh 가 search_path 를 wih 로       │
-- │    고정하므로 `create table foo` 는 wih.foo 가 된다.                    │
-- │ 2. **RLS 를 반드시 켠다.** 안 켜면 anon 키로 전 세계가 읽는다 —          │
-- │    그 키는 브라우저까지 나가는 공개 값이다 (worker/src/auth.ts).         │
-- │    checks.sh 가 RLS 안 켜진 표를 찾아내 빨간 줄을 낸다.                 │
-- │ 3. 정책은 표 바로 밑에 같이 쓴다. 파일을 나누면 한쪽만 올라간다          │
-- │    (humanish 가 functions/ 를 빠뜨려 배포에서만 500 이 났던 자리다).    │
-- │ 4. 여러 번 돌려도 같은 자리여야 한다 — `if not exists`,                 │
-- │    `drop policy if exists` → `create policy`.                          │
-- │ 5. 사람을 가리키는 열은 `references auth.users(id)`. humanish 와        │
-- │    **같은 계정**이라 user_id 가 그대로 통한다.                          │
-- └────────────────────────────────────────────────────────────────────────┘
--
--   적용:  npm run db:apply      (확인을 묻는다)
--   점검:  npm run db:check      (읽기만 한다 — 아무것도 안 고친다)
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists wih;

-- 이 스키마를 PostgREST 로 노출하려면 **대시보드에서 한 번 더** 해 줘야 한다:
--   Project Settings → API → Data API → Exposed schemas 에 `wih` 추가
-- 여기서 grant 만 해서는 안 보인다. 그 설정을 안 하면 워커가 PostgREST 에서 404 를 받는다.
grant usage on schema wih to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- profiles — **이 게임의 이름**. 계정 하나에 이름 하나.
--
-- ┌─ 왜 humanish 의 이름을 안 쓰나 (2026-08-31 사용자 결정) ────────────────┐
-- │ 처음에는 humanish 의 public.profiles 를 읽어다 썼다. 계정이 같으니       │
-- │ 이름도 같으면 편할 줄 알았는데, 실제로 로그인해 보니 **거기서 지은       │
-- │ 이름이 그대로 박혔다.** 여긴 다른 게임이다 — 다른 이름으로 놀 수 있어야  │
-- │ 한다. 그래서 계정만 공유하고 이름은 여기서 새로 짓는다.                  │
-- │                                                                        │
-- │ humanish 의 표는 **읽지도 않는다.** 남의 게임의 값을 이 게임이 몰래      │
-- │ 참조하기 시작하면, 그쪽이 규칙을 바꿀 때 이쪽이 조용히 깨진다.          │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ★ 구글 이름을 자동으로 넣지 않는다. 그건 사용자가 고른 적 없는 값이라
--   **본명이 대기방에 뜬다.** 화면이 제안까지만 하고 고르는 것은 사람이 한다
--   (features/lobby/Nickname.tsx). humanish 가 같은 이유로 이름 짓는 화면을 따로 뒀다.
create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 길이는 화면·서버와 **같은 값**이어야 한다 (src/world/mp/constants.ts 의 NICK_MAX_LEN = 12).
-- 여기만 다르면 화면에서는 쳐지는데 저장에서 터진다 — 사용자에게는 이유 없는 실패로 보인다.
-- drop 을 먼저 하는 이유: 이 파일을 다시 돌릴 때 같은 이름이 이미 있으면 create 가 안 된다.
alter table profiles drop constraint if exists profiles_display_name_len;
alter table profiles add constraint profiles_display_name_len
  check (char_length(display_name) between 1 and 12);

-- ★ 이름은 겹치지 않는다. **대소문자를 구분하지 않는다** — 'Nine' 과 'nine' 이 같은
--   방에 나란히 서면 같은 사람으로 보인다. 대기방의 ◈(확인된 이름)가 「이 이름은 이
--   사람 것」을 뜻하려면 이름이 사람을 가리켜야 한다.
--   유니크 "제약"이 아니라 표현식 인덱스인 이유: 제약에는 lower() 같은 식을 못 쓴다.
create unique index if not exists profiles_display_name_key
  on profiles (lower(display_name));

alter table profiles enable row level security;

-- ★ 쓰기를 authenticated 에게 연다 — humanish 와 다른 선택이다.
--   그쪽은 service role 로만 쓰는데, 그러려면 그 키를 워커에 둬야 한다.
--   여기서는 **본인 행만** 건드릴 수 있게 정책으로 잠그고 값의 모양은 위 제약이 지킨다.
--   새면 RLS 가 통째로 무의미해지는 키를, 이 표 하나 때문에 인터넷에 붙은
--   프로세스에 둘 이유가 없다 (worker/src/auth.ts 머리말과 같은 규칙).
revoke all on profiles from anon, authenticated;
grant select, insert, update on profiles to authenticated;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

-- using 과 with check 를 **둘 다** 적는다. using 만 적으면 자기 행을 골라서
-- user_id 를 남의 것으로 바꿔 넣을 수 있다 (고른 뒤의 값은 with check 가 본다).
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 지우는 정책은 없다. 계정을 지우면 on delete cascade 로 같이 사라진다.

-- ★ **이름은 한 번 짓고 끝이다** (2026-08-31 사용자 지시. humanish 와 같은 규칙).
--
--   왜 정책이 아니라 트리거인가: 정책은 **누가** 건드리는지를 보고, 트리거는 **무엇이
--   바뀌는지**를 본다. 이름을 못 바꾸게 하는 것은 뒤쪽이다. 게다가 나중에 service role
--   로 쓰는 경로가 하나라도 생기면 정책은 그냥 통과당한다 — 트리거는 못 비껴간다.
--   이 규칙을 아는 자리가 라우트 하나뿐이면, 프로필을 건드리는 경로가 하나 더 생기는
--   순간 조용히 뚫린다.
--
--   화면도 같은 말을 하지만(features/lobby/Nickname.tsx) 그건 안내이고, 자물쇠는 여기다.
create or replace function freeze_display_name() returns trigger
language plpgsql as $$
begin
  if new.display_name is distinct from old.display_name then
    raise exception '이름은 한 번 지으면 바꿀 수 없다' using errcode = 'P0001';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on profiles;
drop trigger if exists profiles_name_frozen on profiles;
create trigger profiles_name_frozen before update on profiles
  for each row execute function freeze_display_name();
