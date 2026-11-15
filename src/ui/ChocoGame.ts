import type { Chiptune } from './Chiptune'
import { RetroWindow } from './RetroWindow'
import { isTouchDevice } from '../utils/device'

/** 전체 제한시간 (녹이기 → 붓기 → 토핑 → 얼리기까지) */
const TIME_LIMIT = 60
/** 한 번 주무를 때마다 녹는 정도 (%) */
const MELT_POWER = 9
/** 꾹 누르고 있을 때 1초에 차오르는 양 (1 = 틀에 가득) */
const POUR_SPEED = 0.55
/** 점선 근처(이 범위)로 채우면 딱 좋아요 */
const GOOD_MIN = 0.8
const GOOD_MAX = 1.0
/** 이만큼 넘치면 더는 안 나와요 */
const OVER_MAX = 1.2
/** 냉장고에서 꽁꽁 얼기까지 걸리는 시간(초) */
const FREEZE_TIME = 4
/** 틀 한 칸에 올릴 수 있는 토핑 수 */
const TOPPING_MAX = 14
const BEST_KEY = 'tiny-room-choco-best'

type Phase = 'mission' | 'melt' | 'pour' | 'topping' | 'freeze' | 'result'
type ChocoKind = 'milk' | 'white' | 'berry'
type ToppingKind = 'sprinkle' | 'almond' | 'candy'
type ShapeKind = 'heart' | 'star' | 'bear' | 'circle'

interface Piece {
  kind: ToppingKind
  x: number
  y: number
  rotate: number
  color: string
}

const CHOCO: Record<ChocoKind, { name: string; color: string; shade: string }> = {
  milk: { name: '밀크초코', color: '#9a6240', shade: '#7a4a2c' },
  white: { name: '화이트초코', color: '#fff1d6', shade: '#e8cf9f' },
  berry: { name: '딸기초코', color: '#f7a8bd', shade: '#e3869f' },
}
const CHOCO_KINDS = Object.keys(CHOCO) as ChocoKind[]

const TOPPING: Record<ToppingKind, string> = {
  sprinkle: '스프링클',
  almond: '아몬드',
  candy: '별사탕',
}
const TOPPING_KINDS = Object.keys(TOPPING) as ToppingKind[]
const SPRINKLE_COLORS = ['#ff9fb2', '#8fd3c1', '#ffd36b', '#a9c6ff', '#c7a6f2', '#ffffff']
const CANDY_COLORS = ['#ffc6d3', '#fff0a6', '#c8f0e0', '#d7ccff']

/** 틀 4칸 모양 (왼쪽부터) */
const MOLD: ShapeKind[] = ['heart', 'star', 'bear', 'circle']

/** 별 모양 꼭짓점 */
function starPath(cx: number, cy: number, outer: number, inner: number) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    return `${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r).toFixed(1)}`
  })
  return `M${points.join(' L')}Z`
}

/**
 * 틀 모양: 그림 조각들(곰돌이는 동그라미 3개를 합친 모양)과 위 · 아래 끝 높이.
 * 초코가 차오르는 높이는 top ~ bottom 사이 비율로 그려요
 */
const SHAPES: Record<ShapeKind, { parts: string[]; top: number; bottom: number }> = {
  heart: {
    parts: ['<path d="M50 88 C22 68 8 50 8 33 C8 19 19 9 31 9 C40 9 46 14 50 21 C54 14 60 9 69 9 C81 9 92 19 92 33 C92 50 78 68 50 88Z"'],
    top: 9,
    bottom: 88,
  },
  star: { parts: [`<path d="${starPath(50, 54, 46, 21)}" stroke-linejoin="round"`], top: 8, bottom: 91 },
  bear: {
    parts: ['<circle cx="24" cy="30" r="14"', '<circle cx="76" cy="30" r="14"', '<circle cx="50" cy="58" r="31"'],
    top: 16,
    bottom: 89,
  },
  circle: { parts: ['<circle cx="50" cy="50" r="40"'], top: 10, bottom: 90 },
}

/** 모양 조각마다 같은 속성을 붙여서 그려요 */
const shapeEls = (kind: ShapeKind, attrs: string) => SHAPES[kind].parts.map((p) => `${p} ${attrs}/>`).join('')

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

/**
 * 냉장고에서 여는 얼려먹는 초코 만들기 게임 (얼초.app).
 * 미션(주문서) → 1 초코 녹이기(연타) → 2 틀에 붓기(꾹 눌러서 점선까지) → 3 토핑 올리기 → 4 냉장고에 얼리기 → 결과(별점).
 * 창 디자인 · 미션 카드 · 시간 막대는 설거지.app과 같아요 (옛날 플래시 얼초 게임 느낌)
 */
export class ChocoGame {
  /** 주무르거나 토핑을 뿌릴 때마다 (캐릭터 손이 바빠져요) */
  onWork: (() => void) | null = null
  /** 한 단계를 잘 끝냈을 때 (캐릭터가 웃어요) */
  onGood: (() => void) | null = null
  /** 창을 닫을 때 */
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  private phase: Phase = 'mission'
  private timeLeft = TIME_LIMIT
  private order = { choco: 'milk' as ChocoKind, topping: 'sprinkle' as ToppingKind }
  private choco: ChocoKind | null = null
  private melt = 0
  private levels = [0, 0, 0, 0]
  private toppings: Piece[][] = [[], [], [], []]
  private topping: ToppingKind | null = null
  private freeze = 0
  /** 지금 초코를 붓고 있는 칸 (-1이면 안 붓는 중) */
  private pouring = -1
  private dripTimer = 0

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '얼초.app', '얼려먹는 초코 만들기 게임')
    this.win.onClose = () => {
      this.pouring = -1
      this.onClose?.()
    }
    window.addEventListener('keydown', (e) => {
      if (!this.win.isOpen || e.code !== 'Space' || this.phase !== 'melt') return
      // 스페이스가 버튼을 누르거나 화면을 내리지 않게 막고, 꾹 누르고 있는 건 한 번만 쳐요
      e.preventDefault()
      if (!e.repeat) this.knead()
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
    if (!this.win.isOpen) return
    if (this.phase === 'mission' || this.phase === 'result') return
    this.timeLeft = Math.max(this.timeLeft - dt, 0)
    this.renderTime()
    if (this.timeLeft <= 0) {
      this.finish(false)
      return
    }

    if (this.phase === 'pour' && this.pouring >= 0) {
      const i = this.pouring
      const before = this.levels[i]
      this.levels[i] = Math.min(before + POUR_SPEED * dt, OVER_MAX)
      if (before <= GOOD_MAX && this.levels[i] > GOOD_MAX) this.music.sfx('miss')
      this.dripTimer -= dt
      if (this.dripTimer <= 0 && this.levels[i] < OVER_MAX) {
        this.dripTimer = 0.14
        this.music.sfx('drip')
      }
      this.renderCell(i)
      this.renderActions()
    }

    if (this.phase === 'freeze' && this.freeze < 1) {
      this.freeze = Math.min(this.freeze + dt / FREEZE_TIME, 1)
      if (this.freeze >= 1) {
        this.music.sfx('freeze')
        this.pop('꽁꽁!')
        this.onGood?.()
      }
      this.renderFreeze()
    }
  }

  // ---------- 진행 ----------

  private showMission() {
    this.phase = 'mission'
    this.music.stop()
    this.order = { choco: pick(CHOCO_KINDS), topping: pick(TOPPING_KINDS) }
    this.choco = null
    this.melt = 0
    this.levels = [0, 0, 0, 0]
    this.toppings = [[], [], [], []]
    this.topping = null
    this.freeze = 0
    this.pouring = -1
    this.timeLeft = TIME_LIMIT
    this.win.body.innerHTML = `
      <div class="dish choco">
        <div class="choco__scene choco__scene--mission" aria-hidden="true">
          <div class="choco__tubes choco__tubes--deco">${CHOCO_KINDS.map((k) => `<span class="choco__tube">${tubeArt(CHOCO[k].color)}</span>`).join('')}</div>
          ${this.moldHtml('m')}
        </div>
        <div class="dish__overlay">
          <div class="dish__mission" role="alertdialog" aria-label="미션">
            <p class="dish__mission-badge">ORDER</p>
            <p class="dish__mission-text"><b>${CHOCO[this.order.choco].name}</b>에 <b>${TOPPING[this.order.topping]}</b>을 올린<br />얼초를 ${TIME_LIMIT}초 안에 만들어요!</p>
            <p class="dish__mission-tip">녹이기 → 틀에 붓기(점선까지!) → 토핑 → 냉장고</p>
            <button type="button" class="tbutton tbutton--main" data-action="start">확인</button>
          </div>
        </div>
      </div>
    `
    this.win.body.querySelector('[data-action="start"]')!.addEventListener('click', () => this.startMelt())
    setTimeout(() => this.win.body.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true }), 450)
  }

  /** 1. 초코 고르고 따뜻한 물에 녹이기 */
  private startMelt() {
    this.phase = 'melt'
    this.music.start(140)
    this.renderShell(`
      <p class="choco__hint" data-ref="hint">어떤 초코를 녹일까요?</p>
      <div class="choco__tubes" data-ref="tubes">
        ${CHOCO_KINDS.map(
          (k) => `<button type="button" class="choco__pick" data-choco="${k}"><span class="choco__tube">${tubeArt(CHOCO[k].color)}</span><span>${CHOCO[k].name}</span></button>`,
        ).join('')}
      </div>
    `, `<button type="button" class="choco__action" data-action="knead" data-silent disabled>주물주물! <small>${isTouchDevice() ? '톡톡' : 'Space'}</small></button>`)
    this.win.body.querySelectorAll<HTMLButtonElement>('[data-choco]').forEach((button) => {
      button.addEventListener('click', () => this.chooseChoco(button.dataset.choco as ChocoKind))
    })
    const knead = this.win.body.querySelector<HTMLButtonElement>('[data-action="knead"]')!
    knead.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.knead()
    })
  }

  private chooseChoco(kind: ChocoKind) {
    if (this.phase !== 'melt' || this.choco) return
    this.choco = kind
    const scene = this.ref('scene')!
    scene.innerHTML = `
      <p class="choco__hint">${isTouchDevice() ? '주물주물! 버튼을 톡톡' : '스페이스바를 빠르게 연타해서'} 초코를 녹여요</p>
      <div class="choco__melt">
        <span class="choco__steam" aria-hidden="true"><i></i><i></i><i></i></span>
        <svg class="choco__bowl-back" viewBox="0 0 240 150" aria-hidden="true"><ellipse cx="120" cy="58" rx="106" ry="18" fill="#d8f1fb" /><ellipse cx="120" cy="58" rx="92" ry="12" fill="#c4e8f7" /></svg>
        <span class="choco__tube choco__tube--melt" data-ref="melt-tube">${meltTubeArt(CHOCO[kind])}</span>
        <svg class="choco__bowl-front" viewBox="0 0 240 150" aria-hidden="true">
          <path d="M14 58 Q120 80 226 58 Q218 142 120 146 Q22 142 14 58Z" fill="#bfe6d4" />
          <path d="M14 58 Q120 80 226 58 Q224 74 220 86 Q120 104 20 86 Q16 74 14 58Z" fill="#a8dcc8" opacity=".55" />
          <ellipse cx="66" cy="104" rx="14" ry="8" fill="#e3f5ec" opacity=".8" />
        </svg>
      </div>
      <div class="choco__meter"><span>녹은 정도</span><div class="dish__progress"><i data-ref="melt"></i></div><b data-ref="melt-text">0%</b></div>
    `
    const knead = this.win.body.querySelector<HTMLButtonElement>('[data-action="knead"]')
    if (knead) knead.disabled = false
    this.renderMelt()
  }

  private knead() {
    if (this.phase !== 'melt' || !this.choco || this.melt >= 100) return
    this.melt = Math.min(this.melt + MELT_POWER, 100)
    this.music.sfx('scrub')
    this.onWork?.()
    this.ref('melt-tube')?.classList.toggle('is-squish')
    this.bubble()
    this.renderMelt()
    if (this.melt >= 100) {
      this.music.sfx('hit')
      this.onGood?.()
      this.pop('사르르~')
      setTimeout(() => {
        if (this.phase === 'melt') this.startPour()
      }, 700)
    }
  }

  /** 2. 꾹 누르고 있으면 초코가 나와요. 점선까지 채우기 */
  private startPour() {
    this.phase = 'pour'
    this.renderShell(`
      <p class="choco__hint">칸을 <b>꾹</b> 누르고 있으면 초코가 나와요 · <b>점선</b>까지!</p>
      ${this.moldHtml('p', true)}
    `, `<button type="button" class="choco__action" data-action="next" disabled>다 부었어요 →</button>`)
    this.bindCells((i, e) => {
      e.preventDefault()
      // 꾹 누른 채 손가락이 칸 밖으로 미끄러져도 계속 부어요 (손을 떼면 멈춰요)
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // 이미 끝난 포인터
      }
      this.startPouring(i)
    })
    this.win.body.querySelector('[data-action="next"]')!.addEventListener('click', () => this.startTopping())
    this.renderActions()
  }

  private startPouring(i: number) {
    if (this.phase !== 'pour' || this.levels[i] >= OVER_MAX) return
    this.pouring = i
    this.dripTimer = 0
    this.cell(i)?.classList.add('is-pouring')
  }

  private stopPouring() {
    if (this.pouring < 0) return
    const i = this.pouring
    this.pouring = -1
    const cell = this.cell(i)
    cell?.classList.remove('is-pouring')
    const level = this.levels[i]
    if (level >= GOOD_MIN && level <= GOOD_MAX) {
      this.music.sfx('hit')
      this.onGood?.()
    }
    this.renderCell(i)
  }

  /** 3. 토핑을 고르고 초코를 톡톡 */
  private startTopping() {
    this.stopPouring()
    this.phase = 'topping'
    this.renderShell(`
      <p class="choco__hint">토핑을 고르고 초코를 <b>톡톡</b> 눌러서 올려요</p>
      ${this.moldHtml('t', true)}
      <div class="choco__jars">
        ${TOPPING_KINDS.map(
          (k) => `<button type="button" class="choco__jar" data-topping="${k}"><svg viewBox="0 0 60 60" aria-hidden="true">${jarArt(k)}</svg><span>${TOPPING[k]}</span></button>`,
        ).join('')}
      </div>
    `, `<button type="button" class="choco__action" data-action="next" disabled>냉장고에 넣기 →</button>`)
    this.win.body.querySelectorAll<HTMLButtonElement>('[data-topping]').forEach((button) => {
      button.addEventListener('click', () => {
        this.topping = button.dataset.topping as ToppingKind
        this.win.body.querySelectorAll('[data-topping]').forEach((b) => b.classList.toggle('is-picked', b === button))
      })
    })
    this.bindCells((i, e) => {
      e.preventDefault()
      this.sprinkle(i)
    })
    this.win.body.querySelector('[data-action="next"]')!.addEventListener('click', () => this.startFreeze())
    this.renderActions()
  }

  private sprinkle(i: number) {
    if (this.phase !== 'topping') return
    if (!this.topping) {
      this.flashHint('먼저 아래에서 토핑을 골라요!')
      return
    }
    if (this.levels[i] <= 0) return
    const pieces = this.toppings[i]
    if (pieces.length >= TOPPING_MAX) return
    const { top, bottom } = SHAPES[MOLD[i]]
    const surface = bottom - (bottom - top) * Math.min(this.levels[i], 1)
    const count = this.topping === 'sprinkle' ? 3 : 2
    for (let n = 0; n < count && pieces.length < TOPPING_MAX; n++) {
      pieces.push({
        kind: this.topping,
        x: 28 + Math.random() * 44,
        y: surface + 6 + Math.random() * Math.max(bottom - surface - 16, 2),
        rotate: Math.random() * 360,
        color: this.topping === 'sprinkle' ? pick(SPRINKLE_COLORS) : pick(CANDY_COLORS),
      })
    }
    this.music.sfx('click')
    this.onWork?.()
    this.renderCell(i)
    this.renderActions()
  }

  /** 4. 냉장고에 넣고 꽁꽁 얼기를 기다려요 (너무 빨리 꺼내면 덜 얼어요) */
  private startFreeze() {
    this.phase = 'freeze'
    this.freeze = 0
    this.renderShell(`
      <p class="choco__hint">꽁꽁 얼 때까지 기다렸다가 꺼내요</p>
      <div class="choco__fridge">${this.fridgeHtml()}</div>
      <div class="choco__meter"><span>❄️ 꽁꽁 지수</span><div class="dish__progress choco__frost"><i data-ref="freeze"></i></div><b data-ref="freeze-text">0%</b></div>
    `, `<button type="button" class="choco__action" data-action="next">꺼내기!</button>`)
    this.win.body.querySelector('[data-action="next"]')!.addEventListener('click', () => this.finish(true))
    this.music.sfx('open')
    this.renderFreeze()
  }

  private finish(done: boolean) {
    this.phase = 'result'
    this.pouring = -1
    this.music.stop()
    const result = this.score()
    this.music.sfx(done && result.total >= 60 ? 'clear' : 'miss')
    const best = done ? this.saveBest(result.total) : this.readBest()
    const isBest = done && result.total > 0 && best === result.total
    const stars = result.total >= 85 ? 3 : result.total >= 60 ? 2 : 1
    const title = !done ? '앗, 시간이 다 됐어요' : stars === 3 ? '완벽한 얼초 완성! ✨' : stars === 2 ? '맛있는 얼초 완성!' : '조금 아쉬운 얼초…'
    this.win.body.innerHTML = `
      <div class="tresult">
        <div class="tresult__card choco__result">
          <p class="tresult__title">${title}${isBest ? ' <mark>최고 점수 🎉</mark>' : ''}</p>
          ${done ? `<div class="choco__result-tray">${this.moldHtml('r', true)}</div><p class="choco__stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></p>` : ''}
          <div class="tresult__lines">
            <div class="tresult__line"><span>주문한 초코</span><b>${this.choco === this.order.choco ? '딱 맞아요' : '달라요'}</b></div>
            <div class="tresult__line"><span>붓기 정확도</span><b>${result.pour}%</b></div>
            <div class="tresult__line"><span>점수</span><b>${done ? `${result.total}점` : '-'}</b></div>
            <div class="tresult__line"><span>최고 점수</span><b>${best ? `${best}점` : '-'}</b></div>
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

  /** 초코 맞춤 20 + 붓기 50 + 토핑 20 + 얼리기 10 = 100점 */
  private score() {
    const pourRatios = this.levels.map((level) => {
      if (level >= GOOD_MIN && level <= GOOD_MAX) return 1
      if (level < GOOD_MIN) return (level / GOOD_MIN) * 0.8
      return Math.max(0.3, 1 - (level - GOOD_MAX) * 3.5)
    })
    const pour = pourRatios.reduce((a, b) => a + b, 0) / pourRatios.length
    const topping =
      this.toppings
        .map((pieces): number => {
          const ordered = pieces.filter((p) => p.kind === this.order.topping).length
          if (!ordered) return 0
          return ordered === pieces.length ? 1 : 0.6
        })
        .reduce((a, b) => a + b, 0) / this.toppings.length
    const color = this.choco === this.order.choco ? 1 : 0
    const total = Math.round(color * 20 + pour * 50 + topping * 20 + this.freeze * 10)
    return { total, pour: Math.round(pour * 100) }
  }

  // ---------- 화면 ----------

  /** 게임 중 공통 틀: 위 단계 표시 · 주문서, 가운데 장면, 아래 시간 막대 · 다음 버튼 */
  private renderShell(scene: string, action: string) {
    const steps = ['녹이기', '붓기', '토핑', '얼리기']
    const now = ['melt', 'pour', 'topping', 'freeze'].indexOf(this.phase)
    this.win.body.innerHTML = `
      <div class="dish choco">
        <div class="choco__top">
          <ol class="choco__steps">
            ${steps.map((s, i) => `<li class="${i < now ? 'is-done' : i === now ? 'is-now' : ''}"><i>${i < now ? '✓' : i + 1}</i>${s}</li>`).join('')}
          </ol>
          <p class="choco__order"><span>주문</span> ${CHOCO[this.order.choco].name} + ${TOPPING[this.order.topping]}</p>
        </div>
        <div class="choco__scene" data-ref="scene">${scene}</div>
        <div class="dish__bottom choco__bottom">
          <span class="dish__clock" aria-hidden="true">⏰</span>
          <div class="dish__time"><i data-ref="time"></i></div>
          ${action}
        </div>
      </div>
    `
    ;(document.activeElement as HTMLElement | null)?.blur()
    this.renderTime()
  }

  /** 초콜릿 틀 4칸. live면 칸마다 붓는 튜브 · 상태 글씨가 붙어요 */
  private moldHtml(prefix: string, live = false) {
    return `
      <div class="choco__mold">
        ${MOLD.map(
          (_, i) => `
          <div class="choco__cell" data-cell="${i}">
            ${live ? `<span class="choco__pourer" style="color:${CHOCO[this.choco ?? 'milk'].color}" aria-hidden="true"><span class="choco__tube">${tubeArt(CHOCO[this.choco ?? 'milk'].color)}</span><i class="choco__stream"></i></span>` : ''}
            <svg viewBox="-8 -8 116 116" data-art>${this.cellSvg(prefix, i)}</svg>
            ${live ? `<span class="choco__cell-note" data-note></span>` : ''}
          </div>`,
        ).join('')}
      </div>`
  }

  /** 틀 한 칸 그림: 테두리 → 빈 홈 → (모양으로 자른) 초코 · 토핑 → 점선 → 넘친 초코 */
  private cellSvg(prefix: string, i: number) {
    const kind = MOLD[i]
    const { top, bottom } = SHAPES[kind]
    const level = this.levels[i]
    const fill = Math.min(level, 1)
    const surface = bottom - (bottom - top) * fill
    const target = bottom - (bottom - top) * ((GOOD_MIN + GOOD_MAX) / 2)
    const choco = CHOCO[this.choco ?? 'milk']
    const frozen = this.phase === 'result' || (this.phase === 'freeze' && this.freeze >= 1)
    const spill = Math.max(level - GOOD_MAX, 0) / (OVER_MAX - GOOD_MAX)
    const id = `choco-${prefix}-${i}`
    return `
      <defs>
        <clipPath id="${id}">${shapeEls(kind, '')}</clipPath>
        <clipPath id="${id}-f"><rect x="-8" y="${surface.toFixed(1)}" width="116" height="116" /></clipPath>
      </defs>
      ${shapeEls(kind, 'fill="#ffdbe4" stroke="#ffdbe4" stroke-width="12" stroke-linejoin="round"')}
      ${shapeEls(kind, 'fill="#fff4f7"')}
      <g clip-path="url(#${id})">
        <rect x="-8" y="${surface.toFixed(1)}" width="116" height="${(bottom - surface + 8).toFixed(1)}" fill="${choco.color}" />
        ${fill > 0 ? `<rect x="-8" y="${surface.toFixed(1)}" width="116" height="3" fill="#fff" opacity=".35" />` : ''}
        ${frozen && fill > 0 ? `<ellipse cx="34" cy="${(surface + 14).toFixed(1)}" rx="9" ry="4" fill="#fff" opacity=".55" transform="rotate(-25 34 ${(surface + 14).toFixed(1)})" />` : ''}
        <g clip-path="url(#${id}-f)">${this.toppings[i].map(pieceSvg).join('')}</g>
        ${level > 0 ? '' : `<line x1="-8" x2="108" y1="${target.toFixed(1)}" y2="${target.toFixed(1)}" stroke="#f4a9bb" stroke-width="2" stroke-dasharray="5 5" />`}
      </g>
      ${level > 0 && this.phase === 'pour' ? `<line x1="2" x2="98" y1="${target.toFixed(1)}" y2="${target.toFixed(1)}" stroke="${level > GOOD_MAX ? '#ec6a52' : '#e98aa3'}" stroke-width="2" stroke-dasharray="5 5" opacity=".9" />` : ''}
      ${spill > 0 ? `<g fill="${choco.color}" opacity="${(0.4 + spill * 0.6).toFixed(2)}">
        <ellipse cx="20" cy="${bottom - 4}" rx="${(4 + spill * 10).toFixed(1)}" ry="${(3 + spill * 5).toFixed(1)}" />
        <ellipse cx="84" cy="${bottom - 10}" rx="${(3 + spill * 9).toFixed(1)}" ry="${(3 + spill * 4).toFixed(1)}" />
        <ellipse cx="54" cy="${bottom + 4}" rx="${(5 + spill * 14).toFixed(1)}" ry="${(2 + spill * 4).toFixed(1)}" />
      </g>` : ''}`
  }

  private renderCell(i: number) {
    const cell = this.cell(i)
    const art = cell?.querySelector('[data-art]')
    if (!cell || !art) return
    art.innerHTML = this.cellSvg(this.phase[0], i)
    const note = cell.querySelector('[data-note]')
    if (!note) return
    const level = this.levels[i]
    let text = ''
    let mood = ''
    if (this.phase === 'pour' && level > 0) {
      if (level > GOOD_MAX) [text, mood] = ['넘쳤어요!', 'bad']
      else if (level >= GOOD_MIN) [text, mood] = ['딱 좋아요!', 'good']
      else [text, mood] = ['조금 더', '']
    } else if (this.phase === 'topping') {
      const count = this.toppings[i].length
      text = count ? `토핑 ${count}개` : ''
      mood = count ? 'good' : ''
    }
    note.textContent = text
    note.className = `choco__cell-note${mood ? ` is-${mood}` : ''}`
  }

  /** 다음 단계 버튼: 4칸 모두 조금이라도 붓거나 · 토핑을 올려야 눌려요 */
  private renderActions() {
    const next = this.win.body.querySelector<HTMLButtonElement>('[data-action="next"]')
    if (!next) return
    if (this.phase === 'pour') next.disabled = this.levels.some((l) => l < 0.3)
    if (this.phase === 'topping') next.disabled = this.toppings.some((p) => p.length === 0)
  }

  private renderMelt() {
    const bar = this.ref('melt')
    if (bar) bar.style.width = `${this.melt}%`
    const text = this.ref('melt-text')
    if (text) text.textContent = `${Math.round(this.melt)}%`
    const tube = this.ref('melt-tube')
    tube?.style.setProperty('--melt', String(this.melt / 100))
  }

  private renderFreeze() {
    const bar = this.ref('freeze')
    if (bar) bar.style.width = `${this.freeze * 100}%`
    const text = this.ref('freeze-text')
    if (text) text.textContent = `${Math.round(this.freeze * 100)}%`
    const fridge = this.win.body.querySelector<HTMLElement>('.choco__fridge')
    fridge?.style.setProperty('--frost', String(this.freeze))
    const next = this.win.body.querySelector<HTMLButtonElement>('[data-action="next"]')
    next?.classList.toggle('is-ready', this.freeze >= 1)
  }

  private renderTime() {
    const bar = this.ref('time')
    if (!bar) return
    const ratio = this.timeLeft / TIME_LIMIT
    bar.style.width = `${ratio * 100}%`
    bar.classList.toggle('is-hurry', ratio < 0.25)
  }

  /** 냉장고 안 선반에 얼초 틀이 들어가 있어요. 꽁꽁 지수만큼 서리가 껴요 */
  private fridgeHtml() {
    const choco = CHOCO[this.choco ?? 'milk']
    return `
      <svg viewBox="0 0 260 240" aria-hidden="true">
        <rect x="40" y="8" width="180" height="226" rx="26" fill="#fff0bf" />
        <rect x="56" y="24" width="148" height="194" rx="16" fill="#e6f5fc" />
        <rect x="56" y="24" width="148" height="194" rx="16" fill="#fff" class="choco__fridge-frost" />
        <rect x="60" y="78" width="140" height="6" rx="3" fill="#cfe9f6" />
        <rect x="60" y="160" width="140" height="6" rx="3" fill="#cfe9f6" />
        <rect x="74" y="44" width="30" height="34" rx="6" fill="#ffd977" /><rect x="80" y="38" width="18" height="8" rx="3" fill="#f2b544" />
        <rect x="150" y="54" width="36" height="24" rx="8" fill="#bfe6d4" />
        <circle cx="96" cy="150" r="10" fill="#ffb3a7" /><circle cx="114" cy="152" r="8" fill="#ff9fb2" />
        <g class="choco__fridge-tray">
          <rect x="84" y="116" width="92" height="34" rx="10" fill="#fff" stroke="#ffdbe4" stroke-width="4" />
          ${[0, 1, 2, 3].map((i) => `<circle cx="${98 + i * 21.3}" cy="133" r="8" fill="${choco.color}" />`).join('')}
        </g>
        <path d="M40 34 L6 14 L6 230 L40 222 Z" fill="#ffe7a3" />
        <rect x="14" y="70" width="6" height="60" rx="3" fill="#a8754d" />
        <g class="choco__snow" fill="#fff">
          <circle cx="80" cy="100" r="3" /><circle cx="160" cy="96" r="2.5" /><circle cx="120" cy="190" r="3" /><circle cx="180" cy="186" r="2" /><circle cx="70" cy="196" r="2" />
        </g>
      </svg>
      <span class="choco__flake" style="left:30%;animation-delay:-0.4s">❄</span>
      <span class="choco__flake" style="left:58%;animation-delay:-1.3s">❄</span>
      <span class="choco__flake" style="left:72%;animation-delay:-2.1s">❄</span>`
  }

  private bindCells(onDown: (i: number, e: PointerEvent) => void) {
    this.win.body.querySelectorAll<HTMLElement>('[data-cell]').forEach((cell) => {
      const i = Number(cell.dataset.cell)
      cell.addEventListener('pointerdown', (e) => onDown(i, e))
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        cell.addEventListener(type, () => {
          if (this.pouring === i) this.stopPouring()
        })
      }
    })
  }

  private flashHint(text: string) {
    const hint = this.win.body.querySelector<HTMLElement>('.choco__hint')
    if (!hint || hint.classList.contains('is-warn')) return
    const original = hint.innerHTML
    hint.textContent = text
    hint.classList.add('is-warn')
    this.music.sfx('miss')
    setTimeout(() => {
      hint.innerHTML = original
      hint.classList.remove('is-warn')
    }, 1100)
  }

  /** 주무르면 따뜻한 김이 퐁 */
  private bubble() {
    const scene = this.ref('scene')
    if (!scene) return
    const bubble = document.createElement('span')
    bubble.className = 'dish__bubble'
    bubble.style.left = `${38 + Math.random() * 24}%`
    bubble.style.top = `${30 + Math.random() * 30}%`
    bubble.style.setProperty('--size', `${0.8 + Math.random() * 1.2}em`)
    scene.appendChild(bubble)
    setTimeout(() => bubble.remove(), 700)
  }

  private pop(text: string) {
    const scene = this.ref('scene')
    if (!scene) return
    const el = document.createElement('span')
    el.className = 'dish__pop'
    el.textContent = text
    scene.appendChild(el)
    setTimeout(() => el.remove(), 800)
  }

  private ref(name: string) {
    return this.win.body.querySelector<HTMLElement>(`[data-ref="${name}"]`)
  }

  private cell(i: number) {
    return this.win.body.querySelector<HTMLElement>(`[data-cell="${i}"]`)
  }

  // ---------- 최고 점수 (이 브라우저에만 저장) ----------

  private readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0
    } catch {
      return 0
    }
  }

  private saveBest(score: number) {
    const best = this.readBest()
    if (best >= score) return best
    try {
      localStorage.setItem(BEST_KEY, String(score))
    } catch {
      // 저장소를 못 쓰면 이번 기록만
    }
    return score
  }
}

/** 얼초 짜는 튜브: 버터색 뚜껑 · 하얀 봉지 · 안에 초코색 (뚜껑이 위) */
function tubeArt(color: string) {
  return `<svg viewBox="0 0 60 120" aria-hidden="true">
    <rect x="20" y="0" width="20" height="16" rx="6" fill="#f2c58c"/>
    <path d="M8 16 h44 l-4 94 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8z" fill="#fff"/>
    <path d="M13 40 h34 l-3 66 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6z" fill="${color}"/>
    <rect x="12" y="22" width="36" height="10" rx="5" fill="#ffe08a"/>
    <ellipse cx="20" cy="74" rx="3" ry="18" fill="#fff" opacity=".45"/>
  </svg>`
}

/** 녹이는 튜브: 딱딱한 초코 덩어리가 --melt 만큼 사르르 매끈해져요 */
function meltTubeArt({ color, shade }: { color: string; shade: string }) {
  return `<svg viewBox="0 0 60 120" aria-hidden="true">
    <rect x="20" y="0" width="20" height="16" rx="6" fill="#f2c58c"/>
    <path d="M8 16 h44 l-4 94 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8z" fill="#fff"/>
    <path class="choco__melted" d="M13 40 h34 l-3 66 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6z" fill="${color}"/>
    <g class="choco__chunks" fill="${shade}">
      <rect x="14" y="44" width="14" height="12" rx="3"/><rect x="31" y="46" width="14" height="13" rx="3"/>
      <rect x="15" y="60" width="13" height="14" rx="3"/><rect x="31" y="63" width="13" height="12" rx="3"/>
      <rect x="16" y="78" width="13" height="13" rx="3"/><rect x="31" y="80" width="12" height="13" rx="3"/>
      <rect x="18" y="95" width="11" height="12" rx="3"/><rect x="31" y="96" width="11" height="11" rx="3"/>
    </g>
    <rect x="12" y="22" width="36" height="10" rx="5" fill="#ffe08a"/>
    <ellipse cx="20" cy="74" rx="3" ry="18" fill="#fff" opacity=".45"/>
  </svg>`
}

/** 토핑 한 알 */
function pieceSvg(p: Piece) {
  const at = `transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rotate.toFixed(0)})"`
  if (p.kind === 'sprinkle') return `<rect x="-5" y="-1.7" width="10" height="3.4" rx="1.7" fill="${p.color}" ${at}/>`
  if (p.kind === 'almond') return `<g ${at}><ellipse rx="6" ry="3.6" fill="#d9a066"/><path d="M-3 -0.5 Q0 -2 3 -0.5" stroke="#b9824b" stroke-width="1" fill="none"/></g>`
  return `<path d="${starPath(0, 0, 5, 2.6)}" fill="${p.color}" stroke="#fff" stroke-width=".8" stroke-linejoin="round" ${at}/>`
}

/** 토핑 병: 유리병 안에 토핑이 소복이 */
function jarArt(kind: ToppingKind) {
  const pieces: Piece[] = Array.from({ length: kind === 'sprinkle' ? 9 : 6 }, (_, i) => ({
    kind,
    x: 18 + (i % 3) * 12 + (Math.floor(i / 3) % 2) * 5,
    y: 34 + Math.floor(i / 3) * 7,
    rotate: (i * 67) % 360,
    color: kind === 'sprinkle' ? SPRINKLE_COLORS[i % SPRINKLE_COLORS.length] : CANDY_COLORS[i % CANDY_COLORS.length],
  }))
  return `
    <rect x="14" y="4" width="32" height="9" rx="4" fill="#f2c58c"/>
    <rect x="10" y="12" width="40" height="44" rx="10" fill="#eef8fd"/>
    ${pieces.map(pieceSvg).join('')}
    <rect x="15" y="17" width="5" height="20" rx="2.5" fill="#fff" opacity=".8"/>`
}
