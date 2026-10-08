/**
 * 손글씨 폰트 설정.
 * 다른 웹폰트를 쓰려면 index.html의 폰트 <link>(또는 @font-face)와 style.css의 --font-hand,
 * 그리고 아래 HAND_FONT 이름만 바꾸면 3D 바닥 글씨 · 말풍선 · UI가 모두 바뀌어요.
 *
 * 지금 폰트(나눔손글씨 힘내라는 말보단)는 굵기가 하나뿐이라 굵게(700)를 쓰지 않아요.
 * 없는 굵기로 그리면 브라우저가 억지로 두껍게 만들어서 글씨가 뭉개져요.
 */
export const HAND_FONT = 'NanumHimNaeRaNeunMarBoDan'

export const handFont = (px: number) => `${px}px "${HAND_FONT}", sans-serif`

/**
 * 캔버스에 그리기 전에 폰트를 확실히 받아와요.
 * 캔버스는 폰트가 아직 없으면 기본 글꼴로 그려버려서, 실제로 그릴 글자를 넘겨 미리 받아둬요.
 * (글자 범위별로 쪼개진 웹폰트도 필요한 조각까지 받아와요)
 */
export function loadHandFont(texts: string[]) {
  const sample = Array.from(new Set(texts.join(''))).join('')
  return document.fonts.load(handFont(64), sample)
}
