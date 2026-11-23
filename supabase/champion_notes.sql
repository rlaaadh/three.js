-- 1등 한마디: 새로 1등이 된 사람이 이전 1등에게 남기는 한마디 (모든 게임 랭킹 공용)
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (여러 번 실행해도 괜찮아요)
-- ※ 게임 랭킹 표(rain · dish · sleep · sleep_speed · jelly · kkomantle _scores)를 먼저 만든 뒤에 실행하세요.
-- 누구나 "읽기"와 submit_champion_note 함수로 "등록"만 할 수 있어요. 지금 그 랭킹 1등인 닉네임만 남길 수 있어요.

create table if not exists public.champion_notes (
  id bigint generated always as identity primary key,
  -- 어느 랭킹인지: rain · dish · sleep · sleep_speed · jelly · kkomantle:YYYY-MM-DD
  board text not null check (char_length(board) between 1 and 40),
  -- 한마디를 남긴 새 1등
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  -- 자리를 내준 이전 1등
  to_nickname text not null check (char_length(btrim(to_nickname)) between 1 and 12),
  message text not null check (char_length(btrim(message)) between 1 and 10),
  created_at timestamptz not null default now()
);

-- 같은 랭킹 · 같은 닉네임은 한마디 하나 (다시 1등이 되면 새 한마디로 바뀌어요)
create unique index if not exists champion_notes_board_nickname_key on public.champion_notes (board, nickname);

alter table public.champion_notes enable row level security;

drop policy if exists "누구나 한마디 보기" on public.champion_notes;
create policy "누구나 한마디 보기"
  on public.champion_notes for select
  to anon, authenticated
  using (true);

-- 그 랭킹의 지금 1등 닉네임 (각 게임 랭킹과 같은 정렬 기준)
create or replace function public.champion_of(p_board text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_board = 'rain' then
      (select nickname from rain_scores order by reached_round desc, total_score desc, avg_cpm desc, created_at limit 1)
    when p_board = 'dish' then
      (select nickname from dish_scores order by percent desc, time_sec asc, created_at limit 1)
    when p_board = 'sleep' then
      (select nickname from sleep_scores order by slept_min desc, score desc, sheep desc, created_at limit 1)
    when p_board = 'sleep_speed' then
      (select nickname from sleep_speed_scores order by slept_min desc, score desc, sheep desc, created_at limit 1)
    when p_board = 'jelly' then
      (select nickname from jelly_scores order by score desc, lines desc, created_at limit 1)
    when p_board ~ '^kkomantle:\d{4}-\d{2}-\d{2}$' then
      (select nickname from kkomantle_scores where day = split_part(p_board, ':', 2)::date order by tries, time_sec, created_at limit 1)
  end;
$$;

-- 등록: 지금 1등인 닉네임만. 같은 사람이 다시 남기면 바꿔요
create or replace function public.submit_champion_note(
  p_board text,
  p_nickname text,
  p_to_nickname text,
  p_message text
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  p_nickname := btrim(p_nickname);
  p_to_nickname := btrim(p_to_nickname);
  p_message := btrim(p_message);
  if char_length(p_message) not between 1 and 10 then
    raise exception '한마디는 1~10자로 적어 주세요';
  end if;
  if p_nickname = p_to_nickname or champion_of(p_board) is distinct from p_nickname then
    raise exception '지금 1등만 한마디를 남길 수 있어요';
  end if;

  -- 지난 꼬맨틀 날짜의 한마디는 정리해요
  delete from champion_notes
  where board like 'kkomantle:%'
    and split_part(board, ':', 2)::date < (now() at time zone 'Asia/Seoul')::date - 1;

  insert into champion_notes (board, nickname, to_nickname, message)
  values (p_board, p_nickname, p_to_nickname, p_message)
  on conflict (board, nickname) do update
  set to_nickname = excluded.to_nickname,
      message = excluded.message,
      created_at = now();
  return 'ok';
end;
$$;

grant select on public.champion_notes to anon, authenticated;
revoke insert, update, delete on public.champion_notes from anon, authenticated;
revoke execute on function public.champion_of(text) from public;
revoke execute on function public.submit_champion_note(text, text, text, text) from public;
grant execute on function public.submit_champion_note(text, text, text, text) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
