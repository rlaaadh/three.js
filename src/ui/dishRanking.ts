import { RANK_LIMIT, fetchRanking, submitRanking } from './typing/ranking'

/**
 * 설거지 게임 랭킹 (Supabase). 낱말연습 랭킹과 같은 서버 · 같은 방식이에요.
 * 테이블 · 권한은 supabase/dish_scores.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 */

const TABLE = 'dish_scores'

export interface DishScore {
  nickname: string
  /** 닦은 접시 수 */
  dishes: number
  /** 미션 성공 (제한시간 안에 다 닦음) */
  cleared: boolean
  /** 설거지 완료율 0 ~ 100 */
  percent: number
  /** 걸린 시간(초, 소수 첫째 자리). 실패하면 제한시간 그대로 */
  time_sec: number
  created_at?: string
}

/** 순위: 완료율 → 빨리 끝낸 시간 → 먼저 등록한 사람 */
export function fetchDishTop(limit = RANK_LIMIT) {
  return fetchRanking<DishScore>(TABLE, 'nickname,dishes,cleared,percent,time_sec,created_at', 'percent.desc,time_sec.asc,created_at.asc', limit)
}

/** 같은 닉네임이 이미 있으면 더 좋은 기록일 때만 바뀌어요 */
export function submitDishScore(score: Omit<DishScore, 'created_at'>) {
  return submitRanking('submit_dish_score', { ...score })
}
