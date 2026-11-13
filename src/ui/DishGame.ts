import type { Chiptune } from './Chiptune'
import { RetroWindow } from './RetroWindow'
import { isTouchDevice } from '../utils/device'

/** 미션: 제한시간 안에 접시 몇 장 */
const TIME_LIMIT = 20
const DISH_GOAL = 5
/** 한 번 누를 때마다 지금 접시가 깨끗해지는 정도 (%) */
const SCRUB_POWER = 7
const BEST_KEY = 'tiny-room-dish-best'
/** 거품 방울 수: 뒤쪽 거품 산 · 앞쪽 거품 · 하늘에 떠오르는 비눗방울 */
const BACK_FOAM = 56
const FRONT_FOAM = 36
const AIR_BUBBLES = 10

type Phase = 'mission' | 'playing' | 'result'

/** 거품 속에 파묻힌 안 닦은 그릇 자리 [가로 %, 아래 %, 종류, 기울기] — 닦을수록 뒤에서부터 사라져요 */
const PILE: [left: number, bottom: number, kind: 'pot' | 'plate' | 'cup' | 'kettle', rotate: number][] = [
  [13, 24, 'kettle', -8],
  [85, 26, 'pot', 10],
  [28, 22, 'cup', -10],
  [70, 21, 'plate', 12],
]

/** 접시 위 얼룩 자리 (접시 그림 안 좌표) */
const STAINS: [x: number, y: number, rx: number, ry: number][] = [
  [72, 78, 18, 12],
  [128, 70, 14, 10],
  [100, 118, 22, 14],
  [140, 120, 12, 9],
  [62, 124, 10, 8],
  [108, 88, 9, 7],
]

/**
 * 주방 싱크대에서 여는 뽀득뽀득 설거지 게임 (설거지.app).
 * 미션 카드 → 스페이스바(모바일은 뽀득! 버튼)를 빠르게 연타해서 접시를 닦아요 → 결과.
 * 화면 위 완료율 %, 아래 시간 막대 · 닦은 접시 수 (옛날 플래시 설거지 게임 느낌)
 */
export class DishGame {
  /** 한 번 문지를 때마다 */
  onScrub: (() => void) | null = null
  /** 접시 한 장을 다 닦았을 때 */
  onDish: (() => void) | null = null
  /** 창을 닫을 때 */
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  private phase: Phase = 'mission'
  private timeLeft = TIME_LIMIT
  private dishes = 0
  /** 지금 접시가 깨끗한 정도 0 ~ 100 */
  private shine = 0

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '설거지.app', '설거지 게임')
    this.win.onClose = () => this.onClose?.()
    window.addEventListener('keydown', (e) => {
      if (!this.win.isOpen || e.code !== 'Space') return
      // 스페이스가 버튼을 누르거나 화면을 내리지 않게 막고, 꾹 누르고 있는 건 한 번만 쳐요
      e.preventDefault()
      if (!e.repeat) this.scrub()
    })
  }

  get isOpen() {
    return this.win.isOpen
  }

  open() {
    if (this.win.isOpen) return
    this.win.open()
    this.showMission()
  }

  close() {
    this.win.close()
  }

  update(dt: number) {
    if (!this.win.isOpen || this.phase !== 'playing') return
    this.timeLeft = Math.max(this.timeLeft - dt, 0)
    this.renderTime()
    if (this.timeLeft <= 0) this.finish()
  }

  // ---------- 진행 ----------

  private showMission() {
    this.phase = 'mission'
    this.music.stop()
    this.win.body.innerHTML = `
      <div class="dish">
        ${this.sceneHtml()}
        <div class="dish__overlay">
          <div class="dish__mission" role="alertdialog" aria-label="미션">
            <p class="dish__mission-badge">MISSION</p>
            <p class="dish__mission-text">제한시간 <b>${TIME_LIMIT}초</b> 안에<br />접시를 <b>${DISH_GOAL}장</b> 뽀득뽀득 닦아요!</p>
            <p class="dish__mission-tip">${isTouchDevice() ? '아래 뽀득! 버튼을 톡톡 빠르게 눌러요' : '스페이스바를 빠르게 연타해요'}</p>
            <button type="button" class="tbutton tbutton--main" data-action="start">확인</button>
          </div>
        </div>
      </div>
    `
    this.win.body.querySelector('[data-action="start"]')!.addEventListener('click', () => this.start())
    // 미션 화면 뒤로도 그릇이 쌓인 설거지통이 보여요
    this.dishes = 0
    this.shine = 0
    this.renderDish()
    setTimeout(() => this.win.body.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true }), 450)
  }

  private start() {
    this.phase = 'playing'
    this.timeLeft = TIME_LIMIT
    this.dishes = 0
    this.shine = 0
    this.win.body.innerHTML = `
      <div class="dish">
        <div class="dish__top">
          <span class="dish__label">설거지 완료율</span>
          <b class="dish__percent" data-ref="percent">0%</b>
        </div>
        <div class="dish__progress"><i data-ref="progress"></i></div>
        ${this.sceneHtml()}
        <div class="dish__bottom">
          <span class="dish__clock" aria-hidden="true">⏰</span>
          <div class="dish__time"><i data-ref="time"></i></div>
          <span class="dish__count">🍽️ <b data-ref="count">0</b>장</span>
        </div>
        <button type="button" class="dish__scrub" data-action="scrub" data-silent>뽀득! <small>${isTouchDevice() ? '톡톡' : 'Space'}</small></button>
      </div>
    `
    // 마우스 · 터치로 눌러도 문질러요 (누르는 순간 바로 반응하게 pointerdown에서)
    const button = this.win.body.querySelector<HTMLButtonElement>('[data-action="scrub"]')!
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.scrub()
    })
    ;(document.activeElement as HTMLElement | null)?.blur()
    this.music.start(150)
    this.renderDish()
    this.renderTime()
  }

  private scrub() {
    if (this.phase !== 'playing') return
    this.shine = Math.min(this.shine + SCRUB_POWER, 100)
    this.music.sfx('scrub')
    this.onScrub?.()
    this.bubble()
    if (this.shine >= 100) {
      this.dishes += 1
      this.shine = 0
      this.music.sfx('hit')
      this.onDish?.()
      this.pop('뽀득!')
      if (this.dishes >= DISH_GOAL) {
        this.finish()
        return
      }
    }
    this.renderDish()
  }

  private finish() {
    this.phase = 'result'
    this.music.stop()
    const success = this.dishes >= DISH_GOAL
    const used = TIME_LIMIT - this.timeLeft
    const percent = this.percent()
    this.music.sfx(success ? 'clear' : 'miss')
    const best = success ? this.saveBest(used) : this.readBest()
    const isBest = success && best === used
    this.win.body.innerHTML = `
      <div class="tresult">
        <div class="tresult__card">
          <p class="tresult__title">${success ? '설거지를 완료했어요! ✨' : '앗, 시간이 다 됐어요'}${isBest ? ' <mark>최고 기록 🎉</mark>' : ''}</p>
          <div class="tresult__lines">
            <div class="tresult__line"><span>닦은 접시</span><b>${this.dishes}장</b></div>
            <div class="tresult__line"><span>설거지 완료율</span><b>${percent}%</b></div>
            <div class="tresult__line"><span>${success ? '걸린 시간' : '최고 기록'}</span><b>${success ? `${used.toFixed(1)}초` : best ? `${best.toFixed(1)}초` : '-'}</b></div>
          </div>
          <div class="tresult__buttons">
            <button type="button" class="tbutton tbutton--main" data-action="again">다시 하기</button>
            <button type="button" class="tbutton" data-action="quit">그만하기</button>
          </div>
        </div>
      </div>
    `
    this.win.body.querySelector('[data-action="again"]')!.addEventListener('click', () => this.showMission())
    this.win.body.querySelector('[data-action="quit"]')!.addEventListener('click', () => this.close())
  }

  // ---------- 화면 ----------

  private percent() {
    return Math.round(((this.dishes + this.shine / 100) / DISH_GOAL) * 100)
  }

  /**
   * 몽글몽글 설거지 장면: 하늘색 배경에 비눗방울이 떠오르고, 아래는 거품 산.
   * 거품 속에 안 닦은 그릇(주전자 · 냄비 · 컵 · 접시)이 파묻혀 있고, 가운데 지금 닦는 접시
   */
  private sceneHtml() {
    return `
      <div class="dish__scene" data-ref="scene" aria-hidden="true">
        <div class="dish__air">${airHtml()}</div>
        <div class="dish__foam dish__foam--back">${foamHtml(BACK_FOAM, 58, 2.2, 2.6)}</div>
        <div class="dish__pile" data-ref="pile"></div>
        <svg class="dish__plate" viewBox="0 0 200 200" data-ref="plate">
          <circle cx="100" cy="100" r="88" fill="#fff" stroke="#efe2cf" stroke-width="5" />
          <circle cx="100" cy="100" r="58" fill="#fffaf2" stroke="#f3e8d8" stroke-width="4" />
          <ellipse cx="72" cy="62" rx="26" ry="10" fill="#fff" opacity="0.9" transform="rotate(-30 72 62)" />
          <g data-ref="stains" fill="#c9a27c">
            ${STAINS.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" />`).join('')}
          </g>
          <g data-ref="sparkle" class="dish__sparkle" fill="#ffe08a" stroke="#f2c25c" stroke-width="2" stroke-linejoin="round">
            <path d="M150 50 l4 9 10 2 -8 6 2 10 -8 -5 -8 5 2 -10 -8 -6 10 -2z" />
            <path d="M48 140 l3 6 7 1 -5 4 1 7 -6 -3 -6 3 1 -7 -5 -4 7 -1z" />
          </g>
        </svg>
        <div class="dish__foam dish__foam--front">${foamHtml(FRONT_FOAM, 30, 2, 2.2, false)}</div>
        <span class="dish__sponge">${SPONGE_ART}</span>
      </div>`
  }

  private renderDish() {
    const ref = (name: string) => this.win.body.querySelector<HTMLElement | SVGElement>(`[data-ref="${name}"]`)
    const dirt = 1 - this.shine / 100
    ref('stains')?.setAttribute('opacity', String(Math.max(dirt, 0)))
    ref('sparkle')?.setAttribute('opacity', String(this.shine / 100))
    const percent = this.percent()
    const percentEl = ref('percent')
    if (percentEl) percentEl.textContent = `${percent}%`
    const bar = ref('progress') as HTMLElement | null
    if (bar) bar.style.width = `${percent}%`
    const count = ref('count')
    if (count) count.textContent = String(this.dishes)
    // 거품 속 안 닦은 그릇: 지금 닦는 접시 빼고 남은 만큼만
    const pile = ref('pile')
    const left = Math.max(DISH_GOAL - this.dishes - 1, 0)
    if (pile && pile.childElementCount !== left) pile.innerHTML = PILE.slice(0, left).map(pileItemHtml).join('')
    // 문지를 때마다 수세미가 좌우로 살짝
    const sponge = this.win.body.querySelector<HTMLElement>('.dish__sponge')
    sponge?.classList.toggle('is-left')
  }

  private renderTime() {
    const bar = this.win.body.querySelector<HTMLElement>('[data-ref="time"]')
    if (!bar) return
    const ratio = this.timeLeft / TIME_LIMIT
    bar.style.width = `${ratio * 100}%`
    bar.classList.toggle('is-hurry', ratio < 0.3)
  }

  /** 문지르면 거품이 퐁 */
  private bubble() {
    const scene = this.win.body.querySelector('[data-ref="scene"]')
    if (!scene) return
    const bubble = document.createElement('span')
    bubble.className = 'dish__bubble'
    bubble.style.left = `${30 + Math.random() * 40}%`
    bubble.style.top = `${30 + Math.random() * 40}%`
    bubble.style.setProperty('--size', `${0.8 + Math.random() * 1.2}em`)
    scene.appendChild(bubble)
    setTimeout(() => bubble.remove(), 700)
  }

  /** 접시를 다 닦으면 "뽀득!" */
  private pop(text: string) {
    const scene = this.win.body.querySelector('[data-ref="scene"]')
    if (!scene) return
    const el = document.createElement('span')
    el.className = 'dish__pop'
    el.textContent = text
    scene.appendChild(el)
    setTimeout(() => el.remove(), 800)
  }

  // ---------- 최고 기록 (가장 빨리 끝낸 시간, 이 브라우저에만 저장) ----------

  private readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0
    } catch {
      return 0
    }
  }

  private saveBest(seconds: number) {
    const best = this.readBest()
    if (best && best <= seconds) return best
    try {
      localStorage.setItem(BEST_KEY, String(seconds))
    } catch {
      // 저장소를 못 쓰면 이번 기록만
    }
    return seconds
  }
}

/** 귀여운 수세미: 버터색 스펀지 위에 민트색 거친 면, 작은 얼굴 (테두리 없이) */
const SPONGE_ART = `
<svg viewBox="0 0 140 96">
  <rect x="8" y="30" width="124" height="58" rx="20" fill="#ffd977"/>
  <rect x="8" y="58" width="124" height="30" rx="16" fill="#f7c95c" opacity=".55"/>
  <rect x="8" y="8" width="124" height="32" rx="16" fill="#a8dcc8"/>
  <rect x="8" y="28" width="124" height="12" rx="6" fill="#8fcfb5" opacity=".6"/>
  <rect x="22" y="13" width="54" height="8" rx="4" fill="#fff" opacity=".5"/>
  <g fill="#f2b544" opacity=".55">
    <circle cx="26" cy="74" r="4"/><circle cx="112" cy="70" r="5"/><circle cx="98" cy="80" r="3"/><circle cx="40" cy="80" r="3"/>
  </g>
  <circle cx="56" cy="56" r="4.5" fill="#5a4033"/>
  <circle cx="84" cy="56" r="4.5" fill="#5a4033"/>
  <circle cx="57.5" cy="54.5" r="1.4" fill="#fff"/>
  <circle cx="85.5" cy="54.5" r="1.4" fill="#fff"/>
  <ellipse cx="46" cy="66" rx="7" ry="4" fill="#ffb3a7" opacity=".7"/>
  <ellipse cx="94" cy="66" rx="7" ry="4" fill="#ffb3a7" opacity=".7"/>
  <path d="M64 64 q6 6 12 0" fill="none" stroke="#5a4033" stroke-width="3" stroke-linecap="round"/>
</svg>`

/** 거품 방울 하나 (크기 · 위치 · 보글거리는 박자가 제각각) */
const bubbleSpan = (left: number, bottom: number, size: number) =>
  `<span style="left:${left.toFixed(1)}%;bottom:${bottom.toFixed(1)}%;--size:${size.toFixed(2)}em;animation-delay:${(-Math.random() * 2).toFixed(2)}s"></span>`

/**
 * 거품 쌓기. 뒤쪽은 가운데가 높은 거품 산, 앞쪽은 고르게 깔려서 그릇 아랫부분을 덮어요.
 * @param height 거품 높이 (장면 높이 %)
 * @param mound true면 가운데가 높고 양옆으로 낮아져요
 */
function foamHtml(count: number, height: number, minSize: number, sizeRange: number, mound = true) {
  return Array.from({ length: count }, (_, i) => {
    const left = (i / count) * 108 - 4 + (Math.random() - 0.5) * 6
    const top = mound ? height * (1 - Math.abs(left - 50) / 110) : height * (0.75 + Math.random() * 0.25)
    return bubbleSpan(left, Math.random() ** 1.4 * top - 6, minSize + Math.random() * sizeRange)
  }).join('')
}

/** 하늘에서 천천히 떠오르는 투명한 비눗방울 */
function airHtml() {
  return Array.from({ length: AIR_BUBBLES }, () => bubbleSpan(Math.random() * 100, 40 + Math.random() * 50, 0.6 + Math.random() * 1.6)).join('')
}

/** 거품 속 그릇 하나: 테두리 없이 부드러운 색과 음영으로 */
function pileItemHtml([left, bottom, kind, rotate]: (typeof PILE)[number]) {
  const art = {
    pot: `<svg viewBox="0 0 120 90"><ellipse cx="60" cy="62" rx="48" ry="24" fill="#f7c95c"/><rect x="12" y="34" width="96" height="30" rx="6" fill="#ffd977"/><ellipse cx="60" cy="34" rx="50" ry="12" fill="#ffe7a3"/><ellipse cx="60" cy="30" rx="34" ry="8" fill="#ffd977"/><rect x="54" y="16" width="12" height="12" rx="5" fill="#c89a6c"/><rect x="2" y="38" width="14" height="8" rx="4" fill="#f2b544"/><rect x="104" y="38" width="14" height="8" rx="4" fill="#f2b544"/><ellipse cx="36" cy="46" rx="10" ry="5" fill="#fff6d6" opacity=".8"/></svg>`,
    kettle: `<svg viewBox="0 0 120 110"><path d="M30 30 Q60 -6 90 30" fill="none" stroke="#c89a6c" stroke-width="7" stroke-linecap="round"/><ellipse cx="60" cy="72" rx="42" ry="32" fill="#ffd977"/><ellipse cx="60" cy="44" rx="30" ry="9" fill="#ffe7a3"/><rect x="54" y="30" width="12" height="10" rx="5" fill="#c89a6c"/><path d="M98 66 L118 52 L114 62 L100 80 Z" fill="#f7c95c"/><ellipse cx="42" cy="62" rx="10" ry="6" fill="#fff6d6" opacity=".8"/></svg>`,
    cup: `<svg viewBox="0 0 100 90"><path d="M74 32 a16 16 0 1 1 0 32" fill="none" stroke="#9fd6be" stroke-width="8"/><path d="M16 24 h60 l-6 54 a8 8 0 0 1 -8 7 h-32 a8 8 0 0 1 -8 -7z" fill="#bfe6d4"/><ellipse cx="46" cy="24" rx="30" ry="7" fill="#e3f5ec"/><ellipse cx="32" cy="46" rx="6" ry="10" fill="#fff" opacity=".6"/></svg>`,
    plate: `<svg viewBox="0 0 120 50"><ellipse cx="60" cy="28" rx="56" ry="18" fill="#f3e8d8"/><ellipse cx="60" cy="24" rx="56" ry="18" fill="#fffaf2"/><ellipse cx="60" cy="24" rx="34" ry="10" fill="#f6ecdd"/><ellipse cx="48" cy="22" rx="7" ry="3" fill="#c9a27c"/></svg>`,
  }[kind]
  return `<span class="dish__item dish__item--${kind}" style="left:${left}%;bottom:${bottom}%;rotate:${rotate}deg">${art}</span>`
}
