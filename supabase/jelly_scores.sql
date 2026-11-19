-- 말랑젤리 쌓기 랭킹 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 붙여 넣고 Run 하면 돼요. (여러 번 실행해도 괜찮아요)
-- 누구나 "읽기"와 submit_jelly_score 함수로 "등록"만 할 수 있어요. 같은 닉네임은 더 좋은 기록일 때만 바뀌어요.

create table if not exists public.jelly_scores (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 12),
  score int not null check (score between 0 and 10000000),
  lines smallint not null check (lines between 0 and 9999),
  level smallint not null check (level between 1 and 99),
  created_at timestamptz not null default now()
);

-- 순위 정렬용
create index if not exists jelly_scores_rank_idx
  on public.jelly_scores (score desc, lines desc, created_at);

-- 같은 닉네임은 한 줄만
create unique index if not exists jelly_scores_nickname_key on public.jelly_scores (nickname);

-- 행 단위 권한(RLS): 켜 두면 아래 정책에 맞는 것만 허용돼요
alter table public.jelly_scores enable row level security;

drop policy if exists "누구나 랭킹 보기" on public.jelly_scores;
create policy "누구나 랭킹 보기"
  on public.jelly_scores for select
  to anon, authenticated
  using (true);

-- 등록: 처음이면 추가, 더 좋으면 갱신, 아니면 그대로 ('inserted' · 'updated' · 'kept')
-- 순위와 같은 기준이에요: 점수 → 줄 수
create or replace function public.submit_jelly_score(
  p_nickname text,
  p_score int,
  p_lines int,
  p_level int
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  p_nickname := btrim(p_nickname);
  insert into jelly_scores (nickname, score, lines, level)
  values (p_nickname, p_score, p_lines, p_level)
  on conflict (nickname) do nothing;
  if found then
    return 'inserted';
  end if;

  update jelly_scores
  set score = p_score,
      lines = p_lines,
      level = p_level,
      created_at = now()
  where nickname = p_nickname
    and (p_score > score or (p_score = score and p_lines > lines));
  if found then
    return 'updated';
  end if;
  return 'kept';
end;
$$;

-- "Automatically expose new tables"를 꺼 뒀다면 API에서 쓰도록 직접 열어 줘요 (읽기 + 등록 함수만)
grant select on public.jelly_scores to anon, authenticated;
revoke insert, update, delete on public.jelly_scores from anon, authenticated;
revoke execute on function public.submit_jelly_score(text, int, int, int) from public;
grant execute on function public.submit_jelly_score(text, int, int, int) to anon, authenticated;

-- API가 새 함수를 바로 알아보게
notify pgrst, 'reload schema';
