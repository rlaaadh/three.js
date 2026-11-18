import './ranking.css'

/**
 * 떨어지는 낱말연습 랭킹 (Supabase).
 * supabase-js 없이 REST API(PostgREST)를 fetch로 바로 불러요.
 * 테이블 · 권한은 supabase/rain_scores.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 *
 * .env의 VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY를 써요.
 * publishable 키는 브라우저에 공개돼도 되는 키예요 (권한은 RLS로 막아요). secret 키는 절대 넣지 마세요.
 */

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const TABLE = 'rain_scores'

export interface RainScore {
  nickname: string
  reached_round: number
  cleared: boolean
  total_score: number
  avg_cpm: number
  max_cpm: number
  min_cpm: number
  created_at?: string
}

/** 닉네임은 1~8글자 (랭킹 줄이 깨지지 않게) */
export const NICKNAME_MAX = 8

/** 랭킹은 몇 등까지 보여 줄지 (많으면 팝업 안에서 스크롤) */
export const RANK_LIMIT = 50

export const rankingEnabled = () => Boolean(URL_BASE && KEY)

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY!, 'Content-Type': 'application/json', ...extra }
}

/** 순위: 도달 라운드 → 총 점수 → 평균 타수 → 먼저 등록한 사람 */
export async function fetchTopScores(limit = RANK_LIMIT): Promise<RainScore[]> {
  if (!rankingEnabled()) return []
  const params = new URLSearchParams({
    select: 'nickname,reached_round,cleared,total_score,avg_cpm,max_cpm,min_cpm,created_at',
    order: 'reached_round.desc,total_score.desc,avg_cpm.desc,created_at.asc',
    limit: String(limit),
  })
  const res = await fetch(`${URL_BASE}/rest/v1/${TABLE}?${params}`, { headers: headers() })
  if (!res.ok) throw new Error(`랭킹을 불러오지 못했어요 (${res.status})`)
  return res.json()
}

export async function submitScore(score: RainScore) {
  if (!rankingEnabled()) throw new Error('랭킹 서버가 설정되지 않았어요')
  const res = await fetch(`${URL_BASE}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(score),
  })
  if (!res.ok) throw new Error(`랭킹에 올리지 못했어요 (${res.status})`)
}

/** 지난번에 쓴 닉네임 기억하기 (이 브라우저에만) */
const NICK_KEY = 'tiny-room-rain-nickname'
export function savedNickname() {
  try {
    return localStorage.getItem(NICK_KEY) ?? ''
  } catch {
    return ''
  }
}
export function rememberNickname(name: string) {
  try {
    localStorage.setItem(NICK_KEY, name)
  } catch {
    // 저장소를 못 쓰면 넘어가요
  }
}
