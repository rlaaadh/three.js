/** 드래그하는 동안 시작점에 뜨는 작은 조이스틱 표시 */
export class Joystick {
  private readonly el: HTMLElement
  private readonly knob: HTMLElement

  constructor() {
    this.el = document.getElementById('stick')!
    this.knob = this.el.querySelector<HTMLElement>('.stick__knob')!
  }

  show(x: number, y: number, dx: number, dy: number) {
    this.el.style.transform = `translate(${x}px, ${y}px)`
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`
    this.el.classList.add('is-active')
  }

  hide() {
    this.el.classList.remove('is-active')
  }
}
