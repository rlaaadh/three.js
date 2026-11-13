/**
 * 한글 글자를 두벌식 키 입력 순서로 풀어요.
 * 예) '왜' → ㅇ ㅗ ㅐ, '닭' → ㄷ ㅏ ㄹ ㄱ
 * 다음에 누를 키 안내와 타수(CPM) 계산에 써요.
 */

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

/** 두 번 눌러 만드는 모음 · 받침 */
const SPLIT: Record<string, string> = {
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
}

/** Shift를 같이 눌러야 하는 자모 → 기본 키 */
export const SHIFTED: Record<string, string> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ', ㅒ: 'ㅐ', ㅖ: 'ㅔ' }

/** 키보드 가이드에 그리는 두벌식 자판 */
export const KEY_ROWS = [
  ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
  ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
  ['⇧', 'ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ'],
]

const split = (jamo: string) => (SPLIT[jamo] ?? jamo).split('')

/** 글자 하나를 누르는 키 순서로 */
export function keysOf(char: string): string[] {
  const code = char.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return SPLIT[char] ? split(char) : [char]
  const cho = CHO[Math.floor(code / 588)]
  const jung = JUNG[Math.floor((code % 588) / 28)]
  const jong = JONG[code % 28]
  return [cho, ...split(jung), ...(jong ? split(jong) : [])]
}

export const keysOfText = (text: string) => Array.from(text).flatMap(keysOf)

/** 타수 계산용: 글자를 치는 데 든 키 수 */
export const strokesOf = (text: string) => keysOfText(text).length

/**
 * 지금까지 친 글자를 보고 다음에 누를 키를 알려줘요.
 * 조합 중인 글자(예: '바다'를 치다 생긴 '받')도 키 순서로 비교해서 자연스럽게 이어져요.
 */
export function nextKey(target: string, typed: string): string | null {
  const want = keysOfText(target)
  const have = keysOfText(typed)
  let i = 0
  while (i < have.length && i < want.length && have[i] === want[i]) i++
  return want[i] ?? null
}

export type CharState = 'done' | 'wrong' | 'current' | 'todo'

/** 목표 문장의 글자마다 상태: 맞음 / 틀림 / 지금 칠 글자 / 아직 */
export function charStates(target: string, typed: string): CharState[] {
  const goal = Array.from(target)
  const got = Array.from(typed)
  let current = got.length
  const states: CharState[] = goal.map((char, i) => {
    if (i >= got.length) return 'todo'
    if (got[i] === char) return 'done'
    // 마지막 글자가 아직 조합 중이면(키 순서가 앞부분과 같으면) 틀린 게 아니라 치는 중
    if (i === got.length - 1) {
      const want = keysOfText(goal.slice(i).join(''))
      const have = keysOf(got[i])
      if (have.every((k, j) => want[j] === k)) {
        current = i
        return 'current'
      }
    }
    return 'wrong'
  })
  if (current < goal.length && states[current] === 'todo') states[current] = 'current'
  return states
}
