import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export type SpotAction = 'lie' | 'sit'

/** 캐릭터가 다가가서 특정 동작을 하는 지점 (침대, 책상) */
export interface Spot {
  action: SpotAction
  /** 동작 전에 걸어가서 서는 위치 */
  approach: THREE.Vector3
  /** 동작 중일 때 캐릭터 root 위치 */
  position: THREE.Vector3
  /** 동작 중일 때 캐릭터 root 회전 */
  quaternion: THREE.Quaternion
  hint: string
}

const material = (color: string, roughness = 0.7) =>
  new THREE.MeshStandardMaterial({ color, roughness })

function box(w: number, h: number, d: number, color: string, radius = 0.05) {
  const r = Math.min(radius, Math.min(w, h, d) / 2 - 0.001)
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), material(color))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function cylinder(rTop: number, rBottom: number, h: number, color: string) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 32), material(color))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, parent: THREE.Object3D) {
  obj.position.set(x, y, z)
  parent.add(obj)
  return obj
}

function plankTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f4d6aa'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#e2bb88'
  ctx.lineWidth = 3
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(0, i * 64)
    ctx.lineTo(256, i * 64)
    ctx.stroke()
    const x = (i * 97) % 256
    ctx.beginPath()
    ctx.moveTo(x, i * 64)
    ctx.lineTo(x, i * 64 + 64)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  return texture
}

/**
 * 임시 도형으로 만든 작은 방.
 * 나중에 GLB 모델로 바꿀 때도 `floor`, `bed`, `desk`와 각 Spot 구조만 유지하면
 * 클릭 · 이동 로직은 그대로 쓸 수 있어요.
 */
export class Room {
  readonly group = new THREE.Group()
  readonly floor: THREE.Mesh
  /** 클릭이 통과하지 않도록 막는 벽 */
  readonly walls: THREE.Mesh[] = []
  readonly bed = new THREE.Group()
  readonly desk = new THREE.Group()
  readonly bedSpot: Spot
  readonly deskSpot: Spot

  constructor() {
    const g = this.group

    // ---------- 바닥 · 벽 ----------
    this.floor = box(6.4, 0.25, 6.4, '#ffffff', 0.04)
    ;(this.floor.material as THREE.MeshStandardMaterial).map = plankTexture()
    place(this.floor, 0, -0.125, 0, g)

    this.walls.push(
      place(box(0.2, 3.4, 6.4, '#fff4e4', 0.04), -3.1, 1.45, 0, g),
      place(box(6.4, 3.4, 0.2, '#ffe39b', 0.04), 0, 1.45, -3.1, g),
    )

    // 창문 (뒤쪽 벽)
    place(box(1.5, 1.2, 0.08, '#ffffff', 0.03), -0.4, 1.9, -2.97, g)
    place(box(1.3, 1.0, 0.06, '#bfe8ff', 0.02), -0.4, 1.9, -2.93, g)
    place(box(0.35, 1.5, 0.06, '#fff8d8', 0.03), -1.3, 1.85, -2.9, g)
    place(box(0.35, 1.5, 0.06, '#fff8d8', 0.03), 0.5, 1.85, -2.9, g)

    // 액자 · 시계 (왼쪽 벽)
    place(box(0.06, 0.8, 1.0, '#ffffff', 0.02), -2.97, 2.1, 0.6, g)
    place(box(0.04, 0.6, 0.8, '#ffc9d6', 0.02), -2.94, 2.1, 0.6, g)
    const clock = cylinder(0.32, 0.32, 0.08, '#ffd23f')
    clock.rotation.z = Math.PI / 2
    place(clock, -2.95, 2.3, 1.9, g)
    const clockFace = cylinder(0.25, 0.25, 0.02, '#ffffff')
    clockFace.rotation.z = Math.PI / 2
    place(clockFace, -2.9, 2.3, 1.9, g)

    // 러그 · 화분 · 낮은 수납장 · 쿠션
    place(cylinder(1.3, 1.3, 0.03, '#a9dcc7'), 0.4, 0.015, 0.8, g)
    place(cylinder(0.22, 0.17, 0.4, '#e98b5a'), 2.65, 0.2, -2.6, g)
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), material('#7cc46a'))
    leaves.castShadow = true
    leaves.scale.set(1, 1.3, 1)
    place(leaves, 2.65, 0.85, -2.6, g)
    place(box(0.7, 0.8, 1.3, '#f6c9a0', 0.06), -2.6, 0.4, 1.7, g)
    place(box(0.5, 0.15, 0.5, '#ffb3c7', 0.07), 1.9, 0.08, 1.6, g)
    place(box(0.25, 0.3, 0.2, '#6fa8ff', 0.03), -2.6, 0.95, 1.4, g)
    place(box(0.25, 0.25, 0.2, '#ffd23f', 0.03), -2.6, 0.93, 1.75, g)

    // ---------- 침대 (머리는 왼쪽 벽 쪽) ----------
    const bed = this.bed
    place(box(2.3, 0.4, 1.5, '#e3b98a', 0.06), 0, 0.2, 0, bed)
    place(box(2.2, 0.26, 1.42, '#ffffff', 0.1), 0, 0.53, 0, bed)
    place(box(1.3, 0.1, 1.48, '#f7b6c8', 0.04), 0.45, 0.66, 0, bed)
    // 베개: 누웠을 때 머리가 닿는 자리에 납작하게
    place(box(0.55, 0.12, 0.95, '#ffe08a', 0.06), -0.5, 0.69, 0, bed)
    place(box(0.14, 1.1, 1.5, '#d9a877', 0.05), -1.08, 0.55, 0, bed)
    place(bed, -1.85, 0, -2.0, g)

    // 누운 자세: 머리는 -x(베개), 얼굴은 위(+y)를 보도록
    const lieQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ),
    )
    this.bedSpot = {
      action: 'lie',
      approach: new THREE.Vector3(-0.3, 0, -1.6),
      position: new THREE.Vector3(-0.95, 0.96, -2.0),
      quaternion: lieQuat,
      hint: '침대에서 뒹굴기',
    }
    bed.userData.spot = this.bedSpot

    // ---------- 책상 + 의자 (뒤쪽 벽 쪽) ----------
    const desk = this.desk
    place(box(1.7, 0.08, 0.8, '#e9c18f', 0.03), 0, 0.95, 0, desk)
    for (const [x, z] of [
      [-0.78, -0.33],
      [0.78, -0.33],
      [-0.78, 0.33],
      [0.78, 0.33],
    ]) {
      place(box(0.07, 0.92, 0.07, '#d4a673', 0.02), x, 0.46, z, desk)
    }
    place(box(0.5, 0.25, 0.7, '#f3d3a8', 0.03), 0.5, 0.77, 0, desk)
    place(box(0.5, 0.04, 0.35, '#5b6b8c', 0.01), -0.2, 1.01, 0.05, desk)
    place(box(0.5, 0.32, 0.03, '#5b6b8c', 0.01), -0.2, 1.17, -0.13, desk)
    place(cylinder(0.08, 0.12, 0.05, '#ff8f6b'), -0.65, 1.01, -0.2, desk)
    place(cylinder(0.025, 0.025, 0.4, '#ff8f6b'), -0.65, 1.2, -0.2, desk)
    place(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), material('#fff1b8')), -0.65, 1.42, -0.15, desk)

    // 의자 (책상 앞, +z 쪽)
    place(box(0.6, 0.08, 0.6, '#9fc7ff', 0.03), 0, 0.5, 0.75, desk)
    place(box(0.6, 0.6, 0.08, '#9fc7ff', 0.03), 0, 0.82, 1.02, desk)
    for (const [x, z] of [
      [-0.25, 0.5],
      [0.25, 0.5],
      [-0.25, 1.0],
      [0.25, 1.0],
    ]) {
      place(box(0.05, 0.48, 0.05, '#7aa8e6', 0.02), x, 0.24, z, desk)
    }
    place(desk, 1.5, 0, -2.5, g)

    // 앉은 자세: 책상(-z)을 바라보고, 엉덩이가 의자 위에 오도록
    this.deskSpot = {
      action: 'sit',
      approach: new THREE.Vector3(1.5, 0, -0.95),
      position: new THREE.Vector3(1.5, 0.24, -1.72),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)),
      hint: '책상에 앉기',
    }
    desk.userData.spot = this.deskSpot
  }

  /** 클릭 판정 대상 */
  get clickables(): THREE.Object3D[] {
    return [this.bed, this.desk, this.floor]
  }
}
