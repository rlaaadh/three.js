import './ranking.css'

/**
 * 게임 랭킹 (Supabase) — 떨어지는 낱말연습 · 설거지 게임이 같이 써요.
 * supabase-js 없이 REST API(PostgREST)를 fetch로 바로 불러요.
 * 테이블 · 권한은 supabase/*.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
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
export const RANK_LIMIT = 10

export const rankingEnabled = () => Boolean(URL_BASE && KEY)

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY!, 'Content-Type': 'application/json', ...extra }
}

/** 랭킹 테이블에서 위에서부터 limit줄 불러요 (게임마다 테이블 · 칸 · 정렬만 달라요) */
export async function fetchRanking<T>(table: string, select: string, order: string, limit = RANK_LIMIT, filter: Record<string, string> = {}): Promise<T[]> {
  if (!rankingEnabled()) return []
  // filter: PostgREST 조건 (예: { day: 'eq.2026-11-19' })
  const params = new URLSearchParams({ select, order, limit: String(limit), ...filter })
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${params}`, { headers: headers() })
  if (!res.ok) throw new Error(`랭킹을 불러오지 못했어요 (${res.status})`)
  return res.json()
}

/**
 * 등록 결과. 같은 닉네임은 한 줄만 남아요.
 * inserted: 처음 등록 · updated: 더 좋은 기록으로 바뀜 · kept: 예전 기록이 더 좋아서 그대로
 */
export type SubmitResult = 'inserted' | 'updated' | 'kept'

/** 등록은 표에 바로 넣지 않고 Supabase 함수(supabase/*.sql의 submit_..._score)로 해요 */
export async function submitRanking(fn: string, row: Record<string, unknown>): Promise<SubmitResult> {
  if (!rankingEnabled()) throw new Error('랭킹 서버가 설정되지 않았어요')
  // 함수 인자 이름은 p_ 를 붙여요 (칸 이름과 헷갈리지 않게)
  const params = Object.fromEntries(Object.entries(row).map(([key, value]) => [`p_${key}`, value]))
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`랭킹에 올리지 못했어요 (${res.status})`)
  return res.json()
}

/** 등록 결과 안내 문구 */
export function submitMessage(result: SubmitResult) {
  if (result === 'updated') return '더 좋은 기록으로 바꿨어요! 🎉'
  if (result === 'kept') return '예전 기록이 더 좋아서 그대로 뒀어요'
  return '랭킹에 올렸어요! 🎉'
}

/** 순위: 도달 라운드 → 총 점수 → 평균 타수 → 먼저 등록한 사람 */
export function fetchTopScores(limit = RANK_LIMIT) {
  return fetchRanking<RainScore>(
    TABLE,
    'nickname,reached_round,cleared,total_score,avg_cpm,max_cpm,min_cpm,created_at',
    'reached_round.desc,total_score.desc,avg_cpm.desc,created_at.asc',
    limit,
  )
}

export function submitScore(score: Omit<RainScore, 'created_at'>) {
  return submitRanking('submit_rain_score', { ...score })
}

/** 닉네임 칸: 한글 조합 중에는 maxlength가 넘칠 수 있어서, 조합이 끝나면 한 번 더 잘라요 */
export function limitNickname(input: HTMLInputElement) {
  const clamp = () => {
    if (input.value.length > NICKNAME_MAX) input.value = input.value.slice(0, NICKNAME_MAX)
  }
  input.addEventListener('compositionend', clamp)
  input.addEventListener('input', (e) => {
    if (!(e as InputEvent).isComposing) clamp()
  })
}

/** 지난번에 쓴 닉네임 기억하기 (이 브라우저에만, 게임끼리 같이 써요) */
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

/** 떨어지는 낱말연습 랭킹 목록 위 머리글 (각 숫자가 무엇인지) */
export const RAIN_RANK_HEAD = `
  <div class="trank__row trank__head" aria-hidden="true">
    <span class="trank__no">순위</span>
    <span class="trank__name">닉네임</span>
    <span class="trank__round">도달 라운드</span>
    <span class="trank__score">총점</span>
    <span class="trank__cpm">평균 타수</span>
  </div>`

/** 랭킹 목록 아래 작은 설명 */
export const RAIN_RANK_HINT = '<p class="trank__hint">평균 타수는 게임 전체(모든 라운드) 평균이에요 · 👑 10라운드까지 모두 통과</p>'
