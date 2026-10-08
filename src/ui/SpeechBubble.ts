import * as THREE from 'three'
import { toScreen } from './screen'

/** 말풍선이 사라지는 페이드 시간 (CSS transition과 맞춰요) */
const FADE_TIME = 0.25

/**
 * 캐릭터 머리 위에 뜨는 HTML 말풍선.
 * 3D 위치를 화면 좌표로 바꿔서 매 프레임 따라가요. (글자가 선명하고 줄바꿈도 자연스러워요)
 */
export class SpeechBubble {
  private readonly el = document.getElementById('bubble')!
  private readonly point = new THREE.Vector3()
  private remaining = 0

  show(text: string, seconds = Math.min(2.5 + text.length * 0.12, 7)) {
    this.el.textContent = text
    this.remaining = seconds
    this.el.classList.add('is-visible')
  }

  /** anchor: 말풍선 꼬리가 가리킬 월드 좌표를 채워주는 함수 */
  update(dt: number, camera: THREE.Camera, canvas: HTMLCanvasElement, anchor: (target: THREE.Vector3) => THREE.Vector3) {
    if (this.remaining <= -FADE_TIME) return
    this.remaining -= dt
    if (this.remaining <= 0) this.el.classList.remove('is-visible')

    const { x, y } = toScreen(anchor(this.point), camera, canvas)
    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`
  }
}
