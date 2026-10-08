import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Spot } from './Room'
import { groundHeight, planPath } from './Navigation'
import { damp, dampAngle, easeInOutCubic } from '../utils/math'
import { handFont } from '../utils/fonts'

type State = 'idle' | 'walk' | 'transition' | 'lie' | 'sit'

const WALK_SPEED = 1.8
const TRANSITION_TIME = 0.55
/** 발자국 간격 */
const STEP_LENGTH = 0.3

const COLORS = {
  skin: '#ffe1cc',
  hair: '#d9822f',
  denim: '#8fb3dc',
  denimCuff: '#a9c6e6',
  button: '#f2c230',
  shoe: '#8a4f2a',
  nose: '#f07a3c',
}

const material = (color: string, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness })

/**
 * 임시 캐릭터 (일자 앞머리 아이).
 * 나중에 GLB 모델 + 애니메이션으로 교체할 때는 build()와 pose 부분만 바꾸면 돼요.
 * 상태: idle → walk → transition → lie / sit
 */
export class Character {
  readonly root = new THREE.Group()
  readonly zzz: THREE.Sprite
  state: State = 'idle'
  /** 한 걸음 디딜 때마다 호출돼요 (발자국 찍기용) */
  onStep: ((x: number, y: number, z: number, yaw: number) => void) | null = null

  private readonly model = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly hips: THREE.Group[] = []
  private readonly shoulders: THREE.Group[] = []

  private path: THREE.Vector3[] = []
  private stepDistance = 0
  private stepSide = 1
  private onArrive: (() => void) | null = null
  private yaw = Math.PI / 4 // 처음엔 카메라 쪽을 바라봐요
  private time = 0
  /** 손 흔들기 남은 시간 */
  private waveTime = 0
  /** 활짝 웃는 표정 남은 시간 */
  private smileTime = 0
  private readonly faces = { normal: faceTexture('normal'), happy: faceTexture('happy') }
  private readonly faceMaterial = new THREE.MeshStandardMaterial({ map: this.faces.normal, roughness: 0.65 })
  private spot: Spot | null = null
  private transition: {
    fromP: THREE.Vector3
    toP: THREE.Vector3
    fromQ: THREE.Quaternion
    toQ: THREE.Quaternion
    t: number
    done: () => void
  } | null = null

  constructor() {
    this.root.add(this.model)
    this.root.rotation.y = this.yaw
    this.build()
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    this.zzz = createZzz()
  }

  /** 바닥의 한 지점으로 걸어가요 */
  moveTo(point: THREE.Vector3) {
    if (this.state === 'transition') return
    this.leaveSpot(() => this.walk(point, null))
  }

  /** 침대 · 책상 같은 지점으로 가서 동작해요 */
  perform(spot: Spot) {
    if (this.state === 'transition' || this.spot === spot) return
    this.leaveSpot(() => this.walk(spot.approach, () => this.enter(spot)))
  }

  /** 활짝 웃으면서 손을 흔들어요 */
  wave(duration = 2.2) {
    this.waveTime = duration
    this.smile(duration)
  }

  /** 잠깐 활짝 웃어요 */
  smile(duration = 1.8) {
    this.smileTime = Math.max(this.smileTime, duration)
    this.faceMaterial.map = this.faces.happy
  }

  /** 말풍선이 붙을 머리 위 지점 */
  getHeadTop(target: THREE.Vector3) {
    this.head.getWorldPosition(target)
    target.y += 0.62
    return target
  }

  update(dt: number) {
    this.time += dt
    this.waveTime = Math.max(this.waveTime - dt, 0)
    if (this.smileTime > 0) {
      this.smileTime -= dt
      if (this.smileTime <= 0) this.faceMaterial.map = this.faces.normal
    }

    if (this.state === 'walk') this.updateWalk(dt)
    if (this.state === 'transition') this.updateTransition(dt)
    this.updatePose(dt)
    this.updateZzz()
  }

  // ---------- 이동 ----------

  private walk(point: THREE.Vector3, onArrive: (() => void) | null) {
    // 벽에 막히면 벽 끝을 돌아가는 경로로 걸어가요
    this.path = planPath(this.root.position, point)
    this.onArrive = onArrive
    this.state = 'walk'
  }

  private updateWalk(dt: number) {
    const pos = this.root.position
    const target = this.path[0]
    if (!target) {
      this.state = 'idle'
      const cb = this.onArrive
      this.onArrive = null
      cb?.()
      return
    }

    const dx = target.x - pos.x
    const dz = target.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.03) {
      this.path.shift()
      return
    }

    const step = Math.min(WALK_SPEED * dt, dist)
    pos.x += (dx / dist) * step
    pos.z += (dz / dist) * step
    // 방 ↔ 종이 사이 단차를 부드럽게 오르내려요
    pos.y = damp(pos.y, groundHeight(pos.x, pos.z), 18, dt)
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt)
    this.root.rotation.set(0, this.yaw, 0)

    // 일정 거리마다 왼발 · 오른발 번갈아 발자국
    this.stepDistance += step
    if (this.stepDistance >= STEP_LENGTH) {
      this.stepDistance = 0
      this.stepSide *= -1
      const side = this.stepSide * 0.1
      const x = pos.x + Math.cos(this.yaw) * side
      const z = pos.z - Math.sin(this.yaw) * side
      this.onStep?.(x, groundHeight(x, z), z, this.yaw)
    }
  }

  // ---------- 침대 · 책상 진입 / 이탈 ----------

  private enter(spot: Spot) {
    this.spot = spot
    this.startTransition(spot.position, spot.quaternion, () => {
      this.state = spot.action
    })
  }

  private leaveSpot(next: () => void) {
    const spot = this.spot
    if (!spot || (this.state !== 'lie' && this.state !== 'sit')) {
      this.spot = null
      next()
      return
    }
    this.spot = null
    this.yaw = Math.atan2(spot.approach.x - spot.position.x, spot.approach.z - spot.position.z)
    const standQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0))
    this.startTransition(spot.approach, standQ, () => {
      this.state = 'idle'
      next()
    })
  }

  private startTransition(toP: THREE.Vector3, toQ: THREE.Quaternion, done: () => void) {
    this.state = 'transition'
    this.transition = {
      fromP: this.root.position.clone(),
      toP: toP.clone(),
      fromQ: this.root.quaternion.clone(),
      toQ: toQ.clone(),
      t: 0,
      done,
    }
  }

  private updateTransition(dt: number) {
    const tr = this.transition
    if (!tr) return
    tr.t = Math.min(tr.t + dt / TRANSITION_TIME, 1)
    const e = easeInOutCubic(tr.t)
    this.root.position.lerpVectors(tr.fromP, tr.toP, e)
    this.root.position.y += Math.sin(e * Math.PI) * 0.35 // 폴짝
    this.root.quaternion.slerpQuaternions(tr.fromQ, tr.toQ, e)
    if (tr.t >= 1) {
      this.transition = null
      tr.done()
    }
  }

  // ---------- 자세 ----------

  private updatePose(dt: number) {
    const [hipL, hipR] = this.hips
    const [shL, shR] = this.shoulders
    let legL = 0
    let legR = 0
    let armL = 0
    let armR = 0
    let bob = 0

    if (this.state === 'walk') {
      const phase = Math.sin(this.time * 11)
      legL = phase * 0.7
      legR = -phase * 0.7
      armL = -phase * 0.6
      armR = phase * 0.6
      bob = Math.abs(Math.sin(this.time * 11)) * 0.05
    } else if (this.state === 'sit') {
      legL = legR = -Math.PI / 2
      armL = armR = -0.9 + Math.sin(this.time * 6) * 0.08 // 공부하는 척 끄적끄적
    }

    hipL.rotation.x = damp(hipL.rotation.x, legL, 14, dt)
    hipR.rotation.x = damp(hipR.rotation.x, legR, 14, dt)
    shL.rotation.x = damp(shL.rotation.x, armL, 14, dt)
    // 손 흔들기: 오른팔을 옆으로 들어 좌우로 흔들어요
    const waving = this.waveTime > 0
    shR.rotation.x = damp(shR.rotation.x, waving ? 0 : armR, 14, dt)
    shR.rotation.z = damp(shR.rotation.z, waving ? 2.5 + Math.sin(this.time * 14) * 0.4 : 0, 16, dt)
    if (waving && this.state !== 'walk') {
      const since = 2.2 - this.waveTime
      if (since < 0.35) bob = Math.sin((since / 0.35) * Math.PI) * 0.12 // 반가워서 폴짝
    }
    this.model.position.y = damp(this.model.position.y, bob, 20, dt)

    // 숨쉬기 · 고개 까딱
    this.model.scale.y = 1 + Math.sin(this.time * 2.4) * 0.015
    this.head.rotation.z = Math.sin(this.time * 1.4) * (this.state === 'lie' ? 0.02 : 0.06)
    // 누웠을 때 큰 머리가 매트리스에 파묻히지 않도록 살짝 들어올려요 (누운 자세에서 local z = 위쪽)
    this.head.position.z = damp(this.head.position.z, this.state === 'lie' ? 0.2 : 0, 10, dt)
  }

  private updateZzz() {
    this.zzz.visible = this.state === 'lie'
    if (!this.zzz.visible) return
    this.head.getWorldPosition(this.zzz.position)
    this.zzz.position.y += 0.6 + Math.sin(this.time * 2) * 0.08
    this.zzz.position.x += 0.2
    const material = this.zzz.material as THREE.SpriteMaterial
    material.opacity = 0.6 + Math.sin(this.time * 2) * 0.3
  }

  // ---------- 모델링 (임시 도형) ----------

  private build() {
    const hair = material(COLORS.hair, 0.45)
    const skin = material(COLORS.skin, 0.65)
    const denim = material(COLORS.denim, 0.85)
    const stripes = new THREE.MeshStandardMaterial({ map: stripeTexture(4), roughness: 0.8, side: THREE.DoubleSide })
    const sleeveStripes = new THREE.MeshStandardMaterial({ map: stripeTexture(3), roughness: 0.8 })

    const add = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      position: [number, number, number],
      scale?: [number, number, number],
      rotation?: [number, number, number],
    ) => {
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.position.set(...position)
      if (scale) mesh.scale.set(...scale)
      if (rotation) mesh.rotation.set(...rotation)
      parent.add(mesh)
      return mesh
    }
    const sphere = (r = 1, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h)
    const roundBox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r)

    for (const s of [-1, 1]) {
      // 다리: 멜빵바지 + 롤업 밑단 + 로퍼 (엉덩이 관절 기준으로 회전)
      const hip = new THREE.Group()
      hip.position.set(s * 0.11, 0.3, 0)
      this.model.add(hip)
      this.hips.push(hip)
      add(hip, new THREE.CylinderGeometry(0.1, 0.105, 0.2, 20), denim, [0, -0.08, 0])
      add(hip, new THREE.CylinderGeometry(0.115, 0.115, 0.06, 20), material(COLORS.denimCuff, 0.85), [0, -0.19, 0])
      add(hip, sphere(), material(COLORS.shoe, 0.35), [0, -0.255, 0.035], [0.105, 0.065, 0.155])

      // 팔: 줄무늬 소매 + 손 (어깨 관절 기준으로 회전)
      const shoulder = new THREE.Group()
      shoulder.position.set(s * 0.19, 0.74, 0)
      this.model.add(shoulder)
      this.shoulders.push(shoulder)
      add(shoulder, new THREE.CapsuleGeometry(0.075, 0.14, 4, 16), sleeveStripes, [s * 0.04, -0.1, 0], undefined, [0, 0, s * 0.35])
      add(shoulder, sphere(0.07), skin, [s * 0.08, -0.26, 0.01], [1, 1.1, 0.9])
    }

    // 몸통: 줄무늬 티 + 멜빵바지 (가슴판, 주머니, 끈, 노란 단추)
    // 상체: 어깨가 둥글게 이어지는 한 덩어리 (옆에서 본 윤곽을 회전시켜 만든 모양)
    const torsoProfile = [
      [0.23, 0.48],
      [0.235, 0.6],
      [0.23, 0.68],
      [0.215, 0.73],
      [0.18, 0.775],
      [0.12, 0.805],
      [0.06, 0.818],
      [0.001, 0.82],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    add(this.model, new THREE.LatheGeometry(torsoProfile, 40), stripes, [0, 0, 0])
    add(this.model, new THREE.CylinderGeometry(0.24, 0.26, 0.26, 32), denim, [0, 0.42, 0])
    add(this.model, roundBox(0.28, 0.22, 0.06, 0.025), denim, [0, 0.6, 0.2], undefined, [-0.12, 0, 0])
    add(this.model, roundBox(0.12, 0.08, 0.02, 0.008), material(COLORS.denimCuff, 0.85), [0, 0.59, 0.237], undefined, [-0.12, 0, 0])
    for (const s of [-1, 1]) {
      add(this.model, roundBox(0.06, 0.18, 0.03, 0.012), denim, [s * 0.11, 0.73, 0.195], undefined, [-0.45, 0, 0])
      add(this.model, sphere(0.022, 12, 8), material(COLORS.button, 0.3), [s * 0.11, 0.68, 0.235])
    }

    // 머리: 얼굴(텍스처로 그린 눈 · 볼 · 입) + 머리카락
    const head = this.head
    head.position.set(0, 1.32, 0)
    head.rotation.x = -0.12 // 위에서 내려다보는 카메라라 고개를 살짝 들어 얼굴이 잘 보이게
    this.model.add(head)

    const face = add(head, sphere(0.41, 64, 48), this.faceMaterial, [0, -0.04, 0.13])
    face.name = 'face'
    add(head, sphere(0.032, 16, 12), material(COLORS.nose, 0.35), [0, -0.135, 0.528])

    // 정수리부터 눈썹 위까지 덮는 머리 (앞쪽 끝선이 일자 앞머리가 돼요)
    add(head, new THREE.SphereGeometry(0.43, 64, 24, 0, Math.PI * 2, 0, 1.45), hair, [0, -0.04, 0.13])
    // 뒷머리: 뒤통수만 감싸고, 아래로 내려오지 않게 해서 목이 보이게
    add(head, sphere(0.43, 48, 32), hair, [0, 0.0, 0.05], [1, 0.97, 0.95])
    for (const s of [-1, 1]) {
      // 양쪽 똥머리
      add(head, sphere(0.17, 32, 24), hair, [s * 0.33, 0.3, 0.0])
      // 귀
      add(head, sphere(0.075, 20, 16), skin, [s * 0.4, -0.1, 0.12], [0.6, 1, 0.85])
    }

    // 목 + 티셔츠 깃
    add(this.model, new THREE.CylinderGeometry(0.085, 0.09, 0.14, 20), skin, [0, 0.85, 0.02])
    add(this.model, new THREE.TorusGeometry(0.095, 0.028, 10, 24), material('#fbfbf8', 0.8), [0, 0.81, 0.02], undefined, [Math.PI / 2, 0, 0])
  }
}

/** 흰색 + 네이비 가로 줄무늬 */
function stripeTexture(repeat: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fbfbf8'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#2f3b6b'
  ctx.fillRect(0, 22, 64, 22)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, repeat)
  return texture
}

/**
 * 얼굴 텍스처.
 * 구의 UV는 가로 2 : 세로 1이고, 정면(+z)은 가로 1/4 지점 · 세로 가운데에 와요.
 * happy: 눈은 ^^ 모양, 입은 활짝 벌린 미소
 */
function faceTexture(expression: 'normal' | 'happy' = 'normal') {
  const happy = expression === 'happy'
  const W = 1024
  const H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const cx = W * 0.25
  const cy = H * 0.5

  ctx.fillStyle = COLORS.skin
  ctx.fillRect(0, 0, W, H)

  // 볼터치
  for (const s of [-1, 1]) {
    const x = cx + s * 98
    const y = cy + 62
    const g = ctx.createRadialGradient(x, y, 0, x, y, 40)
    g.addColorStop(0, `rgba(255, 128, 140, ${happy ? 0.8 : 0.6})`)
    g.addColorStop(1, 'rgba(255, 128, 140, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, 42, 30, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const s of [-1, 1]) {
    const ex = cx + s * 60
    const ey = cy + 32

    if (happy) {
      // 웃는 눈: 위로 볼록한 곡선 + 바깥쪽 속눈썹
      ctx.strokeStyle = '#3a2216'
      ctx.lineCap = 'round'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.arc(ex, ey + 12, 22, Math.PI * 1.12, Math.PI * 1.88)
      ctx.stroke()
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(ex + s * 21, ey + 2)
      ctx.lineTo(ex + s * 33, ey - 6)
      ctx.stroke()
      // 눈썹 (살짝 올라가요)
      ctx.strokeStyle = '#a8602c'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(ex - 20, cy - 12)
      ctx.quadraticCurveTo(ex, cy - 24, ex + 20, cy - 12)
      ctx.stroke()
      continue
    }

    // 흰자
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(ex, ey, 27, 29, 0, 0, Math.PI * 2)
    ctx.fill()

    // 홍채 (아래로 갈수록 밝은 갈색)
    const iris = ctx.createLinearGradient(ex, ey - 22, ex, ey + 24)
    iris.addColorStop(0, '#5a2c12')
    iris.addColorStop(1, '#c47a3e')
    ctx.fillStyle = iris
    ctx.beginPath()
    ctx.arc(ex, ey + 3, 22, 0, Math.PI * 2)
    ctx.fill()

    // 동공
    ctx.fillStyle = '#2a140a'
    ctx.beginPath()
    ctx.arc(ex, ey + 3, 11, 0, Math.PI * 2)
    ctx.fill()

    // 하이라이트
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex + 8, ey - 7, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex - 8, ey + 12, 3.5, 0, Math.PI * 2)
    ctx.fill()

    // 윗눈꺼풀 라인 + 바깥쪽 속눈썹
    ctx.strokeStyle = '#3a2216'
    ctx.lineCap = 'round'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.ellipse(ex, ey, 29, 31, 0, Math.PI * 1.08, Math.PI * 1.92)
    ctx.stroke()
    ctx.lineWidth = 4
    for (const [dx, dy, lx, ly] of [
      [26, -12, 38, -18],
      [28, -4, 41, -6],
    ]) {
      ctx.beginPath()
      ctx.moveTo(ex + s * dx, ey + dy)
      ctx.lineTo(ex + s * lx, ey + ly)
      ctx.stroke()
    }

    // 눈썹
    ctx.strokeStyle = '#a8602c'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(ex - 20, cy - 6)
    ctx.quadraticCurveTo(ex, cy - 16, ex + 20, cy - 6)
    ctx.stroke()
  }

  // 입
  if (happy) {
    // 활짝 벌린 입 + 혀
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - 28, cy + 86)
    ctx.quadraticCurveTo(cx, cy + 92, cx + 28, cy + 86)
    ctx.quadraticCurveTo(cx, cy + 136, cx - 28, cy + 86)
    ctx.closePath()
    ctx.fillStyle = '#b8424a'
    ctx.fill()
    ctx.clip()
    ctx.fillStyle = '#ff8f9c'
    ctx.beginPath()
    ctx.ellipse(cx, cy + 116, 16, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  } else {
    ctx.strokeStyle = '#c4524c'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(cx - 18, cy + 92)
    ctx.quadraticCurveTo(cx, cy + 106, cx + 18, cy + 92)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function createZzz() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#6b6b6b'
  ctx.font = handFont(700, 64)
  ctx.fillText('z', 30, 110)
  ctx.font = handFont(700, 80)
  ctx.fillText('Z', 90, 85)
  ctx.font = handFont(700, 56)
  ctx.fillText('z', 170, 50)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(0.9, 0.45, 1)
  sprite.visible = false
  return sprite
}
