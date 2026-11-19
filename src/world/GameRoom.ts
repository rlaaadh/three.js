import * as THREE from 'three'
import { C, WALL_HEIGHT, box, buildDoor, cylinder, material, place, plankTexture, type Spot } from './Room'
import { singleRoomLayout, type NavLayout } from './Navigation'
import { createLabel } from './Labels'
import { handFont } from '../utils/fonts'

/** 게임방에서 누를 수 있는 것들 */
export type GameRoomItem = 'door' | 'game' | 'jelly' | 'tv' | 'run' | 'ball' | 'book'

/** 누르거나 마우스를 올렸을 때 왼쪽 위에 뜨는 안내 */
export const GAME_ROOM_HINTS: Record<GameRoomItem | 'default', string> = {
  default: '책꽂이는 꼬맨틀, 게임기는 말랑젤리, 문은 내 방으로',
  door: '문 열고 내 방으로',
  game: '레트로 게임기 (곧 열려요)',
  jelly: '오락기에서 말랑젤리 쌓기 (젤리 블록 퍼즐)',
  tv: '레트로 게임기로 말랑젤리 쌓기 (젤리 블록 퍼즐)',
  run: '런닝머신 (곧 열려요)',
  ball: '짐볼 (곧 열려요)',
  book: '책꽂이에서 꼬맨틀 (비밀 단어 맞히기)',
}

/** 바닥 종이 위 손글씨 */
export const GAME_ROOM_LABELS = {
  title: 'game room',
  book: '1. 책꽂이를 누르면 꼬맨틀',
  door: '2. 문을 누르면 내 방으로',
  jelly: '3. 각종 게임기를 누르면 다양한 게임 플레이 가능',
}

/** 방 크기: 침실(6.4)보다 오른쪽으로 1.5배 넓어요. 왼쪽 · 뒤쪽 벽 위치는 침실과 같아요 */
const ROOM = { minX: -3.2, maxX: 6.4, minZ: -3.2, maxZ: 3.2 }
const ROOM_W = ROOM.maxX - ROOM.minX
const ROOM_CX = (ROOM.minX + ROOM.maxX) / 2

/** 말랑젤리 쌓기 오락기 (뒷벽 오락기 셋 중 오른쪽) */
const ARCADE_X = -0.25

/** 책 색: 집 소품 색에 맞춘 톤 다운 파스텔 */
const BOOK_COLORS = ['#e8a598', '#a9c4a0', '#f2d48a', '#d98a6a', '#b9c7d9', '#efe3c8', '#c9a27e', '#8fae9e', '#e6b8c6', '#a8754d', '#f6eee0', '#7f9cb5']

/** 매번 같은 책 배치가 나오게 하는 작은 난수 */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 오락기 화면: 따뜻한 남색 바탕에 픽셀 외계인 · 별 · 점수 줄 */
function arcadeScreen(accent: string) {
  return canvasTexture(128, 112, (ctx) => {
    ctx.fillStyle = '#3d3a52'
    ctx.fillRect(0, 0, 128, 112)
    ctx.fillStyle = '#fff8e6'
    for (const [x, y] of [[12, 18], [100, 10], [60, 30], [24, 70], [112, 60], [84, 88]]) ctx.fillRect(x, y, 3, 3)
    // 픽셀 외계인 세 마리
    const invader = ['00100100', '00011000', '00111100', '01011010', '11111111', '10111101', '10100101']
    for (const [ox, oy, color] of [[20, 30, accent], [52, 26, '#f2d48a'], [84, 30, '#a9c4a0']] as const) {
      ctx.fillStyle = color
      invader.forEach((row, ry) => [...row].forEach((c, rx) => c === '1' && ctx.fillRect(ox + rx * 3, oy + ry * 3, 3, 3)))
    }
    // 내 비행기 + 점수 줄
    ctx.fillStyle = '#fff8e6'
    ctx.fillRect(58, 88, 12, 4)
    ctx.fillRect(62, 84, 4, 4)
    ctx.fillStyle = accent
    ctx.fillRect(10, 6, 30, 4)
  })
}

/** 말랑젤리 오락기 화면: 민트 바탕에 얼굴 달린 젤리가 쌓여 있고 하나가 내려와요 */
function jellyScreen() {
  return canvasTexture(128, 112, (ctx) => {
    ctx.fillStyle = '#3d3a52'
    ctx.fillRect(0, 0, 128, 112)
    ctx.fillStyle = '#e9f6ef'
    ctx.fillRect(34, 6, 60, 100)
    const s = 10
    const jelly = (x: number, y: number, color: string) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(34 + x * s + 1, 6 + y * s + 1, s - 2, s - 2, 3)
      ctx.fill()
      ctx.fillStyle = '#3f3a3a'
      ctx.fillRect(34 + x * s + 3, 6 + y * s + 4, 1, 2)
      ctx.fillRect(34 + x * s + 6, 6 + y * s + 4, 1, 2)
    }
    // 바닥에 쌓인 젤리
    const stack: [number, number, string][] = [
      [0, 9, '#f7a8b4'], [1, 9, '#f7a8b4'], [2, 9, '#ffe08a'], [3, 9, '#ffe08a'], [4, 9, '#a8dcc8'], [5, 9, '#b6d6f2'],
      [0, 8, '#cdb8ec'], [1, 8, '#cdb8ec'], [3, 8, '#ffc39a'], [4, 8, '#a8dcc8'], [5, 8, '#a8dcc8'],
      [0, 7, '#cdb8ec'], [4, 7, '#c8e0a0'], [5, 7, '#c8e0a0'],
    ]
    for (const [x, y, color] of stack) jelly(x, y, color)
    // 내려오는 젤리
    for (const [x, y] of [[2, 2], [1, 3], [2, 3], [3, 3]]) jelly(x, y, '#ffe08a')
    // 옆 점수 줄 · 별
    ctx.fillStyle = '#f7a8b4'
    ctx.fillRect(100, 12, 20, 4)
    ctx.fillStyle = '#fff8e6'
    ctx.fillRect(100, 22, 14, 4)
    ctx.fillRect(10, 20, 3, 3)
    ctx.fillRect(16, 70, 3, 3)
    ctx.fillRect(110, 80, 3, 3)
  })
}

/** 말랑젤리 오락기 간판 */
function jellyMarquee() {
  return canvasTexture(256, 60, (ctx) => {
    ctx.fillStyle = '#fff3c4'
    ctx.fillRect(0, 0, 256, 60)
    ctx.font = handFont(40)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = '#5a4033'
    ctx.lineJoin = 'round'
    ctx.strokeText('말랑젤리', 128, 32)
    ctx.fillStyle = '#f7a8b4'
    ctx.fillText('말랑젤리', 128, 32)
  })
}

/** 브라운관 TV 화면: 하늘 · 언덕 · 점프하는 네모 주인공 */
function tvScreen() {
  return canvasTexture(128, 96, (ctx) => {
    ctx.fillStyle = '#b9d7e8'
    ctx.fillRect(0, 0, 128, 96)
    ctx.fillStyle = '#fff8e6'
    ctx.fillRect(18, 16, 22, 6)
    ctx.fillRect(14, 20, 30, 6)
    ctx.fillRect(84, 24, 26, 6)
    ctx.fillStyle = '#8fbf72'
    ctx.beginPath()
    ctx.arc(30, 96, 40, Math.PI, 0)
    ctx.arc(100, 100, 34, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = '#c9a27e'
    ctx.fillRect(0, 78, 128, 18)
    ctx.fillStyle = '#e8604c'
    ctx.fillRect(56, 54, 10, 12)
    ctx.fillStyle = '#f2d48a'
    ctx.fillRect(80, 40, 10, 10)
  })
}

/** 런닝머신 계기판 화면 */
function treadmillScreen() {
  return canvasTexture(64, 32, (ctx) => {
    ctx.fillStyle = '#4b5a4f'
    ctx.fillRect(0, 0, 64, 32)
    ctx.fillStyle = '#c8f0a8'
    for (let i = 0; i < 6; i++) ctx.fillRect(6 + i * 9, 24 - i * 3, 6, 4 + i * 3)
  })
}

/**
 * 게임방: 취미로 노는 작은 오락 · 운동 방.
 * 집과 같은 모눈종이 · 크림색 벽 · 나무 마루 위에 레트로 오락기 두 대, 브라운관 TV,
 * 런닝머신 · 짐볼 · 요가 매트, 책이 빼곡한 책꽂이가 있어요.
 * 집과 따로 씬 · 카메라를 갖고, main에서 게임방에 있는 동안만 이 씬을 그려요.
 */
export class GameRoom {
  /** 방 전체: 집과 같은 자리(같은 좌표)에 있고, 게임방에 있는 동안만 보여요 */
  readonly group = new THREE.Group()
  /** 누를 수 있는 것들 (Pointer가 찾아요): 문 · 책꽂이는 Spot, 나머지는 item */
  readonly clickables: THREE.Object3D[] = []
  /** 클릭이 통과하지 않도록 막는 벽 */
  readonly walls: THREE.Mesh[] = []
  /** 걸어 다니는 규칙 (벽 · 가구) */
  readonly layout: NavLayout
  /** 문으로 들어와서 서는 자리 · 바라보는 방향 (방 안쪽 +x) */
  readonly spawn = new THREE.Vector3(-1.9, 0, 2.2)
  readonly spawnYaw = Math.PI / 2
  /** 책꽂이 앞에 서서 꼬맨틀 */
  readonly bookSpot: Spot
  /** 문 앞에 서면 내 방으로 */
  readonly doorSpot: Spot
  /** 오른쪽 오락기 앞에 서서 말랑젤리 쌓기 */
  readonly arcadeSpot: Spot
  /** TV 게임기 앞에 서서 말랑젤리 쌓기 */
  readonly tvSpot: Spot
  /** 드래그로 걸을 때 피해 가는 가구 */
  private readonly obstacles: THREE.Object3D[] = []
  /** 누르면 통 튀는 물건들 */
  private readonly bounces: { obj: THREE.Object3D; t: number; base: THREE.Vector3 }[] = []

  constructor() {
    this.group.visible = false
    this.build()
    this.addLabels()
    const yaw = (y: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, y, 0))
    // 책꽂이(왼쪽 벽)를 바라보고 서요
    this.bookSpot = {
      action: 'read',
      approach: new THREE.Vector3(-1.55, 0, -0.15),
      position: new THREE.Vector3(-1.92, 0, -0.15),
      quaternion: yaw(-Math.PI / 2),
      hint: GAME_ROOM_HINTS.book,
    }
    this.doorSpot = {
      action: 'door',
      approach: this.spawn.clone(),
      position: new THREE.Vector3(-2.26, 0, this.spawn.z),
      quaternion: yaw(-Math.PI / 2),
      hint: GAME_ROOM_HINTS.door,
    }
    // 오른쪽 오락기(뒷벽)를 바라보고 서요
    this.arcadeSpot = {
      action: 'play',
      approach: new THREE.Vector3(ARCADE_X, 0, -1.35),
      position: new THREE.Vector3(ARCADE_X, 0, -1.72),
      quaternion: yaw(Math.PI),
      hint: GAME_ROOM_HINTS.jelly,
    }
    this.jellyArcade.userData.spot = this.arcadeSpot
    // TV 게임기로도 말랑젤리: 빈백 뒤, TV 앞에 서서 TV를 봐요
    this.tvSpot = {
      action: 'play',
      approach: new THREE.Vector3(0.7, 0, -1.95),
      position: new THREE.Vector3(1.5, 0, -1.95),
      quaternion: yaw(Math.PI),
      hint: GAME_ROOM_HINTS.tv,
    }
    this.tv.userData.spot = this.tvSpot
    this.bookshelf.userData.spot = this.bookSpot
    this.door.userData.spot = this.doorSpot
    this.group.updateMatrixWorld(true)
    this.layout = singleRoomLayout(ROOM, this.obstacles)
  }

  /** 아직 준비 중인 물건을 누르면 통 튀어요 */
  bounce(obj: THREE.Object3D) {
    if (this.bounces.some((b) => b.obj === obj)) return
    this.bounces.push({ obj, t: 0, base: obj.scale.clone() })
  }

  update(dt: number) {
    for (let i = this.bounces.length - 1; i >= 0; i--) {
      const b = this.bounces[i]
      b.t += dt / 0.45
      const k = b.t >= 1 ? 0 : Math.sin(b.t * Math.PI * 2) * (1 - b.t) * 0.12
      b.obj.scale.set(b.base.x * (1 - k * 0.5), b.base.y * (1 + k), b.base.z * (1 - k * 0.5))
      if (b.t >= 1) this.bounces.splice(i, 1)
    }
  }

  private bookshelf!: THREE.Group
  private door!: THREE.Group
  private jellyArcade!: THREE.Group
  private tv!: THREE.Group

  /** 누를 수 있게 등록 (item은 문 · 책꽂이 말고 아직 준비 중인 물건 안내용) */
  private clickable(obj: THREE.Object3D, item: GameRoomItem, solid = true) {
    obj.userData.item = item
    obj.userData.hint = GAME_ROOM_HINTS[item]
    this.clickables.push(obj)
    if (solid) this.obstacles.push(obj)
    return obj
  }

  private build() {
    const g = this.group

    // ---------- 바닥 · 벽 (침실과 같은 마루 · 같은 크림색 벽, 오른쪽으로 더 넓게) ----------
    const floor = box(ROOM_W, 0.25, 6.4, '#ffffff', 0.04)
    ;(floor.material as THREE.MeshStandardMaterial).map = plankTexture(ROOM_W / 2.1, 3)
    place(floor, ROOM_CX, -0.125, 0, g)
    this.walls.push(
      place(box(0.2, WALL_HEIGHT, 6.4, C.wall, 0.04), -3.1, WALL_HEIGHT / 2, 0, g),
      place(box(ROOM_W, WALL_HEIGHT, 0.2, C.wall, 0.04), ROOM_CX, WALL_HEIGHT / 2, -3.1, g),
    )
    this.clickables.push(floor)
    place(box(0.06, 0.2, 6.4, C.trim, 0.02), -2.98, 0.1, 0, g)
    place(box(ROOM_W, 0.2, 0.06, C.trim, 0.02), ROOM_CX, 0.1, -2.98, g)
    place(box(0.28, 0.1, 6.5, C.trim, 0.03), -3.1, 3.18, 0, g)
    place(box(ROOM_W + 0.1, 0.1, 0.28, C.trim, 0.03), ROOM_CX, 3.18, -3.1, g)

    // 동그란 러그 (크림 + 버터색 테두리): 방 가운데, 오락기 · TV 앞
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.02, 56), material(C.butter, 0.95))
    rug.receiveShadow = true
    place(rug, 0.9, 0.01, 0.6, g)
    const rugIn = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.022, 56), material(C.cream, 0.95))
    rugIn.receiveShadow = true
    place(rugIn, 0.9, 0.012, 0.6, g)

    // ---------- 왼쪽 벽: 내 방으로 돌아가는 문 ----------
    const door = buildDoor('my room', 'home')
    this.door = door
    door.rotation.y = Math.PI / 2
    place(door, -3.0, 0, this.spawn.z, g)
    this.clickable(door, 'door', false)

    this.buildBookshelf(g)
    this.buildArcade(g, -2.15, C.caramel, '#e8604c')
    this.buildArcade(g, -1.2, '#a9c4a0', '#e6b8c6')
    this.jellyArcade = this.buildArcade(g, ARCADE_X, C.butter, '#7f9cb5', true)
    this.buildTv(g)
    this.buildTreadmill(g)
    this.buildGym(g)
    this.buildDecor(g)
  }

  /** 왼쪽 벽 책꽂이: 5칸에 알록달록한 책이 빼곡해요 */
  private buildBookshelf(g: THREE.Group) {
    const shelf = new THREE.Group()
    const w = 2.5
    const d = 0.42
    const h = 2.35
    const t = 0.05
    const rand = seeded(7)
    // 뒤판 · 옆판 · 위아래 판 (책상 · 선반과 같은 밝은 우드)
    place(box(w, h, 0.03, C.cream, 0.01), 0, h / 2, -d / 2 + 0.015, shelf)
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) place(box(t, h, d, C.wood, 0.015), x, h / 2, 0, shelf)
    const rows = 5
    const gap = (h - t) / rows
    for (let i = 0; i <= rows; i++) place(box(w, t, d, C.wood, 0.015), 0, t / 2 + i * gap, 0, shelf)

    // 칸마다 책을 왼쪽부터 꽉 채워요. 가끔 끝에 비스듬히 기댄 책
    for (let row = 0; row < rows; row++) {
      const baseY = t + row * gap
      let x = -w / 2 + t + 0.02
      const end = w / 2 - t - 0.02
      while (x < end - 0.05) {
        const bw = 0.05 + rand() * 0.06
        if (x + bw > end) break
        const bh = gap * (0.62 + rand() * 0.3)
        const bd = d * (0.7 + rand() * 0.2)
        const color = BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)]
        const book = place(box(bw, bh, bd, color, 0.008), x + bw / 2, baseY + bh / 2, -d / 2 + 0.03 + bd / 2, shelf)
        book.castShadow = false
        // 책등 띠
        if (rand() < 0.35) place(box(bw + 0.002, 0.025, 0.004, '#fff8e6', 0.001), x + bw / 2, baseY + bh * 0.75, -d / 2 + 0.03 + bd + 0.002, shelf)
        x += bw + 0.004
      }
    }
    // 그룹 앞(+z)이 방 안쪽(+x)을 보게 돌려서 왼쪽 벽에 붙여요
    shelf.rotation.y = Math.PI / 2
    place(shelf, -3.0 + d / 2, 0, -0.15, g)
    this.bookshelf = shelf
    this.clickable(shelf, 'book')
  }

  /** 레트로 오락기: 나무 몸통 · 비스듬한 화면 · 조이스틱과 버튼 */
  private buildArcade(g: THREE.Group, x: number, body: string, accent: string, jelly = false) {
    const a = new THREE.Group()
    const w = 0.78
    // 아래 몸통 · 위 몸통 (뒤쪽으로 들어가요) · 지붕 간판
    place(box(w, 1.0, 0.72, body, 0.03), 0, 0.5, 0, a)
    place(box(w, 0.95, 0.5, body, 0.03), 0, 1.47, -0.11, a)
    place(box(w + 0.04, 0.24, 0.6, body, 0.03), 0, 2.02, -0.06, a)
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.1, 0.16),
      jelly ? new THREE.MeshBasicMaterial({ map: jellyMarquee() }) : new THREE.MeshBasicMaterial({ color: '#fff3c4' }),
    )
    place(marquee, 0, 2.02, 0.245, a)
    // 앞판 크림색 + 동전 투입구
    place(box(w - 0.14, 0.6, 0.02, C.cream, 0.01), 0, 0.45, 0.36, a)
    place(box(0.12, 0.08, 0.02, '#7a5640', 0.01), 0, 0.6, 0.375, a)
    // 조작판: 앞으로 살짝 기울어진 판 위에 빨간 조이스틱 + 버튼
    const panel = place(box(w - 0.02, 0.06, 0.32, C.cream, 0.02), 0, 1.03, 0.2, a)
    panel.rotation.x = 0.25
    place(cylinder(0.012, 0.012, 0.1, '#6b5446'), -0.18, 1.1, 0.22, a)
    place(new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), material(accent, 0.4)), -0.18, 1.16, 0.22, a)
    for (const [bx, color] of [[0.06, '#f2d48a'], [0.16, '#8fae9e'], [0.26, accent]] as const) {
      place(cylinder(0.03, 0.03, 0.03, color), bx, 1.07, 0.22, a)
    }
    // 화면: 테두리 안에 살짝 뒤로 젖혀서
    const bezel = place(box(w - 0.12, 0.6, 0.03, '#3a2e2e', 0.02), 0, 1.5, 0.15, a)
    bezel.rotation.x = -0.12
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.22, 0.48), new THREE.MeshBasicMaterial({ map: jelly ? jellyScreen() : arcadeScreen(accent) }))
    screen.rotation.x = -0.12
    place(screen, 0, 1.5, 0.168, a)
    place(a, x, 0, -3.0 + 0.4, g)
    this.clickable(a, jelly ? 'jelly' : 'game')
    return a
  }

  /** 낮은 원목 장 위 브라운관 TV + 게임기 + 패드 두 개, 앞에 빈백 */
  private buildTv(g: THREE.Group) {
    const tv = new THREE.Group()
    // 낮은 장
    place(box(1.3, 0.5, 0.5, C.woodMid, 0.03), 0, 0.25, 0, tv)
    place(box(1.26, 0.02, 0.46, C.ivory, 0.01), 0, 0.51, 0, tv)
    for (const x of [-0.32, 0.32]) place(box(0.58, 0.38, 0.02, C.caramel, 0.015), x, 0.25, 0.25, tv)
    // 브라운관 TV (뚱뚱한 아이보리 몸통)
    place(box(0.72, 0.58, 0.55, C.ivory, 0.08), 0, 0.81, -0.02, tv)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.4), new THREE.MeshBasicMaterial({ map: tvScreen() }))
    place(screen, -0.05, 0.82, 0.258, tv)
    for (const y of [0.92, 0.82]) place(cylinder(0.025, 0.025, 0.02, C.grayDark), 0.28, y, 0.26, tv).rotation.x = Math.PI / 2
    // 게임기 + 선으로 연결된 패드 두 개 (장 앞 바닥)
    place(box(0.32, 0.07, 0.22, '#e4e3df', 0.02), 0.45, 0.56, 0.06, tv)
    place(box(0.06, 0.012, 0.03, '#e8604c', 0.004), 0.37, 0.596, 0.12, tv)
    for (const [px, rot] of [[-0.2, 0.3], [0.25, -0.4]]) {
      const pad = new THREE.Group()
      place(box(0.2, 0.04, 0.09, '#d6d6d4', 0.02), 0, 0.02, 0, pad)
      place(box(0.04, 0.012, 0.012, '#6b5446', 0.003), -0.05, 0.045, 0, pad)
      place(cylinder(0.012, 0.012, 0.012, '#e8604c'), 0.05, 0.045, 0, pad)
      pad.rotation.y = rot
      place(pad, px, 0.01, 0.55, tv)
    }
    place(tv, 1.5, 0, -3.0 + 0.27, g)
    this.tv = tv
    this.clickable(tv, 'tv')

    // TV 앞 버터색 짐볼: 동글동글한 공 (가운데 띠)
    const ball = new THREE.Group()
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 40, 28), new THREE.MeshStandardMaterial({ color: C.butter, roughness: 0.45 }))
    sphere.castShadow = sphere.receiveShadow = true
    place(sphere, 0, 0.34, 0, ball)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.008, 8, 48), material('#f6eee0', 0.5))
    band.rotation.x = Math.PI / 2 - 0.3
    place(band, 0, 0.34, 0, ball)
    place(ball, 1.45, 0, -1.25, g)
    this.clickable(ball, 'ball')
  }

  /** 런닝머신: 벽 쪽에 계기판, 방 안쪽으로 길게 벨트 */
  private buildTreadmill(g: THREE.Group) {
    const t = new THREE.Group()
    const len = 1.8
    const w = 0.78
    // 받침 · 벨트 · 양옆 발판
    place(box(w, 0.14, len, C.lightGray, 0.04), 0, 0.09, 0, t)
    place(box(w - 0.22, 0.02, len - 0.12, '#6f6a66', 0.008), 0, 0.165, 0.02, t)
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) place(box(0.1, 0.03, len - 0.06, C.ivory, 0.01), x, 0.175, 0, t)
    // 뒤쪽(벽) 기둥 두 개 + 손잡이 + 계기판
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
      const post = place(box(0.06, 1.25, 0.06, C.ivory, 0.02), x, 0.75, -len / 2 + 0.12, t)
      post.rotation.x = -0.12
      place(box(0.05, 0.05, 0.38, C.ivory, 0.02), x, 1.18, -len / 2 + 0.36, t)
    }
    place(box(w + 0.04, 0.2, 0.18, C.ivory, 0.05), 0, 1.38, -len / 2 + 0.06, t)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshBasicMaterial({ map: treadmillScreen() }))
    panel.rotation.x = -0.35
    place(panel, 0, 1.4, -len / 2 + 0.16, t)
    // 계기판 양옆에 버터색 버튼
    for (const x of [-0.28, 0.28]) place(cylinder(0.03, 0.03, 0.02, C.butter), x, 1.47, -len / 2 + 0.12, t)
    place(t, 3.6, 0, -3.0 + len / 2 + 0.12, g)
    this.clickable(t, 'run')
  }

  /** 요가 매트 위 짐볼 + 작은 아령 한 쌍 */
  private buildGym(g: THREE.Group) {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.015, 1.7), material('#a9c4a0', 0.95))
    mat.receiveShadow = true
    mat.rotation.y = 0.12
    place(mat, 4.75, 0.008, 0.75, g)
    // 매트 끝에 돌돌 만 부분
    const roll = cylinder(0.07, 0.07, 0.75, '#98b78f')
    roll.rotation.z = Math.PI / 2
    roll.rotation.y = 0.12
    place(roll, 4.85, 0.07, 1.58, g)

    const ball = new THREE.Group()
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 28), new THREE.MeshStandardMaterial({ color: '#e8a598', roughness: 0.45 }))
    sphere.castShadow = sphere.receiveShadow = true
    place(sphere, 0, 0.36, 0, ball)
    // 짐볼 가운데 띠
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.008, 8, 48), material('#f6eee0', 0.5))
    band.rotation.x = Math.PI / 2 - 0.3
    place(band, 0, 0.36, 0, ball)
    place(ball, 5.45, 0, -0.2, g)
    this.clickable(ball, 'ball')

    for (const z of [1.15, 1.4]) {
      const bell = new THREE.Group()
      const bar = cylinder(0.018, 0.018, 0.22, C.grayDark)
      bar.rotation.z = Math.PI / 2
      place(bar, 0, 0.06, 0, bell)
      for (const x of [-0.1, 0.1]) {
        const plate = cylinder(0.06, 0.06, 0.05, C.butter)
        plate.rotation.z = Math.PI / 2
        place(plate, x, 0.06, 0, bell)
      }
      bell.rotation.y = 0.12
      place(bell, 4.6, 0.01, z - 0.3, g)
    }
  }

  /** 벽 장식: 오락기 위 삼각 깃발 줄 · TV 위 동그란 창 · 앞쪽 화분 */
  private buildDecor(g: THREE.Group) {
    const flags = ['#e8a598', '#f2d48a', '#a9c4a0', '#b9c7d9', '#e6b8c6']
    const from = -2.75
    const to = 2.5
    const count = 15
    const string = cylinder(0.006, 0.006, to - from, C.woodDark)
    string.rotation.z = Math.PI / 2
    place(string, (from + to) / 2, 2.72, -2.96, g)
    for (let i = 0; i < count; i++) {
      const shape = new THREE.Shape()
      shape.moveTo(-0.12, 0)
      shape.lineTo(0.12, 0)
      shape.lineTo(0, -0.24)
      shape.lineTo(-0.12, 0)
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(flags[i % flags.length], 0.9))
      const x = from + 0.17 + (i / (count - 1)) * (to - from - 0.34)
      // 줄이 가운데로 살짝 처져요
      const sag = Math.sin((i / (count - 1)) * Math.PI) * 0.08
      place(flag, x, 2.72 - sag, -2.95, g)
    }

    // 동그란 창 (TV 위)
    place(cylinder(0.45, 0.45, 0.06, C.woodMid), 1.5, 1.95, -2.97, g).rotation.x = Math.PI / 2
    place(cylinder(0.38, 0.38, 0.05, C.glass), 1.5, 1.95, -2.94, g).rotation.x = Math.PI / 2

    // 운동 쪽 뒤쪽 벽: 큰 창문 (침실 창문과 같은 모양) + 아래 낮은 선반에 물병 · 수건
    place(box(1.5, 1.2, 0.08, C.woodMid, 0.03), 5.2, 1.9, -2.97, g)
    place(box(1.3, 1.0, 0.06, C.glass, 0.02), 5.2, 1.9, -2.93, g)
    this.obstacles.push(place(box(1.4, 0.06, 0.3, C.wood, 0.02), 5.2, 0.85, -2.82, g))
    for (const x of [-0.45, 0.45]) place(box(0.04, 0.85, 0.28, C.wood, 0.01), 5.2 + x, 0.425, -2.82, g)
    place(cylinder(0.06, 0.06, 0.26, '#b9c7d9'), 4.8, 1.01, -2.82, g)
    const towel = place(box(0.36, 0.14, 0.24, '#f6eee0', 0.05), 5.35, 0.95, -2.82, g)
    towel.rotation.y = 0.1

    // 앞 오른쪽 모서리 화분
    this.obstacles.push(place(cylinder(0.22, 0.17, 0.4, '#e98b5a'), ROOM.maxX - 0.6, 0.2, 2.6, g))
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), material('#7cc46a'))
    leaves.castShadow = true
    leaves.scale.set(1, 1.3, 1)
    place(leaves, ROOM.maxX - 0.6, 0.88, 2.6, g)
  }

  /** 방 앞쪽 종이 위 손글씨 */
  private addLabels() {
    const title = createLabel(GAME_ROOM_LABELS.title, { size: 0.8, underline: true })
    title.position.set(0.6, title.position.y, 4.3)
    const hint = createLabel(GAME_ROOM_LABELS.door, { size: 0.4, color: '#e8604c' })
    const book = createLabel(GAME_ROOM_LABELS.book, { size: 0.4, color: '#e8604c' })
    const jelly = createLabel(GAME_ROOM_LABELS.jelly, { size: 0.4, color: '#e8604c' })
    book.position.set(1.2, book.position.y, 5.4)
    hint.position.set(1.5, hint.position.y, 6.05)
    jelly.position.set(3.2, jelly.position.y, 6.7)
    this.group.add(title, hint, book, jelly)
  }
}
