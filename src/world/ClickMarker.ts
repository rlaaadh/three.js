import * as THREE from 'three'

const DURATION = 0.5

/** 바닥을 클릭한 위치에 퍼지는 동그라미 */
export class ClickMarker {
  readonly mesh: THREE.Mesh
  private t = 1

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.18, 32),
      new THREE.MeshBasicMaterial({ color: '#e8604c', transparent: true, depthWrite: false }),
    )
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.visible = false
  }

  show(point: THREE.Vector3) {
    this.mesh.position.set(point.x, point.y + 0.02, point.z)
    this.t = 0
    this.mesh.visible = true
  }

  update(dt: number) {
    if (this.t >= 1) return
    this.t = Math.min(this.t + dt / DURATION, 1)
    const scale = 0.6 + this.t * 1.2
    this.mesh.scale.set(scale, scale, scale)
    ;(this.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - this.t
    if (this.t >= 1) this.mesh.visible = false
  }
}
