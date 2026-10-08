import * as THREE from 'three'

const MAX_PRINTS = 48
const LIFETIME = 1.8
const MAX_OPACITY = 0.55

/** 걸을 때 바닥에 찍히는 연필 빗금 발자국. 잠시 뒤 서서히 지워져요. */
export class Footprints {
  readonly group = new THREE.Group()
  private readonly prints: { mesh: THREE.Mesh; age: number }[] = []
  private next = 0

  constructor() {
    const texture = footprintTexture()
    const geometry = new THREE.PlaneGeometry(0.12, 0.19)
    geometry.rotateX(-Math.PI / 2)

    for (let i = 0; i < MAX_PRINTS; i++) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }),
      )
      mesh.visible = false
      this.group.add(mesh)
      this.prints.push({ mesh, age: LIFETIME })
    }
  }

  stamp(x: number, y: number, z: number, yaw: number) {
    const print = this.prints[this.next]
    this.next = (this.next + 1) % MAX_PRINTS
    print.mesh.position.set(x, y + 0.006, z)
    print.mesh.rotation.y = yaw + (Math.random() - 0.5) * 0.2
    print.mesh.visible = true
    print.age = 0
  }

  update(dt: number) {
    for (const print of this.prints) {
      if (print.age >= LIFETIME) continue
      print.age += dt
      const t = print.age / LIFETIME
      // 빠르게 진해졌다가 천천히 지워져요
      const opacity = t < 0.08 ? (t / 0.08) * MAX_OPACITY : MAX_OPACITY * (1 - (t - 0.08) / 0.92)
      ;(print.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(opacity, 0)
      if (print.age >= LIFETIME) print.mesh.visible = false
    }
  }
}

/** 타원 안을 연필로 빗금 친 모양 */
function footprintTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 96
  const ctx = canvas.getContext('2d')!

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(32, 48, 24, 42, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.9)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (let i = -100; i < 80; i += 7) {
    const jitter = (Math.random() - 0.5) * 3
    ctx.beginPath()
    ctx.moveTo(i + jitter, 96)
    ctx.lineTo(i + 64 + jitter, 0)
    ctx.stroke()
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(80, 80, 80, 0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(32, 48, 23, 41, 0, 0, Math.PI * 2)
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
