import * as THREE from 'three'
import type { Stage } from '../core/Stage'
import type { Room, Spot } from '../world/Room'
import type { Character } from '../world/Character'
import type { ClickMarker } from '../world/ClickMarker'
import { clampTarget } from '../world/Navigation'

const DEFAULT_HINT = '바닥을 클릭하면 걸어가요'

/**
 * 마우스 클릭 · 호버 처리.
 * Raycaster로 클릭한 오브젝트를 찾아서 바닥(방 · 종이)이면 이동, 침대 · 책상이면 동작을 시켜요.
 */
export class Pointer {
  enabled = false
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly downAt = new THREE.Vector2()
  private hovered: THREE.Object3D | null = null

  constructor(
    private readonly stage: Stage,
    private readonly room: Room,
    private readonly ground: THREE.Object3D,
    private readonly character: Character,
    private readonly marker: ClickMarker,
    private readonly hintEl: HTMLElement,
  ) {
    const canvas = stage.renderer.domElement
    canvas.addEventListener('pointerdown', (e) => this.downAt.set(e.clientX, e.clientY))
    canvas.addEventListener('pointerup', (e) => {
      // 드래그가 아닌 짧은 클릭만 처리
      if (this.downAt.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) < 6) this.onClick(e)
    })
    canvas.addEventListener('pointermove', (e) => this.onHover(e))
  }

  private pick(e: PointerEvent) {
    const rect = this.stage.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.stage.camera)
    const targets = [...this.room.clickables, ...this.room.walls, this.ground]
    const hit = this.raycaster.intersectObjects(targets, true)[0]
    // 벽을 누르면 벽 뒤 바닥으로 가지 않도록 무시해요
    if (!hit || this.room.walls.includes(hit.object as THREE.Mesh)) return null

    // 부모를 거슬러 올라가며 침대 · 책상 그룹인지 확인
    let obj: THREE.Object3D | null = hit.object
    while (obj) {
      if (obj.userData.spot) return { spot: obj.userData.spot as Spot, group: obj, point: hit.point }
      obj = obj.parent
    }
    return { spot: null, group: null, point: hit.point }
  }

  private onClick(e: PointerEvent) {
    if (!this.enabled) return
    const hit = this.pick(e)
    if (!hit) return

    if (hit.spot) {
      this.character.perform(hit.spot)
      return
    }
    const target = clampTarget(hit.point)
    this.marker.show(target)
    this.character.moveTo(target)
  }

  private onHover(e: PointerEvent) {
    if (!this.enabled) return
    const hit = this.pick(e)
    const group = hit?.group ?? null
    this.stage.renderer.domElement.style.cursor = hit ? 'pointer' : 'default'
    if (group === this.hovered) return

    if (this.hovered) setGlow(this.hovered, false)
    this.hovered = group
    if (group) setGlow(group, true)
    this.hintEl.textContent = hit?.spot ? hit.spot.hint : DEFAULT_HINT
  }
}

function setGlow(group: THREE.Object3D, on: boolean) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).emissive?.set(on ? '#3a2a00' : '#000000')
  })
}
