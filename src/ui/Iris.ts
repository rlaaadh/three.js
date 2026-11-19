import { easeInOutCubic } from '../utils/math'

/** 원이 다 닫힌 뒤 잠깐 멈추는 시간 (ms) */
const HOLD = 220

/**
 * 옛날 만화영화 끝처럼 동그란 구멍이 오므라들며 베이지색으로 덮였다가, 다시 벌어지며 열리는 화면 전환.
 * 구멍은 아주 큰 box-shadow를 두른 원이라 mask를 지원하지 않는 브라우저에서도 똑같이 보여요.
 */
export class Iris {
  private readonly el = document.createElement('div')
  private readonly hole = document.createElement('div')

  constructor() {
    this.el.className = 'iris'
    this.hole.className = 'iris__hole'
    this.el.append(this.hole)
    document.body.append(this.el)
  }

  /** 화면의 (x, y)를 향해 원이 오므라들어 화면을 다 덮어요 */
  async close(x: number, y: number, duration = 750) {
    this.el.classList.add('is-active')
    // 닫힐 때는 끝에서 작은 원으로 한 번 멈칫했다가 (캐릭터만 동그랗게 남는 순간) 마저 닫혀요
    const from = this.maxRadius(x, y)
    const peek = Math.min(70, from * 0.12)
    await this.animate(x, y, from, peek, duration, easeInOutCubic)
    await wait(260)
    await this.animate(x, y, peek, 0, 180, (t) => t * t)
    await wait(HOLD)
  }

  /** 화면의 (x, y)에서 원이 벌어지며 새 화면을 보여줘요 */
  async open(x: number, y: number, duration = 750) {
    await this.animate(x, y, 0, this.maxRadius(x, y), duration, (t) => 1 - Math.pow(1 - t, 3))
    this.el.classList.remove('is-active')
  }

  private maxRadius(x: number, y: number) {
    const w = window.innerWidth
    const h = window.innerHeight
    return Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 8
  }

  private setHole(x: number, y: number, r: number) {
    const s = this.hole.style
    s.left = `${x - r}px`
    s.top = `${y - r}px`
    s.width = s.height = `${r * 2}px`
  }

  private animate(x: number, y: number, from: number, to: number, duration: number, ease: (t: number) => number) {
    return new Promise<void>((resolve) => {
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        this.setHole(x, y, from + (to - from) * ease(t))
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      this.setHole(x, y, from)
      requestAnimationFrame(step)
    })
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
