import type { Chiptune } from './Chiptune'

/** 창이 꺼지는 애니메이션 시간(ms) — CSS appwin-off와 맞춰요 */
const CLOSE_MS = 320

/**
 * 옛날 TV처럼 켜지는 귀여운 레트로 창 (타자연습.app · 설거지.app 공용).
 * 고양이 귀 · 버터색 제목줄 · ♪ 소리 버튼 · ✕ 닫기, 안에 내용은 body에 그려요.
 */
export class RetroWindow {
  /** 창 안 내용이 들어가는 곳 */
  readonly body: HTMLElement
  /** ✕ · Esc로 닫을 때 */
  onClose: (() => void) | null = null

  private readonly root = document.createElement('div')
  private readonly soundButton: HTMLButtonElement
  private opened = false
  private closeTimer = 0

  constructor(
    private readonly music: Chiptune,
    title: string,
    label: string,
  ) {
    this.root.className = 'appwin'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.innerHTML = `
      <div class="appwin__frame">
        <span class="appwin__ear appwin__ear--left" aria-hidden="true"></span>
        <span class="appwin__ear appwin__ear--right" aria-hidden="true"></span>
        <div class="appwin__window" role="dialog" aria-label="${label}">
          <div class="appwin__titlebar">
            <span class="appwin__dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="appwin__name">${title}</span>
            <button class="appwin__icon" data-ref="sound" type="button"></button>
            <button class="appwin__icon appwin__icon--close" data-ref="close" type="button" aria-label="닫기">✕</button>
          </div>
          <div class="appwin__body" data-ref="body"></div>
        </div>
      </div>
    `
    document.body.appendChild(this.root)
    this.body = this.root.querySelector('[data-ref="body"]')!
    this.soundButton = this.root.querySelector('[data-ref="sound"]')!
    this.soundButton.addEventListener('click', () => this.renderSound(this.music.toggleMute()))
    this.root.querySelector('[data-ref="close"]')!.addEventListener('click', () => this.close())
    // 창 안 버튼을 누르면 톡 (ENTER처럼 제출 버튼이나 data-silent 버튼은 자기 소리가 따로 나서 빼요)
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('button')
      if (button && button.type !== 'submit' && !button.hasAttribute('data-silent')) this.music.sfx('click')
    })
    window.addEventListener('keydown', (e) => {
      if (this.opened && e.key === 'Escape') this.close()
    })
  }

  get isOpen() {
    return this.opened
  }

  /** 창을 켜요: 가운데 점 → 가로줄 → 세로로 펼쳐져요 */
  open() {
    if (this.opened) return
    window.clearTimeout(this.closeTimer)
    this.opened = true
    this.renderSound(this.music.muted)
    this.root.classList.remove('is-closing')
    this.root.classList.add('is-open')
    this.root.setAttribute('aria-hidden', 'false')
    document.body.classList.add('is-app-open')
    this.music.sfx('open')
  }

  /** 창을 꺼요: 세로로 접혀 가로줄이 된 뒤 사라져요 */
  close() {
    if (!this.opened) return
    this.opened = false
    this.music.stop()
    this.root.classList.add('is-closing')
    this.root.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('is-app-open')
    this.closeTimer = window.setTimeout(() => this.root.classList.remove('is-open', 'is-closing'), CLOSE_MS)
    this.onClose?.()
  }

  private renderSound(muted: boolean) {
    this.soundButton.textContent = muted ? '♪̸' : '♪'
    this.soundButton.classList.toggle('is-muted', muted)
    this.soundButton.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기')
  }
}
