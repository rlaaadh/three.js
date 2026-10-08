import * as THREE from 'three'

/** 각 부분 선이 다 그려진 뒤 색이 채워지는 데 걸리는 진행률 구간 */
const FILL_SPAN = 0.12

interface SketchPart {
  el: SVGPathElement
  length: number
  /** 이 부분을 그리기 시작하는 진행률 (0~1) */
  from: number
  /** 이 부분 선이 다 그려지는 진행률 (0~1) */
  to: number
}

/**
 * 로딩 인트로 화면.
 * 진행률에 맞춰 파비콘의 집을 연필로 그리듯 벽 → 문 → 지붕 순서로 그리고, 색을 채운 뒤 페이드아웃해요.
 * 나중에 GLB 모델을 불러올 때는 `manager`를 GLTFLoader에 넘기면 진행률에 반영돼요.
 */
export class Loader {
  readonly manager = new THREE.LoadingManager()
  private readonly el = document.getElementById('loader')!
  private readonly percentEl = document.getElementById('loader-percent')!
  private readonly sketch = document.getElementById('loader-sketch')!
  private readonly parts: SketchPart[]

  constructor() {
    this.parts = [...this.sketch.querySelectorAll<SVGPathElement>('.loader__part')].map((el) => {
      const length = el.getTotalLength()
      el.style.strokeDasharray = `${length}`
      el.style.strokeDashoffset = `${length}`
      return { el, length, from: Number(el.dataset.from), to: Number(el.dataset.to) }
    })
  }

  /** 모든 작업이 끝나고, 최소 연출 시간이 지나면 resolve 돼요 */
  start(tasks: Promise<unknown>[], minDuration = 2000): Promise<void> {
    let done = 0
    const total = tasks.length
    tasks.forEach((task) =>
      task.then(
        () => done++,
        () => done++,
      ),
    )

    const startedAt = performance.now()
    return new Promise((resolve) => {
      const tick = () => {
        const real = total ? done / total : 1
        const byTime = Math.min((performance.now() - startedAt) / minDuration, 1)
        const progress = Math.min(real, byTime)
        this.render(progress)

        if (progress >= 1) {
          this.sketch.classList.add('is-drawn')
          setTimeout(() => {
            this.el.classList.add('is-done')
            resolve()
          }, 450)
        } else {
          requestAnimationFrame(tick)
        }
      }
      tick()
    })
  }

  private render(progress: number) {
    for (const part of this.parts) {
      const drawn = THREE.MathUtils.clamp((progress - part.from) / (part.to - part.from), 0, 1)
      const filled = THREE.MathUtils.clamp((progress - part.to) / FILL_SPAN, 0, 1)
      part.el.style.strokeDashoffset = `${part.length * (1 - drawn)}`
      part.el.style.fillOpacity = `${progress >= 1 ? 1 : filled}`
    }
    this.percentEl.textContent = String(Math.round(progress * 100))
  }
}
