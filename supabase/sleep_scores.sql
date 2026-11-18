-- 완벽한 잠을 사수하라! 랭킹 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (여러 번 실행해도 괜찮아요)
-- 누구나 "읽기"와 submit_sleep_score 함수로 "등록"만 할 수 있어요. 같은 닉네임은 더 좋은 기록일 때만 바뀌어요.

create table if not exists public.sleep_scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  cleared boolean not null default false,
  slept_min smallint not null check (slept_min between 0 and 480),
  sheep smallint not null check (sheep between 0 and 5000),
  score int not null check (score between 0 and 100000),
  created_at timestamptz not null default now()
);

-- 순위 정렬용
create index if not exists sleep_scores_rank_idx
  on public.sleep_scores (slept_min desc, score desc, created_at);

-- 같은 닉네임은 한 줄만
create unique index if not exists sleep_scores_nickname_key on public.sleep_scores (nickname);

-- 행 단위 권한(RLS): 켜 두면 아래 정책에 맞는 것만 허용돼요
alter table public.sleep_scores enable row level security;

drop policy if exists "누구나 랭킹 보기" on public.sleep_scores;
create policy "누구나 랭킹 보기"
  on public.sleep_scores for select
  to anon, authenticated
  using (true);

-- 등록: 처음이면 추가, 더 좋으면 갱신, 아니면 그대로 ('inserted' · 'updated' · 'kept')
-- 순위와 같은 기준이에요: 오래 잔 시간 → 점수
create or replace function public.submit_sleep_score(
  p_nickname text,
  p_cleared boolean,
  p_slept_min int,
  p_sheep int,
  p_score int
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  p_nickname := btrim(p_nickname);
  insert into sleep_scores (nickname, cleared, slept_min, sheep, score)
  values (p_nickname, p_cleared, p_slept_min, p_sheep, p_score)
  on conflict (nickname) do nothing;
  if found then
    return 'inserted';
  end if;

  update sleep_scores
  set cleared = p_cleared,
      slept_min = p_slept_min,
      sheep = p_sheep,
      score = p_score,
      created_at = now()
  where nickname = p_nickname
    and (p_slept_min > slept_min or (p_slept_min = slept_min and p_score > score));
  if found then
    return 'updated';
  end if;
  return 'kept';
end;
$$;

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 쓰도록 직접 열어 줘요 (읽기 + 등록 함수만)
grant select on public.sleep_scores to anon, authenticated;
revoke insert, update, delete on public.sleep_scores from anon, authenticated;
revoke execute on function public.submit_sleep_score(text, boolean, int, int, int) from public;
grant execute on function public.submit_sleep_score(text, boolean, int, int, int) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
