import * as THREE from 'three'
import { damp } from '../utils/math'

/** 화면 세로에 들어오는 월드 크기 (클수록 멀리 보여요) */
const VIEW_HEIGHT = 11
/** 화면 가로에 최소한 들어와야 하는 월드 크기 (모바일 세로 화면에서 방이 꽉 차게) */
const MIN_VIEW_WIDTH = 10
const MIN_ZOOM = 0.45
const MAX_ZOOM = 3
/** 카메라가 바라보는 점에서 카메라까지 방향 (오른쪽 앞 위) */
const VIEW_DIR = new THREE.Vector3(1, 1.05, 1).normalize()
/** 카메라가 캐릭터를 따라가는 빠르기 */
const FOLLOW_SPEED = 3

/**
 * 렌더러 · 씬 · 카메라 · 조명을 관리해요.
 * 카메라는 고정 각도(아이소메트릭 느낌의 직교 카메라)로 캐릭터를 부드럽게 따라가고, 줌만 허용해요.
 */
export class Stage {
  readonly scene = new THREE.Scene()
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.OrthographicCamera
  /** 카메라가 바라보는 점 (처음엔 집 가운데) */
  readonly focus = new THREE.Vector3(3.2, 0.4, 0)
  /** 따라갈 대상 위치. null이면 지금 자리에 머물러요 */
  followTarget: THREE.Vector3 | null = null
  zoomTarget = 1
  /** 화면 오른쪽 · 위쪽이 바닥(xz)에서 가리키는 방향 */
  private readonly screenRight = new THREE.Vector3()
  private readonly screenUp = new THREE.Vector3()

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene.background = new THREE.Color('#fafaf7')

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    // 오른쪽 앞 위에서 비스듬히 내려다보는 고정 각도
    this.placeCamera()
    this.camera.lookAt(this.focus)
    this.camera.updateMatrixWorld()
    this.screenRight.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize()
    this.screenUp.setFromMatrixColumn(this.camera.matrixWorld, 1).setY(0).normalize()

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

  /** 화면에서 끈 방향(dx 오른쪽, dy 아래쪽 px)을 바닥 위 방향으로 바꿔요 */
  screenToGround(dx: number, dy: number, target: THREE.Vector3) {
    return target
      .copy(this.screenRight)
      .multiplyScalar(dx)
      .addScaledVector(this.screenUp, -dy)
      .normalize()
  }

  private placeCamera() {
    this.camera.position.copy(this.focus).addScaledVector(VIEW_DIR, 40)
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#f3e6d6', 2.2))

    // 집이 넓어져서 해는 집 가운데를 비추고, 그림자 범위도 넓혀요
    const sun = new THREE.DirectionalLight('#fff4e2', 2.4)
    sun.position.set(10, 10, 3)
    sun.target.position.set(4, 0, 0)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const shadowCam = sun.shadow.camera
    shadowCam.left = -14
    shadowCam.right = 14
    shadowCam.top = 14
    shadowCam.bottom = -14
    shadowCam.near = 1
    shadowCam.far = 30
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.02
    this.scene.add(sun, sun.target)
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
    // 캐릭터를 부드럽게 따라가요 (각도는 그대로, 위치만)
    if (this.followTarget) {
      this.focus.x = damp(this.focus.x, this.followTarget.x, FOLLOW_SPEED, dt)
      this.focus.z = damp(this.focus.z, this.followTarget.z, FOLLOW_SPEED, dt)
      this.placeCamera()
    }

    // 휠 줌 값을 부드럽게 따라가요
    const zoom = damp(this.camera.zoom, this.zoomTarget, 8, dt)
    if (Math.abs(zoom - this.camera.zoom) > 1e-4) {
      this.camera.zoom = zoom
      this.camera.updateProjectionMatrix()
    }
    this.renderer.render(this.scene, this.camera)
  }
}
