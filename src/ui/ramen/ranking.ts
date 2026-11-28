import { RANK_LIMIT, fetchRanking, submitRanking } from '../typing/ranking'

/**
 * 꼬들라면 빨리 끓이기 랭킹 (Supabase). 다른 게임 랭킹과 같은 서버 · 같은 방식이에요.
 * 10,000원을 다 모은 판만 올라가고, 걸린 시간이 짧은 순이에요.
 * 테이블 · 권한은 supabase/ramen_scores.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 */

const TABLE = 'ramen_scores'

/** 1등 한마디(champion.ts)에서 쓰는 랭킹 이름 */
export const RAMEN_BOARD = 'ramen'

export interface RamenScore {
  nickname: string
  /** 판 라면 그릇 수 */
  bowls: number
  /** 모은 돈(원) */
  money: number
  /** 10,000원을 모으기까지 걸린 시간(초, 소수 첫째 자리) */
  time_sec: number
  created_at?: string
}

/** 순위: 걸린 시간 짧은 순 → 그릇 수 적은 순 → 먼저 등록한 사람 */
export function fetchRamenTop(limit = RANK_LIMIT) {
  return fetchRanking<RamenScore>(TABLE, 'nickname,bowls,money,time_sec,created_at', 'time_sec.asc,bowls.asc,created_at.asc', limit)
}

/** 같은 닉네임이 이미 있으면 더 좋은 기록일 때만 바뀌어요 */
export function submitRamenScore(score: Omit<RamenScore, 'created_at'>) {
  return submitRanking('submit_ramen_score', { ...score })
}

/** 순위 비교 (fetchRamenTop과 같은 기준, 등록 시각은 빼고) */
export function ramenBetter(a: Pick<RamenScore, 'time_sec' | 'bowls'>, b: Pick<RamenScore, 'time_sec' | 'bowls'>) {
  return a.time_sec < b.time_sec || (a.time_sec === b.time_sec && a.bowls < b.bowls)
}
