-- 떨어지는 낱말연습 랭킹 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (한 번만)
-- 누구나 "읽기"와 submit_rain_score 함수로 "등록"만 할 수 있어요. 같은 닉네임은 더 좋은 기록일 때만 바뀌어요.

create table if not exists public.rain_scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  reached_round smallint not null check (reached_round between 1 and 10),
  cleared boolean not null default false,
  total_score integer not null check (total_score between -50 and 400),
  avg_cpm integer not null check (avg_cpm between 0 and 2000),
  max_cpm integer not null check (max_cpm between 0 and 3000),
  min_cpm integer not null check (min_cpm between 0 and 3000),
  created_at timestamptz not null default now()
);

-- 순위 정렬용
create index if not exists rain_scores_rank_idx
  on public.rain_scores (reached_round desc, total_score desc, avg_cpm desc, created_at);

-- 행 단위 권한(RLS): 켜 두면 아래 정책에 맞는 것만 허용돼요
alter table public.rain_scores enable row level security;

drop policy if exists "누구나 랭킹 보기" on public.rain_scores;
create policy "누구나 랭킹 보기"
  on public.rain_scores for select
  to anon, authenticated
  using (true);

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 이 테이블을 쓰도록 직접 열어 줘요 (읽기만, 등록은 아래 함수로)
grant select on public.rain_scores to anon, authenticated;

-- ---------- 같은 닉네임은 한 줄만: 더 좋은 기록일 때만 바꿔요 ----------
-- 이 파일은 여러 번 실행해도 괜찮아요. 예전에 한 번 실행했어도 다시 Run 하면 아래가 더해져요.

-- 1) 이미 같은 닉네임으로 여러 줄 있으면 가장 좋은 기록 하나만 남겨요
delete from public.rain_scores
where id in (
  select id from (
    select id, row_number() over (
      partition by nickname
      order by reached_round desc, total_score desc, avg_cpm desc, created_at
    ) as rn
    from public.rain_scores
  ) t
  where t.rn > 1
);

-- 2) 닉네임은 이제 겹칠 수 없어요
create unique index if not exists rain_scores_nickname_key on public.rain_scores (nickname);

-- 3) 등록은 이 함수로만: 처음이면 추가, 더 좋으면 갱신, 아니면 그대로 ('inserted' · 'updated' · 'kept')
--    순위와 같은 기준이에요: 도달 라운드 → 총 점수 → 평균 타수
create or replace function public.submit_rain_score(
  p_nickname text,
  p_reached_round int,
  p_cleared boolean,
  p_total_score int,
  p_avg_cpm int,
  p_max_cpm int,
  p_min_cpm int
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  p_nickname := btrim(p_nickname);
  insert into rain_scores (nickname, reached_round, cleared, total_score, avg_cpm, max_cpm, min_cpm)
  values (p_nickname, p_reached_round, p_cleared, p_total_score, p_avg_cpm, p_max_cpm, p_min_cpm)
  on conflict (nickname) do nothing;
  if found then
    return 'inserted';
  end if;

  update rain_scores
  set reached_round = p_reached_round,
      cleared = p_cleared,
      total_score = p_total_score,
      avg_cpm = p_avg_cpm,
      max_cpm = p_max_cpm,
      min_cpm = p_min_cpm,
      created_at = now()
  where nickname = p_nickname
    and (p_reached_round, p_total_score, p_avg_cpm) > (reached_round, total_score, avg_cpm);
  if found then
    return 'updated';
  end if;
  return 'kept';
end;
$$;

-- 4) 브라우저에서는 읽기 + 위 함수만. 표에 바로 넣는 건 막아요 (중복 · 기록 덮어쓰기 방지)
drop policy if exists "누구나 기록 추가" on public.rain_scores;
revoke insert, update, delete on public.rain_scores from anon, authenticated;
revoke execute on function public.submit_rain_score(text, int, boolean, int, int, int, int) from public;
grant execute on function public.submit_rain_score(text, int, boolean, int, int, int, int) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
