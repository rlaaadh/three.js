/**
 * 손글씨 폰트 설정.
 * 다른 웹폰트를 쓰려면 index.html의 폰트 <link>(또는 @font-face)와 style.css의 --font-hand,
 * 그리고 아래 HAND_FONT 이름만 바꾸면 3D 바닥 글씨 · 말풍선 · UI가 모두 바뀌어요.
 */
export const HAND_FONT = 'Gaegu'

export const handFont = (weight: 400 | 700, px: number) => `${weight} ${px}px "${HAND_FONT}", sans-serif`

/**
 * 캔버스에 그리기 전에 폰트를 확실히 받아와요.
 * 한글 웹폰트는 글자 범위별로 파일이 쪼개져 있어서, 실제로 그릴 글자를 넘겨야 그 조각까지 받아와요.
 * (안 그러면 영문 조각만 받아서 한글이 기본 글꼴로 그려져요)
 */
export function loadHandFont(texts: string[]) {
  const sample = Array.from(new Set(texts.join(''))).join('')
  return Promise.all(([400, 700] as const).map((weight) => document.fonts.load(handFont(weight, 64), sample)))
}
