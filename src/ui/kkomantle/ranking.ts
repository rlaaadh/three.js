import { RANK_LIMIT, fetchRanking, submitRanking } from '../typing/ranking'

/**
 * 꼬맨틀 랭킹 (Supabase). 다른 게임 랭킹과 같은 서버 · 같은 방식이에요.
 * 하루 한 단어라서 랭킹도 그날(한국 시간) 기록만 보여요. 밤 12시가 지나면 새 랭킹이에요.
 * 비밀 단어는 랭킹에 남기지 않아요 (아직 못 푼 사람이 랭킹을 보고 알아 버리지 않게).
 * 테이블 · 권한은 supabase/kkomantle_scores.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 */

const TABLE = 'kkomantle_scores'

export interface KkomantleScore {
  nickname: string
  /** 맞히기까지 추측한 횟수 (적을수록 좋아요) */
  tries: number
  /** 걸린 시간(초, 소수 첫째 자리) */
  time_sec: number
  /** 어느 날 단어인지 'YYYY-MM-DD' (한국 시간) */
  day: string
  created_at?: string
}

/** 그날 순위: 적은 횟수 → 빠른 시간 → 먼저 등록한 사람 */
export function fetchKkomantleTop(day: string, limit = RANK_LIMIT) {
  return fetchRanking<KkomantleScore>(TABLE, 'nickname,tries,time_sec,day,created_at', 'tries.asc,time_sec.asc,created_at.asc', limit, { day: `eq.${day}` })
}

/** 같은 날 같은 닉네임이 이미 있으면 더 좋은 기록일 때만 바뀌어요 */
export function submitKkomantleScore(score: Omit<KkomantleScore, 'created_at'>) {
  return submitRanking('submit_kkomantle_score', { ...score })
}
