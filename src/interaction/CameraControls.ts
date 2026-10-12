import type { Stage } from '../core/Stage'

/** 이만큼(px) 이상 움직이면 탭이 아니라 드래그로 봐요 */
const DRAG_THRESHOLD = 6

/** 조이스틱 반지름(px): 이보다 멀리 끌면 시작점이 손가락을 따라와요 */
export const STICK_RADIUS = 56

/**
 * 마우스 · 터치 제스처를 하나로 처리해요.
 * - 한 손가락(마우스) 드래그: 가상 조이스틱 → 끈 방향으로 캐릭터가 걸어가요
 * - 두 손가락 핀치: 확대 · 축소 (페이지 전체가 아니라 3D 화면만)
 * - 짧은 탭(클릭): onTap 호출 → 캐릭터 이동 · 침대 · 책상 · 식탁 · 주방
 */
export class CameraControls {
  onTap: ((e: PointerEvent) => void) | null = null
  /** 드래그 중 매번: 시작점(조이스틱 중심)에서 손가락까지 dx, dy (px). 끝나면 null */
  onStick: ((stick: { x: number; y: number; dx: number; dy: number } | null) => void) | null = null

  private readonly pointers = new Map<number, { x: number; y: number }>()
  private start = { x: 0, y: 0 }
  private dragging = false
  /** 이번 제스처 중에 손가락이 두 개 이상 닿았는지 (그러면 탭으로 보지 않아요) */
  private multiTouch = false
  private pinchDistance = 0

  constructor(private readonly stage: Stage) {
    const el = stage.renderer.domElement
    // 브라우저 기본 터치 동작(스크롤 · 페이지 확대)을 끄고 직접 처리해요
    el.style.touchAction = 'none'

    el.addEventListener('pointerdown', (e) => this.onDown(e))
    el.addEventListener('pointermove', (e) => this.onMove(e))
    el.addEventListener('pointerup', (e) => this.onUp(e, true))
    el.addEventListener('pointercancel', (e) => this.onUp(e, false))
  }

  private onDown(e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      // 손가락이 캔버스 밖으로 나가도 이벤트를 계속 받아요
      this.stage.renderer.domElement.setPointerCapture(e.pointerId)
    } catch {
      // 이미 끝난 포인터 등 캡처할 수 없는 경우는 무시해요
    }

    if (this.pointers.size === 1) {
      this.start = { x: e.clientX, y: e.clientY }
      this.dragging = false
      this.multiTouch = false
    } else {
      // 두 번째 손가락이 닿으면 걷기를 멈추고 핀치로 바꿔요
      if (this.dragging) this.onStick?.(null)
      this.dragging = false
      this.multiTouch = true
      this.resetPinch()
    }
  }

  private onMove(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this.pointers.size === 1 && !this.multiTouch) {
      let dx = e.clientX - this.start.x
      let dy = e.clientY - this.start.y
      if (!this.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        this.dragging = true
        this.stage.renderer.domElement.style.cursor = 'grabbing'
      }
      if (!this.dragging) return
      // 조이스틱 반지름보다 멀리 끌면 시작점을 끌고 와서, 반대로 끌 때 바로 방향이 바뀌게 해요
      const len = Math.hypot(dx, dy)
      if (len > STICK_RADIUS) {
        this.start.x = e.clientX - (dx / len) * STICK_RADIUS
        this.start.y = e.clientY - (dy / len) * STICK_RADIUS
        dx = e.clientX - this.start.x
        dy = e.clientY - this.start.y
      }
      this.onStick?.({ x: this.start.x, y: this.start.y, dx, dy })
      return
    }

    if (this.pointers.size === 2) {
      const distance = this.pinchDistanceNow()
      if (this.pinchDistance > 0) this.stage.zoomBy(distance / this.pinchDistance, true)
      this.pinchDistance = distance
    }
  }

  private onUp(e: PointerEvent, completed: boolean) {
    if (!this.pointers.has(e.pointerId)) return
    const isTap = completed && this.pointers.size === 1 && !this.dragging && !this.multiTouch
    this.pointers.delete(e.pointerId)

    if (this.pointers.size === 2) this.resetPinch()
    if (this.pointers.size === 0) {
      if (this.dragging) this.onStick?.(null)
      this.dragging = false
      this.stage.renderer.domElement.style.cursor = ''
    }
    if (isTap) this.onTap?.(e)
  }

  private pinchDistanceNow() {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private resetPinch() {
    if (this.pointers.size < 2) return
    this.pinchDistance = this.pinchDistanceNow()
  }
}
