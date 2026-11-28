/**
 * 꼬들라면.app 그림 조각 (전부 SVG 문자열).
 * 냄비 · 주전자 · 선반 재료 · 쟁반 · 결과 화면의 캐릭터 · 표정 있는 주전자/라면사리.
 * 그라데이션 · 무늬는 문서에 한 번만 붙이는 공용 defs(ensureRamenDefs)를 같이 써요.
 */

// ---------- 공용 defs ----------

let defsMounted = false

/** 그라데이션 · 클립 · 무늬를 문서에 한 번 붙여요 (여러 SVG가 url(#rm-...)로 같이 써요) */
export function ensureRamenDefs() {
  if (defsMounted) return
  defsMounted = true
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  // display:none이면 크롬에서 그라데이션이 안 보여서, 크기만 0으로 숨겨요
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  holder.innerHTML = `
    <svg width="0" height="0" focusable="false">
      <defs>
        ${potGradient('rm-pot-y', ['#efc560', '#fff1b6', '#f9dc86', '#e9bd55'])}
        ${potGradient('rm-pot-r', ['#e2645a', '#ffa497', '#f27d6e', '#d6574c'])}
        ${potGradient('rm-pot-k', ['#332c2b', '#655b58', '#443c3a', '#28221f'])}
        ${potGradient('rm-kettle', ['#ecc25e', '#fff0b4', '#f7d983', '#e6b951'])}
        <radialGradient id="rm-water" cx="0.42" cy="0.38" r="0.75">
          <stop offset="0" stop-color="#f4fbfe" />
          <stop offset="0.55" stop-color="#d6eef8" />
          <stop offset="1" stop-color="#b9def0" />
        </radialGradient>
        <radialGradient id="rm-broth" cx="0.45" cy="0.4" r="0.75">
          <stop offset="0" stop-color="#fbae84" />
          <stop offset="1" stop-color="#ea7a52" />
        </radialGradient>
        <radialGradient id="rm-broth-plain" cx="0.45" cy="0.4" r="0.75">
          <stop offset="0" stop-color="#fbf0d6" />
          <stop offset="1" stop-color="#ecd8ac" />
        </radialGradient>
        <radialGradient id="rm-broth-soggy" cx="0.45" cy="0.4" r="0.75">
          <stop offset="0" stop-color="#e2bf98" />
          <stop offset="1" stop-color="#c49a72" />
        </radialGradient>
        <radialGradient id="rm-broth-burnt" cx="0.45" cy="0.4" r="0.75">
          <stop offset="0" stop-color="#4f3a2c" />
          <stop offset="1" stop-color="#2c211b" />
        </radialGradient>
        <radialGradient id="rm-yolk" cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stop-color="#ffd860" />
          <stop offset="1" stop-color="#f39a1c" />
        </radialGradient>
        <linearGradient id="rm-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#fff1bd" />
          <stop offset="0.5" stop-color="#ffc062" />
          <stop offset="1" stop-color="#ff8a4c" />
        </linearGradient>
        <linearGradient id="rm-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f7a24a" />
          <stop offset="1" stop-color="#e5782a" />
        </linearGradient>
        <linearGradient id="rm-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f1d3a2" />
          <stop offset="1" stop-color="#e2b77d" />
        </linearGradient>
        <linearGradient id="rm-counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fdf0cf" />
          <stop offset="1" stop-color="#fbe3ad" />
        </linearGradient>
        <linearGradient id="rm-bar-time" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffd978" />
          <stop offset="1" stop-color="#f8c64c" />
        </linearGradient>
        <linearGradient id="rm-bar-money" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffd978" />
          <stop offset="1" stop-color="#f6a08a" />
        </linearGradient>
        <pattern id="rm-wall" width="90" height="40" patternUnits="userSpaceOnUse">
          <rect width="90" height="40" fill="#fffaf0" />
          <rect width="2" height="40" fill="#f6ead2" />
        </pattern>
        <pattern id="rm-stripe" width="20" height="16" patternUnits="userSpaceOnUse">
          <rect width="20" height="16" fill="#fff" />
          <rect width="20" height="7" fill="#33416f" />
        </pattern>
        <clipPath id="rm-inner"><ellipse cx="0" cy="2" rx="162" ry="52" /></clipPath>
        <clipPath id="rm-shelf-noodle"><rect x="-120" y="-62" width="240" height="124" rx="18" /></clipPath>
        <clipPath id="rm-block"><rect x="-86" y="-40" width="172" height="80" rx="16" /></clipPath>
      </defs>
    </svg>`
  document.body.appendChild(holder)
}

function potGradient(id: string, stops: [string, string, string, string]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${stops[0]}" />
    <stop offset="0.32" stop-color="${stops[1]}" />
    <stop offset="0.62" stop-color="${stops[2]}" />
    <stop offset="1" stop-color="${stops[3]}" />
  </linearGradient>`
}

// ---------- 면발 ----------

/** 늘 같은 모양이 나오게 씨앗으로 만드는 난수 */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

/** 꼬불꼬불 면발 여러 가닥 (타원 rx · ry 안쪽) */
function squiggles(seed: number, count: number, rx: number, ry: number, seg: number, amp: number) {
  const rand = seeded(seed)
  let d = ''
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rand())
    const a = rand() * Math.PI * 2
    let x = Math.cos(a) * r * rx * 0.86
    let y = Math.sin(a) * r * ry * 0.8
    const dir = rand() * Math.PI * 2
    const dx = Math.cos(dir) * seg
    const dy = Math.sin(dir) * seg * 0.55
    const px = -Math.sin(dir) * amp
    const py = Math.cos(dir) * amp * 0.55
    // 가운데를 기준으로 앞뒤로 늘여요
    x -= dx * 2.5
    y -= dy * 2.5
    d += `M${x.toFixed(1)} ${y.toFixed(1)}`
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? -1 : 1
      d += `q${(dx / 2 + px * side).toFixed(1)} ${(dy / 2 + py * side).toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}`
    }
  }
  return d
}

const LOOSE_NOODLES = squiggles(7, 26, 162, 52, 26, 11)
const BLOCK_NOODLES = squiggles(19, 30, 100, 60, 16, 8)

export type NoodleLook = 'fresh' | 'soggy' | 'burnt'

const NOODLE_COLORS: Record<NoodleLook, { line: string; fill: string; width: number }> = {
  fresh: { line: '#d29d48', fill: '#fbe0a0', width: 5 },
  soggy: { line: '#c09466', fill: '#f2dcb0', width: 7.5 },
  burnt: { line: '#24180f', fill: '#6b4a2e', width: 6 },
}

/** 풀린 면발 (냄비 안 전체) */
export function looseNoodles(look: NoodleLook) {
  const c = NOODLE_COLORS[look]
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${LOOSE_NOODLES}" stroke="${c.line}" stroke-width="${c.width + 4}" />
    <path d="${LOOSE_NOODLES}" stroke="${c.fill}" stroke-width="${c.width}" />
  </g>`
}

/** 아직 안 풀린 네모난 라면 사리 (가운데) */
export function noodleBlock(look: NoodleLook = 'fresh') {
  const c = NOODLE_COLORS[look]
  return `<g>
    <rect x="-86" y="-40" width="172" height="80" rx="16" fill="${look === 'burnt' ? '#4a3322' : '#e8b55a'}" />
    <g clip-path="url(#rm-block)" fill="none" stroke-linecap="round">
      <path d="${BLOCK_NOODLES}" stroke="${c.line}" stroke-width="7" />
      <path d="${BLOCK_NOODLES}" stroke="${c.fill}" stroke-width="3.6" />
    </g>
  </g>`
}

/** 송송 파 (냄비 위) */
export function onionTopping(look: NoodleLook = 'fresh') {
  const dark = look === 'burnt' ? '#1f2a17' : look === 'soggy' ? '#5f8a45' : '#4b9a3a'
  const light = look === 'burnt' ? '#34452a' : look === 'soggy' ? '#9cc27c' : '#93d66d'
  const lines = [
    'M-112 -22 Q-10 -40 104 -24',
    'M-104 -8 Q-4 -28 112 -12',
    'M-96 6 Q0 -12 98 2',
    'M-84 -36 Q-6 -50 84 -38',
    'M-70 18 Q8 4 80 14',
  ]
  return `<g fill="none" stroke-linecap="round">
    ${lines.map((d) => `<path d="${d}" stroke="${dark}" stroke-width="10" />`).join('')}
    ${lines.map((d) => `<path d="${d}" stroke="${light}" stroke-width="4" />`).join('')}
  </g>`
}

/** 계란 (흰자 + 노른자) */
export function eggTopping(look: NoodleLook = 'fresh') {
  const white = look === 'burnt' ? '#5a4a40' : '#ffffff'
  const yolk = look === 'burnt' ? '#6b4a1e' : 'url(#rm-yolk)'
  return `<g transform="translate(-6 10)">
    <path d="M-48 -4 C-54 -30 -14 -40 8 -34 C38 -40 58 -16 48 6 C56 28 20 36 -2 30 C-28 36 -52 22 -48 -4Z" fill="${white}" stroke="${look === 'burnt' ? '#3a2f28' : '#f1e6d8'}" stroke-width="3" />
    <circle cx="0" cy="-2" r="19" fill="${yolk}" />
    <ellipse cx="-6" cy="-8" rx="6" ry="4" fill="#fff" opacity="${look === 'burnt' ? 0.1 : 0.7}" />
  </g>`
}

// ---------- 냄비 ----------

export type PotColor = 'y' | 'r' | 'k'

const RIM: Record<PotColor, { rim: string; inside: string; hand: string; handIn: string; cheek: string }> = {
  y: { rim: '#fff2bd', inside: '#f3d27e', hand: '#f8dc8a', handIn: '#fff6d2', cheek: '#f7a9a0' },
  r: { rim: '#ffb3a6', inside: '#e4685b', hand: '#f37f70', handIn: '#ffc4b8', cheek: '#d8574d' },
  k: { rim: '#5d5351', inside: '#2b2422', hand: '#3f3836', handIn: '#5e5553', cheek: '#3a3230' },
}

/** 냄비 손잡이 (몸통 뒤) */
export function potHandles(color: PotColor) {
  const c = RIM[color]
  return `
    <circle cx="-196" cy="18" r="31" fill="${c.hand}" />
    <ellipse cx="-200" cy="13" rx="15" ry="11" fill="${c.handIn}" />
    <circle cx="196" cy="18" r="31" fill="${c.hand}" />
    <ellipse cx="200" cy="13" rx="15" ry="11" fill="${c.handIn}" />`
}

/** 냄비 몸통 · 볼터치 · 반짝 선 */
export function potBody(color: PotColor) {
  const c = RIM[color]
  return `
    <path d="M-182 0 C-182 128 -126 206 0 206 C126 206 182 128 182 0 Z" fill="url(#rm-pot-${color})" />
    <ellipse cx="-96" cy="112" rx="25" ry="13" fill="${c.cheek}" opacity="${color === 'k' ? 0.6 : 0.75}" />
    <ellipse cx="96" cy="112" rx="25" ry="13" fill="${c.cheek}" opacity="${color === 'k' ? 0.6 : 0.75}" />
    <path d="M-150 50 Q-154 122 -110 170" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity="${color === 'k' ? 0.25 : 0.75}" />`
}

/** 냄비 입구 (테두리 + 안쪽 바닥) */
export function potRim(color: PotColor) {
  const c = RIM[color]
  return `
    <ellipse cx="0" cy="0" rx="184" ry="66" fill="${c.rim}" />
    <ellipse cx="0" cy="2" rx="162" ry="52" fill="${c.inside}" />`
}

/** 가스불 받침 + 불꽃 (냄비 아래) */
export function burnerPlate() {
  return `<ellipse cx="0" cy="236" rx="132" ry="26" fill="#e3d1b4" opacity="0.9" />
    <ellipse cx="0" cy="232" rx="112" ry="18" fill="#d6c19f" opacity="0.6" />`
}

const FLAME_X = [-104, -78, -50, -18, 18, 50, 78, 104]
export function flames() {
  return FLAME_X.map((x, i) => {
    const h = 34 + ((i * 7) % 3) * 6
    return `<path class="rm-flame" style="animation-delay:${(i * -0.13).toFixed(2)}s" transform="translate(${x} ${238 + Math.abs(x) * 0.04})" d="M0 0 C-12 -5 -12 -${h * 0.55} 0 -${h} C12 -${h * 0.55} 12 -5 0 0Z" fill="url(#rm-flame)" />`
  }).join('')
}

/** 보글보글 거품 */
export function bubbles() {
  const rand = seeded(3)
  return Array.from({ length: 16 }, (_, i) => {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand())
    const x = Math.cos(a) * r * 138
    const y = Math.sin(a) * r * 40
    const size = 5 + rand() * 11
    return `<circle class="rm-bubble" style="animation-delay:${(-rand() * 1.2).toFixed(2)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="#fff" stroke="#bfe0ef" stroke-width="2" opacity="${i % 3 ? 0.9 : 0.7}" />`
  }).join('')
}

/** 김 (흰 김 / 탄 연기) */
export function steam(smoke = false) {
  const color = smoke ? '#5d5350' : '#ffffff'
  return [-60, 10, 72]
    .map(
      (x, i) =>
        `<path class="rm-steam" style="animation-delay:${(i * -0.7).toFixed(1)}s" d="M${x} -40 q-18 -28 0 -56 q18 -28 0 -56" fill="none" stroke="${color}" stroke-width="${smoke ? 20 : 14}" stroke-linecap="round" opacity="0" />`,
    )
    .join('')
}

/** 반짝반짝 (딱 꼬들꼬들할 때) */
export function sparkles() {
  return [
    [-120, -60, 1],
    [128, -46, 0.8],
    [10, -86, 0.65],
  ]
    .map(
      ([x, y, s], i) =>
        `<path class="rm-sparkle" style="animation-delay:${(i * -0.35).toFixed(2)}s" transform="translate(${x} ${y}) scale(${s})" d="M0 -22 Q0 0 22 0 Q0 0 0 22 Q0 0 -22 0 Q0 0 0 -22Z" fill="#fff6c2" stroke="#f4c54d" stroke-width="2.5" />`,
    )
    .join('')
}

/** 덜덜 떨 때 양옆 표시 */
export function shakeMarks() {
  return `<g class="rm-shake-marks" fill="none" stroke="#ec7466" stroke-width="7" stroke-linecap="round">
    <path d="M-236 80 q-16 30 0 60" /><path d="M-258 70 q-22 40 0 80" />
    <path d="M236 80 q16 30 0 60" /><path d="M258 70 q22 40 0 80" />
  </g>`
}

/** 결과 화면용 냄비 한 개 (불 없이) */
export function potStatic(content: string, color: PotColor = 'y', extra = '') {
  return `${potHandles(color)}${potBody(color)}${potRim(color)}<g clip-path="url(#rm-inner)">${content}</g>${extra}`
}

/** 냄비 안 국물 */
export function brothFill(kind: 'water' | 'broth' | 'plain' | 'soggy' | 'burnt') {
  const id = { water: 'rm-water', broth: 'rm-broth', plain: 'rm-broth-plain', soggy: 'rm-broth-soggy', burnt: 'rm-broth-burnt' }[kind]
  return `<ellipse cx="0" cy="2" rx="162" ry="52" fill="url(#${id})" />`
}

// ---------- 선반 재료 · 주전자 · 쟁반 ----------

/** 라면 사리 (선반, 가운데 기준 240 × 130) */
export function shelfNoodle() {
  const d = squiggles(41, 46, 130, 70, 18, 9)
  return `<g>
    <rect x="-120" y="-60" width="240" height="124" rx="18" fill="#d9a243" transform="translate(4 6)" opacity="0.35" />
    <rect x="-120" y="-62" width="240" height="124" rx="18" fill="#e9b85a" />
    <g fill="none" stroke-linecap="round" clip-path="url(#rm-shelf-noodle)">
      <path d="${d}" stroke="#c98d36" stroke-width="7" />
      <path d="${d}" stroke="#fbe2a2" stroke-width="3.4" />
    </g>
    <rect x="-120" y="-62" width="240" height="124" rx="18" fill="none" stroke="#d79f44" stroke-width="3" />
  </g>`
}

/** 스프 봉지 */
export function shelfSoup() {
  // 위 · 아래 끝은 톱니처럼 뜯는 자리
  const xs = Array.from({ length: 9 }, (_, i) => -38 + i * 9.5)
  const top = xs.map((x, i) => `L${x} ${i % 2 ? -68 : -62}`).join(' ')
  const bottom = [...xs].reverse().map((x, i) => `L${x} ${i % 2 ? 68 : 62}`).join(' ')
  return `<g>
    <path d="M-38 -62 ${top} ${bottom} Z" fill="#f2988c" />
    <rect x="-38" y="-48" width="76" height="96" fill="#f6a69b" />
    <rect x="-28" y="-40" width="10" height="80" rx="5" fill="#fff" opacity="0.35" />
    <text x="4" y="-6" text-anchor="middle" font-size="26" fill="#fff">스프</text>
  </g>`
}

/** 파 한 단 */
export function shelfOnion() {
  const ys = [-26, -14, -2, 10, 22]
  return `<g stroke-linecap="round" fill="none">
    ${ys.map((y, i) => `<path d="M-74 ${y + 2} L0 ${y}" stroke="#f2f5e8" stroke-width="10" /><path d="M0 ${y} Q50 ${y - 6 - i} ${86 - i * 4} ${y - 10 + i * 3}" stroke="#58ae3f" stroke-width="10" />`).join('')}
    ${ys.map((y) => `<path d="M6 ${y - 2} Q48 ${y - 7} 74 ${y - 9}" stroke="#97da70" stroke-width="3" />`).join('')}
    <rect x="-12" y="-40" width="14" height="76" rx="6" fill="#ec5b52" />
  </g>`
}

/** 계란 바구니 */
export function shelfEggs() {
  const eggs = [
    [-44, -8],
    [44, -8],
    [0, -26],
    [-22, 2],
    [24, 2],
  ]
  return `<g>
    ${eggs
      .map(
        ([x, y]) =>
          `<ellipse cx="${x}" cy="${y}" rx="28" ry="34" fill="#f7ebe0" stroke="#e8d6c4" stroke-width="2.5" /><ellipse cx="${x - 9}" cy="${y - 12}" rx="7" ry="10" fill="#fff" opacity="0.8" />`,
      )
      .join('')}
    <path d="M-92 14 L92 14 L74 66 L-74 66 Z" fill="#ecc88e" stroke="#d4a868" stroke-width="3" />
    ${[28, 40, 52].map((y) => `<path d="M${-88 + (y - 14) * 0.33} ${y} L${88 - (y - 14) * 0.33} ${y}" stroke="#d4a868" stroke-width="2.5" />`).join('')}
    <rect x="-98" y="8" width="196" height="14" rx="7" fill="#f2d6a4" stroke="#d4a868" stroke-width="2.5" />
  </g>`
}

/** 주전자 (가운데 기준, 폭 약 470) */
export function kettle(face: '' | 'calm' | 'happy' = '') {
  const faceSvg = !face
    ? ''
    : `<g stroke="#5a4033" stroke-width="7" fill="none" stroke-linecap="round">
        ${face === 'happy'
          ? '<path d="M-74 40 Q-56 22 -38 40" /><path d="M38 40 Q56 22 74 40" />'
          : '<path d="M-74 36 Q-56 50 -38 36" /><path d="M38 36 Q56 50 74 36" />'}
      </g>
      <ellipse cx="-96" cy="78" rx="20" ry="11" fill="#f7a9a0" opacity="0.8" />
      <ellipse cx="96" cy="78" rx="20" ry="11" fill="#f7a9a0" opacity="0.8" />
      <path d="M0 70 C-14 58 -44 60 -66 80 C-46 96 -18 92 0 80 C18 92 46 96 66 80 C44 60 14 58 0 70Z" fill="#6a4532" />`
  return `<g>
    <ellipse cx="0" cy="226" rx="236" ry="30" fill="#e9cf9b" opacity="0.6" />
    <path d="M-150 70 L-262 -104 Q-272 -124 -250 -126 L-214 -118 L-110 -10 Z" fill="url(#rm-kettle)" />
    <path d="M-252 -110 L-222 -104" stroke="#fff4c8" stroke-width="8" stroke-linecap="round" />
    <path d="M-150 -96 C-160 -300 160 -300 150 -96" fill="none" stroke="#dcb072" stroke-width="26" stroke-linecap="round" />
    <path d="M-150 -96 C-160 -300 160 -300 150 -96" fill="none" stroke="#f3d6a2" stroke-width="10" stroke-linecap="round" />
    <path d="M-206 76 C-206 -56 -112 -126 0 -126 C112 -126 206 -56 206 76 C206 184 122 222 0 222 C-122 222 -206 184 -206 76Z" fill="url(#rm-kettle)" />
    <path d="M-160 20 Q-170 110 -112 176" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity="0.7" />
    <ellipse cx="0" cy="-124" rx="126" ry="34" fill="#fff0b6" />
    <ellipse cx="0" cy="-122" rx="88" ry="20" fill="#f1cf76" />
    <circle cx="0" cy="-168" r="24" fill="#f7a39a" />
    <circle cx="-8" cy="-176" r="7" fill="#fff" opacity="0.6" />
    ${faceSvg}
  </g>`
}

/** 물줄기 (주전자로 부을 때, 냄비 위) */
export function waterStream() {
  return `<g class="rm-pour">
    <path d="M-30 -260 Q-8 -150 0 -10" fill="none" stroke="#cfeaf6" stroke-width="22" stroke-linecap="round" />
    <path d="M-30 -260 Q-8 -150 0 -10" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.8" />
    <circle cx="-22" cy="-6" r="9" fill="#e2f4fb" /><circle cx="26" cy="-2" r="7" fill="#e2f4fb" />
  </g>`
}

/** 여분 냄비 (작게, 가운데 기준) */
export function sparePot() {
  return `<g>${potHandles('y')}${potBody('y')}<ellipse cx="0" cy="0" rx="184" ry="66" fill="#fff2bd" /><ellipse cx="0" cy="2" rx="162" ry="52" fill="url(#rm-water)" /></g>`
}

/** 단무지 접시 */
export function pickles() {
  return `<g>
    <ellipse cx="0" cy="14" rx="96" ry="44" fill="#e6e1da" />
    <ellipse cx="0" cy="6" rx="96" ry="44" fill="#fdfcf9" />
    <ellipse cx="0" cy="8" rx="68" ry="28" fill="#eeebe4" />
    <path d="M-50 4 Q-30 -26 6 -18 Q2 8 -50 4Z" fill="#ffe25c" />
    <path d="M-20 14 Q0 -22 40 -10 Q30 18 -20 14Z" fill="#ffd93b" />
    <path d="M8 18 Q36 -8 58 4 Q48 26 8 18Z" fill="#ffe874" />
  </g>`
}

// ---------- 캐릭터 (방 안 아이: 주황 똥머리 · 줄무늬 티 · 멜빵바지) ----------

export type Mood = 'smile' | 'happy' | 'cry'

export function girl(mood: Mood) {
  const eyes = {
    smile: `<g fill="#3a2a2a"><ellipse cx="92" cy="140" rx="8" ry="10" /><ellipse cx="148" cy="140" rx="8" ry="10" /></g>
      <circle cx="95" cy="136" r="3" fill="#fff" /><circle cx="151" cy="136" r="3" fill="#fff" />
      <path d="M80 128 L84 132 M160 128 L156 132" stroke="#3a2a2a" stroke-width="3" stroke-linecap="round" />`,
    happy: `<g fill="none" stroke="#3a2a2a" stroke-width="5.5" stroke-linecap="round"><path d="M78 142 Q92 126 106 142" /><path d="M134 142 Q148 126 162 142" /></g>`,
    cry: `<g fill="none" stroke="#3a2a2a" stroke-width="5.5" stroke-linecap="round"><path d="M78 134 Q92 146 106 134" /><path d="M134 134 Q148 146 162 134" /></g>
      <rect x="84" y="142" width="13" height="66" rx="6.5" fill="#a9daf2" opacity="0.95" />
      <rect x="143" y="142" width="13" height="66" rx="6.5" fill="#a9daf2" opacity="0.95" />`,
  }[mood]
  const mouth = {
    smile: '<path d="M110 168 Q120 176 130 168" fill="none" stroke="#c4424f" stroke-width="4" stroke-linecap="round" />',
    happy: '<path d="M106 164 Q120 166 134 164 Q132 184 120 184 Q108 184 106 164Z" fill="#d94e5f" /><path d="M112 177 Q120 172 128 177 Q124 184 120 184 Q116 184 112 177Z" fill="#ff9aa6" />',
    cry: '<ellipse cx="120" cy="174" rx="12" ry="10" fill="#c4424f" />',
  }[mood]
  const arms =
    mood === 'happy'
      ? `<path d="M70 222 Q44 210 38 186" stroke="url(#rm-stripe)" stroke-width="26" stroke-linecap="round" fill="none" /><circle cx="38" cy="180" r="13" fill="#ffe2cf" />
         <path d="M170 222 Q196 210 202 186" stroke="url(#rm-stripe)" stroke-width="26" stroke-linecap="round" fill="none" /><circle cx="202" cy="180" r="13" fill="#ffe2cf" />`
      : `<path d="M70 220 Q58 244 62 262" stroke="url(#rm-stripe)" stroke-width="26" stroke-linecap="round" fill="none" /><circle cx="63" cy="268" r="12" fill="#ffe2cf" />
         <path d="M170 220 Q182 244 178 262" stroke="url(#rm-stripe)" stroke-width="26" stroke-linecap="round" fill="none" /><circle cx="177" cy="268" r="12" fill="#ffe2cf" />`
  return `<svg viewBox="0 0 240 340" aria-hidden="true">
    <ellipse cx="120" cy="328" rx="76" ry="9" fill="#e6d3b6" opacity="0.8" />
    <ellipse cx="94" cy="314" rx="30" ry="13" fill="#8c4f2c" /><ellipse cx="146" cy="314" rx="30" ry="13" fill="#8c4f2c" />
    <rect x="80" y="268" width="36" height="42" rx="8" fill="#93b3e2" /><rect x="124" y="268" width="36" height="42" rx="8" fill="#93b3e2" />
    <rect x="80" y="294" width="36" height="10" rx="5" fill="#b4cdf0" /><rect x="124" y="294" width="36" height="10" rx="5" fill="#b4cdf0" />
    ${arms}
    <rect x="68" y="198" width="104" height="62" rx="26" fill="url(#rm-stripe)" />
    <path d="M78 230 L162 230 L170 282 L70 282 Z" fill="#8fb1e4" />
    <rect x="92" y="208" width="56" height="34" rx="6" fill="#8fb1e4" />
    <rect x="108" y="216" width="24" height="14" rx="4" fill="#b4cdf0" />
    <path d="M92 210 L82 198 M148 210 L158 198" stroke="#8fb1e4" stroke-width="8" stroke-linecap="round" />
    <circle cx="97" cy="214" r="5" fill="#f6c443" /><circle cx="143" cy="214" r="5" fill="#f6c443" />
    <circle cx="50" cy="52" r="40" fill="url(#rm-hair)" /><circle cx="190" cy="52" r="40" fill="url(#rm-hair)" />
    <path d="M30 58 q8 -10 16 0 q8 10 16 0" fill="none" stroke="#ffd08a" stroke-width="5" stroke-linecap="round" />
    <path d="M178 58 q8 -10 16 0 q8 10 16 0" fill="none" stroke="#ffd08a" stroke-width="5" stroke-linecap="round" />
    <circle cx="44" cy="128" r="13" fill="#ffd9c4" /><circle cx="196" cy="128" r="13" fill="#ffd9c4" />
    <ellipse cx="120" cy="124" rx="78" ry="72" fill="#ffe6d4" />
    <path d="M42 118 C36 42 86 22 120 22 C154 22 204 42 198 118 C192 108 186 104 178 104 L62 104 C54 104 48 108 42 118Z" fill="url(#rm-hair)" />
    <path d="M78 46 Q112 30 148 40" fill="none" stroke="#ffc782" stroke-width="8" stroke-linecap="round" opacity="0.9" />
    <ellipse cx="78" cy="160" rx="16" ry="9" fill="#ffb3a8" opacity="0.85" /><ellipse cx="162" cy="160" rx="16" ry="9" fill="#ffb3a8" opacity="0.85" />
    ${eyes}
    <circle cx="120" cy="154" r="4.5" fill="#f07a3c" />
    ${mouth}
  </svg>`
}

/** 우는 라면 사리 (실패 화면) */
export function cryingBlock() {
  return `<svg viewBox="-130 -76 260 160" aria-hidden="true">
    ${shelfNoodle()}
    <g fill="none" stroke="#6a4532" stroke-width="6" stroke-linecap="round">
      <path d="M-46 -2 Q-32 8 -18 -2" /><path d="M18 -2 Q32 8 46 -2" /><path d="M-10 30 Q0 22 10 30" />
    </g>
    <rect x="-40" y="6" width="9" height="40" rx="4.5" fill="#a9daf2" /><rect x="31" y="6" width="9" height="40" rx="4.5" fill="#a9daf2" />
    <ellipse cx="-62" cy="16" rx="13" ry="8" fill="#f7a9a0" opacity="0.8" /><ellipse cx="62" cy="16" rx="13" ry="8" fill="#f7a9a0" opacity="0.8" />
  </svg>`
}
