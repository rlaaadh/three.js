import { IDIOMS } from './content'

/**
 * 떨어지는 낱말연습 낱말 창고 (Supabase rain_words 테이블).
 * 테이블 · 낱말은 supabase/rain_words.sql을 SQL Editor에서 한 번 실행하면 만들어져요.
 *
 * 게임을 열 때 한 번만 불러 두고, 못 불러오면(서버 설정 없음 · 네트워크 오류 · 빈 테이블)
 * content.ts의 IDIOMS를 그대로 써요. 그래서 오프라인에서도 게임은 똑같이 돌아가요.
 */

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const TABLE = 'rain_words'
/** 너무 오래 기다리지 않게 (밀리초) */
const TIMEOUT_MS = 4000

/** 사자성어는 한글 네 글자만 받아요 (잘못 들어간 줄이 게임을 깨지 않게) */
const IDIOM_PATTERN = /^[가-힣]{4}$/

let idioms: string[] = IDIOMS
let loading: Promise<string[]> | null = null

/** 지금 쓸 수 있는 사자성어 (불러오기 전이나 실패하면 기본 낱말) */
export const idiomPool = () => idioms

/** Supabase에서 사자성어를 불러와요. 여러 번 불러도 요청은 한 번만 가요. */
export function loadIdioms(): Promise<string[]> {
  if (!loading) loading = fetchIdioms()
  return loading
}

async function fetchIdioms() {
  if (!URL_BASE || !KEY) return idioms
  try {
    const params = new URLSearchParams({ select: 'word', category: 'eq.idiom', limit: '2000' })
    const res = await fetch(`${URL_BASE}/rest/v1/${TABLE}?${params}`, {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`낱말을 불러오지 못했어요 (${res.status})`)
    const rows: { word: string }[] = await res.json()
    const words = [...new Set(rows.map((row) => row.word.trim()).filter((word) => IDIOM_PATTERN.test(word)))]
    // 한 라운드(최대 16개)를 겹치지 않게 채울 만큼은 있어야 바꿔요
    if (words.length >= 20) idioms = words
  } catch (error) {
    console.warn('[낱말 창고] 기본 사자성어를 써요:', error)
  }
  return idioms
}
