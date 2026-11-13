import { bindKoreanInput } from './input'
import { KEY_ROWS, SHIFTED, charStates, nextKey, strokesOf } from './hangul'
import { LONG_TOPICS, SENTENCES, TIPS, WORDS, cheerFor, shuffle } from './content'
import type { TypingView, ViewContext } from './TypingApp'

export type PracticeMode = 'word' | 'sentence' | 'long'

const SETTINGS: Record<PracticeMode, { label: string; unit: string }> = {
  word: { label: '낱말 연습', unit: '낱말' },
  sentence: { label: '문장 연습', unit: '문장' },
  long: { label: '긴글 연습', unit: '문장' },
}

/** 이번 판에 칠 것들: 낱말 15개 · 속담 8개 · 긴글은 고른 주제에서 한 편을 처음부터 끝까지 */
function pickItems(mode: PracticeMode, topicId?: string) {
  if (mode === 'word') return { items: shuffle(WORDS).slice(0, 15), title: '' }
  if (mode === 'sentence') return { items: shuffle(SENTENCES).slice(0, 8), title: '' }
  const topic = LONG_TOPICS.find((t) => t.id === topicId) ?? LONG_TOPICS[0]
  const passage = topic.passages[Math.floor(Math.random() * topic.passages.length)]
  return { items: passage.lines, title: passage.author ? `${passage.title} (${passage.author})` : passage.title }
}
/** 타수 막대가 꽉 차는 기준 */
const CPM_FULL = 500

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * 낱말 · 문장 · 긴글 연습 화면 (라차 프로젝트 타자 연습 화면 구성 참고).
 * - 낱말 · 문장: 큰 글씨로 칠 것 하나 · 입력창 · 키보드 가이드 / 오른쪽에 기록 · 응원 · 팁
 * - 긴글: 글 전체를 문장 목록으로 보여주고 지금 칠 문장만 강조해요. 다 치고 Enter → 다음 문장.
 *   오른쪽에 기록 · 문장 번호 목차
 */
export class Practice implements TypingView {
  readonly el = document.createElement('div')
  private readonly items: string[]
  private readonly title: string
  private readonly settings: (typeof SETTINGS)[PracticeMode]
  private index = 0
  private startedAt = 0
  /** 끝낸 문장들에서 맞힌 키 수 · 맞힌 글자 수 · 전체 글자 수 */
  private doneStrokes = 0
  private correctChars = 0
  private totalChars = 0
  private statsTimer = 0
  /** 긴글: 문장마다 틀린 글자 없이 쳤는지 */
  private readonly perfect: boolean[] = []

  private readonly isLong: boolean
  private readonly input: HTMLInputElement
  private readonly countEl: HTMLElement
  private readonly badgeEl: HTMLElement
  /** 낱말 · 문장: 칠 글자를 그리는 곳 */
  private readonly targetEl: HTMLElement | null
  /** 긴글: 문장 목록 · 목차 점 */
  private readonly listEl: HTMLElement | null
  private readonly lineEls: HTMLElement[] = []
  private readonly dotEls: HTMLElement[] = []
  private readonly keyEls = new Map<string, HTMLElement>()

  constructor(
    private readonly mode: PracticeMode,
    private readonly ctx: ViewContext,
    private readonly topicId?: string,
  ) {
    this.settings = SETTINGS[mode]
    ;({ items: this.items, title: this.title } = pickItems(mode, topicId))
    this.isLong = mode === 'long'
    this.el.className = `tprac tprac--${mode}`
    this.el.innerHTML = `
      <div class="tprac__main">
        ${this.isLong ? this.longStage() : this.singleStage()}
        ${this.isLong ? '' : this.keyboard()}
      </div>
      <aside class="tprac__side">
        <section class="tcard tdash">
          <p class="tcard__title">오늘의 기록</p>
          ${this.metric('cpm', '타수 (CPM)')}
          ${this.metric('acc', '정확도')}
          ${this.metric('progress', this.isLong ? '현재 문장' : '진행률')}
        </section>
        ${this.isLong ? this.outline() : this.cheerAndTip()}
      </aside>
    `
    const ref = (name: string) => this.el.querySelector<HTMLElement>(`[data-ref="${name}"]`)
    this.input = ref('input') as HTMLInputElement
    this.countEl = ref('count')!
    this.badgeEl = ref('badge')!
    this.targetEl = ref('target')
    this.listEl = ref('list')
    this.el.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => this.lineEls.push(el))
    this.el.querySelectorAll<HTMLElement>('[data-dot]').forEach((el) => this.dotEls.push(el))
    this.el.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => this.keyEls.set(el.dataset.key!, el))
    this.el.querySelector('[data-action="menu"]')!.addEventListener('click', () => ctx.goMenu())

    bindKoreanInput(this.input, ref('form') as HTMLFormElement, {
      submitOnSpace: mode === 'word',
      onInput: () => {
        if (!this.startedAt) this.startedAt = performance.now()
        ctx.onKey()
        this.render()
      },
      onSubmit: () => this.submit(),
    })
    this.render()
  }

  focus() {
    this.input.focus({ preventScroll: true })
  }

  /** 가만히 있어도 타수가 0.5초마다 갱신돼요 */
  update(dt: number) {
    this.statsTimer += dt
    if (!this.startedAt || this.statsTimer < 0.5) return
    this.statsTimer = 0
    this.renderStats()
  }

  private get target() {
    return this.items[this.index] ?? ''
  }

  private submit() {
    const typed = this.input.value.trim()
    if (!typed) return
    const goal = Array.from(this.target)
    const got = Array.from(typed)
    const correct = goal.filter((char, i) => got[i] === char)
    this.correctChars += correct.length
    this.totalChars += goal.length
    this.doneStrokes += strokesOf(correct.join(''))
    const isPerfect = correct.length === goal.length && got.length === goal.length
    this.perfect[this.index] = isPerfect
    this.ctx.music.sfx(isPerfect ? 'hit' : 'miss')
    if (isPerfect) this.ctx.onHit()

    this.index += 1
    this.input.value = ''
    if (this.index >= this.items.length) {
      this.finish()
      return
    }
    this.render()
    this.scrollToCurrent()
    this.focus()
  }

  private finish() {
    const minutes = Math.max((performance.now() - this.startedAt) / 60000, 1 / 60)
    const cpm = Math.round(this.doneStrokes / minutes)
    const accuracy = this.totalChars ? Math.round((this.correctChars / this.totalChars) * 100) : 0
    this.ctx.showResult({
      mode: this.mode,
      topicId: this.topicId,
      title: `${this.settings.label} 끝!`,
      score: cpm,
      lines: [
        { label: '평균 타수', value: `${cpm}타` },
        { label: '정확도', value: `${accuracy}%` },
        { label: '걸린 시간', value: `${Math.round(minutes * 60)}초` },
      ],
    })
  }

  // ---------- 화면 ----------

  private render() {
    const typed = this.input.value
    const total = this.items.length
    const position = `${Math.min(this.index + 1, total)} / ${total}`
    this.badgeEl.textContent = this.title && !this.isLong ? `📖 ${this.title} · ${position}` : `📄 ${position}`
    const counted = `입력: ${Array.from(typed).length} / ${Array.from(this.target).length}`
    this.countEl.textContent = this.isLong ? `Enter로 다음 문장 · ${counted}` : counted

    if (this.isLong) this.renderLong(typed)
    else this.renderSingle(typed)
    this.renderStats()
  }

  private renderSingle(typed: string) {
    this.targetEl!.innerHTML = this.charsHtml(typed)

    // 다음에 누를 키 (쌍자음 · ㅒ · ㅖ는 Shift도 같이)
    const key = nextKey(this.target, typed)
    for (const el of this.keyEls.values()) el.classList.remove('is-next')
    if (key) {
      this.keyEls.get(SHIFTED[key] ?? key)?.classList.add('is-next')
      if (SHIFTED[key]) this.keyEls.get('⇧')?.classList.add('is-next')
    }

    const cheer = cheerFor(this.index, this.items.length, this.settings.unit)
    this.el.querySelector('[data-ref="cheerTitle"]')!.textContent = cheer.title
    this.el.querySelector('[data-ref="cheerText"]')!.textContent = cheer.text
  }

  /** 긴글: 다 친 문장은 ✓, 지금 문장은 강조 상자 안에 글자별 상태, 나머지는 흐리게 */
  private renderLong(typed: string) {
    this.lineEls.forEach((el, i) => {
      const state = i < this.index ? 'done' : i === this.index ? 'current' : 'todo'
      if (el.dataset.state !== state) {
        el.dataset.state = state
        el.className = `tlong__line is-${state}${state === 'done' ? (this.perfect[i] ? ' is-perfect' : ' is-missed') : ''}`
        if (state !== 'current') el.textContent = this.items[i]
      }
      if (state === 'current') el.innerHTML = this.charsHtml(typed)
    })
    this.dotEls.forEach((el, i) => {
      el.className = i < this.index ? 'is-done' : i === this.index ? 'is-current' : ''
    })
  }

  /** 긴글: 지금 문장이 목록 위쪽에 오도록 부드럽게 내려가요 */
  private scrollToCurrent() {
    const line = this.lineEls[this.index]
    if (!line || !this.listEl) return
    this.listEl.scrollTo({ top: line.offsetTop - this.listEl.clientHeight * 0.25, behavior: 'smooth' })
  }

  private charsHtml(typed: string) {
    const states = charStates(this.target, typed)
    return (
      Array.from(this.target)
        // 띄어쓰기는 보통 공백으로 둬서 긴 줄이 띄어쓰기에서 자연스럽게 줄바꿈돼요
        .map((char, i) => `<span class="tchar is-${states[i]}${char === ' ' ? ' tchar--space' : ''}">${escape(char)}</span>`)
        .join('')
    )
  }

  // ---------- 화면 조각 ----------

  private singleStage() {
    return `
      <section class="tcard tprac__stage">
        <div class="tprac__top">
          <button type="button" class="tback" data-action="menu">← 메뉴</button>
          <span class="tbadge" data-ref="badge"></span>
        </div>
        <p class="tprac__target" data-ref="target" aria-live="polite"></p>
        ${this.form()}
        <p class="tprac__count" data-ref="count"></p>
      </section>`
  }

  private longStage() {
    return `
      <section class="tcard tprac__stage tlong">
        <div class="tlong__head">
          <button type="button" class="tback" data-action="menu">← 메뉴</button>
          <span class="tlong__title">${escape(this.title)}</span>
          <span class="tbadge" data-ref="badge"></span>
        </div>
        <ol class="tlong__list" data-ref="list" aria-live="polite">
          ${this.items.map((line, i) => `<li class="tlong__line" data-line="${i}">${escape(line)}</li>`).join('')}
        </ol>
        ${this.form()}
        <p class="tprac__count" data-ref="count"></p>
      </section>`
  }

  private form() {
    return `
      <form class="tprac__form" data-ref="form" autocomplete="off">
        <input data-ref="input" type="text" placeholder="여기에 입력하세요..." aria-label="입력" autocapitalize="off" spellcheck="false" />
        <button type="submit" class="tprac__enter">ENTER →</button>
      </form>`
  }

  private keyboard() {
    return `
      <section class="tcard tkeys" aria-label="키보드 가이드">
        <p class="tcard__title"><span class="tcard__icon">⌨️</span>키보드 가이드</p>
        <div class="tkeys__rows">
          ${KEY_ROWS.map((row) => `<div class="tkeys__row">${row.map((k) => `<span class="tkey${k === '⇧' ? ' tkey--wide' : ''}" data-key="${k}">${k}</span>`).join('')}</div>`).join('')}
          <div class="tkeys__row"><span class="tkey tkey--space" data-key=" ">SPACE</span></div>
        </div>
      </section>`
  }

  private cheerAndTip() {
    return `
      <section class="tcheer" aria-live="polite">
        <span class="tcheer__icon">🏆</span>
        <p class="tcheer__title" data-ref="cheerTitle"></p>
        <p class="tcheer__text" data-ref="cheerText"></p>
      </section>
      <section class="tcard ttip">
        <span class="ttip__icon">💡</span>
        <div><p class="ttip__title">연습 팁</p><p class="ttip__text">${TIPS[Math.floor(Math.random() * TIPS.length)]}</p></div>
      </section>`
  }

  /** 긴글: 문장 번호 목차 (다 친 문장 · 지금 문장 표시) */
  private outline() {
    return `
      <section class="tcard toutline" aria-label="문장 목차">
        <p class="tcard__title">목차</p>
        <div class="toutline__dots">${this.items.map((_, i) => `<span data-dot="${i}">${i + 1}</span>`).join('')}</div>
      </section>`
  }

  private renderStats() {
    const goal = Array.from(this.target)
    const got = Array.from(this.input.value)
    const liveCorrect = goal.filter((char, i) => i < got.length - 1 && got[i] === char)
    const minutes = this.startedAt ? (performance.now() - this.startedAt) / 60000 : 0
    const strokes = this.doneStrokes + strokesOf(liveCorrect.join(''))
    const cpm = minutes > 0.02 ? Math.round(strokes / minutes) : 0
    const checked = this.totalChars + Math.max(got.length - 1, 0)
    const accuracy = checked ? Math.round(((this.correctChars + liveCorrect.length) / checked) * 100) : 100
    this.setMetric('cpm', String(cpm), cpm / CPM_FULL)
    this.setMetric('acc', `${accuracy}%`, accuracy / 100)
    const total = this.items.length
    // 긴글은 지금 몇 번째 문장인지, 낱말 · 문장은 몇 개를 끝냈는지
    const progress = this.isLong ? `${Math.min(this.index + 1, total)}/${total}` : `${this.index}/${total}`
    this.setMetric('progress', progress, this.index / total)
  }

  private metric(name: string, label: string) {
    return `
      <div class="tdash__metric tdash__metric--${name}">
        <div class="tdash__row"><span>${label}</span><b data-metric="${name}">0</b></div>
        <div class="tdash__bar"><i data-bar="${name}"></i></div>
      </div>`
  }

  private setMetric(name: string, value: string, ratio: number) {
    this.el.querySelector(`[data-metric="${name}"]`)!.textContent = value
    ;(this.el.querySelector(`[data-bar="${name}"]`) as HTMLElement).style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`
  }
}
