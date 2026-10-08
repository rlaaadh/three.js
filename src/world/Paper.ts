import * as THREE from 'three'

export const PAPER_Y = -0.25
const SIZE = 120
const CELL = 0.5

/**
 * 모눈종이 바닥.
 * 종이 색이 조명에 따라 변하지 않도록 Basic 재질로 그리고,
 * 그림자는 위에 얹은 ShadowMaterial 평면으로만 받아요.
 * `ground`는 클릭 판정용 (방 밖을 걸어다닐 때)
 */
export function createPaper() {
  const group = new THREE.Group()

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fafaf7'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#dfe3e8'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 1.5)
  ctx.lineTo(256, 1.5)
  ctx.moveTo(1.5, 0)
  ctx.lineTo(1.5, 256)
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(SIZE / CELL, SIZE / CELL)
  texture.anisotropy = 8

  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshBasicMaterial({ map: texture }),
  )
  paper.rotation.x = -Math.PI / 2
  paper.position.y = PAPER_Y
  group.add(paper)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.ShadowMaterial({ color: '#5a4a3a', opacity: 0.18 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = PAPER_Y + 0.001
  shadow.receiveShadow = true
  group.add(shadow)

  return { group, ground: paper }
}
