import './style.css'
import * as THREE from 'three'
import { Stage } from './core/Stage'
import { Loader } from './core/Loader'
import { createPaper } from './world/Paper'
import { Room } from './world/Room'
import { Character, EMOTE_TEXTS } from './world/Character'
import { createLabels, LABEL_TEXTS } from './world/Labels'
import { ClickMarker } from './world/ClickMarker'
import { Footprints } from './world/Footprints'
import { createNature } from './world/Nature'
import { Pointer } from './interaction/Pointer'
import { CameraControls } from './interaction/CameraControls'
import { TypingApp } from './ui/typing/TypingApp'
import { isTouchDevice } from './utils/device'
import { loadHandFont } from './utils/fonts'
import { easeOutBack, easeOutBounce } from './utils/math'

const canvas = document.getElementById('webgl') as HTMLCanvasElement
const hintEl = document.getElementById('hint')!

const stage = new Stage(canvas)
const controls = new CameraControls(stage)

// iOS Safari는 touch-action만으로는 핀치 페이지 확대가 안 막혀서 제스처 이벤트도 막아요
document.addEventListener('gesturestart', (e) => e.preventDefault())
const loader = new Loader()

// 손글씨 폰트가 준비돼야 캔버스(3D 바닥 글씨 · Zzz)가 제대로 그려져요
const fontsReady = loadHandFont([...Object.values(LABEL_TEXTS), ...Object.values(EMOTE_TEXTS), 'zZ'])

const paper = createPaper()
const room = new Room()
const marker = new ClickMarker()
const footprints = new Footprints()
const nature = createNature()
stage.scene.add(paper.group, room.group, marker.mesh, footprints.group, nature)

let character: Character | null = null
let pointer: Pointer | null = null

// ---------- 인트로 연출 ----------
const intro = { t: -1 }
room.group.scale.setScalar(0.001)
nature.children.forEach((item) => item.scale.setScalar(0.001))
stage.camera.zoom = 0.45
stage.camera.updateProjectionMatrix()

function updateIntro(dt: number) {
  if (intro.t < 0 || intro.t > 90) return
  intro.t += dt

  // 방이 "뽕" 하고 튀어나와요
  const roomT = THREE.MathUtils.clamp(intro.t / 0.7, 0, 1)
  room.group.scale.setScalar(Math.max(easeOutBack(roomT), 0.001))

  // 나무 · 꽃이 하나씩 쏙쏙 솟아나요
  nature.children.forEach((item, i) => {
    const t = THREE.MathUtils.clamp((intro.t - 0.3 - i * 0.05) / 0.5, 0, 1)
    item.scale.setScalar(Math.max(easeOutBack(t), 0.001))
  })

  // 캐릭터가 위에서 떨어져 착지해요
  if (character && intro.t < 1.5) {
    const dropT = THREE.MathUtils.clamp((intro.t - 0.6) / 0.8, 0, 1)
    character.root.visible = intro.t > 0.6
    character.root.position.y = (1 - easeOutBounce(dropT)) * 4
  }

  if (intro.t > 1.4 && pointer) pointer.enabled = true
  // 집 전체를 보여준 뒤 카메라가 캐릭터를 따라가기 시작해요
  if (intro.t > 1.6 && character) stage.followTarget = character.root.position
  if (intro.t > 2 + nature.children.length * 0.05) intro.t = 99 // 인트로 끝
}

loader.start([fontsReady]).then(() => {
  character = new Character()
  character.root.position.set(0.4, 4, 0.8)
  character.root.visible = false
  stage.scene.add(character.root, character.emotes, createLabels())

  character.onStep = (x, y, z, yaw) => footprints.stamp(x, y, z, yaw)
  // 책상에 앉으면 타자 연습 창, 일어나면 창을 닫아요
  character.onAction = (action) => {
    if (action === 'sit') sitAtDesk()
    else if (action === null) leaveDesk()
  }
  pointer = new Pointer(stage, room, paper.ground, character, marker, hintEl, controls)
  stage.zoomTarget = 1
  intro.t = 0
})

// ---------- 타자 연습 (책상에 앉으면) ----------
const typing = new TypingApp()
let zoomBeforeTyping = 1
let atDesk = false
let typingTimer = 0
/** 3D 아이맥 화면: 꺼져 있다가 앉으면 환하게 켜져요 */
const SCREEN_OFF = new THREE.Color('#4a4d55')
const SCREEN_ON = new THREE.Color('#ffffff')

function sitAtDesk() {
  // 모바일은 화면 키보드로 치기 불편해서 타자연습 창 없이 예전처럼 앉아서 공부하는 척만 해요
  if (isTouchDevice()) return
  atDesk = true
  zoomBeforeTyping = stage.zoomTarget
  stage.zoomTarget = Math.max(stage.zoomTarget, 1.8)
  // 모니터가 먼저 켜지고, 이어서 타자연습 창이 TV처럼 켜져요
  typingTimer = window.setTimeout(() => typing.open(), 450)
}

function leaveDesk() {
  if (!atDesk) return
  atDesk = false
  window.clearTimeout(typingTimer)
  stage.zoomTarget = zoomBeforeTyping
  typing.close()
}

typing.onKey = () => character?.typeKey()
typing.onHit = () => character?.smile(0.8)
typing.onClose = () => {
  leaveDesk()
  character?.standUp()
}

// ---------- 줌 버튼 ----------
document.getElementById('zoom-in')!.addEventListener('click', () => stage.zoomBy(1.25))
document.getElementById('zoom-out')!.addEventListener('click', () => stage.zoomBy(0.8))

// 개발 중에만 콘솔에서 상태를 확인할 수 있게 열어둬요 (예: __app.stage.camera.zoom)
if (import.meta.env.DEV) {
  Object.assign(window, { __app: { stage, room, intro, get character() { return character }, get pointer() { return pointer } } })
}

// ---------- 렌더 루프 ----------
const timer = new THREE.Timer()
stage.renderer.setAnimationLoop((time) => {
  timer.update(time)
  const dt = Math.min(timer.getDelta(), 0.05)
  updateIntro(dt)
  if (character && intro.t > 1.4) character.update(dt)
  marker.update(dt)
  typing.update(dt)
  room.monitorScreen.color.lerp(atDesk ? SCREEN_ON : SCREEN_OFF, 1 - Math.exp(-dt * 6))
  footprints.update(dt)
  stage.update(dt)
})
