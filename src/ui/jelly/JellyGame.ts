import '../typing/FallingWords.css'
import './jelly.css'
import type { Chiptune } from '../Chiptune'
import { RetroWindow } from '../RetroWindow'
import { isTouchDevice } from '../../utils/device'
import { handFont } from '../../utils/fonts'
import { NICKNAME_MAX, RANK_LIMIT, limitNickname, rankingEnabled, rememberNickname, savedNickname, submitMessage } from '../typing/ranking'
import { fetchJellyTop, submitJellyScore, type JellyScore } from './ranking'

/*
 * 말랑젤리 쌓기 (말랑젤리.app)
 * 게임방 오른쪽 오락기에서 하는 블록 쌓기 퍼즐: 위에서 말랑한 젤리 조각이 하나씩 내려와요.
 * 옆으로 옮기고 돌려서 가로 한 줄을 꽉 채우면 그 줄이 팡! 터져요.
 * 네 칸짜리 젤리 7가지에 가끔 작은 간식 조각(2~3칸)이 섞여 나오고, 별사탕이 든 젤리 줄을 터뜨리면 보너스.
 * 줄 8개마다 레벨이 올라 더 빨리 떨어지고, 젤리가 맨 위까지 쌓이면 끝이에요.
 */

// ---------- 게임 설정 ----------

/** 젤리 통 크기 (가로 9칸 · 세로 16칸, 위에 안 보이는 2칸이 더 있어요) */
const COLS = 9
const ROWS = 16
const HIDDEN = 2
const TOTAL_ROWS = ROWS + HIDDEN
/** 이 줄 수마다 레벨 업 */
const LINES_PER_LEVEL = 8
/** 바닥에 닿은 뒤 굳기까지 (초) · 그동안 움직이면 다시 기다려 주는 횟수 */
const LOCK_SEC = 0.5
const LOCK_RESETS = 15
/** 꾹 누르고 있으면: 처음 기다리는 시간 · 그 뒤 한 칸씩 가는 간격 (초) */
const REPEAT_DELAY = 0.17
const REPEAT_EVERY = 0.05
const SOFT_DROP_EVERY = 0.035
/** 줄이 터지는 애니메이션 (초) */
const CLEAR_SEC = 0.32
/** 한 번에 터뜨린 줄 수별 점수 (× 레벨) */
const LINE_POINTS = [0, 100, 300, 500, 800]
const STAR_POINT = 200
const COMBO_POINT = 50
/** 이 조각이 별사탕을 품고 나올 확률 */
const STAR_CHANCE = 0.16
const BEST_KEY = 'tiny-room-jelly-best'

/** 레벨별 한 칸 떨어지는 간격 (초): 레벨이 오를수록 빨라져요 */
const fallEvery = (level: number) => Math.max(0.06, 0.82 * 0.83 ** (level - 1))
/** 배경음악 빠르기: 레벨 1 = 120 → 레벨이 오를수록 빨라져요 (최대 176) */
const musicTempo = (level: number) => Math.min(120 + (level - 1) * 7, 176)

/** 그림 선: 창과 같은 갈색 */
const LINE = '#5a4033'

type Phase = 'intro' | 'playing' | 'paused' | 'over'

/** 젤리 맛 (색) */
interface Flavor {
  fill: string
  shade: string
}

const FLAVORS: Record<string, Flavor> = {
  strawberry: { fill: '#f7a8b4', shade: '#e07f93' },
  lemon: { fill: '#ffe08a', shade: '#e9b95a' },
  mint: { fill: '#a8dcc8', shade: '#78bba3' },
  peach: { fill: '#ffc39a', shade: '#ec9a6c' },
  soda: { fill: '#b6d6f2', shade: '#83afd8' },
  grape: { fill: '#cdb8ec', shade: '#a28bcf' },
  matcha: { fill: '#c8e0a0', shade: '#9cbf70' },
  milk: { fill: '#fff4dc', shade: '#e3caa2' },
  choco: { fill: '#d9a882', shade: '#b07e55' },
}

interface PieceKind {
  name: string
  /** 회전 상자 크기 (n × n) */
  size: number
  cells: [number, number][]
  flavor: keyof typeof FLAVORS
}

/** 네 칸 젤리 7가지 */
const MAIN_PIECES: PieceKind[] = [
  { name: 'stick', size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], flavor: 'lemon' },
  { name: 'box', size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], flavor: 'strawberry' },
  { name: 'bump', size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], flavor: 'mint' },
  { name: 'stairUp', size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], flavor: 'peach' },
  { name: 'stairDown', size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], flavor: 'soda' },
  { name: 'hookLeft', size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], flavor: 'grape' },
  { name: 'hookRight', size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], flavor: 'matcha' },
]

/** 가끔 섞여 나오는 작은 간식 조각 (2~3칸) */
const SNACK_PIECES: PieceKind[] = [
  { name: 'pair', size: 2, cells: [[0, 0], [1, 0]], flavor: 'milk' },
  { name: 'corner', size: 2, cells: [[0, 0], [0, 1], [1, 1]], flavor: 'choco' },
  { name: 'three', size: 3, cells: [[0, 1], [1, 1], [2, 1]], flavor: 'milk' },
]

/** 통에 쌓인 젤리 한 칸 */
interface Cell {
  flavor: keyof typeof FLAVORS
  star: boolean
}

/** 지금 내려오는 젤리 */
interface Piece {
  kind: PieceKind
  /** 회전한 칸 (상자 안 좌표) */
  cells: [number, number][]
  x: number
  y: number
  /** 별사탕이 든 칸 번호 (-1이면 없음) */
  star: number
}

interface Pop {
  text: string
  x: number
  y: number
  t: number
  color: string
  size: number
}

interface Crumb {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  color: string
  r: number
}

type Held = 'left' | 'right' | 'down'

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** 상자 안에서 시계 방향으로 90도 (dir = -1이면 반대로) */
function rotateCells(cells: [number, number][], size: number, dir: 1 | -1): [number, number][] {
  return cells.map(([x, y]) => (dir === 1 ? [size - 1 - y, x] : [y, size - 1 - x]))
}

/** 돌렸는데 벽 · 젤리에 막히면 조금씩 옮겨서 다시 해 봐요 */
const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]]

export class JellyGame {
  /** 젤리를 움직일 때 (캐릭터가 버튼을 딸깍딸깍) */
  onPlay: (() => void) | null = null
  /** 줄을 터뜨렸을 때 (캐릭터가 방긋) */
  onClear: (() => void) | null = null
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  private readonly el = document.createElement('div')
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly overlay: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly rankButton: HTMLButtonElement
  private readonly hud: Record<'score' | 'lines' | 'level', HTMLElement>
  private rankPopup: HTMLElement | null = null

  private phase: Phase = 'intro'
  /** 캔버스 픽셀 크기 · 한 칸 크기 · 통 위치 */
  private cell = 20
  private boardX = 0
  private boardY = 0
  /** 세로로 긴 화면이면 주머니 · 다음 칸이 통 위로 가요 */
  private tall = false
  private time = 0

  // 판마다 바뀌는 값
  private board: (Cell | null)[][] = []
  private piece: Piece | null = null
  private queue: PieceKind[] = []
  private hold: PieceKind | null = null
  private holdUsed = false
  private score = 0
  private lines = 0
  private level = 1
  private combo = -1
  private stars = 0
  private fallTimer = 0
  private lockTimer = 0
  private lockResets = 0
  /** 터지는 중인 줄 (애니메이션이 끝나면 지워요) */
  private clearing: number[] = []
  private clearTimer = 0
  private pops: Pop[] = []
  private crumbs: Crumb[] = []
  /** 젤리가 굳을 때 살짝 말랑 눌리는 효과 */
  private squash: { rows: Set<string>; t: number } = { rows: new Set(), t: 1 }
  private held: Held | null = null
  private heldTimer = 0
  private lastHud = ''

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '말랑젤리.app', '말랑젤리 쌓기')
    this.win.onClose = () => {
      if (this.phase === 'playing') this.pause()
      this.held = null
      this.onClose?.()
    }
    this.win.onEscape = () => this.onEscape()

    this.el.className = 'train jelly'
    this.el.innerHTML = `
      <div class="train__top">
        <button type="button" class="tback train__pause" data-action="pause" hidden>⏸ 멈춤 <small>Esc</small></button>
        <button type="button" class="tback train__rankbtn" data-action="ranking" hidden>🏆 랭킹 보기</button>
        <div class="train__stats">
          <span class="train__stat">레벨 <b data-hud="level">1</b></span>
          <span class="train__stat">줄 <b data-hud="lines">0</b>개</span>
          <span class="train__stat train__stat--score">점수 <b data-hud="score">0</b>점</span>
        </div>
      </div>
      <div class="train__field jelly__field">
        <canvas class="jelly__canvas" data-ref="canvas" aria-label="말랑젤리 쌓기 화면"></canvas>
        <div class="train__overlay" data-ref="overlay"></div>
      </div>
      <div class="jelly__pad" aria-label="조작 버튼">
        <button type="button" class="jelly__key" data-key="left" data-silent aria-label="왼쪽으로">◀<small>왼쪽</small></button>
        <button type="button" class="jelly__key" data-key="right" data-silent aria-label="오른쪽으로">▶<small>오른쪽</small></button>
        <button type="button" class="jelly__key" data-key="down" data-silent aria-label="살살 내리기">▼<small>살살</small></button>
        <button type="button" class="jelly__key jelly__key--hold" data-key="hold" data-silent aria-label="주머니에 넣기 · 꺼내기">${POUCH_ICON}<small>주머니</small></button>
        <button type="button" class="jelly__key jelly__key--spin" data-key="spin" data-silent aria-label="돌리기">${SPIN_ICON}<small>돌리기</small></button>
        <button type="button" class="jelly__key jelly__key--drop" data-key="drop" data-silent aria-label="한번에 내리기">${DROP_ICON}<small>한번에</small></button>
      </div>
    `
    this.canvas = this.el.querySelector<HTMLCanvasElement>('[data-ref="canvas"]')!
    this.ctx = this.canvas.getContext('2d')!
    this.overlay = this.el.querySelector<HTMLElement>('[data-ref="overlay"]')!
    const hud = (name: string) => this.el.querySelector<HTMLElement>(`[data-hud="${name}"]`)!
    this.hud = { score: hud('score'), lines: hud('lines'), level: hud('level') }
    this.pauseButton = this.el.querySelector<HTMLButtonElement>('[data-action="pause"]')!
    this.pauseButton.addEventListener('click', () => this.pause())
    this.rankButton = this.el.querySelector<HTMLButtonElement>('[data-action="ranking"]')!
    this.rankButton.addEventListener('click', () => this.openRanking())

    this.bindKeyboard()
    this.bindPad()
    // 다른 탭에 다녀오면 멈춰 둬요
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause()
    })
  }

  get isOpen() {
    return this.win.isOpen
  }

  open() {
    if (this.win.isOpen) return
    this.win.open()
    // 하던 판이 멈춰 있으면 멈춤 화면 그대로, 아니면 처음 화면
    if (this.phase === 'paused' && this.el.isConnected) return
    this.mountGame()
    this.reset()
    this.showIntro()
  }

  close() {
    this.win.close()
  }

  update(dt: number) {
    if (!this.win.isOpen || !this.el.isConnected) return
    this.time += dt
    this.resize()
    if (this.phase === 'playing') this.step(Math.min(dt, 0.05))
    else this.stepEffects(Math.min(dt, 0.05))
    this.draw()
  }

  // ---------- 조작 ----------

  private bindKeyboard() {
    const keyOf = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          return 'left'
        case 'ArrowRight':
        case 'KeyD':
          return 'right'
        case 'ArrowDown':
        case 'KeyS':
          return 'down'
        case 'ArrowUp':
        case 'KeyW':
        case 'KeyX':
          return 'spin'
        case 'KeyZ':
          return 'spinBack'
        case 'Space':
          return 'drop'
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
          return 'hold'
      }
      return null
    }
    window.addEventListener('keydown', (e) => {
      if (!this.win.isOpen || this.phase !== 'playing') return
      if (e.target instanceof HTMLInputElement) return
      const key = keyOf(e)
      if (!key) return
      // 스페이스 · 화살표가 버튼을 누르거나 화면을 움직이지 않게 막아요. 꾹 누르는 건 게임이 직접 반복해요
      e.preventDefault()
      if (e.repeat) return
      this.press(key)
    })
    window.addEventListener('keyup', (e) => {
      const key = keyOf(e)
      if (key && key === this.held) this.held = null
    })
    window.addEventListener('blur', () => (this.held = null))
  }

  /** 휴대폰 조작 버튼: 누르는 순간 바로 (◀ ▶ ▼는 꾹 누르면 계속) */
  private bindPad() {
    for (const button of this.el.querySelectorAll<HTMLButtonElement>('[data-key]')) {
      const key = button.dataset.key as Held | 'spin' | 'drop' | 'hold'
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        if (this.phase !== 'playing') return
        button.classList.add('is-down')
        this.press(key)
      })
      const release = () => {
        button.classList.remove('is-down')
        if (this.held === key) this.held = null
      }
      button.addEventListener('pointerup', release)
      button.addEventListener('pointercancel', release)
      button.addEventListener('pointerleave', release)
      // 길게 누를 때 뜨는 메뉴 · 확대를 막아요
      button.addEventListener('contextmenu', (e) => e.preventDefault())
    }
  }

  private press(key: Held | 'spin' | 'spinBack' | 'drop' | 'hold') {
    if (this.phase !== 'playing') return
    switch (key) {
      case 'left':
      case 'right':
      case 'down':
        this.held = key
        this.heldTimer = REPEAT_DELAY
        this.repeatMove(key)
        break
      case 'spin':
        this.spin(1)
        break
      case 'spinBack':
        this.spin(-1)
        break
      case 'drop':
        this.hardDrop()
        break
      case 'hold':
        this.swapHold()
        break
    }
  }

  private repeatMove(key: Held) {
    if (key === 'down') {
      if (this.piece && this.move(0, 1)) {
        this.score += 1
        this.fallTimer = 0
      }
      return
    }
    if (this.move(key === 'left' ? -1 : 1, 0)) this.music.sfx('tick')
  }

  // ---------- 진행 ----------

  private mountGame() {
    if (!this.el.isConnected) this.win.body.replaceChildren(this.el)
  }

  private reset() {
    this.board = Array.from({ length: TOTAL_ROWS }, () => Array<Cell | null>(COLS).fill(null))
    this.piece = null
    this.queue = []
    this.hold = null
    this.holdUsed = false
    this.score = 0
    this.lines = 0
    this.level = 1
    this.combo = -1
    this.stars = 0
    this.fallTimer = 0
    this.lockTimer = 0
    this.lockResets = 0
    this.clearing = []
    this.clearTimer = 0
    this.pops = []
    this.crumbs = []
    this.held = null
    this.fillQueue()
    this.renderHud()
  }

  /** 처음 화면: 제목 · 규칙 · 게임 시작 (다른 게임 인트로와 같은 모양) */
  private showIntro() {
    this.phase = 'intro'
    this.music.stop()
    const touch = isTouchDevice()
    this.overlay.innerHTML = `
      <div class="train__intro jelly__intro">
        <p class="train__title jelly__title">말랑젤리<br />쌓기!</p>
        <p class="train__desc">가로 한 줄을 꽉 채우면 <b>팡!</b> 터져요</p>
        <ul class="train__rules">
          ${
            touch
              ? `<li><span class="train__chip">◀ ▶</span>옮기기 · <span class="train__chip">${SPIN_ICON}</span>돌리기</li>
                 <li><span class="train__chip">▼ 살살</span>꾹 누르는 동안 천천히 내려가요</li>
                 <li><span class="train__chip jelly__chip--drop">${DROP_ICON} 한번에</span>점선 자리까지 바로 쿵! 내려가요</li>`
              : `<li><span class="train__chip">← →</span>옮기기 · <span class="train__chip">↑</span>돌리기<span class="train__more"> (Z는 반대로)</span></li>
                 <li><span class="train__chip">↓</span>꾹 누르는 동안 천천히 내려가요</li>
                 <li><span class="train__chip jelly__chip--drop">스페이스</span>점선 자리까지 바로 쿵! 내려가요</li>`
          }
          <li><span class="train__chip jelly__chip--hold">${touch ? `${POUCH_ICON} 주머니` : 'C 주머니'}</span>지금 젤리를 넣어 두고 다음 젤리를 받아요. 다시 누르면 꺼내서 바꿔요<span class="train__more"> (젤리 하나에 한 번)</span></li>
          <li>여러 줄을 <b>한 번에</b> 터뜨릴수록 점수 쑥쑥<span class="train__more">, 연달아 터뜨리면 콤보!</span></li>
          <li><span class="train__chip jelly__chip--star">⭐ 별사탕</span>든 줄을 터뜨리면 <b>+${STAR_POINT}</b><span class="train__more"> × 레벨</span></li>
          <li class="train__more">작은 간식 조각(2~3칸)도 가끔 나와요</li>
          <li>줄 <b>${LINES_PER_LEVEL}개</b>마다 레벨 업! 젤리가 맨 위까지 차면 끝</li>
        </ul>
        <div class="train__buttons">
          <button type="button" class="tbutton tbutton--main" data-action="start">게임 시작</button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    const button = this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]')!
    button.addEventListener('click', () => this.start())
    this.renderHud()
    setTimeout(() => button.isConnected && button.focus({ preventScroll: true }), 450)
  }

  private start() {
    this.closeRanking()
    this.mountGame()
    this.reset()
    this.overlay.classList.remove('is-on')
    this.overlay.replaceChildren()
    ;(document.activeElement as HTMLElement | null)?.blur()
    // 버튼 클릭 안에서 소리를 켜야 브라우저가 막지 않아요
    this.music.start(musicTempo(1), 'jelly')
    this.phase = 'playing'
    this.spawn()
    this.renderHud()
  }

  /** Esc: 랭킹 팝업 닫기 → 하는 중이면 멈춤 → 멈춤 화면이면 계속하기 */
  private onEscape() {
    if (this.rankPopup) {
      this.closeRanking()
      return true
    }
    if (this.phase === 'playing') {
      this.pause()
      return true
    }
    if (this.phase === 'paused' && this.el.isConnected) {
      this.resume()
      return true
    }
    return false
  }

  private pause() {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    this.held = null
    this.music.stop()
    this.renderHud()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--pause">잠깐 멈춤</p>
        <p class="train__desc">레벨 <b>${this.level}</b> · 줄 ${this.lines}개 · 점수 ${this.score}점</p>
        <div class="train__buttons">
          <button type="button" class="tbutton tbutton--main" data-action="resume">계속하기</button>
          <button type="button" class="tbutton" data-action="quit">그만하기</button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    this.overlay.querySelector('[data-action="resume"]')!.addEventListener('click', () => this.resume())
    this.overlay.querySelector('[data-action="quit"]')!.addEventListener('click', () => {
      // 그만하기: 판을 접고 창을 닫아요 (다음에 열면 처음부터)
      this.phase = 'over'
      this.close()
    })
    this.overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus({ preventScroll: true })
  }

  private resume() {
    if (this.phase !== 'paused') return
    this.overlay.classList.remove('is-on')
    this.overlay.replaceChildren()
    ;(document.activeElement as HTMLElement | null)?.blur()
    this.music.start(musicTempo(this.level), 'jelly')
    this.phase = 'playing'
    this.renderHud()
  }

  // ---------- 젤리 ----------

  /** 다음에 나올 젤리: 7가지를 한 봉지에 섞고, 간식 조각 하나를 가끔 끼워요 */
  private fillQueue() {
    while (this.queue.length < 8) {
      const bag = [...MAIN_PIECES]
      if (Math.random() < 0.6) bag.push(SNACK_PIECES[Math.floor(Math.random() * SNACK_PIECES.length)])
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      this.queue.push(...bag)
    }
  }

  private makePiece(kind: PieceKind): Piece {
    const width = Math.max(...kind.cells.map(([x]) => x)) + 1
    const top = Math.min(...kind.cells.map(([, y]) => y))
    return {
      kind,
      cells: kind.cells.map(([x, y]) => [x, y]),
      x: Math.floor((COLS - width) / 2),
      // 맨 윗줄이 보이는 통 바로 위(안 보이는 칸 마지막 줄)에서 시작해요
      y: HIDDEN - 1 - top,
      star: Math.random() < STAR_CHANCE ? Math.floor(Math.random() * kind.cells.length) : -1,
    }
  }

  private spawn(kind?: PieceKind) {
    if (!kind) {
      kind = this.queue.shift()!
      this.fillQueue()
    }
    const piece = this.makePiece(kind)
    this.fallTimer = 0
    this.lockTimer = 0
    this.lockResets = 0
    // 나올 자리가 막혀 있으면 한 칸 위에서라도 나와 보고, 그래도 막히면 끝
    if (!this.fits(piece.cells, piece.x, piece.y)) {
      if (this.fits(piece.cells, piece.x, piece.y - 1)) piece.y -= 1
      else {
        this.piece = piece
        this.gameOver()
        return
      }
    }
    this.piece = piece
  }

  private fits(cells: [number, number][], px: number, py: number) {
    for (const [cx, cy] of cells) {
      const x = px + cx
      const y = py + cy
      if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return false
      if (y >= 0 && this.board[y][x]) return false
    }
    return true
  }

  private move(dx: number, dy: number) {
    const p = this.piece
    if (!p || this.clearing.length) return false
    if (!this.fits(p.cells, p.x + dx, p.y + dy)) return false
    p.x += dx
    p.y += dy
    if (dx) this.bumpLock()
    this.onPlay?.()
    return true
  }

  private spin(dir: 1 | -1) {
    const p = this.piece
    if (!p || this.clearing.length || p.kind.name === 'box') return
    const cells = rotateCells(p.cells, p.kind.size, dir)
    for (const [kx, ky] of KICKS) {
      if (!this.fits(cells, p.x + kx, p.y + ky)) continue
      p.cells = cells
      p.x += kx
      p.y += ky
      this.bumpLock()
      this.music.sfx('spin')
      this.onPlay?.()
      return
    }
  }

  /** 바닥에 닿아 있을 때 움직이면 굳기 전 시간을 다시 줘요 (너무 오래 버티지는 못하게 횟수 제한) */
  private bumpLock() {
    if (this.lockResets >= LOCK_RESETS || !this.piece) return
    if (!this.fits(this.piece.cells, this.piece.x, this.piece.y + 1)) {
      this.lockTimer = 0
      this.lockResets += 1
    }
  }

  private ghostY() {
    const p = this.piece!
    let y = p.y
    while (this.fits(p.cells, p.x, y + 1)) y++
    return y
  }

  private hardDrop() {
    const p = this.piece
    if (!p || this.clearing.length) return
    const y = this.ghostY()
    const fell = y - p.y
    this.score += fell * 2
    p.y = y
    // 쿵 떨어진 자리에 부스러기가 톡톡
    for (const [cx, cy] of p.cells) {
      if (Math.random() < 0.6) this.crumb(p.x + cx + 0.5, p.y + cy + 1, FLAVORS[p.kind.flavor].fill, 1.2)
    }
    this.music.sfx('squish')
    this.onPlay?.()
    this.lock(true)
  }

  private swapHold() {
    const p = this.piece
    if (!p || this.holdUsed || this.clearing.length) return
    const prev = this.hold
    this.hold = p.kind
    this.holdUsed = true
    this.music.sfx('spin')
    this.onPlay?.()
    this.spawn(prev ?? undefined)
  }

  /** 젤리가 굳어요: 통에 붙이고, 꽉 찬 줄이 있으면 터뜨려요 */
  private lock(dropped = false) {
    const p = this.piece
    if (!p) return
    const touched = new Set<string>()
    let above = false
    p.cells.forEach(([cx, cy], i) => {
      const x = p.x + cx
      const y = p.y + cy
      if (y < HIDDEN) above = true
      if (y >= 0) this.board[y][x] = { flavor: p.kind.flavor, star: i === p.star }
      touched.add(`${x},${y}`)
    })
    this.piece = null
    this.holdUsed = false
    this.squash = { rows: touched, t: 0 }
    if (!dropped) this.music.sfx('thud')

    const full: number[] = []
    for (let y = 0; y < TOTAL_ROWS; y++) if (this.board[y].every(Boolean)) full.push(y)
    if (full.length) {
      this.clearRows(full)
      return
    }
    this.combo = -1
    // 줄도 못 터뜨렸는데 보이는 통 위로 삐져나오면 끝
    if (above) {
      this.gameOver()
      return
    }
    this.spawn()
    this.renderHud()
  }

  private clearRows(rows: number[]) {
    this.clearing = rows
    this.clearTimer = 0
    this.combo += 1
    const n = rows.length
    let starCount = 0
    for (const y of rows) for (const cell of this.board[y]) if (cell?.star) starCount++
    const gained = LINE_POINTS[Math.min(n, 4)] * this.level + Math.max(this.combo, 0) * COMBO_POINT * this.level + starCount * STAR_POINT * this.level
    this.score += gained
    this.stars += starCount
    const levelBefore = this.level
    this.lines += n
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL)

    // 팡! 글자 · 부스러기
    // 글자가 통 아래 · 위로 삐져나가지 않게 가운데 쪽으로 모아요
    const midY = Math.min(Math.max(rows.reduce((a, b) => a + b, 0) / n - HIDDEN + 0.5, 2.5), ROWS - 3)
    const word = n >= 4 ? '말랑 대폭발!' : n === 3 ? '팡팡팡!' : n === 2 ? '팡팡!' : '팡!'
    this.pop(word, COLS / 2, midY, '#ec6a52', n >= 3 ? 1.6 : 1.25)
    this.pop(`+${gained}`, COLS / 2, midY + 1.3, '#5a4033', 0.85)
    if (this.combo > 0) this.pop(`${this.combo + 1}콤보`, COLS / 2, midY - 1.4, '#7f9cb5', 0.9)
    if (starCount) this.pop(`⭐ ×${starCount}`, COLS / 2 + 2.6, midY - 0.6, '#e9b95a', 0.9)
    for (const y of rows) {
      for (let x = 0; x < COLS; x++) {
        const cell = this.board[y][x]
        if (!cell) continue
        for (let k = 0; k < 2; k++) this.crumb(x + 0.5, y - HIDDEN + 0.5, FLAVORS[cell.flavor].fill, 2.6)
      }
    }
    this.music.sfx(n >= 4 ? 'freeze' : 'clear')
    if (starCount) this.music.coin(Math.min(starCount * 3, 12))
    if (this.level > levelBefore) {
      this.pop(`레벨 ${this.level}!`, COLS / 2, ROWS * 0.3, '#78bba3', 1.4)
      this.music.sfx('ding')
      this.music.setTempo(musicTempo(this.level))
    }
    this.onClear?.()
    this.renderHud()
  }

  /** 터지는 애니메이션이 끝나면 줄을 빼고 위 젤리를 내려요 */
  private finishClear() {
    const rows = new Set(this.clearing)
    const kept = this.board.filter((_, y) => !rows.has(y))
    const fresh = Array.from({ length: rows.size }, () => Array<Cell | null>(COLS).fill(null))
    this.board = [...fresh, ...kept]
    this.clearing = []
    this.spawn()
  }

  private gameOver() {
    this.phase = 'over'
    this.held = null
    this.music.stop()
    this.music.sfx('miss')
    this.renderHud()
    const hasRank = rankingEnabled()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--fail">꽉 찼다!</p>
        <p class="train__desc">젤리 통이 가득 찼어요 · 점수 <b>${this.score}점</b></p>
        <p class="train__rule">레벨 ${this.level} · 터뜨린 줄 ${this.lines}개 · 별사탕 ${this.stars}개</p>
        <div class="train__buttons">
          ${hasRank ? '<button type="button" class="tbutton tbutton--main" data-action="submit-rank">🏆 랭킹 등록</button>' : ''}
          <button type="button" class="tbutton${hasRank ? '' : ' tbutton--main'}" data-action="result">결과 보기</button>
          <button type="button" class="tbutton" data-action="restart">다시 시작하기</button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    // 🏆 랭킹 등록: 결과 화면의 닉네임 칸이 바로 열려요 · 결과 보기: 결과 카드부터
    this.overlay.querySelector('[data-action="submit-rank"]')?.addEventListener('click', () => this.showResult(true))
    this.overlay.querySelector('[data-action="result"]')!.addEventListener('click', () => this.showResult(false))
    this.overlay.querySelector('[data-action="restart"]')!.addEventListener('click', () => this.start())
    // 쿵 내리기(스페이스)를 연타하다 끝나도 결과 화면으로 바로 넘어가지 않게, 조금 뒤에 버튼에 포커스
    const main = this.overlay.querySelector<HTMLButtonElement>('.tbutton--main')!
    setTimeout(() => main.isConnected && main.focus({ preventScroll: true }), 600)
  }

  /** 결과 화면: 결과 카드 + 랭킹 카드 (다른 게임 결과와 같은 모양) */
  private showResult(openRanking = false) {
    this.phase = 'over'
    this.music.stop()
    const best = this.saveBest(this.score)
    const isBest = this.score > 0 && this.score >= best
    const hasRank = rankingEnabled()
    const el = document.createElement('div')
    el.className = 'tresult'
    el.innerHTML = `
      <div class="tresult__card">
        <p class="tresult__title">말랑젤리 결과${isBest ? ' <mark>최고 기록 🎉</mark>' : ''}</p>
        <div class="tresult__lines">
          <div class="tresult__line"><span>점수</span><b>${this.score}점</b></div>
          <div class="tresult__line"><span>터뜨린 줄</span><b>${this.lines}개</b></div>
          <div class="tresult__line"><span>레벨</span><b>${this.level}</b></div>
          <div class="tresult__line"><span>별사탕</span><b>${this.stars}개</b></div>
          <div class="tresult__line"><span>최고 점수</span><b>${best}점</b></div>
        </div>
        <div class="tresult__buttons">
          <button type="button" class="tbutton tbutton--main tbutton--icon" data-action="again" aria-label="다시 하기" title="다시 하기">${RETRY_ICON}</button>
          ${hasRank ? '<button type="button" class="tbutton" data-action="rank">🏆 랭킹 등록</button>' : ''}
          <button type="button" class="tbutton" data-action="quit">그만하기</button>
        </div>
      </div>
      ${hasRank ? RANK_CARD : ''}
    `
    this.win.body.replaceChildren(el)
    el.querySelectorAll('[data-action="again"]').forEach((b) =>
      b.addEventListener('click', () => {
        this.mountGame()
        this.reset()
        this.showIntro()
      }),
    )
    el.querySelectorAll('[data-action="quit"]').forEach((b) => b.addEventListener('click', () => this.close()))
    if (hasRank) this.bindRanking(el, { score: this.score, lines: this.lines, level: this.level }, openRanking)
    if (!openRanking) el.querySelector<HTMLButtonElement>('[data-action="again"]')?.focus({ preventScroll: true })
  }

  // ---------- 한 프레임 ----------

  private step(dt: number) {
    this.stepEffects(dt)
    if (this.clearing.length) {
      this.clearTimer += dt
      if (this.clearTimer >= CLEAR_SEC) this.finishClear()
      return
    }
    const p = this.piece
    if (!p) return

    // 꾹 누르고 있는 방향키
    if (this.held) {
      this.heldTimer -= dt
      while (this.held && this.heldTimer <= 0) {
        this.heldTimer += this.held === 'down' ? SOFT_DROP_EVERY : REPEAT_EVERY
        this.repeatMove(this.held)
      }
    }
    if (!this.piece) return

    // 저절로 한 칸씩
    const grounded = !this.fits(p.cells, p.x, p.y + 1)
    if (grounded) {
      this.fallTimer = 0
      this.lockTimer += dt
      if (this.lockTimer >= LOCK_SEC) this.lock()
    } else {
      this.lockTimer = 0
      this.fallTimer += dt
      const every = fallEvery(this.level)
      while (this.fallTimer >= every && this.piece && this.fits(p.cells, p.x, p.y + 1)) {
        this.fallTimer -= every
        p.y += 1
      }
    }
  }

  /** 글자 · 부스러기 · 말랑 눌림은 멈춤 · 끝난 화면에서도 마저 움직여요 */
  private stepEffects(dt: number) {
    this.pops = this.pops.filter((p) => (p.t += dt) < 1)
    for (const c of this.crumbs) {
      c.t += dt
      c.vy += 22 * dt
      c.x += c.vx * dt
      c.y += c.vy * dt
    }
    this.crumbs = this.crumbs.filter((c) => c.t < 0.8)
    this.squash.t = Math.min(this.squash.t + dt / 0.25, 1)
  }

  private pop(text: string, x: number, y: number, color: string, size: number) {
    this.pops.push({ text, x, y, t: 0, color, size })
  }

  private crumb(x: number, y: number, color: string, power: number) {
    const a = Math.random() * Math.PI * 2
    const speed = (2 + Math.random() * 4) * power
    this.crumbs.push({ x, y: y - HIDDEN, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 3 * power, t: 0, color, r: 0.08 + Math.random() * 0.1 })
  }

  // ---------- 화면 위 숫자 ----------

  private renderHud() {
    const playing = this.phase === 'playing'
    this.pauseButton.hidden = !playing
    this.rankButton.hidden = !(this.phase === 'intro' || this.phase === 'over') || !rankingEnabled()
    this.el.classList.toggle('is-playing', playing)
    const key = `${this.phase}|${this.score}|${this.lines}|${this.level}`
    if (key === this.lastHud) return
    this.lastHud = key
    this.hud.score.textContent = String(this.score)
    this.hud.lines.textContent = String(this.lines)
    this.hud.level.textContent = String(this.level)
    // 통이 거의 다 차면 위험 표시
    const top = this.board.findIndex((row) => row.some(Boolean))
    this.el.classList.toggle('is-danger', playing && top >= 0 && top < HIDDEN + 4)
  }

  // ---------- 그리기 ----------

  private resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw
      this.canvas.height = ph
    }
    // 가로로 넓으면 통 양옆에 주머니 · 다음 칸, 세로로 길면 통 위에
    this.tall = pw / ph < 1
    if (this.tall) {
      this.cell = Math.floor(Math.min(ph / (ROWS + 4.4), pw / (COLS + 0.8)))
      this.boardX = Math.round((pw - COLS * this.cell) / 2)
      this.boardY = Math.round(ph - ROWS * this.cell - this.cell * 0.4)
    } else {
      this.cell = Math.floor(Math.min(ph / (ROWS + 0.8), pw / (COLS + 10)))
      this.boardX = Math.round((pw - COLS * this.cell) / 2)
      this.boardY = Math.round((ph - ROWS * this.cell) / 2)
    }
  }

  private draw() {
    const c = this.ctx
    const s = this.cell
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.lineJoin = 'round'
    c.lineCap = 'round'

    // 젤리 통: 크림색 둥근 통 + 연한 점 모눈
    const bx = this.boardX
    const by = this.boardY
    const bw = COLS * s
    const bh = ROWS * s
    const pad = s * 0.18
    c.fillStyle = 'rgba(230, 201, 154, 0.55)'
    roundRect(c, bx - pad + s * 0.18, by - pad + s * 0.18, bw + pad * 2, bh + pad * 2, s * 0.5)
    c.fill()
    c.fillStyle = '#fffdf6'
    roundRect(c, bx - pad, by - pad, bw + pad * 2, bh + pad * 2, s * 0.5)
    c.fill()
    c.strokeStyle = LINE
    c.lineWidth = Math.max(2, s * 0.1)
    c.stroke()
    c.fillStyle = 'rgba(224, 201, 171, 0.7)'
    for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) {
      c.beginPath()
      c.arc(bx + x * s, by + y * s, Math.max(1, s * 0.045), 0, Math.PI * 2)
      c.fill()
    }

    // 쌓인 젤리 (위 안 보이는 칸은 통 밖이라 안 그려요)
    const clearT = this.clearing.length ? Math.min(this.clearTimer / CLEAR_SEC, 1) : 0
    c.save()
    c.beginPath()
    // 통 안에만 그려요 (갓 나온 젤리는 통 위에서 쏙 미끄러져 들어와요)
    c.rect(bx - pad, by - pad * 0.5, bw + pad * 2, bh + pad * 1.5)
    c.clip()
    for (let y = 0; y < TOTAL_ROWS; y++) {
      const clearing = this.clearing.includes(y)
      for (let x = 0; x < COLS; x++) {
        const cell = this.board[y][x]
        if (!cell || y < HIDDEN) continue
        const squash = this.squash.rows.has(`${x},${y}`) ? Math.sin(this.squash.t * Math.PI) * 0.12 : 0
        if (clearing) {
          // 터지는 줄: 하얗게 반짝하다가 쏙 작아져요
          const k = 1 - easeIn(clearT)
          this.drawJelly(bx + x * s, by + (y - HIDDEN) * s, s, cell.flavor, cell.star, 'happy', k, 0, clearT < 0.35 ? 0.7 : 0)
        } else {
          this.drawJelly(bx + x * s, by + (y - HIDDEN) * s, s, cell.flavor, cell.star, 'sleepy', 1, squash)
        }
      }
    }

    // 떨어질 자리 (점선) + 지금 젤리
    const p = this.piece
    if (p && this.phase !== 'intro') {
      const gy = this.ghostY()
      if (gy !== p.y) {
        c.setLineDash([s * 0.16, s * 0.14])
        c.strokeStyle = FLAVORS[p.kind.flavor].shade
        c.lineWidth = Math.max(1.5, s * 0.07)
        c.fillStyle = 'rgba(255, 255, 255, 0.5)'
        for (const [cx, cy] of p.cells) {
          if (gy + cy < HIDDEN) continue
          roundRect(c, bx + (p.x + cx) * s + s * 0.1, by + (gy + cy - HIDDEN) * s + s * 0.1, s * 0.8, s * 0.8, s * 0.24)
          c.fill()
          c.stroke()
        }
        c.setLineDash([])
      }
      // 내려오는 젤리는 살짝 말랑말랑 흔들려요
      const wobble = Math.sin(this.time * 7) * 0.025
      p.cells.forEach(([cx, cy], i) => {
        this.drawJelly(bx + (p.x + cx) * s, by + (p.y + cy - HIDDEN) * s, s, p.kind.flavor, i === p.star, 'awake', 1, wobble)
      })
    }
    c.restore()

    // 통 위로 삐져나오는 선 (여기까지 차면 끝)
    c.strokeStyle = 'rgba(236, 106, 82, 0.35)'
    c.lineWidth = Math.max(1.5, s * 0.06)
    c.setLineDash([s * 0.3, s * 0.2])
    c.beginPath()
    c.moveTo(bx, by + 0.5)
    c.lineTo(bx + bw, by + 0.5)
    c.stroke()
    c.setLineDash([])

    this.drawPanels()

    // 부스러기 · 글자
    for (const cr of this.crumbs) {
      c.globalAlpha = 1 - cr.t / 0.8
      c.fillStyle = cr.color
      c.beginPath()
      c.arc(bx + cr.x * s, by + cr.y * s, cr.r * s, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
    for (const pop of this.pops) {
      const k = pop.t
      const scale = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min((k - 0.15) * 0.4, 0.1)
      c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      c.font = handFont(Math.round(s * pop.size * scale))
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      const x = bx + pop.x * s
      const y = by + (pop.y - k * 0.8) * s
      c.lineWidth = Math.max(3, s * 0.18)
      c.strokeStyle = '#fffaf0'
      c.strokeText(pop.text, x, y)
      c.fillStyle = pop.color
      c.fillText(pop.text, x, y)
    }
    c.globalAlpha = 1
  }

  /** 주머니(왼쪽/위 왼쪽) · 다음(오른쪽/위 오른쪽) 칸 */
  private drawPanels() {
    const s = this.cell
    const bx = this.boardX
    const by = this.boardY
    const bw = COLS * s
    if (this.tall) {
      const h = s * 3.2
      const y = by - s * 0.4 - h - s * 0.3
      const w = bw * 0.36
      this.panel('주머니', bx, y, w, h, this.hold ? [this.hold] : [], this.holdUsed, 0.62)
      this.panel('다음', bx + bw - bw * 0.6, y, bw * 0.6, h, this.queue.slice(0, 2), false, 0.62, true)
    } else {
      const w = s * 4.2
      const gap = s * 0.7
      this.panel('주머니', bx - gap - w, by, w, s * 4.2, this.hold ? [this.hold] : [], this.holdUsed, 0.8)
      this.panel('다음', bx + bw + gap, by, w, s * 9.6, this.queue.slice(0, 3), false, 0.8)
    }
  }

  private panel(label: string, x: number, y: number, w: number, h: number, kinds: PieceKind[], faded: boolean, scale: number, row = false) {
    const c = this.ctx
    const s = this.cell
    c.fillStyle = 'rgba(230, 201, 154, 0.55)'
    roundRect(c, x + s * 0.14, y + s * 0.14, w, h, s * 0.4)
    c.fill()
    c.fillStyle = '#fffdf6'
    roundRect(c, x, y, w, h, s * 0.4)
    c.fill()
    c.strokeStyle = LINE
    c.lineWidth = Math.max(2, s * 0.09)
    c.stroke()
    c.font = handFont(Math.round(s * 0.62))
    c.textAlign = 'center'
    c.textBaseline = 'top'
    c.fillStyle = LINE
    c.fillText(label, x + w / 2, y + s * 0.18)
    c.globalAlpha = faded ? 0.4 : 1
    const top = y + s * 0.95
    const areaH = h - s * 1.1
    const ps = s * scale
    kinds.forEach((kind, i) => {
      const xs = kind.cells.map(([cx]) => cx)
      const ys = kind.cells.map(([, cy]) => cy)
      const pw = (Math.max(...xs) - Math.min(...xs) + 1) * ps
      const ph = (Math.max(...ys) - Math.min(...ys) + 1) * ps
      let cx: number
      let cy: number
      if (row) {
        const slot = w / kinds.length
        cx = x + slot * i + (slot - pw) / 2
        cy = top + (areaH - ph) / 2
      } else {
        const slot = Math.min(areaH / Math.max(kinds.length, 1), s * 3)
        cx = x + (w - pw) / 2
        cy = top + slot * i + (slot - ph) / 2
      }
      for (const [px, py] of kind.cells) {
        this.drawJelly(cx + (px - Math.min(...xs)) * ps, cy + (py - Math.min(...ys)) * ps, ps, kind.flavor, false, i === 0 && !faded ? 'awake' : 'sleepy', 1, 0)
      }
    })
    c.globalAlpha = 1
  }

  /**
   * 젤리 한 칸: 둥근 네모 + 아래쪽 진한 그림자 + 반짝 하이라이트 + 얼굴.
   * awake: 동그란 눈 (내려오는 중) · sleepy: 웃는 실눈 (쌓여서 쉬는 중) · happy: 터질 때 ><
   */
  private drawJelly(x: number, y: number, s: number, flavor: keyof typeof FLAVORS, star: boolean, mood: 'awake' | 'sleepy' | 'happy', scale: number, squash: number, flash = 0) {
    if (scale <= 0.02) return
    const c = this.ctx
    const f = FLAVORS[flavor]
    const inset = s * 0.05
    const size = (s - inset * 2) * scale
    const sw = size * (1 + squash)
    const sh = size * (1 - squash)
    const cx = x + s / 2
    const bottom = y + s - inset - (s - inset * 2 - size) / 2
    const left = cx - sw / 2
    const top = bottom - sh
    const r = Math.min(sw, sh) * 0.3
    c.fillStyle = f.shade
    roundRect(c, left, top, sw, sh, r)
    c.fill()
    c.fillStyle = f.fill
    roundRect(c, left, top, sw, sh * 0.86, r)
    c.fill()
    c.strokeStyle = 'rgba(90, 64, 51, 0.55)'
    c.lineWidth = Math.max(1, s * 0.05)
    roundRect(c, left, top, sw, sh, r)
    c.stroke()
    // 반짝
    c.fillStyle = 'rgba(255, 255, 255, 0.75)'
    c.beginPath()
    c.ellipse(left + sw * 0.27, top + sh * 0.22, sw * 0.11, sh * 0.07, -0.5, 0, Math.PI * 2)
    c.fill()
    if (flash) {
      c.fillStyle = `rgba(255, 255, 255, ${flash})`
      roundRect(c, left, top, sw, sh, r)
      c.fill()
    }
    if (s < 10) return
    const fx = cx
    const fy = top + sh * 0.52
    if (star) {
      // 별사탕
      c.fillStyle = '#fff6c2'
      c.strokeStyle = '#e9b95a'
      c.lineWidth = Math.max(1, s * 0.045)
      starPath(c, fx, fy, sw * 0.24, sw * 0.11)
      c.fill()
      c.stroke()
      return
    }
    const gap = sw * 0.16
    c.strokeStyle = '#3f3a3a'
    c.fillStyle = '#3f3a3a'
    c.lineWidth = Math.max(1, s * 0.055)
    if (mood === 'awake') {
      for (const d of [-1, 1]) {
        c.beginPath()
        c.ellipse(fx + d * gap, fy, sw * 0.045, sh * 0.06, 0, 0, Math.PI * 2)
        c.fill()
      }
    } else if (mood === 'sleepy') {
      for (const d of [-1, 1]) {
        c.beginPath()
        c.arc(fx + d * gap, fy + sh * 0.02, sw * 0.055, Math.PI * 1.1, Math.PI * 1.9)
        c.stroke()
      }
    } else {
      for (const d of [-1, 1]) {
        const ex = fx + d * gap
        c.beginPath()
        c.moveTo(ex - d * sw * 0.05, fy - sh * 0.05)
        c.lineTo(ex + d * sw * 0.03, fy)
        c.lineTo(ex - d * sw * 0.05, fy + sh * 0.05)
        c.stroke()
      }
    }
    // 입 · 볼
    c.beginPath()
    c.arc(fx, fy + sh * 0.06, sw * 0.05, 0.15 * Math.PI, 0.85 * Math.PI)
    c.stroke()
    c.fillStyle = 'rgba(240, 130, 140, 0.4)'
    for (const d of [-1, 1]) {
      c.beginPath()
      c.ellipse(fx + d * sw * 0.29, fy + sh * 0.1, sw * 0.07, sh * 0.045, 0, 0, Math.PI * 2)
      c.fill()
    }
  }

  // ---------- 랭킹 ----------

  private bindRanking(el: HTMLElement, record: Omit<JellyScore, 'nickname'>, openNow: boolean) {
    const resultCard = el.querySelector<HTMLElement>('.tresult__card')!
    const card = el.querySelector<HTMLElement>('.trank')!
    const form = el.querySelector<HTMLFormElement>('[data-ref="rankForm"]')!
    const input = el.querySelector<HTMLInputElement>('[data-ref="nickname"]')!
    const button = form.querySelector<HTMLButtonElement>('button')!
    const list = el.querySelector<HTMLElement>('[data-ref="rankList"]')!
    const note = el.querySelector<HTMLElement>('[data-ref="rankNote"]')!
    input.value = savedNickname().slice(0, NICKNAME_MAX)
    limitNickname(input)
    let mine: JellyScore | null = null
    let loaded = false

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const nickname = input.value.trim().slice(0, NICKNAME_MAX)
      if (!nickname) {
        note.textContent = '닉네임을 적어 주세요'
        input.focus()
        return
      }
      button.disabled = true
      input.disabled = true
      note.textContent = '올리는 중...'
      try {
        mine = { ...record, nickname }
        const result = await submitJellyScore(mine)
        rememberNickname(nickname)
        note.textContent = submitMessage(result)
        form.classList.add('is-done')
        await renderRanking(list, mine)
      } catch (error) {
        mine = null
        note.textContent = (error as Error).message
        button.disabled = false
        input.disabled = false
      }
    })
    const open = () => {
      resultCard.hidden = true
      card.hidden = false
      if (!loaded) {
        loaded = true
        void renderRanking(list, mine)
      }
      input.focus({ preventScroll: true })
    }
    el.querySelector('[data-action="rank"]')!.addEventListener('click', open)
    if (openNow) open()
  }

  /** 게임 전 · 끝난 화면: 위 🏆 랭킹 보기 → 가운데 랭킹 TOP 10 팝업 */
  private openRanking() {
    if (this.rankPopup || this.phase === 'playing' || this.phase === 'paused') return
    const popup = document.createElement('div')
    popup.className = 'train__rankpop'
    popup.innerHTML = `
      <section class="trank" aria-label="랭킹">
        <p class="trank__title">🏆 랭킹 TOP ${RANK_LIMIT}</p>
        ${RANK_HEAD}
        <ol class="trank__list"><li class="trank__empty">불러오는 중...</li></ol>
        <div class="tresult__buttons">
          <button type="button" class="tbutton" data-action="close-ranking">닫기</button>
        </div>
      </section>
    `
    this.overlay.querySelector<HTMLElement>('.train__intro')?.setAttribute('hidden', '')
    this.overlay.append(popup)
    this.overlay.classList.add('is-on')
    this.rankPopup = popup
    const close = popup.querySelector<HTMLButtonElement>('[data-action="close-ranking"]')!
    close.addEventListener('click', () => this.closeRanking())
    close.focus({ preventScroll: true })
    void renderRanking(popup.querySelector<HTMLElement>('.trank__list')!, null)
  }

  private closeRanking() {
    if (!this.rankPopup) return
    this.rankPopup.remove()
    this.rankPopup = null
    const intro = this.overlay.querySelector<HTMLElement>('.train__intro')
    intro?.removeAttribute('hidden')
    intro?.querySelector<HTMLButtonElement>('.tbutton--main')?.focus({ preventScroll: true })
  }

  // ---------- 최고 점수 (이 브라우저에만 저장) ----------

  private saveBest(score: number) {
    let best = 0
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0
      if (score > best) localStorage.setItem(BEST_KEY, String(score))
    } catch {
      // 저장소를 못 쓰면 이번 기록만
    }
    return Math.max(best, score)
  }
}

/** TOP 10: 순위 · 닉네임 · 점수 · 줄 · 레벨 */
async function renderRanking(list: HTMLElement, mine: JellyScore | null) {
  try {
    const top = await fetchJellyTop()
    if (!list.isConnected) return
    list.innerHTML = top.length
      ? top
          .map((row, i) => {
            const isMine = !!mine && row.nickname === mine.nickname
            return `<li class="trank__row${isMine ? ' is-mine' : ''}">
              <span class="trank__no">${i + 1}</span>
              <span class="trank__name">${escapeHtml(row.nickname)}</span>
              <span class="trank__round">${row.score}점</span>
              <span class="trank__score">${row.lines}줄</span>
              <span class="trank__cpm">Lv.${row.level}</span>
            </li>`
          })
          .join('')
      : '<li class="trank__empty">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</li>'
  } catch (error) {
    if (list.isConnected) list.innerHTML = `<li class="trank__empty">${escapeHtml((error as Error).message)}</li>`
  }
}

// ---------- 그림 조각 ----------

const easeIn = (t: number) => t * t

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number) {
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? inner : outer
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  c.closePath()
}

const RANK_HEAD = `
  <div class="trank__row trank__head" aria-hidden="true">
    <span class="trank__no">순위</span>
    <span class="trank__name">닉네임</span>
    <span class="trank__round">점수</span>
    <span class="trank__score">줄</span>
    <span class="trank__cpm">레벨</span>
  </div>`

/** 주머니: 동그란 끈 주머니 */
const POUCH_ICON = `<svg class="jelly__spin" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 7.5c-3 2-4.5 5-4.5 8 0 3 3 5 8 5s8-2 8-5c0-3-1.5-6-4.5-8"/><path d="M8 7.5h8"/><path d="M9.5 7.5 8 3.5M14.5 7.5 16 3.5"/></svg>`

/** 한번에 내리기: 바닥까지 내려가는 화살표 */
const DROP_ICON = `<svg class="jelly__spin" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M6.5 10.5 12 16l5.5-5.5"/><path d="M5 20.5h14"/></svg>`

/** 돌리기: 시계 방향 동그란 화살표 */
const SPIN_ICON = `<svg class="jelly__spin" viewBox="0 0 24 24" width="1.2em" height="1.2em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4.6h-4.6"/></svg>`

/** 다시 하기: 되돌리는 화살표 아이콘 (다른 게임 결과 화면과 같아요) */
const RETRY_ICON = `<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4.6h4.6"/></svg>`

/** 결과 화면 랭킹 카드: 닉네임 등록 + TOP 10 */
const RANK_CARD = `
  <section class="trank" aria-label="랭킹" hidden>
    <p class="trank__title">🏆 랭킹 TOP ${RANK_LIMIT}</p>
    <form class="trank__form" data-ref="rankForm" autocomplete="off">
      <input data-ref="nickname" type="text" maxlength="${NICKNAME_MAX}" placeholder="닉네임 (${NICKNAME_MAX}자까지)" aria-label="닉네임" spellcheck="false" />
      <button type="submit" class="tprac__enter">등록</button>
    </form>
    <p class="trank__note" data-ref="rankNote" aria-live="polite"></p>
    ${RANK_HEAD}
    <ol class="trank__list" data-ref="rankList"><li class="trank__empty">불러오는 중...</li></ol>
    <div class="tresult__buttons">
      <button type="button" class="tbutton tbutton--main tbutton--icon" data-action="again" aria-label="다시 하기" title="다시 하기">${RETRY_ICON}</button>
      <button type="button" class="tbutton" data-action="quit">그만하기</button>
    </div>
  </section>`
