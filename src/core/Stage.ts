import * as THREE from 'three'
import { damp } from '../utils/math'

/** 화면 세로에 들어오는 월드 크기 (클수록 멀리 보여요) */
const VIEW_HEIGHT = 11
/** 화면 가로에 최소한 들어와야 하는 월드 크기 (모바일 세로 화면에서 방이 꽉 차게) */
const MIN_VIEW_WIDTH = 10
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3
/** 화면을 끌어서 옮길 수 있는 최대 거리 (월드 단위) */
const PAN_LIMIT = 9

/**
 * 렌더러 · 씬 · 카메라 · 조명을 관리해요.
 * 카메라는 고정 시점(아이소메트릭 느낌의 직교 카메라)이고, 줌만 허용해요.
 */
export class Stage {
  readonly scene = new THREE.Scene()
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.OrthographicCamera
  readonly lookAt = new THREE.Vector3(0, 0.4, 0)
  zoomTarget = 1
  /** 기본 카메라 위치 + 드래그로 옮긴 만큼 */
  private readonly basePosition = new THREE.Vector3()
  private readonly panOffset = new THREE.Vector3()
  private readonly axisX = new THREE.Vector3()
  private readonly axisY = new THREE.Vector3()

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene.background = new THREE.Color('#fafaf7')

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    // 오른쪽 앞 위에서 비스듬히 내려다보는 고정 시점
    const direction = new THREE.Vector3(1, 1.05, 1).normalize()
    this.camera.position.copy(this.lookAt).addScaledVector(direction, 40)
    this.camera.lookAt(this.lookAt)
    this.basePosition.copy(this.camera.position)

    this.addLights()
    this.resize()
    window.addEventListener('resize', () => this.resize())

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.zoomBy(Math.exp(-e.deltaY * 0.0015))
      },
      { passive: false },
    )
  }

  /** immediate: 핀치처럼 손가락을 바로 따라가야 할 때는 부드럽게 따라가지 않고 즉시 적용 */
  zoomBy(factor: number, immediate = false) {
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * factor, MIN_ZOOM, MAX_ZOOM)
    if (immediate) {
      this.camera.zoom = this.zoomTarget
      this.camera.updateProjectionMatrix()
    }
  }

  /** 화면을 dx, dy(px)만큼 끌어서 옮겨요 */
  pan(dx: number, dy: number) {
    const height = this.renderer.domElement.clientHeight || window.innerHeight
    const worldPerPx = (this.camera.top - this.camera.bottom) / this.camera.zoom / height
    this.axisX.setFromMatrixColumn(this.camera.matrix, 0)
    this.axisY.setFromMatrixColumn(this.camera.matrix, 1)
    this.panOffset.addScaledVector(this.axisX, -dx * worldPerPx).addScaledVector(this.axisY, dy * worldPerPx)
    this.panOffset.clampLength(0, PAN_LIMIT)
    this.camera.position.copy(this.basePosition).add(this.panOffset)
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#f3e6d6', 2.2))

    const sun = new THREE.DirectionalLight('#fff4e2', 2.4)
    sun.position.set(6, 10, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const shadowCam = sun.shadow.camera
    shadowCam.left = -10
    shadowCam.right = 10
    shadowCam.top = 10
    shadowCam.bottom = -10
    shadowCam.near = 1
    shadowCam.far = 30
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.02
    this.scene.add(sun)
  }

  resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    const aspect = width / height
    const viewHeight = Math.max(VIEW_HEIGHT, MIN_VIEW_WIDTH / aspect)

    this.camera.left = (-viewHeight * aspect) / 2
    this.camera.right = (viewHeight * aspect) / 2
    this.camera.top = viewHeight / 2
    this.camera.bottom = -viewHeight / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  update(dt: number) {
    // 휠 줌 값을 부드럽게 따라가요
    const zoom = damp(this.camera.zoom, this.zoomTarget, 8, dt)
    if (Math.abs(zoom - this.camera.zoom) > 1e-4) {
      this.camera.zoom = zoom
      this.camera.updateProjectionMatrix()
    }
    this.renderer.render(this.scene, this.camera)
  }
}
