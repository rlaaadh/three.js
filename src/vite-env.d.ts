/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 떨어지는 낱말연습 랭킹: Supabase 프로젝트 URL */
  readonly VITE_SUPABASE_URL?: string
  /** 떨어지는 낱말연습 랭킹: Supabase publishable(공개) 키 */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}
