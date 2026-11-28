-- 꼬들라면 빨리 끓이기 랭킹 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (여러 번 실행해도 괜찮아요)
-- 누구나 "읽기"와 submit_ramen_score 함수로 "등록"만 할 수 있어요. 같은 닉네임은 더 좋은 기록일 때만 바뀌어요.
-- 10,000원을 다 모은 판만 올라가요 (걸린 시간이 짧은 순).

create table if not exists public.ramen_scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  bowls smallint not null check (bowls between 1 and 200),
  money int not null check (money between 10000 and 1000000),
  time_sec numeric(5, 1) not null check (time_sec between 1 and 300), -- 제한 시간 2분 (예전 5분 기록도 들어가게 300까지)
  created_at timestamptz not null default now()
);

-- 순위 정렬용
create index if not exists ramen_scores_rank_idx
  on public.ramen_scores (time_sec asc, bowls asc, created_at);

-- 같은 닉네임은 한 줄만
create unique index if not exists ramen_scores_nickname_key on public.ramen_scores (nickname);

-- 행 단위 권한(RLS): 켜 두면 아래 정책에 맞는 것만 허용돼요
alter table public.ramen_scores enable row level security;

drop policy if exists "누구나 라면 랭킹 보기" on public.ramen_scores;
create policy "누구나 라면 랭킹 보기"
  on public.ramen_scores for select
  to anon, authenticated
  using (true);

-- 등록: 처음이면 추가, 더 좋으면 갱신, 아니면 그대로 ('inserted' · 'updated' · 'kept')
-- 순위와 같은 기준이에요: 걸린 시간 짧은 순 → 그릇 수 적은 순
create or replace function public.submit_ramen_score(
  p_nickname text,
  p_bowls int,
  p_money int,
  p_time_sec numeric
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  p_nickname := btrim(p_nickname);
  insert into ramen_scores (nickname, bowls, money, time_sec)
  values (p_nickname, p_bowls, p_money, p_time_sec)
  on conflict (nickname) do nothing;
  if found then
    return 'inserted';
  end if;

  update ramen_scores
  set bowls = p_bowls,
      money = p_money,
      time_sec = p_time_sec,
      created_at = now()
  where nickname = p_nickname
    and (p_time_sec < time_sec or (p_time_sec = time_sec and p_bowls < bowls));
  if found then
    return 'updated';
  end if;
  return 'kept';
end;
$$;

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 쓰도록 직접 열어 줘요 (읽기 + 등록 함수만)
grant select on public.ramen_scores to anon, authenticated;
revoke insert, update, delete on public.ramen_scores from anon, authenticated;
revoke execute on function public.submit_ramen_score(text, int, int, numeric) from public;
grant execute on function public.submit_ramen_score(text, int, int, numeric) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
