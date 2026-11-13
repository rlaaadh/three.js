/** 손가락으로 터치하는 기기(휴대폰 · 태블릿)인지. CSS의 터치 기기 기준(hover: none, pointer: coarse)과 같아요 */
export const isTouchDevice = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches
