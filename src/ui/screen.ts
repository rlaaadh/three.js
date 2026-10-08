import * as THREE from 'three'

const projected = new THREE.Vector3()

/** 3D 월드 좌표 → 화면(px) 좌표 */
export function toScreen(point: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  projected.copy(point).project(camera)
  const rect = canvas.getBoundingClientRect()
  return {
    x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
  }
}
