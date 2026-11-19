-- 꼬맨틀 (책꽂이 단어 유사도 게임) 오늘의 랭킹
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (여러 번 실행해도 괜찮아요)
-- 하루에 한 단어라서 랭킹도 날짜(한국 시간)별이에요. 밤 12시가 지나면 새 랭킹, 지난 기록은 지워져요.
-- 비밀 단어는 저장하지 않아요 (아직 못 푼 사람이 랭킹을 보고 알아 버리지 않게).
-- 누구나 "읽기"와 submit_kkomantle_score 함수로 "등록"만 할 수 있어요. 같은 날 같은 닉네임은 더 좋은 기록일 때만 바뀌어요.

create table if not exists public.kkomantle_scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  tries smallint not null check (tries between 1 and 5000),
  time_sec numeric(7, 1) not null check (time_sec between 0 and 86400),
  day date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now()
);

-- 예전 버전(단어 칸이 있고 날짜 칸이 없던 표)을 이미 만들었다면 새 모양으로 바꿔요
alter table public.kkomantle_scores add column if not exists day date not null default ((now() at time zone 'Asia/Seoul')::date);
alter table public.kkomantle_scores drop column if exists word;
drop index if exists public.kkomantle_scores_nickname_key;
drop index if exists public.kkomantle_scores_rank_idx;
drop function if exists public.submit_kkomantle_score(text, int, numeric, text);

-- 그날 순위 정렬용
create index if not exists kkomantle_scores_day_rank_idx
  on public.kkomantle_scores (day, tries, time_sec, created_at);

-- 같은 날 같은 닉네임은 한 줄만
create unique index if not exists kkomantle_scores_day_nickname_key on public.kkomantle_scores (day, nickname);

-- 행 단위 권한(RLS): 켜 두면 아래 정책에 맞는 것만 허용돼요
alter table public.kkomantle_scores enable row level security;

drop policy if exists "누구나 랭킹 보기" on public.kkomantle_scores;
create policy "누구나 랭킹 보기"
  on public.kkomantle_scores for select
  to anon, authenticated
  using (true);

-- 등록: 처음이면 추가, 더 좋으면 갱신, 아니면 그대로 ('inserted' · 'updated' · 'kept')
-- 순위와 같은 기준이에요: 적은 추측 횟수 → 빠른 시간
-- p_day는 오늘이나 어제(밤 12시 직전에 맞히고 직후에 등록한 경우)만 받아요. 등록할 때 그보다 지난 기록은 지워요.
create or replace function public.submit_kkomantle_score(
  p_nickname text,
  p_tries int,
  p_time_sec numeric,
  p_day date
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_day is null or p_day not in (today, today - 1) then
    raise exception '오늘 단어 기록만 올릴 수 있어요';
  end if;

  delete from kkomantle_scores where day < today - 1;

  p_nickname := btrim(p_nickname);
  insert into kkomantle_scores (nickname, tries, time_sec, day)
  values (p_nickname, p_tries, p_time_sec, p_day)
  on conflict (day, nickname) do nothing;
  if found then
    return 'inserted';
  end if;

  update kkomantle_scores
  set tries = p_tries,
      time_sec = p_time_sec,
      created_at = now()
  where day = p_day
    and nickname = p_nickname
    and (p_tries < tries or (p_tries = tries and p_time_sec < time_sec));
  if found then
    return 'updated';
  end if;
  return 'kept';
end;
$$;

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 쓰도록 직접 열어 줘요 (읽기 + 등록 함수만)
grant select on public.kkomantle_scores to anon, authenticated;
revoke insert, update, delete on public.kkomantle_scores from anon, authenticated;
revoke execute on function public.submit_kkomantle_score(text, int, numeric, date) from public;
grant execute on function public.submit_kkomantle_score(text, int, numeric, date) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
