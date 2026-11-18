import './FallingWords.css'
import { bindKoreanInput } from './input'
import { strokesOf } from './hangul'
import { IDIOMS, LONGER_WORDS, LONG_WORDS, SPECIAL_WORDS, WORDS, shuffle } from './content'
import type { TypingView, ViewContext } from './TypingApp'
import { RANK_LIMIT, fetchTopScores, rankingEnabled } from './ranking'

/**
 * 라운드 설정: 떨어질 낱말 수 · 바닥까지 걸리는 시간(초) · 다음 낱말까지 간격(초) · 통과 점수.
 * 라운드가 올라갈수록 더 많이, 더 빨리 떨어져요.
 */
// 타수별 가상 플레이어 시뮬레이션으로 맞춘 값 (주석의 타수 이상이면 대부분 통과)
// 1~4라운드는 300타 기준: 라운드마다 더 빨리 떨어지고 핑크 낱말(fast 비율)이 많아져요
const ROUNDS = [
  { count: 10, fall: 9, gap: 1.7, goal: 9, fast: 0.1 }, // ~300타
  { count: 12, fall: 8, gap: 2.5, goal: 9, fast: 0.15 }, // ~300타
  { count: 14, fall: 7, gap: 2.6, goal: 9, fast: 0.2 }, // ~300타
  { count: 16, fall: 6.2, gap: 2.6, goal: 9, fast: 0.2 }, // ~300타
  { count: 18, fall: 5.5, gap: 2.15, goal: 13, fast: 0.25 }, // ~400타
  { count: 20, fall: 5.8, gap: 2.3, goal: 12, fast: 0.2 }, // ~500타
  { count: 22, fall: 5.4, gap: 1.9, goal: 13, fast: 0.2 }, // ~600타
  { count: 24, fall: 5, gap: 1.7, goal: 15, fast: 0.2 }, // ~700타
  { count: 26, fall: 4.7, gap: 1.5, goal: 16, fast: 0.2 }, // ~800타
  { count: 28, fall: 4.4, gap: 1.4, goal: 17, fast: 0.2 }, // ~900타
]

/** 낱말 하나 맞히면 +1, 바닥에 떨어지면 -1 */
const HIT_POINT = 1
const MISS_POINT = -1
/** 핑크 낱말은 맞히면 +2점, 바닥에 닿으면 −3점 */
const FAST_HIT_POINT = 2
const FAST_MISS_POINT = -3
/** 라운드 점수가 여기까지 떨어지면 실패 → 1라운드부터 다시 */
/** 라운드 점수가 이보다 낮으면 위험 표시 */
const DANGER_SCORE = -2
const FAIL_SCORE = -5
/** 너무 짧은 시간에 친 낱말이 타수를 튀게 하지 않도록 (초) */
const MIN_TYPING_SEC = 0.25
/** 핑크 낱말은 두 배 빨리 떨어져요 (비율은 ROUNDS의 fast) */
const FAST_SPEED = 2
/**
 * 라운드별 낱말 구성
 * - 라운드 1: 짧은 낱말
 * - 라운드 2~5: 네 글자 사자성어만
 * - 라운드 6~10: 다섯 글자 이상 35% + 햄버거 세트 · 립 색상 이름 2~3개 + 나머지 사자성어 · 네 글자 낱말
 */
const LONGER_RATIO_LATE = 0.35
const LATE_FROM_ROUND = 6

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

/** 세모 고양이 귀 (오른쪽 귀는 CSS로 뒤집어요) */
const EAR = `
  <svg class="tdrop__ear" viewBox="0 0 20 16" aria-hidden="true">
    <path d="M1.5 16 L7 2 Q7.6 0.8 8.6 1.7 L18.5 16" fill="#ffe08a" stroke="#5a4033" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <path d="M5 16 L7.7 7.5 L13.5 16 Z" fill="#ffc4b8"/>
  </svg>`

/** 하늘 꾸미기: 메뉴 그림처럼 갈색 선의 구름 · 별 · 방울이 둥실둥실 */
const CLOUD = `<svg viewBox="0 0 60 34"><path d="M15 31 H46 A9 9 0 0 0 46 13 A13 13 0 0 0 22 10 A10.5 10.5 0 0 0 15 31 Z" fill="#fff" stroke="#5a4033" stroke-width="2.5" stroke-linejoin="round"/></svg>`
const STAR = (fill: string) =>
  `<svg viewBox="0 0 24 24"><path d="M12 2 l3 6.2 6.8 1 -4.9 4.8 1.2 6.8 -6.1 -3.2 -6.1 3.2 1.2 -6.8 -4.9 -4.8 6.8 -1z" fill="${fill}" stroke="#5a4033" stroke-width="2" stroke-linejoin="round"/></svg>`
const DOT = (fill: string) => `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="${fill}" stroke="#5a4033" stroke-width="2"/></svg>`
const DECOR = [
  { svg: CLOUD, x: 6, y: 14, w: 5.5 },
  { svg: CLOUD, x: 70, y: 8, w: 4.5, late: true },
  { svg: CLOUD, x: 40, y: 46, w: 4 },
  { svg: CLOUD, x: 82, y: 58, w: 5, late: true },
  { svg: STAR('#ffe08a'), x: 30, y: 12, w: 1.6, late: true },
  { svg: STAR('#ffd9de'), x: 92, y: 30, w: 1.4 },
  { svg: STAR('#ffe08a'), x: 16, y: 62, w: 1.3, late: true },
  { svg: DOT('#d8f0e4'), x: 58, y: 22, w: 1.1 },
  { svg: DOT('#ffd9de'), x: 26, y: 38, w: 0.9, late: true },
  { svg: DOT('#dcebff'), x: 64, y: 72, w: 1 },
]
  .map(
    (d) =>
      `<span class="train__deco${d.late ? ' train__deco--late' : ''}" style="left:${d.x}%;top:${d.y}%;width:${d.w}em">${d.svg}</span>`,
  )
  .join('')

interface Drop {
  word: string
  el: HTMLElement
  /** 가로 위치 (0~1) */
  x: number
  /** 떨어지기 시작한 뒤 흐른 시간(초) */
  t: number
  fall: number
  /** 핑크 낱말 (두 배 빠르고 점수도 커요) */
  fast: boolean
}

/**
 * 떨어지는 낱말연습: 하늘에서 고양이 귀 방울에 담긴 낱말이 떨어져요.
 * - 낱말을 치고 Enter(또는 스페이스) → 맞히면 +1점, 바닥에 닿으면 -1점
 * - 라운드마다 통과 점수가 있어요. 점수를 넘겨도 그 라운드 낱말은 끝까지 다 떨어져야 라운드가 끝나요.
 * - 낱말 10~25%는 핑크색이고 두 배 빨리 떨어져요 (라운드마다 늘어요)
 * - 라운드 점수가 −5점이 되면 실패 화면 → 1라운드부터 다시
 * - 라운드 시작 전에 "라운드 N" 인트로 → 시작하기 버튼
 * - 끝나면 평균 · 최고 · 최저 타수
 */
export class FallingWords implements TypingView {
  readonly el = document.createElement('div')

  private round = 0
  private playing = false
  /** 멈춤 화면이 떠 있는지 */
  private paused = false
  /** 이번 라운드에 아직 안 떨어진 낱말들 */
  private queue: { word: string; fast: boolean }[] = []
  private drops: Drop[] = []
  private spawnTimer = 0
  private roundScore = 0
  /** 이번 판에 이미 나온 긴 이름 */
  private readonly usedSpecials = new Set<string>()
  private totalScore = 0

  /** 낱말마다 타수 (맞힌 낱말만) */
  private readonly speeds: number[] = []
  private totalStrokes = 0
  private totalTypingSec = 0
  /** 지금 낱말을 치기 시작한 때 */
  private typingSince = 0

  private readonly sky: HTMLElement
  private readonly overlay: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly rankButton: HTMLButtonElement
  /** 게임 전 랭킹 보기 팝업 (열려 있을 때만) */
  private rankPopup: HTMLElement | null = null
  private readonly input: HTMLInputElement
  private readonly form: HTMLFormElement
  private readonly hud: Record<'round' | 'score' | 'left' | 'cpm' | 'warn', HTMLElement>

  constructor(private readonly ctx: ViewContext) {
    this.el.className = 'train'
    this.el.innerHTML = `
      <div class="train__top">
        <button type="button" class="tback" data-action="menu">← 메뉴</button>
        <span class="tbadge" data-hud="round"></span>
        <button type="button" class="tback train__pause" data-action="pause" hidden>⏸ 멈춤 <small>Esc</small></button>
        <button type="button" class="tback train__rankbtn" data-action="ranking" hidden>🏆 랭킹 보기</button>
        <div class="train__stats">
          <span class="train__warn" data-hud="warn" hidden></span>
          <span class="train__stat train__stat--score">이번 라운드 <b data-hud="score">0</b>점</span>
          <span class="train__stat">남은 낱말 <b data-hud="left">0</b></span>
          <span class="train__stat">평균 타수 <b data-hud="cpm">0</b></span>
        </div>
      </div>
      <div class="train__field" data-ref="field">
        <div class="train__decor" aria-hidden="true">${DECOR}</div>
        <div class="train__sky" data-ref="sky" aria-live="polite"></div>
        <div class="train__ground" aria-hidden="true"></div>
        <div class="train__overlay" data-ref="overlay"></div>
      </div>
      <form class="tprac__form train__form" data-ref="form" autocomplete="off">
        <input data-ref="input" type="text" placeholder="낱말을 입력하세요..." aria-label="입력" autocapitalize="off" spellcheck="false" />
        <button type="submit" class="tprac__enter">ENTER →</button>
      </form>
    `
    const ref = <T extends HTMLElement>(name: string) => this.el.querySelector<T>(`[data-ref="${name}"]`)!
    this.sky = ref('sky')
    this.overlay = ref('overlay')
    this.input = ref<HTMLInputElement>('input')
    this.form = ref<HTMLFormElement>('form')
    const hud = (name: string) => this.el.querySelector<HTMLElement>(`[data-hud="${name}"]`)!
    this.hud = { round: hud('round'), score: hud('score'), left: hud('left'), cpm: hud('cpm'), warn: hud('warn') }
    this.el.querySelector('[data-action="menu"]')!.addEventListener('click', () => ctx.goMenu())
    this.pauseButton = this.el.querySelector<HTMLButtonElement>('[data-action="pause"]')!
    this.pauseButton.addEventListener('click', () => this.pause())
    this.rankButton = this.el.querySelector<HTMLButtonElement>('[data-action="ranking"]')!
    this.rankButton.addEventListener('click', () => this.openRanking())

    bindKoreanInput(this.input, this.form, {
      submitOnSpace: true,
      onInput: () => {
        if (!this.playing) return
        if (!this.typingSince && this.input.value) this.typingSince = performance.now()
        ctx.onKey()
        this.highlight()
      },
      onSubmit: () => this.submit(),
    })

    this.showIntro()
  }

  focus() {
    if (this.playing) this.input.focus({ preventScroll: true })
    else this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true })
  }

  update(dt: number) {
    if (!this.playing) return
    // 탭을 다녀오면 dt가 커져요: 한 번에 너무 많이 떨어지지 않게
    dt = Math.min(dt, 0.1)
    const config = ROUNDS[this.round]

    this.spawnTimer -= dt
    if (this.queue.length && this.spawnTimer <= 0) {
      const next = this.queue.shift()!
      this.spawn(next.word, next.fast ? config.fall / FAST_SPEED : config.fall, next.fast)
      this.spawnTimer = config.gap
    }

    const fieldW = this.sky.clientWidth
    const fieldH = this.sky.clientHeight
    for (const drop of [...this.drops]) {
      drop.t += dt
      const p = drop.t / drop.fall
      const w = drop.el.offsetWidth
      const h = drop.el.offsetHeight
      const x = drop.x * Math.max(fieldW - w, 0)
      const y = -h + p * fieldH
      drop.el.style.transform = `translate(${x}px, ${y}px)`
      if (p >= 1) this.land(drop)
      // 실패하면 남은 낱말은 그대로 멈춰요
      if (!this.playing) return
    }

    if (!this.queue.length && !this.drops.length) this.endRound()
  }

  destroy() {
    this.playing = false
  }

  // ---------- 라운드 ----------

  /** "라운드 N" 인트로 + 시작하기 버튼 */
  private showIntro(cleared?: { round: number; score: number }) {
    this.playing = false
    this.input.disabled = true
    const config = ROUNDS[this.round]
    this.renderHud()
    this.overlay.innerHTML = `
      <div class="train__intro">
        ${cleared ? `<p class="train__cleared">라운드 ${cleared.round} 통과! <mark>${cleared.score}점</mark></p>` : ''}
        <p class="train__title">라운드 ${this.round + 1}</p>
        <p class="train__desc">낱말이 다 떨어졌을 때 <b>${config.goal}점</b> 이상이면 통과!</p>
        <ul class="train__rules">
          <li><span class="train__chip">노란 낱말</span>맞히면 <b>+${HIT_POINT}점</b> · 놓치면 <b>${MISS_POINT}점</b></li>
          <li><span class="train__chip train__chip--fast">핑크 낱말</span>맞히면 <b>+${FAST_HIT_POINT}점</b> · 놓치면 <b>${FAST_MISS_POINT}점</b> (두 배 빨라요!)</li>
          <li>${config.goal}점보다 적게 모으면 게임이 끝나요</li>
          <li>도중에 <b>${FAIL_SCORE}점</b>이 되면 그 자리에서 바로 실패예요</li>
        </ul>
        <button type="button" class="tbutton tbutton--main" data-action="start">시작하기</button>
      </div>
    `
    this.overlay.classList.add('is-on')
    const button = this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]')!
    button.addEventListener('click', () => this.startRound())
    button.focus({ preventScroll: true })
  }

  /** 라운드 점수가 −5점: 실패 화면 → 다시 시작하기를 누르면 1라운드부터 */
  private fail() {
    this.playing = false
    this.pauseButton.hidden = true
    this.rankButton.hidden = !rankingEnabled()
    this.el.classList.remove('is-danger')
    this.hud.warn.hidden = true
    this.input.value = ''
    this.input.disabled = true
    this.ctx.music.stop()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--fail">실패!</p>
        <p class="train__desc">이번 라운드 점수가 <b>${this.roundScore}점</b>이 되었어요 (실패 기준 ${FAIL_SCORE}점 이하)</p>
        <p class="train__rule">라운드 1부터 다시 도전해요</p>
        <button type="button" class="tbutton tbutton--main" data-action="restart">다시 시작하기</button>
      </div>
    `
    this.overlay.classList.add('is-on')
    const button = this.overlay.querySelector<HTMLButtonElement>('[data-action="restart"]')!
    button.addEventListener('click', () => this.restart())
    button.focus({ preventScroll: true })
  }

  /** 점수 · 타수 기록을 모두 지우고 라운드 1 인트로로 */
  private restart() {
    this.round = 0
    this.roundScore = 0
    this.totalScore = 0
    this.speeds.length = 0
    this.usedSpecials.clear()
    this.totalStrokes = 0
    this.totalTypingSec = 0
    this.queue = []
    this.drops = []
    this.sky.replaceChildren()
    this.ctx.music.start()
    this.showIntro()
  }

  /** 라운드에 맞춰 낱말을 골라요 (위 '라운드별 낱말 구성' 참고) */
  private pickWords(count: number) {
    const round = this.round + 1
    if (round === 1) return shuffle(WORDS).slice(0, count)
    // 라운드 2~5: 네 글자 사자성어만
    if (round < LATE_FROM_ROUND) return shuffle(IDIOMS).slice(0, count)
    // 햄버거 세트 · 립 색상 이름은 2~3개, 한 판에서 겹치지 않게
    const specials = shuffle(SPECIAL_WORDS.filter((w) => !this.usedSpecials.has(w))).slice(0, 2 + Math.floor(Math.random() * 2))
    specials.forEach((w) => this.usedSpecials.add(w))
    const longer = shuffle(LONGER_WORDS).slice(0, Math.min(Math.round(count * LONGER_RATIO_LATE), count - specials.length))
    const rest = shuffle(LONG_WORDS).slice(0, count - specials.length - longer.length)
    return [...specials, ...longer, ...rest]
  }

  /** 멈춤: 낱말이 그 자리에 멈추고, 계속하기를 누르면 이어서 떨어져요 */
  /** 떨어지는 낱말연습에서만: 플레이 중 Esc → 멈춤, 멈춤 화면에서 Esc → 계속하기 (멈춤 버튼과 같은 동작) */
  onEscape() {
    if (this.rankPopup) {
      this.closeRanking()
      return true
    }
    if (this.playing) {
      this.pause()
      return true
    }
    if (this.paused) {
      this.resume()
      return true
    }
    return false
  }

  private pause() {
    if (!this.playing) return
    this.playing = false
    this.paused = true
    // 멈춘 동안은 타수 시간에 넣지 않도록 치던 낱말은 지워요
    this.typingSince = 0
    this.input.value = ''
    this.input.disabled = true
    this.highlight()
    this.renderHud()
    this.sky.classList.add('is-paused')
    this.ctx.music.stop()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--pause">잠깐 멈춤</p>
        <p class="train__desc">이번 라운드 <b>${this.roundScore}점</b> · 남은 낱말 ${this.queue.length + this.drops.length}개</p>
        <div class="train__buttons">
          <button type="button" class="tbutton tbutton--main" data-action="resume">계속하기</button>
          <button type="button" class="tbutton" data-action="quit">홈으로</button>
        </div>
      </div>
    `
    this.overlay.classList.add('is-on')
    this.overlay.querySelector('[data-action="resume"]')!.addEventListener('click', () => this.resume())
    this.overlay.querySelector('[data-action="quit"]')!.addEventListener('click', () => this.ctx.goMenu())
    this.overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus({ preventScroll: true })
  }

  private resume() {
    if (!this.paused) return
    this.paused = false
    this.overlay.classList.remove('is-on')
    this.overlay.replaceChildren()
    this.sky.classList.remove('is-paused')
    this.input.disabled = false
    this.ctx.music.start()
    this.playing = true
    this.renderHud()
    this.input.focus({ preventScroll: true })
  }

  private startRound() {
    const config = ROUNDS[this.round]
    // 정확히 20%(반올림)를 핑크 낱말로 섞어요
    const fastCount = Math.round(config.count * config.fast)
    const words = this.pickWords(config.count)
    this.queue = shuffle(shuffle(words).map((word, i) => ({ word, fast: i < fastCount })))
    this.drops = []
    this.sky.replaceChildren()
    this.spawnTimer = 0.4
    this.roundScore = 0
    this.typingSince = 0
    this.overlay.classList.remove('is-on')
    this.overlay.replaceChildren()
    this.input.disabled = false
    this.input.value = ''
    this.playing = true
    this.renderHud()
    this.input.focus({ preventScroll: true })
  }

  /** 이번 라운드 낱말이 모두 끝났을 때: 통과면 다음 라운드, 아니면 결과 */
  private endRound() {
    this.playing = false
    this.input.value = ''
    const config = ROUNDS[this.round]
    const passed = this.roundScore >= config.goal
    if (passed && this.round < ROUNDS.length - 1) {
      this.ctx.music.sfx('clear')
      const cleared = { round: this.round + 1, score: this.roundScore }
      this.round += 1
      this.roundScore = 0
      this.showIntro(cleared)
      return
    }
    this.finish(passed)
  }

  private finish(allCleared: boolean) {
    const avg = this.totalTypingSec > 0 ? Math.round(this.totalStrokes / (this.totalTypingSec / 60)) : 0
    const max = this.speeds.length ? Math.max(...this.speeds) : 0
    const min = this.speeds.length ? Math.min(...this.speeds) : 0
    this.ctx.showResult({
      mode: 'rain',
      title: allCleared ? '모두 통과! 🎉' : '아쉬워요!',
      score: avg,
      lines: [
        { label: '도달 라운드', value: `${this.round + 1} / ${ROUNDS.length}` },
        { label: '총 점수', value: `${this.totalScore}점` },
        { label: '평균 타수', value: `${avg}타` },
        { label: '최고 타수', value: `${max}타` },
        { label: '최저 타수', value: `${min}타` },
      ],
      ranking: {
        reached_round: this.round + 1,
        cleared: allCleared,
        total_score: this.totalScore,
        avg_cpm: avg,
        max_cpm: max,
        min_cpm: min,
      },
    })
  }

  // ---------- 낱말 ----------

  private spawn(word: string, fall: number, fast: boolean) {
    const el = document.createElement('div')
    el.className = fast ? 'tdrop tdrop--fast' : 'tdrop'
    el.innerHTML = `${EAR}${EAR}<span class="tdrop__box">${escape(word)}</span>`
    el.style.transform = 'translate(0, -200%)'
    this.sky.appendChild(el)
    // 바로 옆 낱말과 겹치지 않게 가로 위치를 몇 번 골라 봐요
    let x = Math.random()
    for (let i = 0; i < 12; i++) {
      // 핑크 낱말은 앞 낱말을 따라잡으니, 아직 위쪽에 있는 낱말들과 모두 떨어뜨려요
      const recent = this.drops.filter((d) => d.t / d.fall < 0.7)
      if (recent.every((d) => Math.abs(d.x - x) > 0.2)) break
      x = Math.random()
    }
    this.drops.push({ word, el, x, t: 0, fall, fast })
    this.highlight()
  }

  private submit() {
    if (!this.playing) return
    const typed = this.input.value.trim()
    this.input.value = ''
    if (!typed) return
    // 같은 낱말이 여러 개면 바닥에 가까운 것부터
    const target = this.drops
      .filter((d) => d.word === typed)
      .sort((a, b) => b.t / b.fall - a.t / a.fall)[0]

    if (!target) {
      this.typingSince = 0
      this.ctx.music.sfx('miss')
      this.form.classList.remove('is-wrong')
      void this.form.offsetWidth
      this.form.classList.add('is-wrong')
      this.highlight()
      return
    }

    const strokes = strokesOf(target.word)
    const sec = Math.max((performance.now() - (this.typingSince || performance.now())) / 1000, MIN_TYPING_SEC)
    this.typingSince = 0
    this.speeds.push(Math.round(strokes / (sec / 60)))
    this.totalStrokes += strokes
    this.totalTypingSec += sec

    const hit = target.fast ? FAST_HIT_POINT : HIT_POINT
    this.remove(target, 'is-hit', `+${hit}`)
    this.addScore(hit)
    this.ctx.music.sfx('hit')
    this.ctx.onHit()
    this.highlight()
  }

  /** 바닥에 닿았어요: −1점 */
  private land(drop: Drop) {
    const miss = drop.fast ? FAST_MISS_POINT : MISS_POINT
    this.remove(drop, 'is-miss', `${miss}`)
    this.addScore(miss)
    this.ctx.music.sfx('miss')
    if (this.roundScore <= FAIL_SCORE) this.fail()
  }

  private remove(drop: Drop, effect: string, label: string) {
    this.drops = this.drops.filter((d) => d !== drop)
    drop.el.classList.add(effect)
    drop.el.insertAdjacentHTML('beforeend', `<span class="tdrop__point">${label}</span>`)
    window.setTimeout(() => drop.el.remove(), 600)
  }

  private addScore(point: number) {
    this.roundScore += point
    this.totalScore += point
    this.renderHud()
  }

  /** 치고 있는 글자로 시작하는 낱말을 살짝 강조해요 */
  private highlight() {
    const typed = this.input.value.trim()
    for (const drop of this.drops) drop.el.classList.toggle('is-target', !!typed && drop.word.startsWith(typed))
  }

  // ---------- 게임 전 랭킹 보기 ----------

  /** 인트로 위에 랭킹 TOP 10 팝업을 띄워요. 닫으면 인트로로 돌아가요 */
  private openRanking() {
    if (this.rankPopup || this.playing || this.paused) return
    const popup = document.createElement('div')
    popup.className = 'train__rankpop'
    popup.innerHTML = `
      <section class="trank" aria-label="랭킹">
        <p class="trank__title">🏆 랭킹 TOP ${RANK_LIMIT}</p>
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
    const list = popup.querySelector<HTMLElement>('.trank__list')!
    fetchTopScores()
      .then((top) => {
        if (this.rankPopup !== popup) return
        list.innerHTML = top.length
          ? top
              .map(
                (row, i) => `<li class="trank__row">
                  <span class="trank__no">${i + 1}</span>
                  <span class="trank__name">${escapeHtml(row.nickname)}</span>
                  <span class="trank__round">${row.cleared ? '👑 ' : ''}R${row.reached_round}</span>
                  <span class="trank__score">${row.total_score}점</span>
                  <span class="trank__cpm">${row.avg_cpm}타</span>
                </li>`,
              )
              .join('')
          : '<li class="trank__empty">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</li>'
      })
      .catch((error: Error) => {
        if (this.rankPopup === popup) list.innerHTML = `<li class="trank__empty">${escapeHtml(error.message)}</li>`
      })
  }

  private closeRanking() {
    if (!this.rankPopup) return
    this.rankPopup.remove()
    this.rankPopup = null
    const intro = this.overlay.querySelector<HTMLElement>('.train__intro')
    intro?.removeAttribute('hidden')
    intro?.querySelector<HTMLButtonElement>('.tbutton--main')?.focus({ preventScroll: true })
  }

  private renderHud() {
    const config = ROUNDS[this.round]
    this.pauseButton.hidden = !this.playing
    // 게임을 시작하기 전(인트로 · 실패 화면)에만 랭킹 보기
    this.rankButton.hidden = this.playing || this.paused || !rankingEnabled()
    if (this.playing) this.closeRanking()
    this.hud.round.textContent = `라운드 ${this.round + 1} / ${ROUNDS.length}`
    this.hud.score.textContent = String(this.roundScore)
    this.hud.left.textContent = String(this.playing ? this.queue.length + this.drops.length : config.count)
    const avg = this.totalTypingSec > 0 ? Math.round(this.totalStrokes / (this.totalTypingSec / 60)) : 0
    this.hud.cpm.textContent = String(avg)
    this.el.classList.toggle('is-goal', this.roundScore >= config.goal)
    // 위험 표시: 하늘이 핑크로 깜박깜박
    // - 실패 직전: −2점보다 내려가면 (−5점이면 바로 실패)
    // - 통과 위험: 모자란 점수 ≥ 남은 낱말 수 (남은 낱말을 거의 다 맞혀야 통과)
    const left = this.queue.length + this.drops.length
    const nearFail = this.playing && this.roundScore < DANGER_SCORE
    const passRisk = this.playing && config.goal - this.roundScore > 0 && config.goal - this.roundScore >= left
    this.el.classList.toggle('is-danger', nearFail || passRisk)
    this.hud.warn.hidden = !(nearFail || passRisk)
    this.hud.warn.textContent = nearFail ? '실패 직전!' : passRisk ? '통과 위험!' : ''
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
