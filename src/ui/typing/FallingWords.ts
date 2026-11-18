import './FallingWords.css'
import { bindKoreanInput } from './input'
import { strokesOf } from './hangul'
import { LONG_WORDS, WORDS, shuffle } from './content'
import type { TypingView, ViewContext } from './TypingApp'

/**
 * 라운드 설정: 떨어질 낱말 수 · 바닥까지 걸리는 시간(초) · 다음 낱말까지 간격(초) · 통과 점수.
 * 라운드가 올라갈수록 더 많이, 더 빨리 떨어져요.
 */
const ROUNDS = [
  { count: 10, fall: 9, gap: 2.2, goal: 6 },
  { count: 12, fall: 8, gap: 1.9, goal: 8 },
  { count: 14, fall: 7, gap: 1.6, goal: 10 },
  { count: 16, fall: 6.2, gap: 1.35, goal: 12 },
  { count: 18, fall: 5.5, gap: 1.1, goal: 14 },
]

/** 낱말 하나 맞히면 +1, 바닥에 떨어지면 -1 */
const HIT_POINT = 1
const MISS_POINT = -1
/** 라운드 점수가 여기까지 떨어지면 실패 → 1라운드부터 다시 */
const FAIL_SCORE = -5
/** 너무 짧은 시간에 친 낱말이 타수를 튀게 하지 않도록 (초) */
const MIN_TYPING_SEC = 0.25
/** 라운드 낱말 중 이만큼은 핑크 낱말: 두 배 빨리 떨어져요 (난이도) */
const FAST_RATIO = 0.2
const FAST_SPEED = 2

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
}

/**
 * 떨어지는 낱말연습: 하늘에서 고양이 귀 방울에 담긴 낱말이 떨어져요.
 * - 낱말을 치고 Enter(또는 스페이스) → 맞히면 +1점, 바닥에 닿으면 -1점
 * - 라운드마다 통과 점수가 있어요. 점수를 넘겨도 그 라운드 낱말은 끝까지 다 떨어져야 라운드가 끝나요.
 * - 낱말 20%는 핑크색이고 두 배 빨리 떨어져요
 * - 라운드 점수가 −5점이 되면 실패 화면 → 1라운드부터 다시
 * - 라운드 시작 전에 "라운드 N" 인트로 → 시작하기 버튼
 * - 끝나면 평균 · 최고 · 최저 타수
 */
export class FallingWords implements TypingView {
  readonly el = document.createElement('div')

  private round = 0
  private playing = false
  /** 이번 라운드에 아직 안 떨어진 낱말들 */
  private queue: { word: string; fast: boolean }[] = []
  private drops: Drop[] = []
  private spawnTimer = 0
  private roundScore = 0
  private totalScore = 0

  /** 낱말마다 타수 (맞힌 낱말만) */
  private readonly speeds: number[] = []
  private totalStrokes = 0
  private totalTypingSec = 0
  /** 지금 낱말을 치기 시작한 때 */
  private typingSince = 0

  private readonly sky: HTMLElement
  private readonly overlay: HTMLElement
  private readonly input: HTMLInputElement
  private readonly form: HTMLFormElement
  private readonly hud: Record<'round' | 'score' | 'goal' | 'left' | 'total' | 'cpm', HTMLElement>

  constructor(private readonly ctx: ViewContext) {
    this.el.className = 'train'
    this.el.innerHTML = `
      <div class="train__top">
        <button type="button" class="tback" data-action="menu">← 메뉴</button>
        <span class="tbadge" data-hud="round"></span>
        <div class="train__stats">
          <span class="train__stat train__stat--score">점수 <b data-hud="score">0</b> / <b data-hud="goal">0</b></span>
          <span class="train__stat">남은 낱말 <b data-hud="left">0</b></span>
          <span class="train__stat">총점 <b data-hud="total">0</b></span>
          <span class="train__stat">타수 <b data-hud="cpm">0</b></span>
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
    this.hud = { round: hud('round'), score: hud('score'), goal: hud('goal'), left: hud('left'), total: hud('total'), cpm: hud('cpm') }
    this.el.querySelector('[data-action="menu"]')!.addEventListener('click', () => ctx.goMenu())

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
        <p class="train__desc">낱말 ${config.count}개 중 <b>${config.goal}점</b> 이상 모으면 통과!</p>
        <p class="train__rule">맞히면 +1점 · 바닥에 닿으면 −1점 · ${FAIL_SCORE}점이 되면 실패</p>
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
    this.input.value = ''
    this.input.disabled = true
    this.ctx.music.stop()
    this.overlay.innerHTML = `
      <div class="train__intro">
        <p class="train__title train__title--fail">실패!</p>
        <p class="train__desc">점수가 <b>${FAIL_SCORE}점</b>이 되었어요</p>
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
    this.totalStrokes = 0
    this.totalTypingSec = 0
    this.queue = []
    this.drops = []
    this.sky.replaceChildren()
    this.ctx.music.start()
    this.showIntro()
  }

  private startRound() {
    const config = ROUNDS[this.round]
    // 정확히 20%(반올림)를 핑크 낱말로 섞어요
    const fastCount = Math.round(config.count * FAST_RATIO)
    // 라운드 1은 짧은 낱말, 라운드 2부터는 사자성어 · 네 글자 이상 낱말
    const pool = this.round === 0 ? WORDS : LONG_WORDS
    const words = shuffle(pool).slice(0, config.count)
    this.queue = shuffle(words.map((word, i) => ({ word, fast: i < fastCount })))
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
    this.drops.push({ word, el, x, t: 0, fall })
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

    this.remove(target, 'is-hit', `+${HIT_POINT}`)
    this.addScore(HIT_POINT)
    this.ctx.music.sfx('hit')
    this.ctx.onHit()
    this.highlight()
  }

  /** 바닥에 닿았어요: −1점 */
  private land(drop: Drop) {
    this.remove(drop, 'is-miss', `${MISS_POINT}`)
    this.addScore(MISS_POINT)
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

  private renderHud() {
    const config = ROUNDS[this.round]
    this.hud.round.textContent = `라운드 ${this.round + 1} / ${ROUNDS.length}`
    this.hud.score.textContent = String(this.roundScore)
    this.hud.goal.textContent = String(config.goal)
    this.hud.left.textContent = String(this.playing ? this.queue.length + this.drops.length : config.count)
    this.hud.total.textContent = String(this.totalScore)
    const avg = this.totalTypingSec > 0 ? Math.round(this.totalStrokes / (this.totalTypingSec / 60)) : 0
    this.hud.cpm.textContent = String(avg)
    this.el.classList.toggle('is-goal', this.roundScore >= config.goal)
  }
}
