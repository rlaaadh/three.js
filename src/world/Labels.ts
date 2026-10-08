import * as THREE from 'three'
import { PAPER_Y } from './Paper'
import { handFont } from '../utils/fonts'

interface LabelOptions {
  /** 월드 기준 글자 높이 */
  size?: number
  color?: string
  weight?: 400 | 700
  underline?: boolean
}

/** 모눈종이 위에 눕혀 놓는 손글씨 텍스트 */
export function createLabel(text: string, options: LabelOptions = {}) {
  const { size = 0.5, color = '#3a2e2e', weight = 700, underline = false } = options
  const fontPx = 128
  const font = handFont(weight, fontPx)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  const width = Math.ceil(ctx.measureText(text).width) + 40
  const height = Math.ceil(fontPx * 1.4)
  canvas.width = width
  canvas.height = height

  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 20, height / 2)
  if (underline) {
    ctx.strokeStyle = '#e8604c'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(24, height - 18)
    ctx.quadraticCurveTo(width / 2, height - 6, width - 24, height - 20)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  const worldHeight = size * 1.4
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry((worldHeight * width) / height, worldHeight),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = PAPER_Y + 0.005
  return mesh
}

export const LABEL_TEXTS = {
  title: 'my tiny room',
  bed: '① 침대를 누르면 뒹굴뒹굴',
  desk: '② 책상을 누르면 공부하는 척',
}

/** 방 앞쪽 종이 위에 쓰는 안내 문구들 */
export function createLabels() {
  const group = new THREE.Group()

  const title = createLabel(LABEL_TEXTS.title, { size: 0.8, underline: true })
  title.position.set(0.8, title.position.y, 4.7)
  group.add(title)

  const bedHint = createLabel(LABEL_TEXTS.bed, { size: 0.36, color: '#e8604c', weight: 400 })
  bedHint.position.set(1.3, bedHint.position.y, 5.6)
  group.add(bedHint)

  const deskHint = createLabel(LABEL_TEXTS.desk, { size: 0.36, color: '#e8604c', weight: 400 })
  deskHint.position.set(1.5, deskHint.position.y, 6.25)
  group.add(deskHint)

  return group
}
