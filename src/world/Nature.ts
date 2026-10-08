import * as THREE from 'three'
import { PAPER_Y } from './Paper'

type Circle = [x: number, y: number, r: number]

/** 해가 비추는 방향(Stage의 sun 위치)의 반대쪽으로 그림자가 생겨요 */
const SHADOW_DIR = new THREE.Vector2(-6, -3).normalize()

/**
 * 종이 위에 세워 둔 크레용 그림 (나무 · 꽃).
 * 항상 카메라를 바라보는 Sprite라서 종이 인형처럼 보여요.
 */
export function createNature() {
  const group = new THREE.Group()
  const textures = {
    bigTree: treeTexture('#7dba8c', '#4f8f62', [
      [128, 95, 62],
      [92, 150, 58],
      [164, 155, 56],
      [128, 205, 66],
      [86, 225, 52],
      [170, 228, 52],
    ]),
    smallTree: treeTexture('#a9d67f', '#7aa858', [
      [128, 150, 50],
      [102, 196, 44],
      [154, 196, 44],
      [128, 228, 50],
    ]),
    redFlower: flowerTexture('#ef5a43', '#ffd84d'),
    pinkFlower: flowerTexture('#f7a6b2', '#ef5a43'),
  }

  const items: [keyof typeof textures, number, number, number][] = [
    ['bigTree', -6.4, 0.6, 2.4],
    ['smallTree', -5.5, 2.1, 1.4],
    ['bigTree', -2.6, -6.6, 2.2],
    ['smallTree', -6.6, -3.8, 1.5],
    ['bigTree', 5.4, -6.2, 2.4],
    ['smallTree', 6.4, -4.9, 1.4],
    ['bigTree', 7.0, 2.2, 2.2],
    ['redFlower', 4.6, 4.3, 0.75],
    ['pinkFlower', 5.4, 4.9, 0.65],
    ['pinkFlower', -4.7, 4.9, 0.65],
    ['redFlower', -5.4, 5.6, 0.75],
    ['redFlower', 6.7, -1.2, 0.7],
    ['pinkFlower', 2.4, -5.4, 0.65],
    ['redFlower', -4.4, -5.4, 0.7],
    ['pinkFlower', 7.4, 5.6, 0.6],
  ]

  const shadowTexture = blobShadowTexture()
  for (const [kind, x, z, height] of items) {
    const item = new THREE.Group()
    item.position.set(x, PAPER_Y, z)

    const texture = textures[kind]
    const image = texture.image as HTMLCanvasElement
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.05 }))
    sprite.center.set(0.5, 0.03) // 그림 아래쪽이 땅에 닿도록
    sprite.scale.set((height * image.width) / image.height, height, 1)
    item.add(sprite)

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(height * 0.9, height * 0.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
    )
    shadow.position.set(SHADOW_DIR.x * height * 0.3, 0.004, SHADOW_DIR.y * height * 0.3)
    shadow.rotation.y = Math.atan2(-SHADOW_DIR.y, SHADOW_DIR.x)
    item.add(shadow)

    group.add(item)
  }
  return group
}

// ---------- 크레용 그리기 도구 ----------

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

function toTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** 원 여러 개를 합친 모양을 크레용으로 칠해요: 보송한 가장자리 + 결 */
function crayonBlob(ctx: CanvasRenderingContext2D, circles: Circle[], color: string, grain: string) {
  ctx.fillStyle = color
  for (const [x, y, r] of circles) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 가장자리를 보송보송하게
  for (const [x, y, r] of circles) {
    for (let i = 0; i < r * 7; i++) {
      const a = Math.random() * Math.PI * 2
      const rr = r + (Math.random() - 0.5) * 7
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1 + Math.random() * 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 크레용 결 (모양 안쪽에만)
  ctx.save()
  ctx.beginPath()
  for (const [x, y, r] of circles) {
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.clip()
  const xs = circles.map(([x, , r]) => [x - r, x + r]).flat()
  const ys = circles.map(([, y, r]) => [y - r, y + r]).flat()
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  ctx.lineCap = 'round'
  for (let i = 0; i < (maxX - minX) * (maxY - minY) * 0.06; i++) {
    const x = minX + Math.random() * (maxX - minX)
    const y = minY + Math.random() * (maxY - minY)
    const len = 4 + Math.random() * 8
    const a = -0.7 + (Math.random() - 0.5) * 0.5
    ctx.strokeStyle = Math.random() < 0.5 ? grain : 'rgba(255, 255, 255, 0.35)'
    ctx.globalAlpha = 0.15 + Math.random() * 0.15
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

/** 두꺼운 크레용 선 */
function crayonLine(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], width: number, color: string, grain: string) {
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 3)
  const circles: Circle[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    circles.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, width / 2])
  }
  crayonBlob(ctx, circles, color, grain)
}

function treeTexture(color: string, dark: string, canopy: Circle[]) {
  const { canvas, ctx } = makeCanvas(256, 384)
  // 줄기
  crayonBlob(
    ctx,
    [
      [128, 290, 20],
      [128, 315, 20],
      [128, 340, 20],
      [128, 362, 19],
    ],
    '#b8754a',
    '#8a5230',
  )
  // 나뭇잎 덩어리
  crayonBlob(ctx, canopy, color, dark)
  // 잎 무늬 (진한 점)
  ctx.fillStyle = dark
  for (let i = 0; i < 8; i++) {
    const [x, y, r] = canopy[i % canopy.length]
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * r * 0.6
    ctx.beginPath()
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, 4, 7, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  return toTexture(canvas)
}

function flowerTexture(petal: string, center: string) {
  const { canvas, ctx } = makeCanvas(256, 320)
  // 줄기와 잎
  crayonLine(ctx, [128, 150], [128, 300], 16, '#7cc98f', '#55a06a')
  crayonBlob(ctx, [[96, 268, 18], [80, 262, 14], [110, 274, 14]], '#7cc98f', '#55a06a')
  crayonBlob(ctx, [[160, 258, 18], [176, 252, 14], [146, 264, 14]], '#7cc98f', '#55a06a')
  // 꽃잎 5장 + 가운데
  const petals: Circle[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    petals.push([128 + Math.cos(a) * 42, 115 + Math.sin(a) * 38, 36])
  }
  crayonBlob(ctx, petals, petal, 'rgba(0, 0, 0, 0.25)')
  crayonBlob(ctx, [[128, 115, 24]], center, 'rgba(0, 0, 0, 0.2)')
  return toTexture(canvas)
}

/** 바닥에 깔리는 흐릿한 그림자 */
function blobShadowTexture() {
  const { canvas, ctx } = makeCanvas(128, 64)
  const g = ctx.createRadialGradient(64, 32, 0, 64, 32, 64)
  g.addColorStop(0, 'rgba(90, 75, 60, 0.28)')
  g.addColorStop(1, 'rgba(90, 75, 60, 0)')
  ctx.fillStyle = g
  ctx.scale(1, 0.5)
  ctx.fillRect(0, 0, 128, 128)
  return toTexture(canvas)
}
