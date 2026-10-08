import './style.css'
import * as THREE from 'three'
import { Stage } from './core/Stage'
import { Loader } from './core/Loader'
import { createPaper } from './world/Paper'
import { Room } from './world/Room'
import { Character } from './world/Character'
import { createLabels, LABEL_TEXTS } from './world/Labels'
import { ClickMarker } from './world/ClickMarker'
import { Footprints } from './world/Footprints'
import { createNature } from './world/Nature'
import { Pointer } from './interaction/Pointer'
import { SpeechBubble } from './ui/SpeechBubble'
import { burstHearts } from './ui/HeartBurst'
import { toScreen } from './ui/screen'
import { loadHandFont } from './utils/fonts'
import { easeOutBack, easeOutBounce } from './utils/math'

const canvas = document.getElementById('webgl') as HTMLCanvasElement
const hintEl = document.getElementById('hint')!

const stage = new Stage(canvas)
const loader = new Loader()

// 손글씨 폰트가 준비돼야 캔버스(3D 바닥 글씨 · Zzz)가 제대로 그려져요
const fontsReady = loadHandFont([...Object.values(LABEL_TEXTS), 'zZ'])

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
stage.camera.zoom = 0.55
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
  if (intro.t > 2 + nature.children.length * 0.05) intro.t = 99 // 인트로 끝
}

loader.start([fontsReady]).then(() => {
  character = new Character()
  character.root.position.set(0.4, 4, 0.8)
  character.root.visible = false
  stage.scene.add(character.root, character.zzz, createLabels())

  character.onStep = (x, y, z, yaw) => footprints.stamp(x, y, z, yaw)
  pointer = new Pointer(stage, room, paper.ground, character, marker, hintEl)
  stage.zoomTarget = 1
  intro.t = 0
})

// ---------- 말풍선 · 채팅 · 손 흔들기 ----------
const bubble = new SpeechBubble()
const chatForm = document.getElementById('chat-form') as HTMLFormElement
const chatInput = document.getElementById('chat-input') as HTMLInputElement

chatInput.addEventListener('keydown', (e) => {
  // 한글 입력 중(조합 중) Enter는 글자 확정용이라 전송하지 않아요
  if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault()
})
chatForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const text = chatInput.value.trim()
  if (!text || !character) return
  bubble.show(text)
  chatInput.value = ''
})

document.getElementById('wave')!.addEventListener('click', () => {
  if (!character) return
  character.wave()
  bubble.show('안녕! 👋', 2.2)
})

document.getElementById('heart')!.addEventListener('click', () => {
  if (!character) return
  character.smile()
  // 얼굴 주변에서 하트가 퐁퐁
  const head = character.getHeadTop(new THREE.Vector3())
  head.y -= 0.45
  const { x, y } = toScreen(head, stage.camera, canvas)
  burstHearts(x, y)
})

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
  footprints.update(dt)
  if (character) bubble.update(dt, stage.camera, canvas, (v) => character!.getHeadTop(v))
  stage.update(dt)
})
