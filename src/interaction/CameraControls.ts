import type { Stage } from '../core/Stage'

/** 이만큼(px) 이상 움직이면 탭이 아니라 드래그로 봐요 */
const DRAG_THRESHOLD = 6

/**
 * 마우스 · 터치 제스처를 하나로 처리해요.
 * - 한 손가락(마우스) 드래그: 화면 이동
 * - 두 손가락 핀치: 확대 · 축소 (페이지 전체가 아니라 3D 화면만)
 * - 짧은 탭(클릭): onTap 호출 → 캐릭터 이동 · 침대 · 책상
 */
export class CameraControls {
  onTap: ((e: PointerEvent) => void) | null = null

  private readonly pointers = new Map<number, { x: number; y: number }>()
  private start = { x: 0, y: 0 }
  private dragging = false
  /** 이번 제스처 중에 손가락이 두 개 이상 닿았는지 (그러면 탭으로 보지 않아요) */
  private multiTouch = false
  private pinchDistance = 0
  private pinchCenter = { x: 0, y: 0 }

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
      this.multiTouch = true
      this.resetPinch()
    }
  }

  private onMove(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this.pointers.size === 1 && !this.multiTouch) {
      if (!this.dragging && Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > DRAG_THRESHOLD) {
        this.dragging = true
        this.stage.renderer.domElement.style.cursor = 'grabbing'
      }
      if (this.dragging) this.stage.pan(e.clientX - prev.x, e.clientY - prev.y)
      return
    }

    if (this.pointers.size === 2) {
      const { distance, center } = this.pinchState()
      if (this.pinchDistance > 0) this.stage.zoomBy(distance / this.pinchDistance, true)
      this.stage.pan(center.x - this.pinchCenter.x, center.y - this.pinchCenter.y)
      this.pinchDistance = distance
      this.pinchCenter = center
    }
  }

  private onUp(e: PointerEvent, completed: boolean) {
    if (!this.pointers.has(e.pointerId)) return
    const isTap = completed && this.pointers.size === 1 && !this.dragging && !this.multiTouch
    this.pointers.delete(e.pointerId)

    if (this.pointers.size === 2) this.resetPinch()
    if (this.pointers.size === 0) {
      this.dragging = false
      this.stage.renderer.domElement.style.cursor = ''
    }
    if (isTap) this.onTap?.(e)
  }

  private pinchState() {
    const [a, b] = [...this.pointers.values()]
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  }

  private resetPinch() {
    if (this.pointers.size < 2) return
    const { distance, center } = this.pinchState()
    this.pinchDistance = distance
    this.pinchCenter = center
  }
}
