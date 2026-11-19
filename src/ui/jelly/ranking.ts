import { RANK_LIMIT, fetchRanking, submitRanking } from '../typing/ranking'

/**
 * 말랑젤리 쌓기 랭킹 (Supabase). 다른 게임 랭킹과 같은 서버 · 같은 방식이에요.
 * 테이블 · 권한은 supabase/jelly_scores.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 */

const TABLE = 'jelly_scores'

export interface JellyScore {
  nickname: string
  /** 점수 */
  score: number
  /** 터뜨린 줄 수 */
  lines: number
  /** 도달한 레벨 */
  level: number
  created_at?: string
}

/** 순위: 점수 → 줄 수 → 먼저 등록한 사람 */
export function fetchJellyTop(limit = RANK_LIMIT) {
  return fetchRanking<JellyScore>(TABLE, 'nickname,score,lines,level,created_at', 'score.desc,lines.desc,created_at.asc', limit)
}

/** 같은 닉네임이 이미 있으면 더 좋은 기록일 때만 바뀌어요 */
export function submitJellyScore(score: Omit<JellyScore, 'created_at'>) {
  return submitRanking('submit_jelly_score', { ...score })
}
