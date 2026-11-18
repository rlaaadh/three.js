-- 떨어지는 낱말연습 랭킹 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (한 번만)
-- 누구나 "읽기 · 새 기록 추가"만 할 수 있고, 고치기 · 지우기는 못 해요.

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

drop policy if exists "누구나 기록 추가" on public.rain_scores;
create policy "누구나 기록 추가"
  on public.rain_scores for insert
  to anon, authenticated
  with check (true);

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 이 테이블을 쓰도록 직접 열어 줘요
grant select, insert on public.rain_scores to anon, authenticated;
