import { RANK_LIMIT, fetchRanking, submitRanking } from './typing/ranking'

/**
 * 완벽한 잠을 사수하라! 랭킹 (Supabase). 낱말연습 · 설거지 랭킹과 같은 서버 · 같은 방식이에요.
 * 일반 게임과 스피드 게임(속도 2배)은 랭킹이 따로예요.
 * 테이블 · 권한은 supabase/sleep_scores.sql(일반) · supabase/sleep_speed_scores.sql(스피드)을
 * Supabase SQL Editor에서 한 번씩 실행하면 만들어져요.
 */

const TABLES = { normal: 'sleep_scores', speed: 'sleep_speed_scores' } as const
const SUBMIT_FNS = { normal: 'submit_sleep_score', speed: 'submit_sleep_speed_score' } as const

/** normal: 일반 게임, speed: 스피드 게임(속도 2배) */
export type SleepMode = keyof typeof TABLES

/** 1등 한마디(champion.ts)에서 쓰는 랭킹 이름 */
export const sleepBoard = (mode: SleepMode) => (mode === 'speed' ? 'sleep_speed' : 'sleep')

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
export function fetchSleepTop(mode: SleepMode, limit = RANK_LIMIT) {
  return fetchRanking<SleepScore>(TABLES[mode], 'nickname,cleared,slept_min,sheep,score,created_at', 'slept_min.desc,score.desc,created_at.asc', limit)
}

/** 같은 닉네임이 이미 있으면 더 좋은 기록일 때만 바뀌어요 */
export function submitSleepScore(mode: SleepMode, score: Omit<SleepScore, 'created_at'>) {
  return submitRanking(SUBMIT_FNS[mode], { ...score })
}
