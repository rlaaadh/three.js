import type { Chiptune } from '../Chiptune'
import { RetroWindow } from '../RetroWindow'
import { Practice, type PracticeMode } from './Practice'
import { LONG_TOPICS } from './content'

/** 창 안에 들어가는 화면 하나 (메뉴 · 연습 · 결과) */
export interface TypingView {
  readonly el: HTMLElement
  update?(dt: number): void
  focus?(): void
  destroy?(): void
}

export interface TypingResultInfo {
  mode: PracticeMode
  /** 긴글 연습 주제 (다시 하기 때 같은 주제로) */
  topicId?: string
  title: string
  /** 최고 기록 비교용 (평균 타수) */
  score: number
  lines: { label: string; value: string }[]
}

export interface ViewContext {
  music: Chiptune
  onKey(): void
  onHit(): void
  goMenu(): void
  showResult(result: TypingResultInfo): void
}

const BEST_KEY = 'tiny-room-typing-best'

const MODES: { mode: PracticeMode; icon: string; title: string; desc: string }[] = [
  { mode: 'word', icon: '가', title: '낱말 연습', desc: '짧은 낱말부터 차근차근' },
  { mode: 'sentence', icon: '✎', title: '문장 연습', desc: '속담을 한 문장씩' },
  { mode: 'long', icon: '¶', title: '긴글 연습', desc: '가사 · 잰말놀이 · 일기 · 명작' },
]

/**
 * 책상에 앉으면 옛날 TV처럼 켜지는 레트로 창 (타자연습.app).
 * 처음엔 메뉴(책상 그림 + 모드 고르기) → 낱말 연습 · 문장 연습 · 긴글 연습(주제 고르기) → 결과.
 */
export class TypingApp {
  /** 글자를 칠 때마다 */
  onKey: (() => void) | null = null
  /** 맞혔을 때 */
  onHit: (() => void) | null = null
  /** 창을 닫을 때 */
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  private readonly body: HTMLElement
  private view: TypingView | null = null
  private readonly ctx: ViewContext

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '타자연습.app', '타자 연습')
    this.body = this.win.body
    this.win.onClose = () => {
      this.setView(null)
      this.onClose?.()
    }

    this.ctx = {
      music: this.music,
      onKey: () => this.onKey?.(),
      onHit: () => this.onHit?.(),
      goMenu: () => this.showMenu(),
      showResult: (result) => this.showResult(result),
    }
  }

  get isOpen() {
    return this.win.isOpen
  }

  /** 창을 켜고 메뉴부터 */
  open() {
    if (this.win.isOpen) return
    this.win.open()
    this.showMenu()
  }

  close() {
    this.win.close()
  }

  update(dt: number) {
    if (this.win.isOpen) this.view?.update?.(dt)
  }

  // ---------- 화면 ----------

  private setView(view: TypingView | null) {
    this.view?.destroy?.()
    this.view = view
    this.body.replaceChildren(...(view ? [view.el] : []))
    view?.focus?.()
  }

  private showMenu() {
    this.music.stop()
    const el = document.createElement('div')
    el.className = 'tmenu'
    el.innerHTML = `
      <div class="tmenu__art" aria-hidden="true">${DESK_ART}</div>
      <div class="tmenu__side">
        <p class="tmenu__hello">오늘도 <mark>타닥타닥!</mark></p>
        <p class="tmenu__desc">연습할 모드를 골라 주세요</p>
        <div class="tmenu__modes">
          ${MODES.map(
            (m) => `
            <button type="button" class="tmode tmode--${m.mode}" data-mode="${m.mode}">
              <span class="tmode__icon">${m.icon}</span>
              <span class="tmode__text"><b>${m.title}</b><small>${m.desc}</small></span>
              <span class="tmode__best">${this.bestLabel(m.mode)}</span>
            </button>`,
          ).join('')}
        </div>
      </div>
    `
    el.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) =>
      button.addEventListener('click', () => this.startMode(button.dataset.mode as PracticeMode)),
    )
    this.setView({ el, focus: () => el.querySelector<HTMLButtonElement>('[data-mode]')?.focus({ preventScroll: true }) })
  }

  private startMode(mode: PracticeMode, topicId?: string) {
    if (mode === 'long' && !topicId) {
      this.showTopics()
      return
    }
    // 버튼 클릭 안에서 소리를 켜야 브라우저가 막지 않아요
    this.music.start()
    this.setView(new Practice(mode, this.ctx, topicId))
  }

  /** 긴글 연습 주제 고르기: 가사 · 잰말놀이 · 일기 · 명작 */
  private showTopics() {
    this.music.stop()
    const el = document.createElement('div')
    el.className = 'ttopics'
    el.innerHTML = `
      <div class="ttopics__top">
        <button type="button" class="tback" data-action="menu">← 메뉴</button>
        <p class="ttopics__title">긴글 연습 · 무엇을 쳐 볼까요?</p>
      </div>
      <div class="ttopics__grid">
        ${LONG_TOPICS.map(
          (t) => `
          <button type="button" class="ttopic ttopic--${t.id}" data-topic="${t.id}">
            <span class="ttopic__icon">${t.icon}</span>
            <b class="ttopic__name">${t.title}</b>
            <small class="ttopic__desc">${t.desc}</small>
            <span class="ttopic__count">${t.passages.length}편</span>
          </button>`,
        ).join('')}
      </div>
    `
    el.querySelector('[data-action="menu"]')!.addEventListener('click', () => this.showMenu())
    el.querySelectorAll<HTMLElement>('[data-topic]').forEach((button) =>
      button.addEventListener('click', () => this.startMode('long', button.dataset.topic)),
    )
    this.setView({ el, focus: () => el.querySelector<HTMLButtonElement>('[data-topic]')?.focus({ preventScroll: true }) })
  }

  private showResult(result: TypingResultInfo) {
    this.music.stop()
    const best = this.saveBest(result.mode, result.score)
    const isBest = result.score > 0 && result.score >= best
    this.music.sfx('clear')
    const el = document.createElement('div')
    el.className = 'tresult'
    el.innerHTML = `
      <div class="tresult__card">
        <p class="tresult__title">${result.title}${isBest ? ' <mark>최고 기록 🎉</mark>' : ''}</p>
        <div class="tresult__lines">
          ${result.lines.map((line) => `<div class="tresult__line"><span>${line.label}</span><b>${line.value}</b></div>`).join('')}
        </div>
        <div class="tresult__buttons">
          <button type="button" class="tbutton tbutton--main" data-action="again">다시 하기</button>
          <button type="button" class="tbutton" data-action="menu">메뉴로</button>
        </div>
      </div>
    `
    el.querySelector('[data-action="again"]')!.addEventListener('click', () => this.startMode(result.mode, result.topicId))
    el.querySelector('[data-action="menu"]')!.addEventListener('click', () => this.showMenu())
    this.setView({ el, focus: () => el.querySelector<HTMLButtonElement>('[data-action="again"]')?.focus({ preventScroll: true }) })
  }

  // ---------- 최고 기록 (이 브라우저에만 저장) ----------

  private readBest(): Record<string, number> {
    try {
      const saved = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}')
      return saved && typeof saved === 'object' ? saved : {}
    } catch {
      return {}
    }
  }

  private bestLabel(mode: string) {
    const best = this.readBest()[mode]
    if (!best) return ''
    return `최고 ${best}타`
  }

  private saveBest(mode: string, score: number) {
    const all = this.readBest()
    const best = Math.max(all[mode] ?? 0, score)
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({ ...all, [mode]: best }))
    } catch {
      // 저장소를 못 쓰면 이번 기록만
    }
    return best
  }
}

/**
 * 메뉴 그림: 파스텔 책상 위 모니터(가나다) · 알록달록 키보드 · 스탠드 · 연필꽂이, 둥실 떠다니는 방울 · 별
 * (참고 이미지 분위기를 집 색(버터 · 브라운 · 아이보리)에 맞춰 SVG로 그렸어요)
 */
const DESK_ART = `
<svg viewBox="0 0 400 300" class="tart">
  <g class="tart__float">
    <circle cx="48" cy="70" r="14" fill="#d8f0e4" stroke="#5a4033" stroke-width="3"/>
    <circle cx="352" cy="58" r="17" fill="#ffe08a" stroke="#5a4033" stroke-width="3"/>
    <circle cx="362" cy="214" r="12" fill="#ffd9de" stroke="#5a4033" stroke-width="3"/>
    <circle cx="36" cy="222" r="10" fill="#dcebff" stroke="#5a4033" stroke-width="3"/>
  </g>
  <g class="tart__float tart__float--late" fill="#ffe08a" stroke="#5a4033" stroke-width="3" stroke-linejoin="round">
    <path d="M300 30 l5 10 11 2 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -2z"/>
    <path d="M78 150 l4 8 9 1 -6 6 1 9 -8 -4 -8 4 1 -9 -6 -6 9 -1z"/>
  </g>
  <!-- 책상 -->
  <rect x="58" y="214" width="284" height="22" rx="11" fill="#e9c18f" stroke="#5a4033" stroke-width="3"/>
  <rect x="80" y="234" width="14" height="40" rx="6" fill="#d4a673" stroke="#5a4033" stroke-width="3"/>
  <rect x="306" y="234" width="14" height="40" rx="6" fill="#d4a673" stroke="#5a4033" stroke-width="3"/>
  <!-- 모니터 -->
  <rect x="190" y="182" width="40" height="34" rx="6" fill="#f1efea" stroke="#5a4033" stroke-width="3"/>
  <rect x="150" y="66" width="168" height="124" rx="16" fill="#fffaf0" stroke="#5a4033" stroke-width="3"/>
  <rect x="162" y="78" width="144" height="94" rx="10" fill="#bfe3f5" stroke="#5a4033" stroke-width="2.5"/>
  <circle cx="290" cy="94" r="7" fill="#fff" opacity=".7"/>
  <text x="182" y="140" class="tart__letter" fill="#ffd36b">가</text>
  <text x="222" y="150" class="tart__letter tart__letter--2" fill="#ffb3c7">나</text>
  <text x="262" y="138" class="tart__letter tart__letter--3" fill="#a8dcc8">다</text>
  <!-- 키보드 -->
  <rect x="112" y="196" width="150" height="24" rx="10" fill="#fffaf0" stroke="#5a4033" stroke-width="3"/>
  <g stroke="#5a4033" stroke-width="1.5">
    ${Array.from({ length: 8 }, (_, i) => `<rect x="${120 + i * 17}" y="201" width="13" height="6" rx="2" fill="${['#ffd9de', '#d8f0e4', '#ffe08a', '#dcebff'][i % 4]}"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<rect x="${128 + i * 17}" y="210" width="13" height="6" rx="2" fill="${['#dcebff', '#ffe08a', '#ffd9de', '#d8f0e4'][i % 4]}"/>`).join('')}
  </g>
  <!-- 마우스 · 연필꽂이 -->
  <ellipse cx="284" cy="210" rx="9" ry="7" fill="#fffaf0" stroke="#5a4033" stroke-width="2.5"/>
  <rect x="318" y="180" width="18" height="34" rx="5" fill="#ffd9de" stroke="#5a4033" stroke-width="2.5"/>
  <path d="M322 180 l-3 -22 M328 180 l2 -26 M333 180 l5 -18" stroke="#5a4033" stroke-width="3" stroke-linecap="round"/>
  <!-- 스탠드 -->
  <ellipse cx="96" cy="212" rx="22" ry="6" fill="#ffe08a" stroke="#5a4033" stroke-width="3"/>
  <path d="M96 208 C 92 160, 104 130, 120 118" fill="none" stroke="#5a4033" stroke-width="5" stroke-linecap="round"/>
  <path d="M106 112 Q 128 92 150 118 Z" fill="#ffe08a" stroke="#5a4033" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="128" cy="122" rx="14" ry="5" fill="#fff6c8" class="tart__glow"/>
</svg>`
