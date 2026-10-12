import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { BEDROOM, KITCHEN, PARTITION_X, setObstacles } from './Navigation'

export type SpotAction = 'lie' | 'sit' | 'eat' | 'cook'

/** 캐릭터가 다가가서 특정 동작을 하는 지점 (침대, 책상, 식탁, 주방) */
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

/** 집 전체 색: 밝은 버터색 벽 · 가구 + 따뜻한 나무 브라운 */
const C = {
  wall: '#fdfcf8',
  trim: '#b07e55',
  cream: '#fff8e6',
  butter: '#ffe39b',
  wood: '#e9c18f',
  woodMid: '#d4a673',
  woodDark: '#a8754d',
  /** 메이플 우드: 주방 하부장 문 · 침대 프레임 */
  caramel: '#f2c58c',
  duvet: '#eadbc3',
  duvetFold: '#f6eee0',
  bedRunner: '#c8a983',
  ivory: '#fbf6ea',
  silver: '#e4e3df',
  lightGray: '#d6d6d4',
  grayDark: '#9b9b98',
  walnut: '#9a6237',
  walnutDark: '#7f4f2c',
  /** 식탁 의자 가죽: 집 우드톤과 맞춘 브라운 */
  leather: '#a8754d',
  chrome: '#dfe3e8',
  /** 집 바닥: 월넛에 가까운 어두운 마루 */
  plank: ['#a8774f', '#8a5d3b'],
  /** 주방 바닥 타일: 아이보리 · 브라운 체크무늬 + 줄눈 */
  tile: ['#fdf6e6', '#b98a5e', '#e9dcc6'],
  glass: '#cfeaf5',
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

/** 마루 무늬 (2.1m마다 반복되게 repeat을 넘겨요) */
function plankTexture(repeatX: number, repeatY: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = C.plank[0]
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = C.plank[1]
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
  texture.repeat.set(repeatX, repeatY)
  return texture
}

/** 주방 바닥 · 벽 타일: 두 색 체크무늬 + 줄눈 */
function tileTexture(a: string, b: string, grout: string, repeatX: number, repeatY: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const cell = 64
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  ctx.strokeStyle = grout
  ctx.lineWidth = 3
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(256, i * cell)
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, 256)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  return texture
}

/** 월넛 상판 나뭇결 (1m마다 반복) */
function walnutTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = C.walnut
  ctx.fillRect(0, 0, 256, 256)
  ctx.lineWidth = 2
  for (let i = 0; i < 26; i++) {
    const x0 = (i / 26) * 256 + Math.random() * 6
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(90, 50, 25, 0.35)' : 'rgba(200, 140, 90, 0.25)'
    ctx.beginPath()
    ctx.moveTo(x0, 0)
    for (let y = 0; y <= 256; y += 16) ctx.lineTo(x0 + Math.sin(y * 0.03 + i) * 4, y)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** 크롬 파이프 캔틸레버 + 갈색 가죽 의자. +x를 바라봐요 (뒤집으려면 rotation.y = π) */
function cantileverChair() {
  const g = new THREE.Group()
  const chrome = new THREE.MeshStandardMaterial({ color: C.chrome, metalness: 0.85, roughness: 0.25 })
  // 옆에서 본 프레임: 등받이 뒤 → 좌석 아래 → 앞에서 둥글게 내려와 → 바닥 레일
  const frame = new THREE.CatmullRomCurve3(
    [
      [-0.34, 1.15],
      [-0.34, 0.62],
      [-0.3, 0.46],
      [0.2, 0.45],
      [0.34, 0.38],
      [0.36, 0.12],
      [0.27, 0.03],
      [-0.36, 0.03],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    'catmullrom',
    0.2,
  )
  for (const z of [-0.28, 0.28]) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(frame, 64, 0.02, 8), chrome)
    tube.castShadow = true
    place(tube, 0, 0, z, g)
  }
  place(box(0.64, 0.11, 0.62, C.leather, 0.05), 0, 0.51, 0, g)
  const back = place(box(0.1, 0.5, 0.6, C.leather, 0.05), -0.35, 0.9, 0, g)
  back.rotation.z = 0.1
  return g
}

/**
 * 벽은 바닥 판 윗면(y=0)부터 세워요.
 * 바닥 판 옆면과 벽 옆면이 같은 평면에 겹치면 모서리 색이 깜빡여요 (z-fighting)
 */
const WALL_HEIGHT = 3.15

/**
 * 기계식 키보드: 아이보리 케이스 위에 키캡을 하나씩 세워요.
 * 키캡은 연회색 옆면(스커트) 위에 조금 작은 흰 윗면을 얹어서, 키마다 음영이 보여요.
 * 키가 많아서 InstancedMesh로 한 번에 그려요. 앞(+z)이 사용자 쪽이에요
 */
function mechanicalKeyboard() {
  const g = new THREE.Group()
  const cols = 15
  const rows = 5
  const pitch = 0.034
  const width = cols * pitch + 0.03
  const depth = rows * pitch + 0.03
  const caseH = 0.022
  place(box(width, caseH, depth, '#f2f0ea', 0.008), 0, caseH / 2, 0, g)

  // [열 위치, 행, 너비(칸)] — 맨 앞줄 가운데는 긴 스페이스바
  const keys: [col: number, row: number, span: number][] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === 0 && col >= 4 && col <= 10) continue
      keys.push([col, row, 1])
    }
  }
  keys.push([7, 0, 7])
  /** 가장자리 키(Esc, Shift, Enter 등)는 윗면도 연회색이에요 */
  const isModifier = (col: number, row: number, span: number) => span === 1 && (col === 0 || col === cols - 1 || row === 0)

  const skirt = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#cfcfcb', roughness: 0.6 }),
    keys.length,
  )
  const top = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }),
    keys.length,
  )
  const matrix = new THREE.Matrix4()
  const white = new THREE.Color('#fbfbf9')
  const gray = new THREE.Color('#e2e2df')
  keys.forEach(([col, row, span], i) => {
    const x = (col - (cols - 1) / 2) * pitch
    const z = ((rows - 1) / 2 - row) * pitch
    const w = span * pitch - 0.005
    matrix.makeScale(w, 0.016, pitch - 0.005).setPosition(x, caseH + 0.008, z)
    skirt.setMatrixAt(i, matrix)
    // 윗면은 조금 작고 뒤로 살짝 밀려서, 앞쪽 연회색 옆면이 더 보여요
    matrix.makeScale(w - 0.009, 0.006, pitch - 0.014).setPosition(x, caseH + 0.019, z - 0.002)
    top.setMatrixAt(i, matrix)
    top.setColorAt(i, isModifier(col, row, span) ? gray : white)
  })
  skirt.castShadow = true
  g.add(skirt, top)
  return g
}

/** 잎사귀 몇 장을 줄기 끝에 둥글게 달아요 (병에 꽂은 식물) */
function addLeaves(parent: THREE.Object3D, height: number, count: number, spread: number, color: string) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + i * 0.7
    const r = spread * (0.6 + (i % 3) * 0.25)
    const y = height + (i % 3) * 0.05
    const stem = place(cylinder(0.005, 0.005, y, '#6d8f50'), Math.cos(a) * r * 0.4, y / 2, Math.sin(a) * r * 0.4, parent)
    stem.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), material(color, 0.55))
    leaf.scale.set(1.4, 0.35, 1.0)
    leaf.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5)
    leaf.castShadow = true
    place(leaf, Math.cos(a) * r, y + 0.02, Math.sin(a) * r, parent)
  }
}

/** 창밖 풍경 패브릭 포스터: 흰 창틀 너머 초록 나무와 주황 지붕 집, 왼쪽엔 얇은 커튼과 덩굴 */
function windowPosterTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 456
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f4f1ea'
  ctx.fillRect(0, 0, 512, 456)

  // 창 너머 풍경: 숲 → 집 → 앞쪽 나무
  const fx = 120
  const fy = 30
  const fw = 380
  const fh = 410
  const sky = ctx.createLinearGradient(0, fy, 0, fy + fh)
  sky.addColorStop(0, '#5d7f45')
  sky.addColorStop(0.5, '#7fa45a')
  sky.addColorStop(1, '#9cba6c')
  ctx.fillStyle = sky
  ctx.fillRect(fx, fy, fw, fh)
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(60, 95, 45, 0.5)' : 'rgba(170, 200, 90, 0.45)'
    ctx.beginPath()
    ctx.arc(fx + Math.random() * fw, fy + Math.random() * fh * 0.45, 12 + Math.random() * 22, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f2ece0'
  ctx.fillRect(fx + 40, fy + 225, 300, 95)
  ctx.fillStyle = '#e0773a'
  ctx.beginPath()
  ctx.moveTo(fx + 25, fy + 230)
  ctx.lineTo(fx + 60, fy + 185)
  ctx.lineTo(fx + 330, fy + 185)
  ctx.lineTo(fx + 355, fy + 230)
  ctx.fill()
  ctx.fillStyle = '#6b6b66'
  for (const x of [fx + 95, fx + 165, fx + 265]) ctx.fillRect(x, fy + 250, 26, 30)
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(80, 120, 50, 0.6)' : 'rgba(190, 210, 100, 0.55)'
    ctx.beginPath()
    ctx.arc(fx + Math.random() * fw, fy + fh * 0.72 + Math.random() * fh * 0.28, 14 + Math.random() * 20, 0, Math.PI * 2)
    ctx.fill()
  }

  // 흰 창틀: 바깥 틀 + 가운데 세로 + 칸 나누기
  ctx.strokeStyle = '#fbfaf6'
  ctx.lineWidth = 16
  ctx.strokeRect(fx, fy, fw, fh)
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(fx + fw / 2, fy)
  ctx.lineTo(fx + fw / 2, fy + fh)
  for (const t of [0.36, 0.68]) {
    ctx.moveTo(fx, fy + fh * t)
    ctx.lineTo(fx + fw, fy + fh * t)
  }
  ctx.stroke()

  // 왼쪽 얇은 커튼 + 덩굴
  const curtain = ctx.createLinearGradient(0, 0, 150, 0)
  curtain.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  curtain.addColorStop(1, 'rgba(255, 255, 255, 0.55)')
  ctx.fillStyle = curtain
  ctx.fillRect(20, 0, 135, 456)
  ctx.strokeStyle = 'rgba(220, 215, 205, 0.8)'
  ctx.lineWidth = 2
  for (let x = 35; x < 155; x += 18) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 4, 456)
    ctx.stroke()
  }
  ctx.strokeStyle = '#5b4a35'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(40, 0)
  for (let y = 0; y <= 456; y += 20) ctx.lineTo(40 + Math.sin(y * 0.05) * 6, y)
  ctx.stroke()
  for (let y = 15; y < 456; y += 34) {
    ctx.fillStyle = y % 68 ? '#7fae4e' : '#a5c463'
    ctx.beginPath()
    ctx.ellipse(40 + Math.sin(y * 0.05) * 6 + (y % 68 ? 14 : -12), y, 14, 9, 0.6, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** 아이맥 화면: 은은한 파스텔 배경화면 */
function screenTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 132
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 256, 132)
  gradient.addColorStop(0, '#ffd8b5')
  gradient.addColorStop(0.5, '#f7c9d4')
  gradient.addColorStop(1, '#bcd3f2')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 132)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.beginPath()
  ctx.ellipse(170, 80, 90, 40, -0.4, 0, Math.PI * 2)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const yawQuat = (yaw: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))

/**
 * 임시 도형으로 만든 작은 집: 왼쪽 침실 + 오른쪽(+x) 주방 · 식탁.
 * 나중에 GLB 모델로 바꿀 때도 `floors`, `bed`, `desk`, `table`, `kitchen`과 각 Spot 구조만 유지하면
 * 클릭 · 이동 로직은 그대로 쓸 수 있어요.
 */
export class Room {
  readonly group = new THREE.Group()
  /** 침실 마루 · 주방 타일 바닥 */
  readonly floors: THREE.Mesh[] = []
  /** 클릭이 통과하지 않도록 막는 벽 */
  readonly walls: THREE.Mesh[] = []
  readonly bed = new THREE.Group()
  readonly desk = new THREE.Group()
  readonly table = new THREE.Group()
  readonly kitchen = new THREE.Group()
  readonly bedSpot: Spot
  readonly deskSpot: Spot
  readonly tableSpot: Spot
  readonly kitchenSpot: Spot
  /** 드래그로 걸을 때 피해 가는 가구 */
  private readonly obstacles: THREE.Object3D[] = []

  constructor() {
    const g = this.group
    const obstacles = this.obstacles

    // ---------- 바닥 · 벽 ----------
    const bedroomFloor = box(6.4, 0.25, 6.4, '#ffffff', 0.04)
    ;(bedroomFloor.material as THREE.MeshStandardMaterial).map = plankTexture(3, 3)
    place(bedroomFloor, 0, -0.125, 0, g)

    // 주방은 침실보다 오른쪽으로 조금 더 넓어요
    const kw = KITCHEN.maxX - KITCHEN.minX
    const kd = KITCHEN.maxZ - KITCHEN.minZ
    const kx = (KITCHEN.minX + KITCHEN.maxX) / 2
    const kz = (KITCHEN.minZ + KITCHEN.maxZ) / 2
    const kitchenFloor = box(kw, 0.25, kd, '#ffffff', 0.04)
    ;(kitchenFloor.material as THREE.MeshStandardMaterial).map = tileTexture(C.tile[0], C.tile[1], C.tile[2], kw / 2, kd / 2)
    place(kitchenFloor, kx, -0.125, kz, g)
    this.floors.push(bedroomFloor, kitchenFloor)

    const bw = BEDROOM.maxX - BEDROOM.minX
    const backX = (BEDROOM.minX + KITCHEN.maxX) / 2
    this.walls.push(
      place(box(0.2, WALL_HEIGHT, 6.4, C.wall, 0.04), -3.1, WALL_HEIGHT / 2, 0, g),
      place(box(bw, WALL_HEIGHT, 0.2, C.wall, 0.04), 0, WALL_HEIGHT / 2, -3.1, g),
      place(box(kw, WALL_HEIGHT, 0.2, C.wall, 0.04), kx, WALL_HEIGHT / 2, -3.1, g),
      // 침실 · 주방 사이 칸막이 (앞쪽은 뚫려 있어서 오갈 수 있어요)
      place(box(0.2, WALL_HEIGHT, 1.6, C.wall, 0.04), PARTITION_X, WALL_HEIGHT / 2, -2.4, g),
    )

    // 나무 걸레받이 · 벽 위 몰딩
    place(box(0.06, 0.2, 6.4, C.trim, 0.02), -2.98, 0.1, 0, g)
    place(box(bw + kw, 0.2, 0.06, C.trim, 0.02), backX, 0.1, -2.98, g)
    place(box(0.28, 0.1, 6.5, C.trim, 0.03), -3.1, 3.18, 0, g)
    place(box(bw + kw + 0.1, 0.1, 0.28, C.trim, 0.03), backX, 3.18, -3.1, g)
    place(box(0.28, 0.1, 1.7, C.trim, 0.03), PARTITION_X, 3.18, -2.4, g)

    // 창문 (뒤쪽 벽)
    place(box(1.5, 1.2, 0.08, C.woodMid, 0.03), -0.4, 1.9, -2.97, g)
    place(box(1.3, 1.0, 0.06, C.glass, 0.02), -0.4, 1.9, -2.93, g)
    place(box(0.35, 1.5, 0.06, C.cream, 0.03), -1.3, 1.85, -2.9, g)
    place(box(0.35, 1.5, 0.06, C.cream, 0.03), 0.5, 1.85, -2.9, g)

    // 시계 (왼쪽 벽, 침대와 책상 사이 가운데쯤)
    const clockZ = -0.65
    const clock = cylinder(0.32, 0.32, 0.08, C.woodDark)
    clock.rotation.z = Math.PI / 2
    place(clock, -2.95, 2.2, clockZ, g)
    const clockFace = cylinder(0.25, 0.25, 0.02, C.cream)
    clockFace.rotation.z = Math.PI / 2
    place(clockFace, -2.9, 2.2, clockZ, g)

    // 화분은 칸막이에 가려지지 않게 창문 아래에
    const pot = place(cylinder(0.22, 0.17, 0.4, '#e98b5a'), 0.25, 0.2, -2.65, g)
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), material('#7cc46a'))
    leaves.castShadow = true
    leaves.scale.set(1, 1.3, 1)
    place(leaves, 0.25, 0.85, -2.65, g)
    obstacles.push(pot)

    // ---------- 침대 (머리는 왼쪽 벽 쪽) ----------
    const bed = this.bed
    /** 침대 길이(x) · 폭(z) */
    const bedL = 2.6
    const bedW = 1.8
    // 프레임 · 헤드보드는 주방 하부장 문과 같은 메이플 우드
    place(box(bedL, 0.3, bedW, C.caramel, 0.06), 0, 0.15, 0, bed)
    place(box(0.14, 1.2, bedW, C.caramel, 0.05), -bedL / 2 + 0.07, 0.6, 0, bed)
    place(box(bedL - 0.2, 0.22, bedW - 0.08, '#fffdf8', 0.08), 0.03, 0.41, 0, bed)

    // 포근한 호텔 솜이불: 두툼하고 둥글게, 양옆 · 발치로 흘러내려 프레임 윗부분까지 덮어요
    const duvetFrom = -bedL / 2 + 0.75
    const duvetTo = bedL / 2 + 0.05
    const duvetX = (duvetFrom + duvetTo) / 2
    place(box(duvetTo - duvetFrom, 0.42, bedW + 0.1, C.duvet, 0.12), duvetX, 0.43, 0, bed)
    // 위쪽을 한 번 접은 자락 + 발치를 가로지르는 베드 러너
    place(box(0.24, 0.12, bedW + 0.08, C.duvetFold, 0.05), duvetFrom + 0.1, 0.66, 0, bed)
    place(box(0.38, 0.44, bedW + 0.13, C.bedRunner, 0.1), duvetTo - 0.32, 0.44, 0, bed)
    // 통통한 베개 두 개 (나란히)
    for (const z of [-bedW / 4, bedW / 4]) {
      const pillow = place(box(0.42, 0.17, bedW / 2 - 0.1, '#fffdf8', 0.08), -bedL / 2 + 0.38, 0.6, z, bed)
      pillow.rotation.z = -0.12
    }
    const bedAt = new THREE.Vector3(-3.0 + bedL / 2, 0, -2.05)
    place(bed, bedAt.x, 0, bedAt.z, g)

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
      approach: new THREE.Vector3(bedAt.x + bedL / 2, 0, bedAt.z + bedW / 2 + 0.45),
      position: new THREE.Vector3(bedAt.x + 0.5, 0.92, bedAt.z),
      quaternion: lieQuat,
      hint: '침대에서 뒹굴기',
    }
    bed.userData.spot = this.bedSpot

    // ---------- 책상 + 의자 (왼쪽 벽 앞쪽, 의자는 방 안쪽 +x) ----------
    const desk = this.desk
    /** 책상 길이(그룹 x → 집 z) · 깊이(그룹 z → 집 x) */
    const deskW = 2.3
    const deskD = 0.95
    /** 의자 · 앉는 자리: 책상 앞 가장자리에서 띄우는 거리 */
    const chairZ = deskD / 2 + 0.35
    // 상판: 밝은 우드 판 위에 아이보리 윗면 (옆면은 우드로 보여요), 다리 · 서랍은 아이보리
    place(box(deskW, 0.08, deskD, C.wood, 0.03), 0, 0.95, 0, desk)
    place(box(deskW - 0.04, 0.012, deskD - 0.04, C.ivory, 0.005), 0, 0.992, 0, desk)
    const legX = deskW / 2 - 0.07
    const legZ = deskD / 2 - 0.07
    for (const [x, z] of [
      [-legX, -legZ],
      [legX, -legZ],
      [-legX, legZ],
      [legX, legZ],
    ]) {
      place(box(0.07, 0.92, 0.07, C.ivory, 0.02), x, 0.46, z, desk)
    }
    const drawerX = deskW / 2 - 0.45
    place(box(0.55, 0.25, deskD - 0.1, C.ivory, 0.03), drawerX, 0.77, 0, desk)
    place(box(0.14, 0.03, 0.03, C.wood, 0.01), drawerX, 0.77, deskD / 2 - 0.04, desk)

    // 책상 옆 철제 3단 서랍장: 책상과 같은 높이 · 같은 색 (아이보리 + 밝은 우드), 서랍은 의자 쪽 +z를 봐요
    const cabinetW = 0.46
    const cabinetD = 0.6
    const cabinetH = 0.99
    const cabinet = new THREE.Group()
    const metalBox = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
      const mesh = box(w, h, d, color, 0.015)
      const m = mesh.material as THREE.MeshStandardMaterial
      m.roughness = 0.35
      m.metalness = 0.25
      return place(mesh, x, y, z, cabinet)
    }
    metalBox(cabinetW, cabinetH - 0.12, cabinetD, C.ivory, 0, (cabinetH - 0.12) / 2 + 0.04, 0)
    metalBox(cabinetW - 0.04, 0.04, cabinetD - 0.04, C.wood, 0, 0.02, 0)
    // 윗판: 책상처럼 옆면은 밝은 우드, 윗면은 아이보리
    place(box(cabinetW, 0.08, cabinetD, C.wood, 0.03), 0, cabinetH - 0.04, 0, cabinet)
    place(box(cabinetW - 0.04, 0.012, cabinetD - 0.04, C.ivory, 0.005), 0, cabinetH + 0.002, 0, cabinet)
    for (let i = 0; i < 3; i++) {
      const y = 0.06 + (i + 0.5) * ((cabinetH - 0.16) / 3)
      metalBox(cabinetW - 0.05, 0.24, 0.02, C.ivory, 0, y, cabinetD / 2 + 0.005)
      metalBox(0.2, 0.025, 0.02, C.wood, 0, y + 0.07, cabinetD / 2 + 0.02)
    }

    // 서랍장 위 조명: 크롬 받침 · 기둥 위에 동글납작한 버터색 갓 두 개 (실제 빛 없이 색으로만)
    const lamp = new THREE.Group()
    const chrome = new THREE.MeshStandardMaterial({ color: C.chrome, metalness: 0.85, roughness: 0.25 })
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.015, 32), chrome)
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 16), chrome)
    place(lampBase, 0, 0.008, 0, lamp)
    place(lampStem, 0, 0.11, 0, lamp)
    const glass = material(C.butter, 0.5)
    for (const [y, r] of [
      [0.25, 0.13],
      [0.355, 0.125],
    ]) {
      const shade = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), glass)
      shade.scale.y = 0.48
      shade.castShadow = true
      place(shade, 0, y, 0, lamp)
    }
    place(lamp, 0, cabinetH + 0.008, -0.03, cabinet)
    place(cabinet, deskW / 2 + 0.03 + cabinetW / 2, 0, -deskD / 2 + cabinetD / 2, desk)

    const deskTop = 0.998

    // 모니터 받침대: 책상 너비에 가까운 밝은 우드 선반 (상판 옆면과 같은 색), 벽 쪽(-z)에 붙여요
    const riserW = deskW - 0.2
    const riserD = 0.34
    const riserH = 0.16
    const riserZ = -deskD / 2 + 0.03 + riserD / 2
    const board = 0.03
    place(box(riserW, board, riserD, C.wood, 0.01), 0, deskTop + riserH - board / 2, riserZ, desk)
    for (const x of [-riserW / 2 + board / 2, riserW / 2 - board / 2]) {
      place(box(board, riserH - board, riserD, C.wood, 0.01), x, deskTop + (riserH - board) / 2, riserZ, desk)
    }

    // 아이맥(받침대 위): 얇은 화면 + 아래 턱, 구부러진 받침 (화면은 의자 쪽 +z를 봐요)
    const mac = new THREE.Group()
    // 아래 치수는 받침대 윗면 기준이고, 그룹 크기(monitorScale)로 한 번에 키워요
    const monitor = new THREE.Group()
    const monitorScale = 1.35
    place(box(0.16, 0.012, 0.15, C.silver, 0.005), 0, 0.006, -0.02, monitor)
    const neck = place(box(0.15, 0.24, 0.015, C.silver, 0.005), 0, 0.12, -0.08, monitor)
    neck.rotation.x = -0.18
    place(box(0.66, 0.44, 0.022, C.silver, 0.02), 0, 0.39, -0.05, monitor)
    place(box(0.62, 0.33, 0.004, '#20232a', 0.002), 0, 0.43, -0.037, monitor)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.31),
      new THREE.MeshBasicMaterial({ map: screenTexture() }),
    )
    place(screen, 0, 0.43, -0.034, monitor)
    monitor.scale.setScalar(monitorScale)
    place(monitor, 0, deskTop + riserH, riserZ + 0.17, mac)

    // 키보드 · 마우스는 받침대 앞 책상 위에
    const keyboard = mechanicalKeyboard()
    place(keyboard, -0.04, deskTop, 0.24, mac)
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 12), material('#f4f3ef', 0.4))
    mouse.scale.set(0.75, 0.35, 1.15)
    mouse.castShadow = true
    place(mouse, 0.37, deskTop + 0.015, 0.25, mac)
    place(mac, -0.1, 0, -0.15, desk)

    // 컴퓨터 의자 (책상 앞, +z 쪽): 아이보리 쿠션 + 연한 회색 프레임 · 다리 다섯 개 · 바퀴
    const chair = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const arm = place(box(0.3, 0.04, 0.05, C.lightGray, 0.015), Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15, chair)
      arm.rotation.y = -a
      place(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), material(C.grayDark)), Math.cos(a) * 0.29, 0.035, Math.sin(a) * 0.29, chair)
    }
    place(cylinder(0.035, 0.035, 0.34, C.lightGray), 0, 0.27, 0, chair)
    place(box(0.36, 0.04, 0.36, C.lightGray, 0.015), 0, 0.44, 0, chair)
    place(box(0.6, 0.1, 0.58, C.ivory, 0.05), 0, 0.5, 0, chair)
    place(box(0.07, 0.42, 0.04, C.lightGray, 0.015), 0, 0.68, 0.3, chair)
    const back = place(box(0.54, 0.56, 0.09, C.ivory, 0.06), 0, 1.0, 0.33, chair)
    back.rotation.x = 0.1
    for (const x of [-0.31, 0.31]) {
      place(box(0.04, 0.2, 0.04, C.lightGray, 0.015), x, 0.62, 0.05, chair)
      place(box(0.07, 0.035, 0.3, C.lightGray, 0.015), x, 0.73, 0.02, chair)
    }
    place(chair, 0, 0, chairZ, desk)
    // 그룹 안에서는 책상이 -z, 의자가 +z 쪽이라 +90° 돌려서 책상을 왼쪽 벽(-x)에 붙여요
    const deskAt = new THREE.Vector3(-3.0 + deskD / 2 + 0.05, 0, 1.45)
    desk.rotation.y = Math.PI / 2
    place(desk, deskAt.x, 0, deskAt.z, g)

    // 앉은 자세: 책상(-x)을 바라보고, 엉덩이가 의자 위에 오도록
    this.deskSpot = {
      action: 'sit',
      approach: new THREE.Vector3(deskAt.x + chairZ + 0.8, 0, deskAt.z),
      position: new THREE.Vector3(deskAt.x + chairZ + 0.03, 0.24, deskAt.z),
      quaternion: yawQuat(-Math.PI / 2),
      hint: '책상에 앉기',
    }
    desk.userData.spot = this.deskSpot

    this.kitchenSpot = this.buildKitchen()
    this.tableSpot = this.buildTable()
    this.buildCoffeeShelf()
    g.add(this.kitchen, this.table)

    obstacles.push(bed, desk, this.kitchen, this.table)
    g.updateMatrixWorld(true)
    setObstacles(obstacles)
  }

  /** 뒤쪽 벽을 따라 싱크대 · 도마 · 가스레인지 · 밥솥 · 냉장고 */
  private buildKitchen(): Spot {
    const g = this.group
    const k = this.kitchen
    const backZ = -2.6
    const counter = { minX: PARTITION_X + 0.25, maxX: 6.2 }
    const cw = counter.maxX - counter.minX
    const cx = (counter.minX + counter.maxX) / 2
    const sinkX = 4.0
    const boardX = 4.85
    const stoveX = 5.7
    const fridgeX = 6.73

    // 벽 장식은 클릭 대상(그룹) 밖에 둬요: 타일 벽, 창문, 선반, 칸막이 액자
    const splash = box(cw, 0.8, 0.04, '#ffffff', 0.01)
    ;(splash.material as THREE.MeshStandardMaterial).map = tileTexture('#fffaea', '#fff0c9', '#e6cfa8', cw * 1.2, 1)
    place(splash, cx, 1.38, -2.98, g)
    place(box(1.1, 1.0, 0.08, C.woodMid, 0.03), sinkX, 2.35, -2.97, g)
    place(box(0.9, 0.8, 0.06, C.glass, 0.02), sinkX, 2.35, -2.93, g)
    place(box(1.0, 0.08, 0.14, C.woodMid, 0.02), sinkX, 1.84, -2.92, g)
    place(box(0.62, 0.06, 0.3, C.woodMid, 0.02), boardX, 2.25, -2.85, g)
    for (const [x, h, color] of [
      [boardX - 0.19, 0.22, C.butter],
      [boardX, 0.28, C.caramel],
      [boardX + 0.19, 0.2, C.cream],
    ] as const) {
      place(cylinder(0.08, 0.08, h, color), x, 2.28 + h / 2, -2.85, g)
      place(cylinder(0.085, 0.085, 0.04, C.woodDark), x, 2.3 + h, -2.85, g)
    }
    place(box(0.04, 0.7, 0.8, C.woodMid, 0.02), PARTITION_X + 0.12, 2.1, -2.4, g)
    place(box(0.03, 0.52, 0.62, '#ffd9b0', 0.02), PARTITION_X + 0.14, 2.1, -2.4, g)

    // 하부장 + 나무 상판
    place(box(cw, 0.9, 0.8, C.cream, 0.04), cx, 0.45, backZ, k)
    place(box(cw + 0.1, 0.08, 0.88, C.wood, 0.03), cx, 0.94, backZ + 0.02, k)
    for (const [x, w] of [
      [sinkX, 0.8],
      [boardX, 0.8],
    ]) {
      place(box(w, 0.68, 0.04, C.caramel, 0.03), x, 0.45, -2.19, k)
      place(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), material(C.woodDark)), x + w / 2 - 0.1, 0.6, -2.15, k)
    }

    // 싱크대 + 수도꼭지
    place(box(0.85, 0.03, 0.55, '#eef0ee', 0.01), sinkX, 0.985, backZ, k)
    place(box(0.7, 0.02, 0.42, '#c9cfd2', 0.01), sinkX, 0.995, backZ, k)
    place(cylinder(0.03, 0.035, 0.36, '#d8dcdf'), sinkX, 1.16, -2.93, k)
    place(box(0.06, 0.06, 0.28, '#d8dcdf', 0.03), sinkX, 1.33, -2.8, k)

    // 도마 + 당근
    place(box(0.6, 0.04, 0.4, C.woodMid, 0.02), boardX, 1.0, backZ + 0.05, k)
    const carrot = place(cylinder(0.05, 0.015, 0.3, '#f39a4a'), boardX - 0.05, 1.06, backZ + 0.05, k)
    carrot.rotation.z = Math.PI / 2
    place(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), material('#8cc06e')), boardX - 0.22, 1.07, backZ + 0.05, k)

    // 가스레인지: 오븐 문, 화구, 냄비 · 프라이팬(계란후라이)
    place(box(0.8, 0.55, 0.04, '#7a5640', 0.03), stoveX, 0.45, -2.19, k)
    place(box(0.5, 0.05, 0.05, C.cream, 0.02), stoveX, 0.66, -2.15, k)
    place(box(0.88, 0.03, 0.6, '#5a463b', 0.01), stoveX, 0.995, backZ, k)
    place(cylinder(0.14, 0.14, 0.02, '#7d675a'), stoveX - 0.22, 1.015, backZ, k)
    place(cylinder(0.14, 0.14, 0.02, '#7d675a'), stoveX + 0.22, 1.015, backZ, k)
    place(cylinder(0.2, 0.18, 0.24, '#f6b26b'), stoveX - 0.22, 1.14, backZ, k)
    place(cylinder(0.21, 0.21, 0.03, '#ffd59a'), stoveX - 0.22, 1.27, backZ, k)
    place(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), material(C.woodDark)), stoveX - 0.22, 1.3, backZ, k)
    place(cylinder(0.16, 0.14, 0.04, '#5a5048'), stoveX + 0.22, 1.045, backZ, k)
    place(box(0.05, 0.03, 0.28, C.woodDark, 0.015), stoveX + 0.22, 1.06, backZ + 0.3, k)
    place(cylinder(0.1, 0.1, 0.012, '#ffffff'), stoveX + 0.2, 1.07, backZ - 0.02, k)
    place(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), material('#ffc93c')), stoveX + 0.2, 1.08, backZ - 0.02, k)

    // 후드
    place(box(0.95, 0.32, 0.55, C.cream, 0.05), stoveX, 2.55, -2.75, k)
    place(box(0.36, 0.45, 0.3, C.cream, 0.03), stoveX, 2.9, -2.88, k)

    // 밥솥 (냉장고 위)
    place(cylinder(0.17, 0.17, 0.24, C.cream), fridgeX + 0.1, 2.22, backZ, k)
    place(cylinder(0.18, 0.18, 0.05, C.caramel), fridgeX + 0.1, 2.36, backZ, k)

    // 냉장고
    place(box(0.95, 2.1, 0.85, '#fff0bf', 0.08), fridgeX, 1.05, -2.58, k)
    place(box(0.97, 0.03, 0.87, C.caramel, 0.01), fridgeX, 1.4, -2.58, k)
    place(box(0.05, 0.4, 0.05, C.woodDark, 0.02), fridgeX - 0.37, 1.75, -2.13, k)
    place(box(0.05, 0.5, 0.05, C.woodDark, 0.02), fridgeX - 0.37, 0.95, -2.13, k)
    place(box(0.14, 0.14, 0.02, '#ffb3a7', 0.02), fridgeX + 0.15, 1.75, -2.15, k)
    place(box(0.12, 0.12, 0.02, C.woodMid, 0.02), fridgeX - 0.1, 1.95, -2.15, k)

    // 가스레인지 앞에 서서 벽(-z)을 보고 냄비를 저어요
    const spot: Spot = {
      action: 'cook',
      approach: new THREE.Vector3(stoveX - 0.2, 0, -1.3),
      position: new THREE.Vector3(stoveX - 0.2, 0, -1.72),
      quaternion: yawQuat(Math.PI),
      hint: '주방에서 요리하기',
    }
    k.userData.spot = spot
    return spot
  }

  /**
   * 주방 오른쪽 식탁: 한쪽은 반듯하고 반대쪽은 반원인 긴 월넛 테이블을 가로(x)로 두고
   * (반듯한 끝은 오른쪽, 반원은 왼쪽), 앞뒤로 마주 보는 가죽 캔틸레버 의자 (참고 사진)
   */
  private buildTable(): Spot {
    const g = this.group
    const t = this.table
    const length = 2.8
    const width = 1.1
    const top = 0.97
    /** 반듯한 끝에서 의자까지 거리 */
    const chairAlong = 1.1
    /** 반듯한 끝 위치: 주방 오른쪽 가장자리 가까이, 여기서 -x(왼쪽)로 길게 뻗어요 */
    const start = new THREE.Vector3(KITCHEN.maxX - 0.22, 0, 0.5)

    // 아래는 그룹 안 좌표: 모양의 길이 방향이 +z, 나중에 그룹을 돌려서 -x로 눕혀요
    // 상판: 한쪽 끝은 반듯하고 반대쪽은 반원
    const shape = new THREE.Shape()
    const r = width / 2
    shape.moveTo(-r, 0)
    shape.lineTo(r, 0)
    shape.lineTo(r, length - r)
    shape.absarc(0, length - r, r, 0, Math.PI, false)
    shape.lineTo(-r, 0)
    const topGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 3,
      curveSegments: 32,
    })
    const tabletop = new THREE.Mesh(
      topGeometry,
      new THREE.MeshStandardMaterial({ map: walnutTexture(), roughness: 0.55 }),
    )
    // 모양의 y를 +z로 눕히고, 두께는 아래로
    tabletop.rotation.x = Math.PI / 2
    tabletop.castShadow = tabletop.receiveShadow = true
    place(tabletop, 0, top, 0, t)

    // 넓은 판 다리 두 개 (양 끝 쪽) + 바깥쪽 발 받침 두 줄
    for (const [legZ, out] of [
      [0.22, -1],
      [length - 0.6, 1],
    ]) {
      place(box(width * 0.55, top - 0.07, 0.07, C.walnutDark, 0.02), 0, (top - 0.07) / 2, legZ, t)
      place(box(width * 0.55, 0.08, 0.07, C.walnut, 0.02), 0, 0.12, legZ + out * 0.07, t)
      place(box(width * 0.55, 0.08, 0.07, C.walnut, 0.02), 0, 0.5, legZ + out * 0.07, t)
    }

    // 유리 꽃병 + 초록 줄기 (반원 쪽), 고구마 접시 · 계란후라이 접시 · 컵
    const vaseZ = length - 0.5
    const glass = new THREE.MeshStandardMaterial({ color: '#e6f3ef', roughness: 0.15, transparent: true, opacity: 0.55 })
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 24), glass)
    place(vase, 0, top + 0.12, vaseZ, t)
    for (const [x, z, h, lean] of [
      [0, vaseZ, 0.55, 0],
      [-0.02, vaseZ - 0.01, 0.45, 0.25],
      [0.02, vaseZ + 0.01, 0.4, -0.3],
    ]) {
      const stem = place(cylinder(0.008, 0.008, h, '#5f9a4f'), x, top + h / 2, z, t)
      stem.rotation.z = lean
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), material('#6fae5a'))
        leaf.scale.set(1.6, 0.35, 0.8)
        const y = top + h * (0.45 + i * 0.15)
        leaf.rotation.z = i % 2 ? 0.5 : -0.5
        place(leaf, x - Math.sin(lean) * (y - top) + (i % 2 ? 0.04 : -0.04), y, z, t)
      }
    }
    // 캐릭터가 앉는 쪽(-x, 돌리고 나면 뒤쪽) 접시에 고구마
    place(cylinder(0.19, 0.15, 0.03, '#ffffff'), -0.28, top + 0.02, chairAlong, t)
    for (const [dz, ry] of [
      [-0.05, 0.4],
      [0.06, -0.3],
    ]) {
      const potato = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), material('#a8577e', 0.8))
      potato.scale.set(1.9, 0.9, 0.95)
      potato.rotation.y = ry
      potato.castShadow = true
      place(potato, -0.28, top + 0.07, chairAlong + dz, t)
    }
    place(cylinder(0.19, 0.15, 0.03, '#ffffff'), 0.28, top + 0.02, chairAlong, t)
    place(cylinder(0.1, 0.1, 0.012, '#ffffff'), 0.28, top + 0.04, chairAlong, t)
    place(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), material('#ffc93c')), 0.28, top + 0.05, chairAlong, t)
    place(cylinder(0.055, 0.045, 0.13, C.cream), -0.3, top + 0.065, chairAlong + 0.35, t)

    // 의자: -x 쪽은 +x를, +x 쪽은 -x를 바라봐요 (돌리고 나면 앞 · 뒤에서 마주 봐요)
    const seatOffset = width / 2 + 0.36
    place(cantileverChair(), -seatOffset, 0, chairAlong, t)
    place(cantileverChair(), seatOffset, 0, chairAlong, t).rotation.y = Math.PI

    // 그룹을 -90° 돌려서 길이 방향(그룹 +z)이 집의 -x로 가로놓이게
    t.rotation.y = -Math.PI / 2
    place(t, start.x, 0, start.z, g)

    // 뒤쪽 의자(그룹 -x → 집 -z)에 앉아서 카메라 쪽(+z)을 보고 먹어요
    const chairX = start.x - chairAlong
    const chairZ = start.z - seatOffset
    const spot: Spot = {
      action: 'eat',
      approach: new THREE.Vector3(chairX, 0, chairZ - 0.95),
      position: new THREE.Vector3(chairX, 0.25, chairZ + 0.03),
      quaternion: yawQuat(0),
      hint: '식탁에서 냠냠',
    }
    t.userData.spot = spot
    return spot
  }

  /**
   * 냉장고 오른쪽 벽: 창밖 풍경 패브릭 포스터 + 낮은 2단 원목 선반 (참고 사진)
   * 윗단엔 커피머신 · 버섯 조명 · 유리잔에 꽂은 스킨답서스, 아랫단엔 작은 화병 · 캔들 · 긴 화병
   */
  private buildCoffeeShelf() {
    const g = this.group
    /** 선반 너비: 냉장고 오른쪽 끝(7.2) 바로 옆부터 */
    const w = 2.5
    const centerX = 7.35 + w / 2
    const wallZ = -3.0

    // 패브릭 포스터: 살짝 물결치게 (천 느낌)
    const posterW = 1.75
    const posterH = 1.55
    const posterGeometry = new THREE.PlaneGeometry(posterW, posterH, 32, 1)
    const pos = posterGeometry.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / posterW) * Math.PI * 7) * 0.01)
    posterGeometry.computeVertexNormals()
    const poster = new THREE.Mesh(posterGeometry, new THREE.MeshStandardMaterial({ map: windowPosterTexture(), roughness: 0.9 }))
    poster.receiveShadow = true
    place(poster, centerX, 2.1, wallZ + 0.03, g)

    // 낮은 2단 원목 선반: 네 기둥 + 단마다 앞뒤 가로대 + 앞뒤로 놓인 살
    const shelf = new THREE.Group()
    const d = 0.65
    const h = 0.95
    const pine = '#e8c592'
    const pineDark = '#d4a96f'
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) {
      for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) place(box(0.04, h, 0.04, pineDark, 0.01), x, h / 2, z, shelf)
    }
    const tiers = [0.14, h - 0.04]
    for (const y of tiers) {
      for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) place(box(w, 0.045, 0.03, pine, 0.01), 0, y - 0.03, z, shelf)
      for (let x = -w / 2 + 0.06; x <= w / 2 - 0.05; x += 0.075) place(box(0.05, 0.025, d, pine, 0.008), x, y, 0, shelf)
    }
    place(shelf, centerX, 0, wallZ + d / 2 + 0.02, g)
    this.obstacles.push(shelf)

    const glass = new THREE.MeshStandardMaterial({ color: '#eef6f3', roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false })
    const top = tiers[1] + 0.013
    const low = tiers[0] + 0.013

    // 커피머신 (회색 몸통 + 하얀 동그란 머리, 앞(+z)에 받침)
    const machine = new THREE.Group()
    place(box(0.2, 0.03, 0.2, '#c9ced2', 0.012), 0, 0.015, 0.02, machine)
    place(box(0.14, 0.02, 0.1, '#8d9399', 0.006), 0, 0.04, 0.05, machine)
    place(box(0.19, 0.34, 0.13, '#cdd1d4', 0.05), 0, 0.17, -0.05, machine)
    place(box(0.1, 0.06, 0.03, '#9aa0a5', 0.01), 0, 0.27, 0.03, machine)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), material('#f3f3f1', 0.35))
    head.castShadow = true
    place(head, 0, 0.42, -0.03, machine)
    place(machine, -w / 2 + 0.3, top, 0, shelf)

    // 버섯 조명 (노란 갓 + 크림색 받침)
    const lamp = new THREE.Group()
    const lampBase = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), material('#f3ead2', 0.5))
    lampBase.scale.y = 0.8
    place(lampBase, 0, 0.04, 0, lamp)
    place(cylinder(0.015, 0.015, 0.05, '#f3ead2'), 0, 0.09, 0, lamp)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), material('#f6b43a', 0.45))
    dome.scale.y = 1.15
    dome.castShadow = true
    place(dome, 0, 0.11, 0, lamp)
    place(lamp, -w / 2 + 0.8, top, 0.05, shelf)

    // 유리 맥주잔에 꽂은 스킨답서스
    const mug = new THREE.Group()
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.2, 24), glass), 0, 0.1, 0, mug)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20, Math.PI), glass)
    handle.rotation.z = -Math.PI / 2
    place(handle, 0.07, 0.1, 0, mug)
    addLeaves(mug, 0.18, 7, 0.07, '#5f9a4f')
    place(mug, 0.15, top, 0, shelf)

    const sprout = new THREE.Group()
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 20), glass), 0, 0.07, 0, sprout)
    addLeaves(sprout, 0.13, 5, 0.06, '#78b35f')
    place(sprout, w / 2 - 0.35, top, 0, shelf)

    // 아랫단: 작은 유리병 식물 · 캔들 · 긴 화병
    const jar = new THREE.Group()
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.16, 20), glass), 0, 0.08, 0, jar)
    addLeaves(jar, 0.14, 4, 0.06, '#5f9a4f')
    place(jar, -w / 2 + 0.35, low, 0, shelf)
    const candle = new THREE.Group()
    place(new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: '#8fa07c', roughness: 0.2, transparent: true, opacity: 0.75 }),
    ), 0, 0.1, 0, candle)
    place(cylinder(0.075, 0.075, 0.03, '#e8e4da'), 0, 0.215, 0, candle)
    place(box(0.1, 0.07, 0.005, '#f4f1e8', 0.002), 0, 0.09, 0.08, candle)
    place(candle, -0.1, low, 0, shelf)
    const vase = new THREE.Group()
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 20), glass), 0, 0.15, 0, vase)
    place(cylinder(0.006, 0.006, 0.38, '#6d8f50'), 0, 0.22, 0, vase)
    addLeaves(vase, 0.38, 3, 0.05, '#8a3b3b')
    place(vase, w / 2 - 0.45, low, 0, shelf)
  }

  /** 클릭 판정 대상 */
  get clickables(): THREE.Object3D[] {
    return [this.bed, this.desk, this.table, this.kitchen, ...this.floors]
  }
}
