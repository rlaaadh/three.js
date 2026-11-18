import { RANK_LIMIT, fetchRanking, submitRanking } from './typing/ranking'

/**
 * 완벽한 잠을 사수하라! 랭킹 (Supabase). 낱말연습 · 설거지 랭킹과 같은 서버 · 같은 방식이에요.
 * 테이블 · 권한은 supabase/sleep_scores.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 */

const TABLE = 'sleep_scores'

export interface SleepScore {
  nickname: string
  /** 아침 7시까지 안 깨고 잤어요 */
  cleared: boolean
  /** 잔 시간(분): 밤 11시부터 0 ~ 480 */
  slept_min: number
  /** 모은 양 */
  sheep: number
  /** 점수 (양 +1 · 별 +5 · 끝까지 자면 보너스) */
  score: number
  created_at?: string
}

/** 순위: 오래 잔 시간 → 점수 → 먼저 등록한 사람 */
export function fetchSleepTop(limit = RANK_LIMIT) {
  return fetchRanking<SleepScore>(TABLE, 'nickname,cleared,slept_min,sheep,score,created_at', 'slept_min.desc,score.desc,created_at.asc', limit)
}

/** 같은 닉네임이 이미 있으면 더 좋은 기록일 때만 바뀌어요 */
export function submitSleepScore(score: Omit<SleepScore, 'created_at'>) {
  return submitRanking('submit_sleep_score', { ...score })
}
