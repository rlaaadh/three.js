import * as THREE from 'three'

/**
 * 로딩 인트로 화면.
 * 연필로 방 윤곽을 그리듯 진행률을 보여주고, 끝나면 페이드아웃해요.
 * 나중에 GLB 모델을 불러올 때는 `manager`를 GLTFLoader에 넘기면 진행률에 반영돼요.
 */
export class Loader {
  readonly manager = new THREE.LoadingManager()
  private readonly el = document.getElementById('loader')!
  private readonly percentEl = document.getElementById('loader-percent')!
  private readonly path = document.getElementById('loader-path') as unknown as SVGPathElement
  private readonly length: number

  constructor() {
    this.length = this.path.getTotalLength()
    this.path.style.strokeDasharray = `${this.length}`
    this.path.style.strokeDashoffset = `${this.length}`
  }

  /** 모든 작업이 끝나고, 최소 연출 시간이 지나면 resolve 돼요 */
  start(tasks: Promise<unknown>[], minDuration = 1800): Promise<void> {
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
          setTimeout(() => {
            this.el.classList.add('is-done')
            resolve()
          }, 300)
        } else {
          requestAnimationFrame(tick)
        }
      }
      tick()
    })
  }

  private render(progress: number) {
    this.path.style.strokeDashoffset = `${this.length * (1 - progress)}`
    this.percentEl.textContent = String(Math.round(progress * 100))
  }
}
