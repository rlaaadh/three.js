-- 설거지 게임 랭킹 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (여러 번 실행해도 괜찮아요)
-- 누구나 "읽기"와 submit_dish_score 함수로 "등록"만 할 수 있어요. 같은 닉네임은 더 좋은 기록일 때만 바뀌어요.

create table if not exists public.dish_scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  dishes smallint not null check (dishes between 0 and 50),
  cleared boolean not null default false,
  percent smallint not null check (percent between 0 and 100),
  time_sec numeric(4, 1) not null check (time_sec between 0 and 120),
  created_at timestamptz not null default now()
);

-- 순위 정렬용
create index if not exists dish_scores_rank_idx
  on public.dish_scores (percent desc, time_sec asc, created_at);

-- 같은 닉네임은 한 줄만 (이미 여러 줄 있으면 가장 좋은 기록 하나만 남기고 정리)
delete from public.dish_scores
where id in (
  select id from (
    select id, row_number() over (
      partition by nickname
      order by percent desc, time_sec asc, created_at
    ) as rn
    from public.dish_scores
  ) t
  where t.rn > 1
);
create unique index if not exists dish_scores_nickname_key on public.dish_scores (nickname);

-- 행 단위 권한(RLS): 켜 두면 아래 정책에 맞는 것만 허용돼요
alter table public.dish_scores enable row level security;

drop policy if exists "누구나 랭킹 보기" on public.dish_scores;
create policy "누구나 랭킹 보기"
  on public.dish_scores for select
  to anon, authenticated
  using (true);

-- 표에 바로 넣는 건 막고, 등록은 아래 함수로만 해요
drop policy if exists "누구나 기록 추가" on public.dish_scores;

-- 등록: 처음이면 추가, 더 좋으면 갱신, 아니면 그대로 ('inserted' · 'updated' · 'kept')
-- 순위와 같은 기준이에요: 완료율 높은 순 → 걸린 시간 짧은 순
create or replace function public.submit_dish_score(
  p_nickname text,
  p_dishes int,
  p_cleared boolean,
  p_percent int,
  p_time_sec numeric
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  p_nickname := btrim(p_nickname);
  insert into dish_scores (nickname, dishes, cleared, percent, time_sec)
  values (p_nickname, p_dishes, p_cleared, p_percent, p_time_sec)
  on conflict (nickname) do nothing;
  if found then
    return 'inserted';
  end if;

  update dish_scores
  set dishes = p_dishes,
      cleared = p_cleared,
      percent = p_percent,
      time_sec = p_time_sec,
      created_at = now()
  where nickname = p_nickname
    and (p_percent > percent or (p_percent = percent and p_time_sec < time_sec));
  if found then
    return 'updated';
  end if;
  return 'kept';
end;
$$;

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 쓰도록 직접 열어 줘요 (읽기 + 등록 함수만)
grant select on public.dish_scores to anon, authenticated;
revoke insert, update, delete on public.dish_scores from anon, authenticated;
revoke execute on function public.submit_dish_score(text, int, boolean, int, numeric) from public;
grant execute on function public.submit_dish_score(text, int, boolean, int, numeric) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
