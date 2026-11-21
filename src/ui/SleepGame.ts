import './typing/FallingWords.css'
import './SleepGame.css'
import type { Chiptune } from './Chiptune'
import { RetroWindow } from './RetroWindow'
import { isTouchDevice } from '../utils/device'
import { NICKNAME_MAX, RANK_LIMIT, limitNickname, rankingEnabled, rememberNickname, savedNickname, submitMessage } from './typing/ranking'
import { fetchSleepTop, sleepBoard, submitSleepScore, type SleepMode, type SleepScore } from './sleepRanking'
import { celebrateChampion, championBefore, showChampionNote } from './champion'

/*
 * 완벽한 잠을 사수하라! (꿈나라.app)
 * 침대에 누우면 켜지는 꿈속 달리기: 꿈속의 나는 저절로 앞으로 달려요.
 * 클릭(스페이스바 · 화면 톡)하면 점프, 공중에서 한 번 더 누르면 2단 점프.
 * 잠을 깨우는 알람시계 · 휴대폰 · 모기를 피하고, 양 · 별을 모아요.
 * 밤 11시부터 아침 7시까지 베개(목숨) 3개를 지키면 완벽한 잠 성공!
 */

// ---------- 게임 설정 ----------

/** 꿈속 화면에서 가로로 최소 이만큼은 보여요 (세로로 긴 모바일 화면용) */
const MIN_WORLD_W = 108
/** 밤 11시 → 아침 7시까지 걸리는 실제 시간(초) */
const NIGHT_SEC = 90
/** 잔 시간 (분) */
const NIGHT_MIN = 8 * 60
const START_HOUR = 23
const MAX_PILLOWS = 3
/** 달리는 속도 (화면 높이를 100으로 본 단위 / 초): 아침이 가까울수록 빨라져요 */
const SPEED_START = 50
const SPEED_END = 115
/** 배경음악 빠르기(BPM): 속도가 빨라질수록 같이 빨라져요 */
const MUSIC_TEMPO_START = 112
const MUSIC_TEMPO_END = 150
/** 모기는 땅보다 이만큼 더 빨리 날아와요 */
const MOSQUITO_DRIFT = 10
/** 스피드 게임: 달리기 속도 2배, 배경음악은 1.25배 */
const SPEED_MODE_MUL = 2
const SPEED_MODE_TEMPO_MUL = 1.25
const GRAVITY = 430
const JUMP_V = 152
const DOUBLE_JUMP_V = 132
/** 한 번 점프의 체공 시간(초) · 높이 */
const JUMP_AIR = (2 * JUMP_V) / GRAVITY
/** 꼭대기에서 2단 점프했을 때 가장 높은 곳 */
const DOUBLE_JUMP_TOP = (JUMP_V * JUMP_V + DOUBLE_JUMP_V * DOUBLE_JUMP_V) / (2 * GRAVITY)
/** 지금 속도로 한 번 뛰면 가로로 가는 거리 */
const jumpSpan = (speed: number) => JUMP_AIR * speed

/** 점프 궤적(시간 · 발 높이) 표: 한 번 점프, 또는 꼭대기에서 2단 점프 */
function jumpPath(double: boolean) {
  const path: { t: number; h: number }[] = []
  let t = 0
  let h = 0
  let v = JUMP_V
  let usedDouble = !double
  const dt = 1 / 240
  do {
    path.push({ t, h })
    if (!usedDouble && v <= 0) {
      v = DOUBLE_JUMP_V
      usedDouble = true
    }
    h += v * dt
    v -= GRAVITY * dt
    t += dt
  } while (h > 0)
  path.push({ t, h: 0 })
  return path
}

function heightAt(path: { t: number; h: number }[], t: number) {
  const i = Math.min(Math.floor((t / path[path.length - 1].t) * (path.length - 1)), path.length - 1)
  return path[i].h
}
/** 땅에서 살짝 떨어진 뒤에도 점프를 받아 주는 시간 · 땅에 닿기 직전 누른 점프를 기억하는 시간 */
const COYOTE_SEC = 0.08
const BUFFER_SEC = 0.12
/** 부딪힌 뒤 깜박이며 안 다치는 시간 */
const HURT_SEC = 1.6
const SHEEP_POINT = 1
const STAR_POINT = 5
/** 이 시간 안에 다음 양 · 별을 먹으면 콤보가 이어져요 (초) */
const COMBO_SEC = 2.2
/** 콤보 10마다 보너스 */
const COMBO_STEP = 10
const COMBO_BONUS = 5
/** 발 너비 반 (이불 틈 판정) */
const FOOT_HW = 2
const CLEAR_BONUS = 30
/** 아침이 되기 직전 몇 초는 새로 안 나와요 (화면을 비우고 해가 떠요) */
const QUIET_END_SEC = 2.5

/** 땅 높이 (위에서부터, 화면 높이 100 기준) */
const GROUND = 84
const PLAYER_X = 20
/** 그림 선: 얇고 연한 갈색 (투박하지 않게) */
const LINE = '#9a7a68'
const BEST_KEY = 'tiny-room-sleep-best'

type Phase = 'intro' | 'playing' | 'paused' | 'over'
type Kind = 'clock' | 'phone' | 'mosquito' | 'sheep' | 'star' | 'milk'

interface Thing {
  kind: Kind
  x: number
  /** 땅 위 물건은 바닥 높이, 떠 있는 건 가운데 높이 */
  y: number
  /** 애니메이션용 시간 */
  t: number
  /** 부딪힘 상자 (가운데 기준 반폭 · 반높이) */
  hw: number
  hh: number
  /** 모기는 위아래로 둥실 */
  baseY?: number
  done?: boolean
}

interface Pop {
  text: string
  x: number
  y: number
  t: number
  color: string
}

const HARMFUL: Kind[] = ['clock', 'phone', 'mosquito']
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** 밤 11시 + 흐른 분 → "03:20" */
function clockLabel(min: number) {
  const total = (START_HOUR * 60 + Math.floor(min)) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** 깬 때: 밤 · 새벽 · 아침 */
function periodLabel(min: number) {
  const hour = (START_HOUR + Math.floor(min / 60)) % 24
  return hour >= 21 ? '밤' : hour < 5 ? '새벽' : '아침'
}

/** 잔 시간 → "4시간 20분" */
function sleptLabel(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m}분`
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

export class SleepGame {
  /** 양 · 별을 모았을 때 (자면서 방긋) */
  onCollect: (() => void) | null = null
  /** 창을 닫을 때 */
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  /** 게임 화면 (결과 화면에서 다시 하기를 누르면 다시 붙여요) */
  private readonly el = document.createElement('div')
  private readonly canvas: HTMLCanvasElement
  /** 지금 그리는 곳 (화면 캔버스) */
  private ctx: CanvasRenderingContext2D
  private readonly screen: CanvasRenderingContext2D
  private readonly overlay: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly rankButton: HTMLButtonElement
  private readonly hud: Record<'clock' | 'pillows' | 'sheep' | 'score' | 'bar', HTMLElement>
  private rankPopup: HTMLElement | null = null

  private phase: Phase = 'intro'
  /** 화면 크기 (높이 100 기준 단위) */
  private worldW = 133
  /** 세로로 긴 화면에서 0보다 위로 더 보이는 하늘 높이 */
  private skyTop = 0
  private scale = 4
  /** 전체 흐른 시간 (배경 애니메이션용, 멈춰 있어도 흘러요) */
  private time = 0

  // 판마다 바뀌는 값
  private elapsed = 0
  private distance = 0
  private pillows = MAX_PILLOWS
  private sheep = 0
  private stars = 0
  private things: Thing[] = []
  private pops: Pop[] = []
  private spawnLeft = 30
  /** 스피드 게임(속도 2배)으로 하는 중 */
  private speedMode = false
  /** 이불 틈: 이 구간은 바닥이 없어요 */
  private holes: { x: number; w: number }[] = []
  private combo = 0
  private comboTimer = 0
  private maxCombo = 0
  private comboBonus = 0

  // 꿈속의 나
  private py = GROUND
  private vy = 0
  private jumpsUsed = 0
  /** 이불 위에 서 있어요 */
  private grounded = true
  /** 이불 틈 아래로 빠지는 중 (다시 이불 높이 위로 올라오기 전까지 바닥을 무시해요) */
  private falling = false
  private sinceGround = 0
  private bufferedJump = 0
  private hurt = 0
  private runPhase = 0
  private lastHud = ''

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '꿈나라.app', '완벽한 잠을 사수하라')
    this.win.onClose = () => {
      this.phase = this.phase === 'playing' ? 'paused' : this.phase
      this.onClose?.()
    }
    this.win.onEscape = () => this.onEscape()

    this.el.className = 'train sleep'
    this.el.innerHTML = `
      <div class="train__top">
        <span class="tbadge sleep__clock" data-hud="clock">🌙 23:00</span>
        <button type="button" class="tback train__pause" data-action="pause" hidden>⏸ 멈춤 <small>Esc</small></button>
        <button type="button" class="tback train__rankbtn" data-action="ranking" hidden>🏆 랭킹 보기</button>
        <div class="train__stats">
          <span class="train__stat">베개 <span class="sleep__pillows" data-hud="pillows"></span></span>
          <span class="train__stat">양 <b data-hud="sheep">0</b>마리</span>
          <span class="train__stat train__stat--score">점수 <b data-hud="score">0</b>점</span>
        </div>
      </div>
      <div class="sleep__night" aria-hidden="true">
        <span>🌙</span>
        <div class="sleep__bar"><i data-hud="bar"></i></div>
        <span>☀️</span>
      </div>
      <div class="train__field sleep__field">
        <canvas class="sleep__canvas" data-ref="canvas" aria-label="꿈속 달리기 화면"></canvas>
        <div class="train__overlay" data-ref="overlay"></div>
      </div>
    `
    this.canvas = this.el.querySelector<HTMLCanvasElement>('[data-ref="canvas"]')!
    this.screen = this.canvas.getContext('2d')!
    this.ctx = this.screen
    this.overlay = this.el.querySelector<HTMLElement>('[data-ref="overlay"]')!
    const hud = (name: string) => this.el.querySelector<HTMLElement>(`[data-hud="${name}"]`)!
    this.hud = { clock: hud('clock'), pillows: hud('pillows'), sheep: hud('sheep'), score: hud('score'), bar: hud('bar') }
    this.pauseButton = this.el.querySelector<HTMLButtonElement>('[data-action="pause"]')!
    this.pauseButton.addEventListener('click', () => this.pause())
    this.rankButton = this.el.querySelector<HTMLButtonElement>('[data-action="ranking"]')!
    this.rankButton.addEventListener('click', () => this.openRanking())

    // 화면을 누르는 순간 바로 점프 (클릭이 끝날 때까지 기다리지 않게 pointerdown)
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.pressJump()
    })
    window.addEventListener('keydown', (e) => {
      if (!this.win.isOpen || this.phase !== 'playing') return
      if (e.target instanceof HTMLInputElement) return
      if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return
      // 스페이스가 버튼을 누르거나 화면을 내리지 않게 막고, 꾹 누르고 있는 건 한 번만
      e.preventDefault()
      if (!e.repeat) this.pressJump()
    })
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
    this.draw()
  }

  // ---------- 진행 ----------

  private mountGame() {
    if (!this.el.isConnected) this.win.body.replaceChildren(this.el)
  }

  private reset() {
    this.elapsed = 0
    this.distance = 0
    this.pillows = MAX_PILLOWS
    this.sheep = 0
    this.stars = 0
    this.things = []
    this.pops = []
    this.spawnLeft = 30
    this.holes = []
    this.combo = 0
    this.comboTimer = 0
    this.maxCombo = 0
    this.comboBonus = 0
    this.grounded = true
    this.falling = false
    this.py = GROUND
    this.vy = 0
    this.jumpsUsed = 0
    this.sinceGround = 0
    this.bufferedJump = 0
    this.hurt = 0
    this.renderHud()
  }

  /** 게임 시작 전: 제목 · 규칙 · 게임 시작 버튼 (떨어지는 낱말연습 라운드 인트로와 같은 모양) */
  private showIntro() {
    this.phase = 'intro'
    this.music.stop()
    const tap = isTouchDevice() ? '화면 톡' : '클릭 · 스페이스'
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title sleep__title">완벽한 잠을<br />사수하라!</p>
        <p class="train__desc">아침 <b>7시</b>까지 깨지 않고 푹 자면 성공!</p>
        <ul class="train__rules">
          <li><span class="train__chip">${tap}</span>점프! <span class="train__more">공중에서 </span>한 번 더 누르면 <b>2단 점프</b></li>
          <li><span class="train__chip sleep__chip--sheep">🐑 양</span><b>+${SHEEP_POINT}점</b> · <span class="train__chip sleep__chip--star">⭐ 별</span><b>+${STAR_POINT}점</b><span class="train__more"> (높이 있어요!)</span></li>
          <li><span class="train__chip train__chip--fast">⏰ 📱 🦟</span><span class="train__more">알람 · 휴대폰 · 모기에 </span>부딪히면 베개 <b>−1</b></li>
          <li class="train__more">양을 <b>연달아</b> 먹으면 콤보! 음이 올라가고 ${COMBO_STEP}콤보마다 <b>+${COMBO_BONUS}점</b></li>
          <li>이불 틈으로 떨어지면 <b>바로 깨요!</b><span class="train__more"> (넓은 틈은 2단 점프로 건너요)</span></li>
          <li class="train__more">따뜻한 우유 🥛를 마시면 베개가 하나 돌아와요</li>
          <li class="train__more">베개 <b>${MAX_PILLOWS}개</b>를 다 잃으면 잠에서 깨요</li>
        </ul>
        <div class="train__buttons">
          <button type="button" class="tbutton tbutton--main" data-action="start">게임 시작</button>
          <button type="button" class="tbutton sleep__speedbtn" data-action="speed"><span class="sleep__new" aria-label="새 모드">NEW</span>⚡ 스피드 게임 <small>속도 2배</small></button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    const button = this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]')!
    button.addEventListener('click', () => this.start(false))
    this.overlay.querySelector('[data-action="speed"]')!.addEventListener('click', () => this.start(true))
    this.renderHud()
    setTimeout(() => button.isConnected && button.focus({ preventScroll: true }), 450)
  }

  /** speedMode: 스피드 게임(속도 2배) */
  private start(speedMode = this.speedMode) {
    this.speedMode = speedMode
    this.closeRanking()
    this.reset()
    this.overlay.classList.remove('is-on')
    this.overlay.replaceChildren()
    ;(document.activeElement as HTMLElement | null)?.blur()
    // 버튼 클릭 안에서 소리를 켜야 브라우저가 막지 않아요. 자장가처럼 조금 느리게 시작해요
    this.music.start(this.musicTempo())
    this.phase = 'playing'
    this.renderHud()
  }

  /** Esc: 랭킹 팝업 닫기 → 플레이 중이면 멈춤 → 멈춤 화면이면 계속하기 */
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
    this.music.stop()
    this.renderHud()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--pause">잠깐 멈춤</p>
        <p class="train__desc">지금 <b>${clockLabel(this.sleptMin())}</b> · 베개 ${this.pillows}개 · 양 ${this.sheep}마리</p>
        <div class="train__buttons">
          <button type="button" class="tbutton tbutton--main" data-action="resume">계속하기</button>
          <button type="button" class="tbutton" data-action="quit">그만하기</button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    this.overlay.querySelector('[data-action="resume"]')!.addEventListener('click', () => this.resume())
    this.overlay.querySelector('[data-action="quit"]')!.addEventListener('click', () => this.close())
    this.overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus({ preventScroll: true })
  }

  private resume() {
    if (this.phase !== 'paused') return
    this.overlay.classList.remove('is-on')
    this.overlay.replaceChildren()
    ;(document.activeElement as HTMLElement | null)?.blur()
    this.music.start(this.musicTempo())
    this.phase = 'playing'
    this.renderHud()
  }

  /** 베개를 다 잃었어요: 깼다! (떨어지는 낱말연습 실패 화면과 같은 모양) */
  private wakeUp(reason = '') {
    this.phase = 'over'
    this.music.stop()
    this.music.sfx('miss')
    this.renderHud()
    const slept = this.sleptMin()
    const hasRank = rankingEnabled()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--fail">깼다!</p>
        <p class="train__desc">${reason ? `${reason} ` : ''}${periodLabel(slept)} <b>${clockLabel(slept)}</b>에 잠에서 깼어요 (${sleptLabel(slept)} 잤어요)</p>
        <p class="train__rule">${this.speedMode ? '⚡ 스피드 게임 · ' : ''}양 ${this.sheep}마리 · 별 ${this.stars}개 · 점수 ${this.score()}점</p>
        <div class="train__buttons">
          ${hasRank ? '<button type="button" class="tbutton tbutton--main" data-action="submit-rank">🏆 랭킹 등록</button>' : ''}
          <button type="button" class="tbutton${hasRank ? '' : ' tbutton--main'}" data-action="restart">다시 시작하기</button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    this.overlay.querySelector('[data-action="submit-rank"]')?.addEventListener('click', () => this.showResult(false, true))
    this.overlay.querySelector('[data-action="restart"]')!.addEventListener('click', () => this.start())
    this.overlay.querySelector<HTMLButtonElement>('.tbutton--main')!.focus({ preventScroll: true })
  }

  /** 결과 화면: 결과 카드 + 랭킹 카드 (타자연습 · 설거지 결과와 같은 모양) */
  private showResult(cleared: boolean, openRanking = false) {
    this.phase = 'over'
    this.music.stop()
    if (cleared) this.music.sfx('clear')
    const slept = this.sleptMin()
    const score = this.score()
    const best = this.saveBest(score)
    const isBest = score > 0 && score >= best
    const hasRank = rankingEnabled()
    const el = document.createElement('div')
    el.className = 'tresult'
    el.innerHTML = `
      <div class="tresult__card">
        <p class="tresult__title">${this.speedMode ? '⚡ ' : ''}${cleared ? '완벽한 잠 성공! ☀️' : '아쉬워요, 깼어요!'}${isBest ? ' <mark>최고 기록 🎉</mark>' : ''}</p>
        <div class="tresult__lines">
          <div class="tresult__line"><span>잔 시간</span><b>${sleptLabel(slept)}</b></div>
          <div class="tresult__line"><span>모은 양</span><b>${this.sheep}마리</b></div>
          <div class="tresult__line"><span>모은 별</span><b>${this.stars}개</b></div>
          <div class="tresult__line"><span>최대 콤보</span><b>${this.maxCombo}콤보</b></div>
          <div class="tresult__line"><span>점수</span><b>${score}점${cleared ? ` <small>(보너스 +${CLEAR_BONUS})</small>` : ''}</b></div>
          <div class="tresult__line"><span>최고 점수</span><b>${best}점</b></div>
        </div>
        <div class="tresult__buttons">
          <button type="button" class="tbutton tbutton--main tbutton--icon" data-action="again" aria-label="다시 하기" title="다시 하기">${RETRY_ICON}</button>
          ${hasRank ? '<button type="button" class="tbutton" data-action="rank">🏆 랭킹 등록</button>' : ''}
          <button type="button" class="tbutton" data-action="quit">그만하기</button>
        </div>
      </div>
      ${hasRank ? rankCard(this.mode) : ''}
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
    if (hasRank) this.bindRanking(el, { cleared, slept_min: slept, sheep: this.sheep, score }, openRanking)
    if (!openRanking) el.querySelector<HTMLButtonElement>('[data-action="again"]')?.focus({ preventScroll: true })
  }

  // ---------- 한 프레임 ----------

  private step(dt: number) {
    const hourBefore = Math.floor((this.elapsed / NIGHT_SEC) * 8)
    this.elapsed += dt
    const progress = this.progress()
    const hour = Math.floor(progress * 8)
    if (hour > hourBefore && hour < 8) {
      this.pop('속도 UP!', this.worldW / 2, 30, '#ec6a52')
      this.music.sfx('clear')
    }
    const speed = lerp(SPEED_START, SPEED_END, progress) * (this.speedMode ? SPEED_MODE_MUL : 1)
    // 달리기가 빨라지는 만큼 배경음악도 같이 빨라져요
    this.music.setTempo(this.musicTempo())
    const move = speed * dt
    this.distance += move
    this.runPhase += dt * (6 + speed / 10)

    // 꿈속의 나: 점프 · 중력
    this.bufferedJump = Math.max(this.bufferedJump - dt, 0)
    this.comboTimer = Math.max(this.comboTimer - dt, 0)
    if (!this.comboTimer) this.combo = 0
    for (const hole of this.holes) hole.x -= move
    this.holes = this.holes.filter((h) => h.x + h.w > -20)
    this.vy += GRAVITY * dt
    this.py += this.vy * dt
    if (this.falling && this.py < GROUND) this.falling = false
    if (this.py >= GROUND && !this.falling && !this.overHole()) {
      this.py = GROUND
      this.vy = 0
      this.jumpsUsed = 0
      this.sinceGround = 0
      this.grounded = true
      if (this.bufferedJump > 0) this.jump()
    } else {
      this.grounded = false
      if (this.py > GROUND + 0.5) this.falling = true
      if (this.py > 104 && this.vy > 0) {
        this.rescue()
        if (this.phase !== 'playing') return
      }
      this.sinceGround += dt
      // 점프 없이 땅에서 떨어진 게 아니면 첫 점프는 코요테 시간 뒤 쓴 걸로 쳐요
      if (this.jumpsUsed === 0 && this.sinceGround > COYOTE_SEC) this.jumpsUsed = 1
    }
    this.hurt = Math.max(this.hurt - dt, 0)

    // 새로 나오는 것들
    if (NIGHT_SEC - this.elapsed > QUIET_END_SEC) {
      this.spawnLeft -= move
      if (this.spawnLeft <= 0) this.spawnLeft = this.spawn(progress, speed)
    }

    // 움직이고 부딪히기
    const box = this.playerBox()
    for (const thing of this.things) {
      thing.t += dt
      thing.x -= move + (thing.kind === 'mosquito' ? MOSQUITO_DRIFT * dt : 0)
      if (thing.baseY !== undefined) thing.y = thing.baseY + Math.sin(thing.t * 3.2) * 6
      if (thing.done) continue
      const cy = thing.kind === 'clock' || thing.kind === 'phone' ? thing.y - thing.hh : thing.y
      const hit = Math.abs(thing.x - box.x) < thing.hw + box.hw && Math.abs(cy - box.y) < thing.hh + box.hh
      if (hit) this.touch(thing)
      if (this.phase !== 'playing') return
    }
    this.things = this.things.filter((t) => t.x > -20 && !(t.done && !HARMFUL.includes(t.kind)))
    this.pops = this.pops.filter((p) => (p.t += dt) < 0.9)

    this.renderHud()
    if (this.elapsed >= NIGHT_SEC) {
      this.elapsed = NIGHT_SEC
      this.showResult(true)
    }
  }

  private pressJump() {
    if (this.phase !== 'playing') return
    if (this.grounded || this.sinceGround <= COYOTE_SEC || this.jumpsUsed < 2) this.jump()
    else this.bufferedJump = BUFFER_SEC
  }

  private jump() {
    const onGround = this.grounded || (this.jumpsUsed === 0 && this.sinceGround <= COYOTE_SEC)
    if (!onGround && this.jumpsUsed >= 2) return
    this.vy = -(onGround ? JUMP_V : DOUBLE_JUMP_V)
    this.jumpsUsed = onGround ? 1 : 2
    this.sinceGround = COYOTE_SEC + 1
    this.bufferedJump = 0
    this.grounded = false
    if (!this.falling) this.py = Math.min(this.py, GROUND - 0.01)
    this.music.sfx('jump')
  }

  /** 발이 통째로 이불 틈 위에 있어요 */
  private overHole() {
    return this.holes.some((h) => h.x < PLAYER_X - FOOT_HW && h.x + h.w > PLAYER_X + FOOT_HW)
  }

  /** 이불 틈으로 떨어졌어요: 그 자리에서 바로 깨요 */
  private rescue() {
    this.pillows = 0
    this.combo = 0
    this.comboTimer = 0
    this.wakeUp('이불 밖으로 떨어져서')
  }


  private touch(thing: Thing) {
    if (HARMFUL.includes(thing.kind)) {
      if (this.hurt > 0) return
      thing.done = true
      this.pillows -= 1
      this.hurt = HURT_SEC
      this.combo = 0
      this.comboTimer = 0
      const word = { clock: '따르릉!', phone: '띠링!', mosquito: '위잉~' }[thing.kind as 'clock' | 'phone' | 'mosquito']
      this.pop(word, PLAYER_X + 4, this.py - 20, '#ec6a52')
      // 부딪힌 것마다 소리: 알람시계는 따르릉, 모기는 위잉~, 휴대폰은 띠링
      this.music.sfx(({ clock: 'ring', phone: 'ding', mosquito: 'buzz' } as const)[thing.kind as 'clock' | 'phone' | 'mosquito'])
      if (this.pillows <= 0) this.wakeUp()
      return
    }
    thing.done = true
    if (thing.kind === 'sheep' || thing.kind === 'star') {
      // 연달아 먹으면 콤보: 음이 한 칸씩 올라가요
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1
      this.comboTimer = COMBO_SEC
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      this.music.coin(this.combo)
      if (thing.kind === 'sheep') {
        this.sheep += 1
        this.pop(this.combo >= 3 ? `${this.combo}` : `+${SHEEP_POINT}`, thing.x, thing.y - 6, '#2f8a63')
      } else {
        this.stars += 1
        this.pop(`+${STAR_POINT}`, thing.x, thing.y - 6, '#e0a100')
        this.music.sfx('freeze')
      }
      if (this.combo % COMBO_STEP === 0) {
        this.comboBonus += COMBO_BONUS
        this.pop(`${this.combo}콤보! +${COMBO_BONUS}`, PLAYER_X + 14, this.py - 26, '#ec6a52')
        this.music.sfx('clear')
      }
    } else {
      this.pillows = Math.min(this.pillows + 1, MAX_PILLOWS)
      this.pop('베개 +1', thing.x, thing.y - 6, '#5d8fc9')
      this.music.sfx('clear')
    }
    this.onCollect?.()
  }

  /**
   * 다음 코스를 화면 오른쪽 밖에 놓고, 그다음 코스까지 거리를 돌려줘요.
   * 양이 줄지어 나오는 코스(줄 · 물결 · 무지개)와 이불 틈(작은 틈 · 2단 점프 틈 · 징검다리)이 섞여요.
   * 아침이 가까울수록 모기 · 넓은 틈 · 징검다리가 늘어요.
   */
  private spawn(progress: number, speed: number) {
    const x = this.worldW + 12
    /** 이불 틈 하나 + 그 위로 진짜 점프 궤적을 따라 양 무지개 (지금 속도 기준, 틈 가운데에 맞춰요) */
    const holeWithArc = (hx: number, w: number, n: number, double = false) => {
      this.holes.push({ x: hx, w })
      const span = this.jumpArc(hx + w / 2, speed, n, double)
      return Math.max(hx - x + w, hx + w / 2 + span / 2 - x)
    }
    const options: [weight: number, make: () => number][] = [
      [2.2, () => this.add('clock', x, GROUND)],
      [1.4, () => this.add('phone', x, GROUND)],
      // 모기: 낮게(뛰어 넘기) 또는 높게(그냥 달리면 안전, 뛰면 부딪혀요). 아침이 가까울수록 높은 모기가 늘어요
      [
        progress > 0.08 ? 0.8 + 2 * progress : 0,
        () => this.add('mosquito', x, GROUND - (Math.random() < 0.3 + progress * 0.4 ? rand(30, 46) : rand(14, 24))),
      ],
      // 하늘에 뜬금없이 떠 있는 알람시계: 습관처럼 뛰면 부딪혀요
      [progress > 0.12 ? 0.9 + 1.2 * progress : 0, () => this.skyClock(x)],
      // 알람시계 위로 양 무지개: 점프하면 같이 먹어요
      [
        1.6,
        () => {
          const span = jumpSpan(speed)
          this.add('clock', x + span / 2, GROUND)
          this.jumpArc(x + span / 2, speed, 5)
          return span
        },
      ],
      // 이불 위에 길게 줄지은 양
      [
        2,
        () => {
          const n = 6 + Math.floor(Math.random() * 9)
          for (let i = 0; i < n; i++) this.add('sheep', x + i * 7, GROUND - 5)
          // 가끔 줄 위 하늘에 시계나 모기가 떠 있어요: 땅으로 달리며 먹으면 안전해요
          if (progress > 0.15 && Math.random() < 0.3 + progress * 0.5) {
            const hx = x + rand(0.3, 0.8) * n * 7
            if (Math.random() < 0.55) this.skyClock(hx)
            else this.add('mosquito', PLAYER_X + ((hx - PLAYER_X) * (speed + MOSQUITO_DRIFT)) / speed, GROUND - rand(30, 44))
          }
          return n * 7
        },
      ],
      // 양 대행진 (양 30마리쯤): 이불 위 줄 → 틈 넘는 무지개 → 줄 → 2단 점프 무지개 → 줄 → 높은 물결로 이어지는 긴 코스
      [
        progress > 0.05 ? 1.3 : 0,
        () => {
          let cx = x
          const line = (n: number) => {
            for (let i = 0; i < n; i++) this.add('sheep', cx + i * 7, GROUND - 5)
            cx += n * 7 + 4
          }
          const single = jumpSpan(speed)
          const double = this.jumpArc(-1000, speed, 0, true)
          line(6)
          // 작은 틈 + 한 번 점프 무지개
          this.holes.push({ x: cx + single / 2 - 7, w: 14 })
          this.jumpArc(cx + single / 2, speed, 5)
          cx += single + 10
          line(5)
          // 2단 점프 무지개 (꼭대기에 별)
          this.jumpArc(cx + double / 2, speed, 7, true)
          this.add('star', cx + double / 2, GROUND - DOUBLE_JUMP_TOP - 6.5)
          // 2단 점프 무지개 아래엔 휴대폰
          this.add('phone', cx + double / 2, GROUND)
          cx += double + 10
          line(4)
          // 마지막은 높은 물결 하나 (아래에 알람시계)
          this.jumpArc(cx + double / 2, speed, 7, true)
          this.add('clock', cx + double / 2, GROUND)
          cx += double
          return cx - x
        },
      ],
      // 끝없는 물결 양: 2단 점프 궤적을 여러 개 이어 붙여 길게 (두 번 눌러야 꼭대기까지 먹어요).
      // 물결 사이 땅에는 알람시계 · 휴대폰, 물결 아래엔 모기가 끼어 있어서 박자를 놓치면 부딪혀요
      [
        1.6,
        () => {
          const span = this.jumpArc(-1000, speed, 0, true)
          // 물결 사이는 거의 붙여요: 착지하자마자 다시 뛰면 다음 물결에 딱 맞아요
          const gap = 3
          const humps = 4 + Math.floor(Math.random() * 3) + (progress > 0.5 ? 1 : 0)
          for (let k = 0; k < humps; k++) {
            const cx = x + span / 2 + k * (span + gap)
            const first = this.things.length
            this.jumpArc(cx, speed, 7, true)
            // 꼭대기 함정: 물결 꼭대기 양 대신 모기나 시계가 떠 있어요.
            // 이 물결은 2단 점프하면 부딪히고, 한 번만 뛰면 아래로 지나가요
            if (k > 0 && Math.random() < 0.22 + progress * 0.3) {
              const apex = this.things.splice(first + 3, 1)[0]
              if (Math.random() < 0.5) {
                this.add('mosquito', PLAYER_X + ((apex.x - PLAYER_X) * (speed + MOSQUITO_DRIFT)) / speed, apex.y)
              } else {
                this.add('clock', apex.x, apex.y + 5.2)
              }
              continue
            }
            // 방해물: 물결 가운데 땅(뛰어서 넘어요)에 시계 · 휴대폰, 가끔은 낮게 뜬 모기
            if (k > 0 && Math.random() < 0.35 + progress * 0.4) {
              const r = Math.random()
              if (r < 0.4) this.add('clock', cx, GROUND)
              else if (r < 0.75) this.add('phone', cx, GROUND)
              // 모기는 땅보다 조금 빨리 날아와서, 물결 가운데에 같이 도착하게 그만큼 뒤에 놓아요
              else this.add('mosquito', PLAYER_X + ((cx - PLAYER_X) * (speed + MOSQUITO_DRIFT)) / speed, GROUND - 13)
            }
          }
          return humps * (span + gap)
        },
      ],
      // 작은 이불 틈: 한 번 점프로 건너요
      [2.6, () => holeWithArc(x + 8, rand(13, 18), 5)],
      // 넓은 이불 틈: 2단 점프로 건너고, 꼭대기엔 별
      [
        progress > 0.1 ? 2.2 : 0,
        () => {
          const w = Math.min(Math.max(speed * 0.45, 24), 44)
          const end = holeWithArc(x + 10, w, 7, true)
          // 별은 2단 점프 꼭대기에
          this.add('star', x + 10 + w / 2, GROUND - DOUBLE_JUMP_TOP - 6.5)
          return end
        },
      ],
      // 징검다리: 작은 틈 셋, 틈마다 양
      [
        progress > 0.3 ? 1.5 : 0,
        () => {
          // 틈 사이 거리 = 한 번 점프 거리 + 디딜 자리 (빨라지면 같이 넓어져요)
          const step = jumpSpan(speed) + 14
          let end = 0
          for (let i = 0; i < 3; i++) end = holeWithArc(x + 8 + i * step, 13, 3)
          return end
        },
      ],
      // 두 개 연속: 착지하자마자 다시 점프
      [
        progress > 0.3 ? 1.2 : 0,
        () => {
          // 첫 번째를 넘어 착지한 뒤 다시 뛸 자리가 있게: 점프 거리 + 여유
          const gap = jumpSpan(speed) + 20
          this.add(Math.random() < 0.5 ? 'clock' : 'phone', x, GROUND)
          this.add('clock', x + gap, GROUND)
          return gap
        },
      ],
      // 높은 곳의 별: 2단 점프로만 닿아요 (가끔 아래에 휴대폰)
      [
        0.9,
        () => {
          this.add('star', x + 6, GROUND - DOUBLE_JUMP_TOP - 4)
          if (progress > 0.4 && Math.random() < 0.5) this.add('phone', x + 6, GROUND)
          return 12
        },
      ],
      [this.pillows < MAX_PILLOWS ? 0.45 : 0, () => this.add('milk', x, GROUND - 16)],
    ]
    const total = options.reduce((sum, [w]) => sum + w, 0)
    let pick = Math.random() * total
    let width = 0
    for (const [w, make] of options) {
      pick -= w
      if (pick <= 0) {
        width = make()
        break
      }
    }
    // 속도가 빨라져도 반응할 여유가 비슷하게 거리를 조금씩 늘려요
    return width + rand(40, 66) + speed * 0.3
  }

  /**
   * 진짜 점프 궤적 위에 양을 놓아요. 지금 속도로 뛰었을 때 몸이 지나가는 길이라 한 번 뛰면 줄줄이 먹어요.
   * centerX: 궤적 가운데, double: 꼭대기에서 2단 점프. 궤적의 가로 길이를 돌려줘요.
   */
  private jumpArc(centerX: number, speed: number, n: number, double = false) {
    const path = jumpPath(double)
    const total = path[path.length - 1].t
    const span = total * speed
    for (let i = 0; i < n; i++) {
      // 양 끝은 땅에 붙어 있어서 조금 안쪽부터 놓아요
      const t = total * (0.12 + 0.76 * (n === 1 ? 0.5 : i / (n - 1)))
      const h = heightAt(path, t)
      this.add('sheep', centerX - span / 2 + t * speed, GROUND - 6.5 - h)
    }
    return span
  }

  /**
   * 하늘에 떠서 위아래로 흔들리는 알람시계. 높이는 한 번 점프 ~ 2단 점프 사이라
   * 땅으로 달리면 아래로 지나가고, 뛰는 타이밍에 따라 부딪혀요.
   */
  private skyClock(x: number) {
    this.add('clock', x, GROUND - rand(28, 46) + 5.2)
    this.things[this.things.length - 1].baseY = this.things[this.things.length - 1].y
    return 10
  }

  private add(kind: Kind, x: number, y: number) {
    const size: Record<Kind, [number, number]> = {
      clock: [4.2, 5.2],
      phone: [3.4, 5.2],
      mosquito: [3.6, 2.8],
      sheep: [4.2, 3.8],
      star: [4.4, 4.4],
      milk: [3.8, 4.2],
    }
    const [hw, hh] = size[kind]
    this.things.push({ kind, x, y, t: Math.random() * 3, hw, hh, baseY: kind === 'mosquito' ? y : undefined })
    return 0
  }

  private pop(text: string, x: number, y: number, color: string) {
    this.pops.push({ text, x, y, t: 0, color })
  }

  private playerBox() {
    return { x: PLAYER_X, y: this.py - 6.5, hw: 3.6, hh: 5.8 }
  }

  /** 배경음악 빠르기: 밤 11시 112 → 아침 7시 150 (달리기 속도와 같이 올라가요) */
  private musicTempo() {
    return lerp(MUSIC_TEMPO_START, MUSIC_TEMPO_END, this.progress()) * (this.speedMode ? SPEED_MODE_TEMPO_MUL : 1)
  }

  private progress() {
    return Math.min(this.elapsed / NIGHT_SEC, 1)
  }

  private sleptMin() {
    return Math.round(this.progress() * NIGHT_MIN)
  }

  private score() {
    return this.sheep * SHEEP_POINT + this.stars * STAR_POINT + this.comboBonus + (this.elapsed >= NIGHT_SEC ? CLEAR_BONUS : 0)
  }

  // ---------- 화면 위 숫자 ----------

  private renderHud() {
    const playing = this.phase === 'playing'
    this.pauseButton.hidden = !playing
    this.rankButton.hidden = !(this.phase === 'intro' || this.phase === 'over') || !rankingEnabled()
    const slept = this.sleptMin()
    const key = `${this.phase}|${slept}|${this.pillows}|${this.sheep}|${this.stars}|${this.comboBonus}`
    if (key === this.lastHud) return
    this.lastHud = key
    const morning = this.progress() >= 0.9
    this.hud.clock.textContent = `${morning ? '☀️' : '🌙'} ${clockLabel(slept)}${this.speedMode ? ' ⚡' : ''}`
    this.hud.pillows.innerHTML = Array.from({ length: MAX_PILLOWS }, (_, i) => `<i class="${i < this.pillows ? '' : 'is-lost'}">${PILLOW_ICON}</i>`).join('')
    this.hud.sheep.textContent = String(this.sheep)
    this.hud.score.textContent = String(this.score())
    this.hud.bar.style.width = `${this.progress() * 100}%`
    this.el.classList.toggle('is-danger', playing && this.pillows === 1)
  }

  // ---------- 그리기 ----------

  /** 캔버스를 창 크기에 맞춰요. 높이를 100으로 보고 그려요 */
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
    // 세로로 긴 화면에서도 앞이 보이게 가로는 최소 MIN_WORLD_W만큼 보여요 (남는 높이는 위쪽 하늘로)
    this.scale = Math.min(ph / 100, pw / MIN_WORLD_W)
    this.worldW = pw / this.scale
    this.skyTop = ph / this.scale - 100
  }

  private draw() {
    const c = this.screen
    const p = this.progress()
    this.ctx = c
    c.setTransform(this.scale, 0, 0, this.scale, 0, this.skyTop * this.scale)
    c.lineJoin = 'round'
    c.lineCap = 'round'
    this.drawSky(p)
    this.drawGround()

    // 물건 · 양: 외곽선 없는 플랫 그림 그대로
    for (const thing of this.things) if (!(thing.done && !HARMFUL.includes(thing.kind))) this.drawThing(thing)
    // 몽실이는 손그림 갈색 선을 직접 그려서 레이어 밖에서
    this.drawPlayer()
    for (const pop of this.pops) {
      const k = pop.t / 0.9
      c.globalAlpha = 1 - k * k
      this.text(pop.text, pop.x, pop.y - k * 8, 5.2, pop.color)
      c.globalAlpha = 1
    }
  }

  /** 밤하늘: 보랏빛 밤 → 아침이 가까우면 하늘색 · 버터색. 달이 지고 해가 떠요 */
  private drawSky(p: number) {
    const c = this.ctx
    const W = this.worldW
    const morning = Math.max((p - 0.7) / 0.3, 0)
    // 새벽 하늘: 위는 짙은 남색, 지평선 쪽은 노란빛이 살짝. 아침이 가까우면 밝은 하늘로
    const top = mix('#1c2552', '#6f9ad6', morning)
    const mid = mix('#3a4787', '#a9c8ec', morning)
    const bottom = mix('#e9c98a', '#ffe7a8', morning)
    const g = c.createLinearGradient(0, 0, 0, GROUND)
    g.addColorStop(0, top)
    g.addColorStop(0.62, mid)
    g.addColorStop(1, bottom)
    c.fillStyle = g
    c.fillRect(0, -this.skyTop, W, 100 + this.skyTop)

    // 반짝이는 작은 별 (멀리 있어서 천천히 지나가요)
    c.globalAlpha = 1 - morning
    const starCount = Math.round(26 * (1 + this.skyTop / 60))
    for (let i = 0; i < starCount; i++) {
      const sx = (((i * 37.7 - this.distance * 0.06) % (W + 10)) + W + 10) % (W + 10) - 5
      // 세로로 긴 화면이면 위로 더 보이는 하늘까지 고르게 흩어져요
      const sy = 6 - this.skyTop + ((i * 53.3) % (52 + this.skyTop))
      const tw = 0.6 + 0.4 * Math.sin(this.time * 2.4 + i * 1.7)
      c.fillStyle = i % 3 ? '#fffaf0' : '#fde68a'
      sparkle(c, sx, sy, 0.6 + (i % 4) * 0.25 * tw)
    }
    c.globalAlpha = 1

    // 달: 연노랑 초승달 + 반짝이 별 셋. 아침이 가까울수록 아래로 져요
    const moonY = 18 + morning * 60
    c.save()
    c.globalAlpha = 1 - morning * 0.8
    c.translate(W - 22, moonY)
    c.fillStyle = '#fde68a'
    c.save()
    c.beginPath()
    c.arc(0, 0, 8, 0, Math.PI * 2)
    c.clip()
    c.beginPath()
    c.arc(0, 0, 8, 0, Math.PI * 2)
    c.arc(3.6, -3, 6.6, 0, Math.PI * 2)
    c.fill('evenodd')
    c.restore()
    const tw = (i: number) => 0.85 + 0.15 * Math.sin(this.time * 3 + i * 2)
    sparkle(c, 5.6, -1.6, 1.4 * tw(0))
    sparkle(c, 7.4, 3.4, 0.8 * tw(1))
    sparkle(c, -8.6, 7.4, 0.8 * tw(2))
    c.restore()

    // 해: 산호색 얼굴 해님이 구름 뒤에서 빼꼼
    if (morning > 0) {
      const sx = W * 0.42
      const sy = GROUND + 6 - morning * 44
      c.save()
      c.translate(sx, sy)
      c.fillStyle = '#ffe2a0'
      c.beginPath()
      c.arc(0, 0, 8.7, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#ff7a63'
      c.beginPath()
      c.arc(0, 0, 8, 0, Math.PI * 2)
      c.fill()
      face(c, -1, -1.6, 3.4, false)
      c.restore()
      puffyCloud(c, sx + 4, sy + 9, 1.25, true)
    }

    // 구름: 몽글몽글, 큰 구름은 얼굴이 있어요 (조금 더 빨리 지나가요)
    for (let i = 0; i < 4; i++) {
      const span = W + 40
      const cx = ((((i * span) / 4 + 13 - this.distance * 0.25) % span) + span) % span - 20
      const cy = 14 + ((i * 19) % 34)
      puffyCloud(c, cx, cy, 0.8 + (i % 2) * 0.35, i % 2 === 1)
    }
  }

  /** 땅: 베이지 · 갈색 블록이 번갈아 반복돼요. 이불 틈은 비워서 아래 하늘이 보여요 */
  private drawGround() {
    const c = this.ctx
    const W = this.worldW
    c.save()
    c.beginPath()
    c.rect(0, GROUND, W, 100 - GROUND)
    for (const h of this.holes) c.rect(h.x, GROUND, h.w, 100 - GROUND)
    c.clip('evenodd')
    const tile = 10
    const off = this.distance % (tile * 2)
    for (let x = -off; x < W + tile; x += tile) {
      const odd = Math.round((x + off) / tile) % 2 === 1
      c.fillStyle = odd ? '#c99c6e' : '#ddb98d'
      c.fillRect(x, GROUND, tile + 0.1, 100 - GROUND)
    }
    // 윗면은 밝은 베이지 띠, 아랫단은 조금 진하게
    c.fillStyle = '#f1d9b3'
    c.fillRect(0, GROUND, W, 2.2)
    // 하늘과 또렷하게 나뉘도록 맨 위에 갈색 테두리
    c.fillStyle = '#a97b52'
    c.fillRect(0, GROUND, W, 0.6)
    c.fillStyle = 'rgba(90, 58, 34, 0.18)'
    c.fillRect(0, 95, W, 5)
    c.restore()
    // 이불 틈 양옆: 진한 갈색 단면으로 틈이 또렷하게
    for (const h of this.holes) {
      if (h.x > W + 4 || h.x + h.w < -4) continue
      c.fillStyle = '#a97b52'
      c.fillRect(h.x - 1.2, GROUND, 1.2, 100 - GROUND)
      c.fillRect(h.x + h.w, GROUND, 1.2, 100 - GROUND)
    }
  }

  /**
   * 꿈속의 나: 몽실몽실 하얀 아기 곰(몽실이) + 하늘색 수면 모자.
   * 손그림처럼 둥근 갈색 선, 점 눈, 분홍 볼, 작은 입 (외곽선은 직접 그려서 연보라 레이어 선은 안 써요)
   */
  private drawPlayer() {
    const c = this.ctx
    // 다친 동안은 깜박깜박
    if (this.hurt > 0 && Math.floor(this.hurt * 12) % 2 === 0) return
    const inAir = !this.grounded
    const bob = inAir ? 0 : Math.abs(Math.sin(this.runPhase)) * 0.7
    const startled = this.hurt > HURT_SEC - 0.5
    const ink = '#6b4a3a'
    /** 몸 테두리는 연한 갈색 (눈 · 입은 진하게) */
    const line = '#b39484'
    c.save()
    c.translate(PLAYER_X, this.py - bob)
    c.rotate(inAir ? Math.max(Math.min(this.vy / 900, 0.16), -0.16) : 0)
    c.lineJoin = 'round'
    c.lineCap = 'round'
    c.strokeStyle = line
    c.lineWidth = 0.38

    // 바닥 그림자
    if (!inAir) {
      c.fillStyle = 'rgba(40, 30, 60, 0.18)'
      c.beginPath()
      c.ellipse(0, bob, 5.4, 0.9, 0, 0, Math.PI * 2)
      c.fill()
    }
    // 발: 종종종 번갈아
    const swing = inAir ? 0 : Math.sin(this.runPhase * 2) * 1.1
    c.fillStyle = '#fffdf8'
    for (const s of [-1, 1]) {
      c.beginPath()
      c.ellipse(s * 2.4 + swing * s, -0.6 - (inAir ? 0.4 : Math.max(0, swing * s) * 0.5), 1.5, 0.95, 0, 0, Math.PI * 2)
      c.fill()
      c.stroke()
    }
    // 귀 (모자 아래로 빼꼼)
    for (const [ex, ey] of [[-5.6, -9.6], [5.6, -9.8]]) {
      c.fillStyle = '#fffdf8'
      c.beginPath()
      c.arc(ex, ey, 1.7, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.fillStyle = '#ffd2d6'
      c.beginPath()
      c.arc(ex, ey, 0.8, 0, Math.PI * 2)
      c.fill()
    }
    // 몸: 찹쌀떡처럼 아래가 살짝 퍼진 둥근 몸
    c.fillStyle = '#fffdf8'
    c.beginPath()
    c.moveTo(-6.2, -2)
    c.bezierCurveTo(-6.8, -9, -3.6, -12.4, 0, -12.4)
    c.bezierCurveTo(3.8, -12.4, 6.9, -9, 6.3, -2)
    c.quadraticCurveTo(6, -0.4, 3.6, -0.5)
    c.lineTo(-3.6, -0.5)
    c.quadraticCurveTo(-6, -0.4, -6.2, -2)
    c.closePath()
    c.fill()
    c.stroke()
    // 얼굴 (오른쪽을 보고 달려요)
    c.fillStyle = 'rgba(255, 160, 175, 0.55)'
    c.beginPath()
    c.ellipse(-0.6, -5.4, 1.25, 0.8, 0, 0, Math.PI * 2)
    c.ellipse(4.9, -5.4, 1.05, 0.75, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = ink
    c.strokeStyle = ink
    c.lineWidth = 0.34
    if (startled) {
      c.beginPath()
      c.moveTo(0.6, -7.6)
      c.lineTo(1.6, -7)
      c.lineTo(0.6, -6.4)
      c.moveTo(4.6, -7.6)
      c.lineTo(3.6, -7)
      c.lineTo(4.6, -6.4)
      c.stroke()
      c.beginPath()
      c.ellipse(2.6, -5.3, 0.55, 0.7, 0, 0, Math.PI * 2)
      c.fill()
    } else {
      c.beginPath()
      c.arc(1.1, -7, 0.48, 0, Math.PI * 2)
      c.arc(4.3, -7, 0.48, 0, Math.PI * 2)
      c.fill()
      // ω 입
      c.beginPath()
      c.arc(2.25, -5.9, 0.45, 0.1 * Math.PI, 0.95 * Math.PI)
      c.moveTo(3.5, -5.9)
      c.arc(3.05, -5.9, 0.45, 0.05 * Math.PI, 0.9 * Math.PI)
      c.stroke()
    }

    // 팔: 점프하면 만세 (볼 위로 그려서 볼이 비쳐 보이지 않게)
    c.fillStyle = '#fffdf8'
    c.strokeStyle = line
    c.lineWidth = 0.38
    for (const s of [-1, 1]) {
      c.save()
      c.translate(s * 5.4, -4.4)
      c.rotate(inAir ? -s * 1.1 : s * 0.35 + Math.sin(this.runPhase * 2) * 0.25 * s)
      c.beginPath()
      c.ellipse(0, -0.9, 0.95, 1.5, 0, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.restore()
    }

    // 하늘색 수면 모자: 머리 위에 폭 씌우고 뒤로 늘어져요, 끝엔 몽글 방울
    const flop = Math.sin(this.time * 4) * 0.7 + (inAir ? -1.2 : 0)
    const tipX = -8.6
    const tipY = -15.6 + flop
    c.lineWidth = 0.38
    c.strokeStyle = line
    c.fillStyle = '#cfe6f7'
    c.beginPath()
    c.moveTo(-4.9, -10.6)
    c.quadraticCurveTo(-3.6, -18.6, tipX, tipY)
    c.quadraticCurveTo(0.6, -20.4, 5, -10.8)
    c.closePath()
    c.fill()
    c.stroke()
    c.fillStyle = '#ffffff'
    c.beginPath()
    c.roundRect(-5.4, -11.6, 11, 2.3, 1.15)
    c.fill()
    c.stroke()
    c.fillStyle = '#fde68a'
    sparkle(c, 0.6, -14.6, 0.75)
    c.fillStyle = '#cfe6f7'
    c.beginPath()
    c.arc(tipX - 0.5, tipY + 0.9, 1.5, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    c.restore()

    // 머리 뒤로 몽글몽글 Zz
    if (!startled) {
      for (let i = 0; i < 2; i++) {
        const k = (this.time * 0.6 + i * 0.5) % 1
        c.globalAlpha = Math.sin(k * Math.PI) * 0.9
        this.text(i ? 'z' : 'Z', PLAYER_X - 6 - k * 6, this.py - 19 - k * 8, 3.4 + i, '#fffaf0', true)
      }
      c.globalAlpha = 1
    }
  }

  private drawThing(thing: Thing) {
    const c = this.ctx
    c.save()
    c.translate(thing.x, thing.y)
    c.strokeStyle = LINE
    c.lineWidth = 0.28
    if (thing.done) c.globalAlpha = 0.35
    switch (thing.kind) {
      case 'clock': {
        // 따르릉 흔들리는 주황 알람시계 (테두리 없는 플랫 그림)
        c.fillStyle = 'rgba(40, 30, 60, 0.16)'
        c.beginPath()
        c.ellipse(0, 0.3, 5, 0.8, 0, 0, Math.PI * 2)
        c.fill()
        c.rotate(Math.sin(thing.t * 38) * 0.1)
        c.strokeStyle = '#8d8790'
        c.lineWidth = 0.55
        c.beginPath()
        c.moveTo(-2.6, -1.6)
        c.lineTo(-3.6, 0)
        c.moveTo(2.6, -1.6)
        c.lineTo(3.6, 0)
        c.moveTo(-3.6, -11)
        c.quadraticCurveTo(0, -14.6, 3.6, -11)
        c.stroke()
        c.fillStyle = '#8d8790'
        c.fillRect(-0.9, -10.9, 1.8, 0.5)
        c.fillRect(-0.25, -10.6, 0.5, 1)
        for (const s of [-1, 1]) {
          c.save()
          c.translate(s * 3.3, -9.3)
          c.rotate(s * 0.45)
          c.fillStyle = '#ffb84d'
          c.beginPath()
          c.arc(0, 0, 2, Math.PI, 0)
          c.closePath()
          c.fill()
          c.fillStyle = '#8d8790'
          c.beginPath()
          c.arc(0, -2.1, 0.45, 0, Math.PI * 2)
          c.fill()
          c.restore()
        }
        c.fillStyle = '#ffb84d'
        c.beginPath()
        c.arc(0, -5.2, 5, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#f59e1b'
        c.beginPath()
        c.arc(0, -5.2, 4.2, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#f7f7f5'
        c.beginPath()
        c.arc(0, -5.2, 3.7, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#a9a6ab'
        c.lineWidth = 0.22
        c.beginPath()
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2
          c.moveTo(Math.cos(a) * 3.1, -5.2 + Math.sin(a) * 3.1)
          c.lineTo(Math.cos(a) * 3.5, -5.2 + Math.sin(a) * 3.5)
        }
        c.stroke()
        c.strokeStyle = '#3a2f2f'
        c.lineWidth = 0.45
        c.beginPath()
        c.moveTo(0, -5.2)
        c.lineTo(-1.8, -6.6)
        c.moveTo(0, -5.2)
        c.lineTo(2.2, -6.6)
        c.stroke()
        c.fillStyle = '#3a2f2f'
        c.beginPath()
        c.arc(0, -5.2, 0.45, 0, Math.PI * 2)
        c.fill()
        if (Math.sin(thing.t * 5) > 0) {
          c.strokeStyle = 'rgba(255, 255, 255, 0.85)'
          c.lineWidth = 0.4
          c.beginPath()
          c.moveTo(-6.4, -10)
          c.lineTo(-7.6, -11.4)
          c.moveTo(6.4, -10)
          c.lineTo(7.6, -11.4)
          c.moveTo(-6.8, -6)
          c.lineTo(-8.2, -6)
          c.moveTo(6.8, -6)
          c.lineTo(8.2, -6)
          c.stroke()
        }
        break
      }
      case 'phone': {
        // 지잉지잉 진동하는 피치색 휴대폰 (외곽선 없는 플랫 그림)
        c.fillStyle = 'rgba(40, 30, 60, 0.16)'
        c.beginPath()
        c.ellipse(0, 0.2, 4.2, 0.7, 0, 0, Math.PI * 2)
        c.fill()
        c.translate(Math.sin(thing.t * 50) * 0.35, 0)
        // 세로로 길쭉해 보이지 않게 조금 납작하게
        c.scale(1.05, 0.82)
        c.fillStyle = '#ffb48c'
        c.beginPath()
        c.roundRect(-3.4, -12.8, 6.8, 12.8, 1.5)
        c.fill()
        c.fillStyle = '#fff1df'
        c.beginPath()
        c.roundRect(-2.6, -11.2, 5.2, 8.6, 0.9)
        c.fill()
        // 화면 반사광
        c.save()
        c.clip()
        c.fillStyle = 'rgba(255, 255, 255, 0.55)'
        c.beginPath()
        c.moveTo(-2.6, -5.6)
        c.quadraticCurveTo(1.2, -6.6, 2.6, -11.2)
        c.lineTo(-2.6, -11.2)
        c.closePath()
        c.fill()
        c.restore()
        c.fillStyle = '#7a4a3a'
        c.beginPath()
        c.roundRect(-0.7, -12.2, 1.4, 0.4, 0.2)
        c.fill()
        c.fillStyle = '#ff9466'
        c.beginPath()
        c.roundRect(-1.1, -1.9, 2.2, 0.9, 0.45)
        c.fill()
        // 화면 속 알림 종
        c.fillStyle = '#ffc56b'
        c.beginPath()
        c.moveTo(-1.3, -5.4)
        c.quadraticCurveTo(-1.3, -8.8, 0, -8.8)
        c.quadraticCurveTo(1.3, -8.8, 1.3, -5.4)
        c.closePath()
        c.fill()
        c.beginPath()
        c.arc(0, -5, 0.5, 0, Math.PI * 2)
        c.fill()
        if (Math.sin(thing.t * 6) > -0.2) {
          c.strokeStyle = '#ffd0b5'
          c.lineWidth = 0.5
          c.beginPath()
          for (const sd of [-1, 1]) {
            c.moveTo(sd * 4.7, -9.6)
            c.quadraticCurveTo(sd * 5.7, -7.4, sd * 4.7, -5.2)
            c.moveTo(sd * 6.1, -10.4)
            c.quadraticCurveTo(sd * 7.3, -7.4, sd * 6.1, -4.4)
          }
          c.stroke()
        }
        break
      }
      case 'mosquito': {
        // 위잉 모기: 날개가 파닥파닥
        const flap = Math.sin(thing.t * 40) * 0.5
        c.strokeStyle = '#8a7466'
        c.lineWidth = 0.25
        c.beginPath()
        c.moveTo(-3.8, 0)
        c.lineTo(-6.6, 1)
        c.moveTo(-0.6, 1.4)
        c.lineTo(-1.6, 3.4)
        c.moveTo(1.4, 1.6)
        c.lineTo(1.2, 3.6)
        c.moveTo(3, 1.2)
        c.lineTo(4, 3.2)
        c.stroke()
        c.fillStyle = 'rgba(255, 255, 255, 0.8)'
        c.beginPath()
        c.ellipse(-0.6, -2.6, 1.6, 3 + flap, -0.4, 0, Math.PI * 2)
        c.ellipse(1.2, -2.4, 1.4, 2.6 - flap, 0.4, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#b9a596'
        c.beginPath()
        c.ellipse(0.6, 0, 3, 1.7, 0.15, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#a08a7b'
        c.beginPath()
        c.arc(-2.6, -0.4, 1.4, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#2e2420'
        c.beginPath()
        c.arc(-2.9, -0.7, 0.4, 0, Math.PI * 2)
        c.fill()
        break
      }
      case 'sheep': {
        // 몽글몽글 크림색 양: 베이지 얼굴 · 귀, 분홍 볼, 점 눈, 부드러운 갈색 발굽.
        // 진한 선 없이, 구름처럼 몸과 비슷한 크림 베이지 테만 둘러요 (나를 보고 와요)
        c.translate(0, Math.sin(thing.t * 4) * 0.6)
        c.scale(0.8, 0.8)
        const rim = '#efdcbc'
        // 다리 + 발굽
        for (const [dx, back] of [[-1.4, true], [3, true], [-2.6, false], [1.8, false]] as const) {
          c.fillStyle = back ? '#ecc994' : '#f3d4a4'
          c.beginPath()
          c.roundRect(dx - 0.7, 2, 1.4, 3.4, 0.5)
          c.fill()
          c.fillStyle = back ? '#a8743f' : '#b9824b'
          c.beginPath()
          c.roundRect(dx - 0.75, 4.5, 1.5, 1.2, 0.5)
          c.fill()
        }
        // 몸: 크림색 몽글몽글 + 크림 베이지 테
        const puffs: [number, number, number][] = [[-1.4, -0.6, 2.6], [1.2, -1.6, 2.7], [3.6, -0.4, 2.4], [0.8, 1, 2.7], [-2, 1.2, 2], [3.2, 1.4, 2]]
        const blob = (grow: number) => {
          c.beginPath()
          for (const [dx, dy, r] of puffs) {
            c.moveTo(dx + r + grow, dy)
            c.arc(dx, dy, r + grow, 0, Math.PI * 2)
          }
          c.fill()
        }
        c.fillStyle = rim
        blob(0.45)
        c.fillStyle = '#fff6e6'
        blob(0)
        // 뒤쪽 귀
        c.fillStyle = '#e3ad6a'
        c.beginPath()
        c.ellipse(-1.4, -1.6, 1.7, 1, 0.5, 0, Math.PI * 2)
        c.fill()
        // 얼굴: 베이지 둥근 얼굴
        c.fillStyle = rim
        c.beginPath()
        c.ellipse(-4, -0.6, 2.75, 2.45, -0.1, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#f2cf9a'
        c.beginPath()
        c.ellipse(-4, -0.6, 2.4, 2.1, -0.1, 0, Math.PI * 2)
        c.fill()
        // 앞쪽 귀
        c.fillStyle = '#e8b673'
        c.beginPath()
        c.ellipse(-6.6, -1.4, 1.4, 0.8, -0.5, 0, Math.PI * 2)
        c.fill()
        // 머리 위 몽글 앞머리
        c.fillStyle = '#fff6e6'
        c.beginPath()
        for (const [dx, r] of [[-5.2, 1], [-4, 1.2], [-2.8, 1]] as const) {
          c.moveTo(dx + r, -2.7)
          c.arc(dx, -2.7, r, 0, Math.PI * 2)
        }
        c.fill()
        // 점 눈 · 분홍 볼 · 코와 입
        c.fillStyle = '#4a3324'
        c.beginPath()
        c.arc(-5, -0.7, 0.4, 0, Math.PI * 2)
        c.arc(-3, -0.7, 0.4, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = 'rgba(255, 160, 160, 0.6)'
        c.beginPath()
        c.ellipse(-5.6, 0.4, 0.7, 0.45, 0, 0, Math.PI * 2)
        c.ellipse(-2.3, 0.4, 0.7, 0.45, 0, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#7a4a2a'
        c.beginPath()
        c.ellipse(-4, 0.1, 0.35, 0.25, 0, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#7a4a2a'
        c.lineWidth = 0.22
        c.beginPath()
        c.moveTo(-4, 0.3)
        c.quadraticCurveTo(-4.4, 0.9, -4.8, 0.6)
        c.moveTo(-4, 0.3)
        c.quadraticCurveTo(-3.6, 0.9, -3.2, 0.6)
        c.stroke()
        break
      }
      case 'star': {
        // 반짝이는 노란 별
        c.rotate(Math.sin(thing.t * 2) * 0.25)
        const s = 1 + Math.sin(thing.t * 5) * 0.06
        c.scale(s, s)
        c.fillStyle = '#fde68a'
        c.beginPath()
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 2.3 : 4.8
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        c.closePath()
        c.lineJoin = 'round'
        c.strokeStyle = '#fde68a'
        c.lineWidth = 0.8
        c.fill()
        c.stroke()
        c.fillStyle = '#fff7d6'
        c.beginPath()
        c.ellipse(-1.2, -1.2, 0.9, 0.6, -0.6, 0, Math.PI * 2)
        c.fill()
        break
      }
      case 'milk': {
        // 김이 모락모락 따뜻한 우유
        c.translate(0, Math.sin(thing.t * 3) * 0.8)
        c.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        c.lineWidth = 0.4
        c.beginPath()
        for (const dx of [-1.2, 1.2]) {
          const w = Math.sin(thing.t * 4 + dx) * 0.6
          c.moveTo(dx, -5)
          c.quadraticCurveTo(dx + 1 + w, -6.6, dx, -8.2)
        }
        c.stroke()
        c.strokeStyle = '#e6ddd0'
        c.lineWidth = 0.7
        c.beginPath()
        c.arc(3.4, 0, 1.5, -Math.PI / 2, Math.PI / 2)
        c.stroke()
        c.fillStyle = '#fffdf8'
        c.beginPath()
        c.roundRect(-3.2, -4, 6.4, 8, 1.4)
        c.fill()
        c.fillStyle = '#bfe3f5'
        c.fillRect(-3.2, -0.4, 6.4, 2.2)
        c.fillStyle = '#fff1d6'
        c.beginPath()
        c.ellipse(0, -3.6, 2.8, 0.6, 0, 0, Math.PI * 2)
        c.fill()
        break
      }
    }
    c.restore()
  }

  /** 손글씨(히피체)로 가운데 맞춰 쓰기 */
  private text(text: string, x: number, y: number, size: number, color: string, thin = false) {
    const c = this.ctx
    c.font = `${size}px Hippie, 'Pretendard Variable', sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    // 테두리 대신 하얀 테를 살짝 (Zz는 테두리 없이)
    if (!thin) {
      c.lineWidth = 0.8
      c.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      c.strokeText(text, x, y)
    }
    c.fillStyle = color
    c.fillText(text, x, y)
  }

  // ---------- 랭킹 (Supabase, 설거지 · 낱말연습과 같은 방식) ----------

  /** 결과 화면: 랭킹 등록 → 결과 카드 자리에 랭킹 카드 (닉네임 등록 + TOP 10) */
  private bindRanking(el: HTMLElement, record: Omit<SleepScore, 'nickname'>, openNow: boolean) {
    const resultCard = el.querySelector<HTMLElement>('.tresult__card')!
    const card = el.querySelector<HTMLElement>('.trank')!
    const form = el.querySelector<HTMLFormElement>('[data-ref="rankForm"]')!
    const input = el.querySelector<HTMLInputElement>('[data-ref="nickname"]')!
    const button = form.querySelector<HTMLButtonElement>('button')!
    const list = el.querySelector<HTMLElement>('[data-ref="rankList"]')!
    const note = el.querySelector<HTMLElement>('[data-ref="rankNote"]')!
    input.value = savedNickname().slice(0, NICKNAME_MAX)
    limitNickname(input)
    let mine: SleepScore | null = null
    let loaded = false
    // 끝난 판의 모드 랭킹에 올려요 (일반 · 스피드는 랭킹이 따로)
    const mode = this.mode

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
        const previous = await championBefore((limit) => fetchSleepTop(mode, limit))
        const result = await submitSleepScore(mode, mine)
        rememberNickname(nickname)
        note.textContent = submitMessage(result)
        form.classList.add('is-done')
        await renderRanking(list, mine, mode)
        celebrateChampion(list, sleepBoard(mode), nickname, previous)
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
        void renderRanking(list, mine, mode)
      }
      input.focus({ preventScroll: true })
    }
    el.querySelector('[data-action="rank"]')!.addEventListener('click', open)
    if (openNow) open()
  }

  /** 게임 전 · 깬 화면: 위 🏆 랭킹 보기 → 가운데 랭킹 TOP 10 팝업. 닫으면 원래 화면으로 */
  private openRanking() {
    if (this.rankPopup || this.phase === 'playing' || this.phase === 'paused') return
    const popup = document.createElement('div')
    popup.className = 'train__rankpop'
    popup.innerHTML = `
      <section class="trank" aria-label="랭킹">
        <p class="trank__title">🏆 랭킹 TOP ${RANK_LIMIT}</p>
        <div class="sleep__ranktabs" role="tablist">
          <button type="button" class="sleep__ranktab" role="tab" data-mode="normal">🌙 일반</button>
          <button type="button" class="sleep__ranktab" role="tab" data-mode="speed">⚡ 스피드</button>
        </div>
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
    // 일반 · 스피드 탭: 처음엔 마지막으로 한 모드 랭킹을 보여줘요
    const list = popup.querySelector<HTMLElement>('.trank__list')!
    const tabs = popup.querySelectorAll<HTMLButtonElement>('[data-mode]')
    const show = (mode: SleepMode) => {
      tabs.forEach((tab) => {
        const on = tab.dataset.mode === mode
        tab.classList.toggle('is-on', on)
        tab.setAttribute('aria-selected', String(on))
      })
      list.innerHTML = '<li class="trank__empty">불러오는 중...</li>'
      list.dataset.mode = mode
      void renderRanking(list, null, mode)
    }
    tabs.forEach((tab) => tab.addEventListener('click', () => show(tab.dataset.mode as SleepMode)))
    show(this.mode)
  }

  /** 지금 모드: 일반 · 스피드 (랭킹 · 최고 점수가 따로예요) */
  private get mode(): SleepMode {
    return this.speedMode ? 'speed' : 'normal'
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
      // 스피드 게임 최고 점수는 따로 저장해요
      const key = this.speedMode ? `${BEST_KEY}-speed` : BEST_KEY
      best = Number(localStorage.getItem(key)) || 0
      if (score > best) localStorage.setItem(key, String(score))
    } catch {
      // 저장소를 못 쓰면 이번 기록만
    }
    return Math.max(best, score)
  }
}

/** TOP 10 그리기: 순위 · 닉네임 · 잔 시간(아침까지 자면 👑) · 점수 · 모은 양 */
async function renderRanking(list: HTMLElement, mine: SleepScore | null, mode: SleepMode) {
  try {
    const top = await fetchSleepTop(mode)
    // 그새 탭을 바꿨으면 늦게 온 결과는 버려요
    if (!list.isConnected || list.dataset.mode !== undefined && list.dataset.mode !== mode) return
    list.innerHTML = top.length
      ? top
          .map((row, i) => {
            const isMine = !!mine && row.nickname === mine.nickname
            return `<li class="trank__row${isMine ? ' is-mine' : ''}">
              <span class="trank__no">${i + 1}</span>
              <span class="trank__name">${escapeHtml(row.nickname)}</span>
              <span class="trank__round">${row.cleared ? '👑 ' : ''}${sleptLabel(row.slept_min)}</span>
              <span class="trank__score">${row.score}점</span>
              <span class="trank__cpm">🐑${row.sheep}</span>
            </li>`
          })
          .join('')
      : '<li class="trank__empty">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</li>'
    void showChampionNote(list, sleepBoard(mode))
  } catch (error) {
    if (list.isConnected) list.innerHTML = `<li class="trank__empty">${escapeHtml((error as Error).message)}</li>`
  }
}

// ---------- 그림 조각 ----------

/** 두 색 섞기 (#rrggbb) */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, Math.min(Math.max(t, 0), 1)))
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

/** 반짝: 네 갈래 작은 별 */
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath()
  c.moveTo(x, y - r * 2)
  c.quadraticCurveTo(x, y, x + r * 2, y)
  c.quadraticCurveTo(x, y, x, y + r * 2)
  c.quadraticCurveTo(x, y, x - r * 2, y)
  c.quadraticCurveTo(x, y, x, y - r * 2)
  c.fill()
}

/** 몽글몽글 구름: 크림색 몸 + 연노랑 테두리(선 대신 살짝 큰 그림자), 얼굴은 까만 점 눈 · 분홍 볼 */
function puffyCloud(c: CanvasRenderingContext2D, x: number, y: number, s: number, withFace: boolean) {
  const bumps: [number, number, number][] = [
    [-6.2, 1, 3.4],
    [-2.6, -2.2, 4],
    [2, -3.2, 4.4],
    [6, -0.4, 3.6],
    [3.6, 2.2, 3.4],
    [-1.6, 2.4, 3.6],
  ]
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  const blob = (grow: number) => {
    c.beginPath()
    for (const [bx, by, r] of bumps) {
      c.moveTo(bx + r + grow, by)
      c.arc(bx, by, r + grow, 0, Math.PI * 2)
    }
    c.fill()
  }
  c.fillStyle = 'rgba(255, 226, 160, 0.9)'
  blob(0.55)
  c.fillStyle = '#fffdf0'
  blob(0)
  if (withFace) face(c, 0, 0.6, 2.2, true)
  c.restore()
}

/** 구름 · 해 얼굴: 까만 점 눈 + 분홍 볼 */
function face(c: CanvasRenderingContext2D, x: number, y: number, gap: number, cheeks: boolean) {
  c.fillStyle = '#3f3a3a'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(x + (s * gap) / 2, y, 0.45, 0.6, 0, 0, Math.PI * 2)
    c.fill()
  }
  c.fillStyle = cheeks ? 'rgba(250, 190, 200, 0.75)' : 'rgba(255, 200, 200, 0.6)'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.ellipse(x + s * (gap / 2 + 1.4), y + 1.1, 1, 0.7, 0, 0, Math.PI * 2)
    c.fill()
  }
}

/** HUD 베개 아이콘 */
const PILLOW_ICON = `<svg viewBox="0 0 28 18" aria-hidden="true"><path d="M5 3 Q14 0 23 3 Q27 9 23 15 Q14 18 5 15 Q1 9 5 3Z" fill="#fffaf0" stroke="#5a4033" stroke-width="2" stroke-linejoin="round"/><path d="M8 7 Q14 5 20 7" fill="none" stroke="#b8b3ea" stroke-width="2" stroke-linecap="round"/></svg>`

/** 다시 하기: 되돌리는 화살표 아이콘 (타자연습.app 결과 화면과 같아요) */
const RETRY_ICON = `<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4.6h4.6"/></svg>`

/** 결과 화면 랭킹 카드: 닉네임 등록 + TOP 10 (스피드 게임은 스피드 랭킹) */
const rankCard = (mode: SleepMode) => `
  <section class="trank" aria-label="랭킹" hidden>
    <p class="trank__title">${mode === 'speed' ? '⚡ 스피드 ' : '🏆 '}랭킹 TOP ${RANK_LIMIT}</p>
    <form class="trank__form" data-ref="rankForm" autocomplete="off">
      <input data-ref="nickname" type="text" maxlength="${NICKNAME_MAX}" placeholder="닉네임 (${NICKNAME_MAX}자까지)" aria-label="닉네임" spellcheck="false" />
      <button type="submit" class="tprac__enter">등록</button>
    </form>
    <p class="trank__note" data-ref="rankNote" aria-live="polite"></p>
    <ol class="trank__list" data-ref="rankList"><li class="trank__empty">불러오는 중...</li></ol>
    <div class="tresult__buttons">
      <button type="button" class="tbutton tbutton--main tbutton--icon" data-action="again" aria-label="다시 하기" title="다시 하기">${RETRY_ICON}</button>
      <button type="button" class="tbutton" data-action="quit">그만하기</button>
    </div>
  </section>`
