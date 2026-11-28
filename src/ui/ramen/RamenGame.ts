import './ramen.css'
import type { Chiptune } from '../Chiptune'
import { RetroWindow } from '../RetroWindow'
import * as A from './art'
import { NICKNAME_MAX, RANK_LIMIT, limitNickname, rankingEnabled, rememberNickname, savedNickname, submitMessage } from '../typing/ranking'
import { celebrateChampion, championBefore, showChampionNote } from '../champion'
import { RAMEN_BOARD, fetchRamenTop, ramenBetter, submitRamenScore, type RamenScore } from './ranking'

/** 제한 시간(초) */
const TIME_LIMIT = 300
/** 모아야 하는 돈 */
const GOAL = 10000
/** 탄 냄비를 바꿀 여분 냄비 수 */
const SPARES = 2
/** 물을 부은 뒤 보글보글 끓기까지 */
const BOIL_TIME = 6
/** 끓는 물에 면을 넣고 꼬들꼬들해지기까지 */
const COOK_TIME = 10
/** 꼬들꼬들(반짝) → 퍼짐 → 빨갛게 → 덜덜 → 까맣게 (각 단계 길이, 초) */
const PERFECT_TIME = 6
const SOGGY_TIME = 6
const RED_TIME = 4
const SHAKE_TIME = 4
/** 한 그릇 값: 면 300 + 스프 300 + 파 200 + 계란 200 = 1,000원 */
const PRICE = { noodle: 300, soup: 300, onion: 200, egg: 200 }
/** 쟁반에 올린 뒤 리액션 카드가 떠 있는 시간(ms) */
const REACT_MS = 1600
/** 주전자로 물을 붓는 연출 시간(초) */
const POUR_TIME = 0.7
const BEST_KEY = 'tiny-room-ramen-best'

type Phase = 'intro' | 'playing' | 'over'
type Stage = 'none' | 'raw' | 'perfect' | 'soggy' | 'red' | 'shake' | 'burnt'
type Ingredient = 'noodle' | 'soup' | 'onion' | 'egg'
/** 집어 드는 것: 선반 재료 · 주전자 · 여분 냄비 · 화구 위 냄비(번호) */
type Source = Ingredient | 'kettle' | 'spare' | number
type Target = { kind: 'pot'; i: number } | { kind: 'tray' }

interface Pot {
  water: boolean
  /** 물을 부은 뒤 지난 시간 (BOIL_TIME이 넘으면 보글보글) */
  heat: number
  noodles: boolean
  soup: boolean
  onion: boolean
  egg: boolean
  /** 끓는 물에서 면이 익은 시간 */
  cook: number
  /** 냄비마다 불 세기가 조금씩 달라요 */
  speed: number
  burnt: boolean
  /** 물 붓는 연출 남은 시간 */
  pour: number
  /** "안 돼요" 도리도리 남은 시간 */
  no: number
  /** 마지막으로 그린 모습 (바뀔 때만 다시 그려요) */
  key: string
}

interface Layout {
  W: number
  H: number
  wallY: number
  pots: [number, number][]
  ps: number
  shelf: Record<Ingredient, [number, number, number]>
  labels: boolean
  hud: { x: number; y: number; w: number; h: number; barX: number; timeEnd: number; moneyEnd: number }
  kettle: [number, number, number]
  tray: { x: number; y: number; w: number; h: number }
  trayPot: [number, number, number]
  spares: { label: [number, number]; anchor: 'start' | 'end'; xs: number[]; y: number; s: number }
}

const LANDSCAPE: Layout = {
  W: 1600,
  H: 1000,
  wallY: 420,
  pots: [
    [480, 500],
    [920, 500],
    [330, 790],
    [790, 790],
  ],
  ps: 0.92,
  shelf: { noodle: [160, 182, 0.9], soup: [370, 180, 0.85], onion: [560, 196, 1], egg: [770, 190, 0.92] },
  labels: true,
  hud: { x: 960, y: 34, w: 620, h: 130, barX: 1110, timeEnd: 1460, moneyEnd: 1290 },
  kettle: [1290, 700, 0.8],
  tray: { x: 1480, y: 520, w: 220, h: 360 },
  trayPot: [1546, 606, 0.3],
  spares: { label: [1376, 972], anchor: 'end', xs: [1440, 1520], y: 962, s: 0.15 },
}

const PORTRAIT: Layout = {
  W: 740,
  H: 1510,
  wallY: 500,
  pots: [
    [240, 620],
    [560, 620],
    [180, 920],
    [500, 920],
  ],
  ps: 0.66,
  shelf: { noodle: [104, 318, 0.66], soup: [268, 318, 0.6], onion: [432, 330, 0.74], egg: [636, 322, 0.68] },
  labels: false,
  hud: { x: 16, y: 14, w: 708, h: 118, barX: 170, timeEnd: 560, moneyEnd: 440 },
  kettle: [500, 1300, 0.66],
  tray: { x: -40, y: 1150, w: 250, h: 230 },
  trayPot: [90, 1250, 0.36],
  spares: { label: [24, 1488], anchor: 'start', xs: [188, 262], y: 1476, s: 0.14 },
}

const INGREDIENT_ART: Record<Ingredient, () => string> = {
  noodle: A.shelfNoodle,
  soup: A.shelfSoup,
  onion: A.shelfOnion,
  egg: A.shelfEggs,
}
const INGREDIENT_NAME: Record<Ingredient, string> = { noodle: '라면', soup: '스프', onion: '파', egg: '계란' }

/** 리액션 카드 (쟁반에 올리면 주전자 사장님이 맛봐요) */
interface Reaction {
  tone: 'good' | 'meh' | 'bad'
  tag: string
  face: A.KettleFace
  line: string
  price: number | null
  was?: number
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const minSec = (sec: number) => {
  const s = Math.round(sec)
  return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`
}

function newPot(): Pot {
  return { water: false, heat: 0, noodles: false, soup: false, onion: false, egg: false, cook: 0, speed: 0.9 + Math.random() * 0.25, burnt: false, pour: 0, no: 0, key: '' }
}

function stageOf(p: Pot): Stage {
  if (p.burnt) return 'burnt'
  if (!p.noodles) return 'none'
  let t = p.cook - COOK_TIME
  if (t < 0) return 'raw'
  if ((t -= PERFECT_TIME) < 0) return 'perfect'
  if ((t -= SOGGY_TIME) < 0) return 'soggy'
  if ((t -= RED_TIME) < 0) return 'red'
  if ((t -= SHAKE_TIME) < 0) return 'shake'
  return 'burnt'
}

const boiling = (p: Pot) => p.water && p.heat >= BOIL_TIME

/** 냄비 안 (국물 · 면 · 파 · 계란 · 거품) */
function potContent(p: Pot, stage: Stage) {
  if (!p.water) return ''
  const look: A.NoodleLook = stage === 'burnt' ? 'burnt' : stage === 'soggy' || stage === 'red' || stage === 'shake' ? 'soggy' : 'fresh'
  let c = ''
  if (stage === 'none') c += A.brothFill(p.soup ? 'broth' : 'water')
  else if (stage === 'burnt') c += A.brothFill('burnt')
  else if (stage === 'soggy') c += A.brothFill('soggy')
  else c += A.brothFill(p.soup ? 'broth' : 'plain')
  if (stage === 'raw') c += `<g class="rm-loose" opacity="0">${A.looseNoodles('fresh')}</g><g class="rm-block">${A.noodleBlock()}</g>`
  else if (stage !== 'none') c += A.looseNoodles(look)
  if (p.onion) c += A.onionTopping(look)
  if (p.egg) c += A.eggTopping(look)
  if (boiling(p) && (stage === 'none' || stage === 'raw')) c += A.bubbles()
  return c
}

/** 냄비 한 개 그림 (불 · 김 · 반짝 · 덜덜 포함) */
function potArt(p: Pot, stage: Stage, withFire = true) {
  const color: A.PotColor = stage === 'burnt' ? 'k' : stage === 'red' || stage === 'shake' ? 'r' : 'y'
  const inner = `${A.potHandles(color)}${A.potBody(color)}${A.potRim(color)}<g clip-path="url(#rm-inner)">${potContent(p, stage)}</g>`
  const shaking = stage === 'shake'
  const fx =
    (stage === 'perfect' ? A.sparkles() : '') +
    (stage === 'soggy' || stage === 'red' || shaking ? A.steam() : '') +
    (stage === 'burnt' ? A.steam(true) : '') +
    (shaking ? A.shakeMarks() : '') +
    (p.pour > 0 ? A.waterStream() : '')
  return `${withFire ? A.burnerPlate() : '<ellipse cx="0" cy="222" rx="150" ry="24" fill="#e6cf9f" opacity=".55" />'}
    <g class="rm-pot__wiggle${shaking ? ' is-shaking' : ''}">${shaking ? `<g opacity="0.28" transform="translate(-16 -4)">${inner}</g>` : ''}${inner}</g>
    ${withFire && stage !== 'burnt' ? A.flames() : ''}${fx}`
}

/** 결과 · 인트로 · 리액션에 쓰는 작은 냄비 그림 */
function potSvg(p: Partial<Pot>, stage: Stage, vb = '-240 -140 480 400') {
  return `<svg viewBox="${vb}" aria-hidden="true">${potArt({ ...newPot(), water: true, heat: BOIL_TIME, ...p }, stage, false)}</svg>`
}
const kettleSvg = (face: A.KettleFace) => `<svg viewBox="-280 -320 520 590" aria-hidden="true">${A.kettle(face)}</svg>`

/**
 * 가스레인지에서 여는 라면 끓이기 게임 (꼬들라면 끓이기.app).
 * 주전자로 냄비에 물 붓기 → 물이 끓으면 라면 · 스프 → 파 · 계란 → 꼬들꼬들(반짝)할 때 쟁반으로.
 * 5분 안에 10,000원을 모으면 성공 (걸린 시간으로 빨리 끓이기 랭킹), 못 모으면 설거지 당번.
 * 너무 오래 끓이면 면이 퍼지고 → 냄비가 빨개지고 → 덜덜 떨다가 → 까맣게 타서 불이 꺼져요 (여분 냄비로 바꿔요).
 * 재료는 끌어다 놓거나, 톡 눌러 집은 뒤 냄비를 톡 눌러도 돼요.
 */
export class RamenGame {
  /** 재료를 넣거나 냄비를 옮길 때 (캐릭터가 휘휘 저어요) */
  onWork: (() => void) | null = null
  /** 맛있는 라면을 팔았을 때 (캐릭터가 웃어요) */
  onGood: (() => void) | null = null
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  private phase: Phase = 'intro'
  private pots: Pot[] = []
  private spares = SPARES
  private money = 0
  private bowls = 0
  private bestBowls = 0
  private elapsed = 0
  private failReason: 'time' | 'burnt' = 'time'

  private root: HTMLElement | null = null
  private svg: SVGSVGElement | null = null
  private layout: Layout = LANDSCAPE
  private resizeObserver: ResizeObserver | null = null
  private drag: { src: Source; x: number; y: number; moved: boolean } | null = null
  private held: Source | null = null
  private reactTimer = 0
  private finishTimer = 0
  private trayTimer = 0

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '꼬들라면 끓이기.app', '꼬들라면 끓이기 게임')
    this.win.onClose = () => {
      this.stopTimers()
      this.resizeObserver?.disconnect()
      this.onClose?.()
    }
    A.ensureRamenDefs()
  }

  get isOpen() {
    return this.win.isOpen
  }

  open() {
    if (this.win.isOpen) return
    this.win.open()
    this.showIntro()
  }

  close() {
    this.win.close()
  }

  update(dt: number) {
    if (!this.win.isOpen || this.phase !== 'playing') return
    this.elapsed += dt
    for (let i = 0; i < this.pots.length; i++) this.stepPot(this.pots[i], dt)
    this.renderPots()
    this.renderHud()
    if (this.elapsed >= TIME_LIMIT) {
      this.failReason = 'time'
      this.finish(false)
    } else if (this.spares === 0 && this.pots.every((p) => p.burnt)) {
      this.failReason = 'burnt'
      this.finish(false)
    }
  }

  // ---------- 진행 ----------

  private reset() {
    this.stopTimers()
    this.pots = Array.from({ length: 4 }, newPot)
    this.spares = SPARES
    this.money = 0
    this.bowls = 0
    this.bestBowls = 0
    this.elapsed = 0
    this.drag = null
    this.held = null
  }

  private stopTimers() {
    window.clearTimeout(this.reactTimer)
    window.clearTimeout(this.finishTimer)
    window.clearTimeout(this.trayTimer)
  }

  private showIntro() {
    this.phase = 'intro'
    this.music.stop()
    this.reset()
    this.mountScene()
    const intro = document.createElement('div')
    intro.className = 'rm-intro'
    intro.innerHTML = `
      <div class="rm-intro__hero" aria-hidden="true">
        <div class="rm-bubble rm-intro__say">오늘 목표는 딱 만 원!<br /><b>꼬들꼬들</b>하게 끓여 볼까요?</div>
        <div class="rm-intro__girl">${A.girl('smile')}</div>
        <div class="rm-intro__pots">${potSvg({}, 'none')}${potSvg({ noodles: true, soup: true, onion: true, egg: true }, 'perfect')}</div>
      </div>
      <div class="rm-card rm-intro__card" role="dialog" aria-label="꼬들라면 게임 방법">
        <p class="rm-intro__title">꼬들라면 가게 오픈!</p>
        <p class="rm-intro__goal"><b>5분</b> 안에 라면을 팔아 <b>10,000원</b> 모으기</p>
        <ol class="rm-steps">
          <li><span>1</span>주전자를 끌어다 냄비에 물 붓기</li>
          <li><span>2</span>물이 보글보글 끓으면 라면 · 스프</li>
          <li><span>3</span>파 · 계란을 올리면 한 그릇 1,000원</li>
          <li><span>4</span>반짝반짝 꼬들꼬들할 때 쟁반으로!</li>
        </ol>
        <div class="rm-warn">
          <span>너무 오래 끓이면</span>
          ${potSvg({ noodles: true, soup: true }, 'soggy', '-250 -150 500 420')}<i>→</i>
          ${potSvg({ noodles: true, soup: true }, 'red', '-250 -150 500 420')}<i>→</i>
          ${potSvg({ noodles: true, soup: true }, 'burnt', '-250 -150 500 420')}
          <small>탄 냄비는 여분 냄비로 바꿔요 · 끌어다 놓거나 톡 집어서 톡</small>
        </div>
        <div class="rm-buttons">
          <button type="button" class="tbutton tbutton--main" data-action="start">시작하기</button>
          ${rankingEnabled() ? '<button type="button" class="tbutton" data-action="ranking">🏆 랭킹 보기</button>' : ''}
        </div>
      </div>
    `
    this.root!.append(intro)
    this.root!.classList.add('is-intro')
    intro.querySelector('[data-action="start"]')!.addEventListener('click', () => this.start())
    intro.querySelector('[data-action="ranking"]')?.addEventListener('click', () => this.openRanking())
    setTimeout(() => intro.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true }), 450)
  }

  private start() {
    this.reset()
    this.phase = 'playing'
    this.root?.querySelector('.rm-intro')?.remove()
    this.root?.querySelector('.rm-rankpop')?.remove()
    this.root?.classList.remove('is-intro')
    this.renderScene()
    this.music.start(150)
  }

  private stepPot(p: Pot, dt: number) {
    p.pour = Math.max(p.pour - dt, 0)
    p.no = Math.max(p.no - dt, 0)
    if (!p.water || p.burnt) return
    const wasBoiling = boiling(p)
    p.heat += dt
    if (!wasBoiling && boiling(p) && !p.noodles) this.music.sfx('tick')
    if (!p.noodles || !boiling(p)) return
    const before = stageOf(p)
    p.cook += dt * p.speed
    const after = stageOf(p)
    if (after === 'burnt') {
      // 까맣게 타면 불이 꺼지고 더는 안 익어요
      p.burnt = true
      this.music.sfx('miss')
      return
    }
    // 단계가 바뀔 때 소리로도 알려줘요
    if (after === before) return
    if (after === 'perfect') this.music.sfx('spin')
    else if (after === 'shake') this.music.sfx('ring')
  }

  // ---------- 집기 · 놓기 ----------

  private canApply(src: Source, target: Target): boolean {
    if (target.kind === 'tray') return typeof src === 'number'
    if (typeof src === 'number') return false
    const p = this.pots[target.i]
    if (src === 'spare') return p.burnt && this.spares > 0
    if (p.burnt) return false
    const stage = stageOf(p)
    switch (src) {
      case 'kettle':
        return !p.water
      case 'noodle':
        return p.water && !p.noodles
      case 'soup':
        return p.water && !p.soup
      case 'onion':
      case 'egg':
        return p.noodles && !p[src] && stage !== 'red' && stage !== 'shake'
    }
    return false
  }

  private apply(src: Source, target: Target) {
    if (!this.canApply(src, target)) {
      if (target.kind === 'pot') {
        this.pots[target.i].no = 0.45
        this.music.sfx('thud')
      }
      return
    }
    if (target.kind === 'tray') {
      this.serve(src as number)
      return
    }
    const p = this.pots[target.i]
    switch (src) {
      case 'kettle':
        p.water = true
        p.heat = 0
        p.pour = POUR_TIME
        this.music.sfx('drip')
        setTimeout(() => this.music.sfx('drip'), 160)
        setTimeout(() => this.music.sfx('drip'), 320)
        break
      case 'spare':
        this.spares--
        this.pots[target.i] = newPot()
        this.music.sfx('clear')
        this.renderSpares()
        break
      case 'noodle':
        p.noodles = true
        p.cook = 0
        this.music.sfx('thud')
        break
      case 'soup':
        p.soup = true
        this.music.sfx('squish')
        break
      default:
        p[src as 'onion' | 'egg'] = true
        this.music.sfx('tick')
    }
    this.onWork?.()
    this.renderPots()
  }

  /** 쟁반에 올리면 주전자 사장님이 맛보고 값을 매겨요 */
  private serve(i: number) {
    const p = this.pots[i]
    const stage = stageOf(p)
    const full = PRICE.noodle + (p.soup ? PRICE.soup : 0) + (p.onion ? PRICE.onion : 0) + (p.egg ? PRICE.egg : 0)
    let reaction: Reaction
    if (stage === 'raw') {
      // 덜 익었으면 안 팔고 냄비는 화구로 그대로
      p.no = 0.45
      this.music.sfx('thud')
      this.react({ tone: 'bad', tag: '덜 익었어요', face: 'shock', line: '아직 덜 익었다잉!', price: null }, p, stage)
      return
    }
    if (stage === 'red' || stage === 'shake') reaction = { tone: 'bad', tag: '못 팔아요', face: 'shock', line: '이걸 팔겠다고?! 버려라!', price: 0 }
    else if (stage === 'soggy') reaction = { tone: 'meh', tag: '퍼졌어요', face: 'frown', line: '면이 다 불었다잉…', price: Math.floor(full / 200) * 100, was: full }
    else if (!p.soup) reaction = { tone: 'meh', tag: '싱거워요', face: 'frown', line: '국물이 맹탕이다잉…', price: full, was: 1000 }
    else if (full < 1000) reaction = { tone: 'good', tag: '맛있어요', face: 'calm', line: '파 · 계란도 올려 보라잉', price: full, was: 1000 }
    else reaction = { tone: 'good', tag: '꼬들꼬들!', face: 'happy', line: '바로 이 맛이다잉!', price: full }

    const price = reaction.price ?? 0
    this.money += price
    if (price > 0) this.bowls++
    if (price >= 1000) this.bestBowls++
    this.music.sfx(reaction.tone === 'good' ? 'clear' : reaction.tone === 'meh' ? 'hit' : 'miss')
    if (reaction.tone === 'good') this.onGood?.()
    this.onWork?.()
    this.react(reaction, p, stage)
    this.showOnTray(p, stage, price)
    // 팔고 나면 냄비는 비워서 화구로 (불은 그대로)
    this.pots[i] = newPot()
    this.renderPots()
    this.renderHud()
    if (this.money >= GOAL) {
      this.phase = 'over'
      this.music.stop()
      this.finishTimer = window.setTimeout(() => this.finish(true), 1200)
    }
  }

  // ---------- 화면: 게임 장면 (SVG 한 장) ----------

  private mountScene() {
    this.win.body.innerHTML = '<div class="rm"></div>'
    this.root = this.win.body.querySelector('.rm')!
    this.root.addEventListener('pointerdown', (e) => this.onDown(e))
    this.root.addEventListener('pointermove', (e) => this.onMove(e))
    this.root.addEventListener('pointerup', (e) => this.onUp(e))
    this.root.addEventListener('pointercancel', () => this.cancelDrag())
    this.resizeObserver?.disconnect()
    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(this.root)
    this.renderScene()
  }

  private renderScene() {
    if (!this.root) return
    const portrait = this.root.clientHeight > this.root.clientWidth * 1.05
    const L = (this.layout = portrait ? PORTRAIT : LANDSCAPE)
    const shelfItems = (Object.keys(L.shelf) as Ingredient[])
      .map((k) => {
        const [x, y, s] = L.shelf[k]
        return `<g class="rm-src" data-src="${k}" transform="translate(${x} ${y}) scale(${s})" role="button" aria-label="${INGREDIENT_NAME[k]}">
          <rect x="-130" y="-90" width="260" height="170" fill="transparent" />${INGREDIENT_ART[k]()}</g>
          ${L.labels ? `<text x="${x}" y="322" text-anchor="middle" font-size="28" fill="#5a4033">${INGREDIENT_NAME[k]}</text>` : ''}`
      })
      .join('')
    const plankY = portrait ? 384 : 252
    const h = L.hud
    const r1 = h.y + h.h * 0.36
    const r2 = h.y + h.h * 0.74
    const bar = (y: number, end: number, ref: string, fill: string) =>
      `<rect x="${h.barX}" y="${y - 10}" width="${end - h.barX}" height="18" rx="9" fill="#efe7dc" /><rect data-ref="${ref}" x="${h.barX}" y="${y - 10}" width="0" height="18" rx="9" fill="${fill}" />`
    const t = L.tray
    this.root.querySelector('.rm-scene')?.remove()
    this.root.insertAdjacentHTML(
      'afterbegin',
      `<svg class="rm-scene" viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid meet">
        <rect x="-3000" y="-3000" width="${L.W + 6000}" height="${L.wallY + 3000}" fill="url(#rm-wall)" />
        <rect x="-3000" y="${L.wallY}" width="${L.W + 6000}" height="3000" fill="url(#rm-counter)" />
        <rect x="-3000" y="${L.wallY - 4}" width="${L.W + 6000}" height="12" fill="#f3e2c2" />
        <rect x="-100" y="${plankY}" width="${portrait ? 940 : 1000}" height="24" rx="8" fill="#ecc994" />
        <rect x="-100" y="${plankY + 22}" width="${portrait ? 940 : 1000}" height="10" fill="#d9b47a" opacity=".5" />
        ${shelfItems}
        <g class="rm-hud">
          <rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="30" fill="#fff" stroke="#eadcc6" stroke-width="3" />
          <text x="${h.x + 26}" y="${r1 + 9}" font-size="27" fill="#5a4033">남은 시간</text>${bar(r1, h.timeEnd, 'time-bar', 'url(#rm-bar-time)')}
          <text data-ref="time" x="${h.x + h.w - 24}" y="${r1 + 10}" text-anchor="end" font-size="30" fill="#5a4033">5:00</text>
          <text x="${h.x + 26}" y="${r2 + 9}" font-size="27" fill="#5a4033">모은 돈</text>${bar(r2, h.moneyEnd, 'money-bar', 'url(#rm-bar-money)')}
          <text data-ref="money" x="${h.x + h.w - 24}" y="${r2 + 10}" text-anchor="end" font-size="30" fill="#e8604c">0 / 10,000원</text>
        </g>
        <g class="rm-tray" data-tray="1">
          <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="22" fill="url(#rm-wood)" />
          <rect x="${t.x + 12}" y="${t.y + 12}" width="${t.w - 24}" height="${t.h - 24}" rx="16" fill="#f3d9ad" opacity=".55" />
          <text x="${portrait ? 88 : 1540}" y="${t.y + t.h / 2 + 10}" text-anchor="middle" font-size="30" fill="#8a6044">쟁반</text>
          <g class="rm-tray__pot" transform="translate(${L.trayPot[0]} ${L.trayPot[1]}) scale(${L.trayPot[2]})"></g>
        </g>
        <g class="rm-src rm-kettle" data-src="kettle" transform="translate(${L.kettle[0]} ${L.kettle[1]}) scale(${L.kettle[2]})" role="button" aria-label="주전자">
          <rect x="-270" y="-320" width="490" height="560" fill="transparent" />${A.kettle()}</g>
        ${L.pots
          .map(
            ([x, y], i) =>
              `<g class="rm-pot" data-pot="${i}" transform="translate(${x} ${y}) scale(${L.ps})"><ellipse cx="0" cy="90" rx="232" ry="190" fill="transparent" /><g class="rm-pot__art"></g></g>`,
          )
          .join('')}
        <text x="${L.spares.label[0]}" y="${L.spares.label[1]}" text-anchor="${L.spares.anchor}" font-size="26" fill="#5a4033">여분 냄비</text>
        ${L.spares.xs.map((x, i) => `<g class="rm-src rm-spare" data-src="spare" data-spare="${i}" transform="translate(${x} ${L.spares.y}) scale(${L.spares.s})"><rect x="-240" y="-120" width="480" height="340" fill="transparent" />${A.sparePot()}</g>`).join('')}
        <g class="rm-coins"></g>
        <g class="rm-ghost"></g>
      </svg>`,
    )
    this.svg = this.root.querySelector('.rm-scene')
    for (const p of this.pots) p.key = ''
    this.fit()
    this.renderPots()
    this.renderSpares()
    this.renderHud()
    this.renderHighlights()
  }

  /** 창 비율에 맞춰 viewBox를 넓혀요 (벽 · 조리대가 창 끝까지). 가로 ↔ 세로가 바뀌면 배치도 바꿔요 */
  private fit() {
    if (!this.root || !this.svg) return
    const w = this.root.clientWidth
    const h = this.root.clientHeight
    if (!w || !h) return
    const portrait = h > w * 1.05
    if ((this.layout === PORTRAIT) !== portrait) {
      this.renderScene()
      return
    }
    const { W, H } = this.layout
    const r = w / h
    if (r > W / H) this.svg.setAttribute('viewBox', `${-(H * r - W) / 2} 0 ${H * r} ${H}`)
    else this.svg.setAttribute('viewBox', `0 ${-(W / r - H) / 2} ${W} ${W / r}`)
  }

  private renderPots() {
    if (!this.svg) return
    this.pots.forEach((p, i) => {
      const group = this.svg!.querySelector<SVGGElement>(`[data-pot="${i}"]`)
      if (!group) return
      const stage = stageOf(p)
      const key = [p.water, boiling(p), p.noodles, p.soup, p.onion, p.egg, stage, p.pour > 0].join()
      const art = group.querySelector<SVGGElement>('.rm-pot__art')!
      if (key !== p.key) {
        p.key = key
        art.innerHTML = potArt(p, stage)
      }
      group.classList.toggle('is-no', p.no > 0)
      group.classList.toggle('is-burnt', p.burnt)
      // 익는 중: 네모난 사리가 점점 풀려요
      if (stage === 'raw') {
        const t = Math.min(p.cook / COOK_TIME, 1)
        art.querySelector('.rm-loose')?.setAttribute('opacity', (t * 0.9).toFixed(2))
        art.querySelector('.rm-block')?.setAttribute('opacity', (1 - t * 0.85).toFixed(2))
      }
    })
  }

  private renderSpares() {
    this.svg?.querySelectorAll<SVGGElement>('[data-spare]').forEach((g) => {
      g.style.display = Number(g.dataset.spare) < this.spares ? '' : 'none'
    })
  }

  private renderHud() {
    if (!this.svg) return
    const L = this.layout.hud
    const left = TIME_LIMIT - this.elapsed
    const timeBar = this.svg.querySelector('[data-ref="time-bar"]')
    const moneyBar = this.svg.querySelector('[data-ref="money-bar"]')
    timeBar?.setAttribute('width', String(Math.max(0, (L.timeEnd - L.barX) * (left / TIME_LIMIT))))
    moneyBar?.setAttribute('width', String((L.moneyEnd - L.barX) * Math.min(this.money / GOAL, 1)))
    const time = this.svg.querySelector('[data-ref="time"]')
    if (time) {
      time.textContent = clock(left)
      time.setAttribute('fill', left <= 30 ? '#e8604c' : '#5a4033')
    }
    const money = this.svg.querySelector('[data-ref="money"]')
    if (money) money.textContent = `${this.money.toLocaleString('ko-KR')} / 10,000원`
  }

  /** 집어 든 것을 놓을 수 있는 곳을 반짝 */
  private renderHighlights(over: Target | null = null) {
    if (!this.svg) return
    const src = this.drag?.src ?? this.held
    this.svg.querySelectorAll<SVGGElement>('[data-pot]').forEach((g) => {
      const i = Number(g.dataset.pot)
      const target: Target = { kind: 'pot', i }
      g.classList.toggle('is-target', src !== null && src !== undefined && this.canApply(src, target))
      g.classList.toggle('is-over', over?.kind === 'pot' && over.i === i)
    })
    const tray = this.svg.querySelector('.rm-tray')
    tray?.classList.toggle('is-target', typeof src === 'number')
    tray?.classList.toggle('is-over', over?.kind === 'tray')
    this.svg.querySelectorAll<SVGGElement>('[data-src]').forEach((g) => {
      const name = g.dataset.src
      g.classList.toggle('is-held', this.held !== null && name === String(this.held) && (name !== 'spare' || g.dataset.spare === String(this.spares - 1)))
    })
    this.svg.querySelectorAll<SVGGElement>('[data-pot]').forEach((g) => g.classList.toggle('is-held', this.held === Number(g.dataset.pot)))
  }

  // ---------- 포인터 ----------

  private toSvg(e: PointerEvent) {
    const m = this.svg?.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  private targetAt(x: number, y: number): Target | null {
    const L = this.layout
    const t = L.tray
    if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return { kind: 'tray' }
    let best: Target | null = null
    let bestD = Infinity
    L.pots.forEach(([px, py], i) => {
      const dx = (x - px) / (240 * L.ps)
      const dy = (y - (py + 80 * L.ps)) / (200 * L.ps)
      const d = dx * dx + dy * dy
      if (d < 1 && d < bestD) {
        bestD = d
        best = { kind: 'pot', i }
      }
    })
    return best
  }

  private sourceOf(el: Element | null): Source | null {
    const src = el?.closest<SVGGElement>('[data-src]')?.dataset.src
    if (src) return src as Source
    const pot = el?.closest<SVGGElement>('[data-pot]')?.dataset.pot
    if (pot === undefined) return null
    const p = this.pots[Number(pot)]
    return p.noodles && !p.burnt ? Number(pot) : null
  }

  private onDown(e: PointerEvent) {
    if (this.phase !== 'playing' || !this.svg || !e.isPrimary) return
    const target = e.target as Element
    if (!this.svg.contains(target)) return
    e.preventDefault()
    const pt = this.toSvg(e)
    const spot = this.targetAt(pt.x, pt.y)
    // 톡 집어 둔 게 있으면: 놓을 곳을 누르면 놓아요
    if (this.held !== null && spot && this.canApply(this.held, spot)) {
      const held = this.held
      this.held = null
      this.apply(held, spot)
      this.renderHighlights()
      return
    }
    // 탄 냄비를 누르면 여분 냄비로 바꿔요
    const potIndex = target.closest<SVGGElement>('[data-pot]')?.dataset.pot
    if (potIndex !== undefined && this.pots[Number(potIndex)].burnt) {
      this.held = null
      this.apply('spare', { kind: 'pot', i: Number(potIndex) })
      this.renderHighlights()
      return
    }
    const src = this.sourceOf(target)
    if (src === null || (src === 'spare' && this.spares <= 0)) {
      if (this.held !== null && spot?.kind === 'pot') this.apply(this.held, spot) // 못 놓는 냄비: 도리도리
      this.held = null
      this.renderHighlights()
      return
    }
    this.held = null
    this.drag = { src, x: e.clientX, y: e.clientY, moved: false }
    try {
      this.root!.setPointerCapture(e.pointerId)
    } catch {
      // 이미 끝난 포인터
    }
    this.renderHighlights()
  }

  private onMove(e: PointerEvent) {
    if (!this.drag || !e.isPrimary) return
    if (!this.drag.moved && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) < 8) return
    if (!this.drag.moved) {
      this.drag.moved = true
      this.showGhost(this.drag.src)
    }
    const pt = this.toSvg(e)
    this.moveGhost(pt.x, pt.y)
    this.renderHighlights(this.targetAt(pt.x, pt.y))
  }

  private onUp(e: PointerEvent) {
    const drag = this.drag
    if (!drag || !e.isPrimary) return
    this.drag = null
    this.hideGhost()
    if (!drag.moved) {
      // 톡: 집어 들고 놓을 곳을 기다려요
      this.held = drag.src
      this.music.sfx('click')
    } else {
      const pt = this.toSvg(e)
      const spot = this.targetAt(pt.x, pt.y)
      if (spot) this.apply(drag.src, spot)
    }
    this.renderHighlights()
  }

  private cancelDrag() {
    this.drag = null
    this.hideGhost()
    this.renderHighlights()
  }

  private showGhost(src: Source) {
    const ghost = this.svg?.querySelector('.rm-ghost')
    if (!ghost) return
    const L = this.layout
    let art: string
    if (typeof src === 'number') {
      const p = this.pots[src]
      art = `<g transform="scale(${L.ps * 0.75})">${potArt(p, stageOf(p), false)}</g>`
    } else if (src === 'kettle') art = `<g transform="translate(60 -40) rotate(-28) scale(${L.kettle[2] * 0.6})">${A.kettle()}</g>`
    else if (src === 'spare') art = `<g transform="scale(${L.ps * 0.6})">${A.sparePot()}</g>`
    else art = `<g transform="scale(${L.shelf[src][2] * 0.8})">${INGREDIENT_ART[src]()}</g>`
    ghost.innerHTML = `<g class="rm-ghost__item">${art}</g>`
    // 들고 있는 냄비는 화구에서 잠깐 흐리게
    if (typeof src === 'number') this.svg?.querySelector(`[data-pot="${src}"]`)?.classList.add('is-lifted')
  }

  private moveGhost(x: number, y: number) {
    this.svg?.querySelector('.rm-ghost__item')?.setAttribute('transform', `translate(${x} ${y})`)
  }

  private hideGhost() {
    const ghost = this.svg?.querySelector('.rm-ghost')
    if (ghost) ghost.innerHTML = ''
    this.svg?.querySelectorAll('.is-lifted').forEach((g) => g.classList.remove('is-lifted'))
  }

  // ---------- 리액션 · 동전 ----------

  private react(r: Reaction, p: Pot, stage: Stage) {
    if (!this.root) return
    window.clearTimeout(this.reactTimer)
    this.root.querySelector('.rm-react-pop')?.remove()
    const pop = document.createElement('div')
    pop.className = 'rm-react-pop'
    pop.setAttribute('role', 'status')
    const price = r.price === null ? '<p class="rm-react__price rm-react__price--back">냄비는 다시 불 위로</p>' : `<p class="rm-react__price">${r.price > 0 ? '+' : ''}${won(r.price)}${r.was && r.was !== r.price ? ` <s>${won(r.was)}</s>` : ''}</p>`
    pop.innerHTML = `<div class="rm-react rm-react--${r.tone}">
      <span class="rm-react__tag">${r.tag}</span>
      <div class="rm-react__kettle">${kettleSvg(r.face)}</div>
      <div class="rm-react__body"><p class="rm-react__line">${r.line}</p>${price}</div>
      <div class="rm-react__pot">${potSvg({ ...p, pour: 0 }, stage)}</div>
    </div>`
    this.root.append(pop)
    this.reactTimer = window.setTimeout(() => {
      pop.classList.add('is-leaving')
      setTimeout(() => pop.remove(), 300)
    }, REACT_MS)
  }

  /** 판 라면이 쟁반에 잠깐 올라가고, 위로 "+1,000원"이 떠올라요 */
  private showOnTray(p: Pot, stage: Stage, price: number) {
    if (!this.svg) return
    const slot = this.svg.querySelector('.rm-tray__pot')
    if (slot) slot.innerHTML = potArt({ ...p, pour: 0 }, stage, false)
    window.clearTimeout(this.trayTimer)
    this.trayTimer = window.setTimeout(() => {
      if (slot) slot.innerHTML = ''
    }, 1100)
    const coins = this.svg.querySelector('.rm-coins')
    if (!coins) return
    const [x, y] = this.layout.trayPot
    const portrait = this.layout === PORTRAIT
    const coin = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    coin.setAttribute('class', `rm-coin${price ? '' : ' is-zero'}`)
    coin.setAttribute('x', String(portrait ? x + 60 : x - 90))
    coin.setAttribute('y', String(y - 70))
    coin.setAttribute('text-anchor', 'middle')
    coin.textContent = price ? `+${won(price)}` : '0원'
    coins.append(coin)
    setTimeout(() => coin.remove(), 1300)
  }

  // ---------- 결과 ----------

  private finish(cleared: boolean) {
    this.phase = 'over'
    this.stopTimers()
    this.drag = null
    this.held = null
    this.music.stop()
    this.music.sfx(cleared ? 'clear' : 'miss')
    if (cleared) this.showSuccess()
    else this.showFail()
  }

  private showFail() {
    const reason = this.failReason === 'burnt' ? '냄비가 다 타 버렸어요.' : '시간이 다 됐어요.'
    this.win.body.innerHTML = `
      <div class="rm rm-result rm-fail">
        <div class="rm-result__head">
          <p class="rm-big">오늘은 냄비 <em>설거지 당번!</em></p>
          <p class="rm-sub">${reason} 10,000원을 못 모아서 쌓인 냄비를 다 닦아야 해요.</p>
        </div>
        <div class="rm-fail__stage">
          ${dishPile()}
          <div class="rm-bubble rm-fail__girl-say">흐잉… 다음엔 꼭 꼬들하게!</div>
          <div class="rm-bubble rm-fail__kettle-say">만 원 못 벌었으니<br /><b>뽀득뽀득 설거지다잉!</b></div>
        </div>
        <div class="rm-result__foot">
          <div class="rm-stats">
            <div class="rm-stat"><span>끓인 라면</span><b>${this.bowls}그릇</b></div>
            <div class="rm-stat"><span>1,000원 그릇</span><b>${this.bestBowls}그릇</b></div>
            <div class="rm-stat"><span>모은 돈</span><b>${won(this.money)}</b></div>
            <div class="rm-stat"><span>모자란 돈</span><b>${won(Math.max(GOAL - this.money, 0))}</b></div>
          </div>
          ${this.resultButtons()}
        </div>
      </div>`
    this.root = null
    this.svg = null
    this.bindResultButtons()
  }

  private showSuccess() {
    const time = Math.round(this.elapsed * 10) / 10
    const best = this.saveBest(time)
    const isBest = best === time
    const record: Omit<RamenScore, 'nickname'> = { bowls: this.bowls, money: this.money, time_sec: time }
    const hasRank = rankingEnabled()
    this.win.body.innerHTML = `
      <div class="rm rm-result rm-win${hasRank ? '' : ' is-solo'}">
        <div class="rm-win__left">
          <div class="rm-result__head">
            <p class="rm-big">완벽한 라면을 <em>끓이셨군요!</em></p>
            <p class="rm-sub">10,000원을 다 모았어요${isBest ? ' · <b>내 최고 기록!</b>' : ` · 내 최고 기록 ${minSec(best)}`}</p>
          </div>
          <div class="rm-win__stage" aria-hidden="true">
            <div class="rm-win__girl">${A.girl('happy')}</div>
            <svg class="rm-win__tray" viewBox="0 0 640 460">
              <path d="M80 70 L560 70 L630 420 L10 420 Z" fill="#d9ad72" />
              <path d="M80 60 L560 60 L620 404 L20 404 Z" fill="url(#rm-wood)" />
              <path d="M104 84 L536 84 L590 384 L50 384 Z" fill="#f5dcb0" opacity=".6" />
              <g transform="translate(300 170) scale(0.78)">${potArt({ ...newPot(), water: true, noodles: true, soup: true, onion: true, egg: true }, 'perfect', false)}</g>
              <g transform="translate(160 330) scale(0.6)">${A.pickles()}</g>
            </svg>
            <div class="rm-win__kettle"><div class="rm-bubble">잘 끓였네! 합격이다잉</div>${kettleSvg('happy')}</div>
          </div>
          <div class="rm-stats">
            <div class="rm-stat"><span>끓인 라면</span><b>${this.bowls}그릇</b></div>
            <div class="rm-stat"><span>모은 돈</span><b>${won(this.money)}</b></div>
            <div class="rm-stat"><span>걸린 시간</span><b>${minSec(time)}</b></div>
          </div>
          ${this.resultButtons()}
        </div>
        ${hasRank ? rankCard(true) : ''}
      </div>`
    this.root = null
    this.svg = null
    this.bindResultButtons()
    if (hasRank) this.bindRanking(record)
  }

  private resultButtons() {
    return `<div class="rm-buttons"><button type="button" class="tbutton tbutton--main" data-action="again">재도전하기</button><button type="button" class="tbutton" data-action="quit">그만하기</button></div>`
  }

  private bindResultButtons() {
    this.win.body.querySelector('[data-action="again"]')?.addEventListener('click', () => this.showIntro())
    this.win.body.querySelector('[data-action="quit"]')?.addEventListener('click', () => this.close())
    setTimeout(() => this.win.body.querySelector<HTMLButtonElement>('[data-action="again"]')?.focus({ preventScroll: true }), 400)
  }

  // ---------- 랭킹 (Supabase, 다른 게임 랭킹과 같은 방식) ----------

  /** 성공 화면 오른쪽 랭킹: 등록 전에는 이번 판이 몇 등쯤인지 "나 (이번 판)"으로 미리 보여줘요 */
  private bindRanking(record: Omit<RamenScore, 'nickname'>) {
    const el = this.win.body
    const form = el.querySelector<HTMLFormElement>('[data-ref="rankForm"]')!
    const input = form.querySelector<HTMLInputElement>('input')!
    const button = form.querySelector<HTMLButtonElement>('button')!
    const list = el.querySelector<HTMLElement>('[data-ref="rankList"]')!
    const note = el.querySelector<HTMLElement>('[data-ref="rankNote"]')!
    input.value = savedNickname().slice(0, NICKNAME_MAX)
    limitNickname(input)
    void renderRanking(list, { preview: record })

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const nickname = input.value.trim().slice(0, NICKNAME_MAX)
      if (!nickname) {
        note.textContent = '이름을 적어 주세요'
        input.focus()
        return
      }
      button.disabled = true
      input.disabled = true
      note.textContent = '올리는 중...'
      try {
        const mine = { ...record, nickname }
        const previous = await championBefore((limit) => fetchRamenTop(limit))
        const result = await submitRamenScore(mine)
        rememberNickname(nickname)
        note.textContent = submitMessage(result)
        form.classList.add('is-done')
        await renderRanking(list, { mine: nickname })
        celebrateChampion(list, RAMEN_BOARD, nickname, previous)
      } catch (error) {
        note.textContent = (error as Error).message
        button.disabled = false
        input.disabled = false
      }
    })
  }

  /** 인트로의 🏆 랭킹 보기: 가운데 팝업 */
  private openRanking() {
    if (!this.root || this.root.querySelector('.rm-rankpop')) return
    const pop = document.createElement('div')
    pop.className = 'rm-rankpop'
    pop.innerHTML = `${rankCard(false)}`
    this.root.append(pop)
    const card = pop.querySelector('.rm-rank')!
    card.insertAdjacentHTML('beforeend', '<div class="rm-buttons"><button type="button" class="tbutton" data-action="close-ranking">닫기</button></div>')
    const close = pop.querySelector<HTMLButtonElement>('[data-action="close-ranking"]')!
    close.addEventListener('click', () => {
      pop.remove()
      this.root?.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true })
    })
    close.focus({ preventScroll: true })
    void renderRanking(pop.querySelector<HTMLElement>('[data-ref="rankList"]')!, {})
  }

  // ---------- 최고 기록 (이 브라우저에만 저장, 짧을수록 좋아요) ----------

  private saveBest(time: number) {
    let best = Infinity
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || Infinity
      if (time < best) localStorage.setItem(BEST_KEY, String(time))
    } catch {
      // 저장소를 못 쓰면 이번 기록만
    }
    return Math.min(best, time)
  }
}

/** 랭킹 카드 (withForm: 성공 화면의 이름 등록 칸) */
function rankCard(withForm: boolean) {
  return `<section class="rm-card rm-rank" aria-label="빨리 끓이기 랭킹">
    <p class="rm-rank__title">👑 빨리 끓이기 랭킹</p>
    ${
      withForm
        ? `<form class="rm-rank__form" data-ref="rankForm" autocomplete="off">
            <input type="text" maxlength="${NICKNAME_MAX}" placeholder="이름을 적어 주세요" aria-label="닉네임" spellcheck="false" />
            <button type="submit" class="tbutton tbutton--main">랭킹 등록</button>
          </form>
          <p class="rm-rank__note" data-ref="rankNote" aria-live="polite"></p>`
        : ''
    }
    <ol class="trank__list rm-rank__list" data-ref="rankList"><li class="trank__empty">불러오는 중...</li></ol>
    <p class="rm-rank__hint">10,000원을 모은 판만, 걸린 시간이 짧은 순으로 올라가요</p>
  </section>`
}

/** TOP 10 그리기: 순위(1등 👑) · 이름 · 그릇 수 · 걸린 시간. preview가 있으면 "나 (이번 판)" 줄을 끼워 넣어요 */
async function renderRanking(list: HTMLElement, opts: { preview?: Omit<RamenScore, 'nickname'>; mine?: string }) {
  try {
    const top = await fetchRamenTop()
    if (!list.isConnected) return
    type Row = Pick<RamenScore, 'nickname' | 'bowls' | 'time_sec'> & { me?: boolean }
    let rows: Row[] = top
    if (opts.preview) {
      const at = top.findIndex((row) => ramenBetter(opts.preview!, row))
      const me: Row = { nickname: '나 (이번 판)', bowls: opts.preview.bowls, time_sec: opts.preview.time_sec, me: true }
      rows = at < 0 ? [...top, me] : [...top.slice(0, at), me, ...top.slice(at)]
      rows = rows.slice(0, RANK_LIMIT + 1)
    }
    list.innerHTML = rows.length
      ? rows
          .map((row, i) => {
            const isMine = row.me || (!!opts.mine && row.nickname === opts.mine)
            return `<li class="trank__row rm-rank__row${isMine ? ' is-mine' : ''}">
              <span class="trank__no">${i === 0 ? '👑' : i + 1}</span>
              <span class="trank__name">${escapeHtml(row.nickname)}</span>
              <span class="rm-rank__bowls">${row.bowls}그릇</span>
              <span class="rm-rank__time">${clock(row.time_sec)}</span>
            </li>`
          })
          .join('')
      : '<li class="trank__empty">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</li>'
    // 미리보기 줄이 1등이면 한마디 말풍선은 건너뛰어요 (진짜 1등 줄이 아니라서)
    if (!rows[0]?.me) void showChampionNote(list, RAMEN_BOARD)
  } catch (error) {
    if (list.isConnected) list.innerHTML = `<li class="trank__empty">${escapeHtml((error as Error).message)}</li>`
  }
}

/** 설거지 벌칙: 거품 속에 냄비 · 주전자가 잔뜩 쌓이고 아이가 고무장갑 끼고 반쯤 파묻혀요 */
function dishPile() {
  let seed = 11
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const foam = (count: number, x0: number, x1: number, y0: number, y1: number, r0: number, r1: number) =>
    Array.from({ length: count }, () => {
      const x = x0 + rand() * (x1 - x0)
      const y = y0 + rand() * (y1 - y0)
      const r = r0 + rand() * (r1 - r0)
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" fill="url(#rm-foam)" stroke="#d3ecf6" stroke-width="4" />
        <circle cx="${(x - r * 0.38).toFixed(0)}" cy="${(y - r * 0.38).toFixed(0)}" r="${(r * 0.16).toFixed(0)}" fill="#fff" />`
    }).join('')
  const floating = Array.from({ length: 26 }, (_, i) => {
    const r = 6 + rand() * 22
    return `<circle class="rm-float" style="animation-delay:${(-i * 0.37).toFixed(2)}s" cx="${(rand() * 1600).toFixed(0)}" cy="${(rand() * 380).toFixed(0)}" r="${r.toFixed(0)}" fill="#fff" fill-opacity=".6" stroke="#cfe9f5" stroke-width="3" />`
  }).join('')
  const potAt = (x: number, y: number, s: number, rot: number) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${A.potHandles('y')}${A.potBody('y')}${A.potRim('y')}</g>`
  const kettleAt = (x: number, y: number, s: number, rot: number, face: A.KettleFace = '') => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${A.kettle(face)}</g>`
  const girl = A.girl('sulky')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
  return `<svg class="rm-dish" viewBox="0 0 1600 720" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    ${floating}
    ${foam(26, 60, 1540, 470, 600, 50, 96)}
    ${potAt(300, 440, 0.52, -18)}${potAt(1180, 470, 0.5, 150)}${potAt(500, 520, 0.42, 12)}
    ${kettleAt(250, 330, 0.42, -12)}
    ${kettleAt(1330, 330, 0.5, 6, 'frown')}
    <svg x="630" y="130" width="340" height="482" viewBox="0 0 240 340"><g class="rm-scrub">${girl}</g></svg>
    ${foam(34, 20, 1580, 615, 730, 60, 112)}
    ${potAt(170, 640, 0.55, 14)}${potAt(1040, 660, 0.52, -16)}${potAt(1460, 620, 0.5, 20)}${potAt(640, 690, 0.46, -170)}
    ${foam(18, 0, 1600, 670, 760, 50, 90)}
  </svg>`
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
