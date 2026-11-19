import './style.css'
import * as THREE from 'three'
import { Stage } from './core/Stage'
import { Loader } from './core/Loader'
import { createPaper } from './world/Paper'
import { Room } from './world/Room'
import { HOUSE_LAYOUT, addObstacles, setNavLayout } from './world/Navigation'
import { Character, EMOTE_TEXTS } from './world/Character'
import { createLabels, LABEL_TEXTS } from './world/Labels'
import { ClickMarker } from './world/ClickMarker'
import { Footprints } from './world/Footprints'
import { createNature } from './world/Nature'
import { Pointer } from './interaction/Pointer'
import { CameraControls } from './interaction/CameraControls'
import { TypingApp } from './ui/typing/TypingApp'
import { DishGame } from './ui/DishGame'
import { ChocoGame } from './ui/ChocoGame'
import { SleepGame } from './ui/SleepGame'
import { Chiptune } from './ui/Chiptune'
import { Iris } from './ui/Iris'
import { Kkomantle } from './ui/kkomantle/Kkomantle'
import { JellyGame } from './ui/jelly/JellyGame'
import { GameRoom, GAME_ROOM_HINTS, GAME_ROOM_LABELS } from './world/GameRoom'
import { DEFAULT_HINT } from './interaction/Pointer'
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
const fontsReady = loadHandFont([...Object.values(LABEL_TEXTS), ...Object.values(EMOTE_TEXTS), ...Object.values(GAME_ROOM_LABELS), 'zZ'])

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
  if (intro.t > 2 + nature.children.length * 0.05) {
    intro.t = 99 // 인트로 끝
    // 다 자란 나무 · 꽃도 통과하지 못하게 장애물로 더해요
    nature.updateMatrixWorld(true)
    addObstacles(nature.children)
  }
}

// 폰트가 오면 캐릭터 · 바닥 글씨를 로딩 화면 뒤에서 미리 만들고, 셰이더 컴파일 · 텍스처 업로드까지 끝내둬요
// (로딩이 끝난 뒤에 처음 그리면 그 순간 화면이 1초쯤 멈춰요)
const sceneReady = fontsReady
  .catch(() => {})
  .then(async () => {
    character = new Character()
    character.root.position.set(0.4, 4, 0.8)
    // 게임방도 같은 자리에 미리 만들어 두고 (숨겨 둠) 셰이더까지 같이 준비해요
    gameRoom = new GameRoom()
    stage.scene.add(character.root, character.emotes, houseLabels, gameRoom.group)
    gameRoom.group.visible = true
    await stage.renderer.compileAsync(stage.scene, stage.camera)
    gameRoom.group.visible = false
    // 로딩 화면이 덮고 있는 동안 한 프레임 그려서 그림자 · 텍스처까지 GPU에 올려요
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    character.root.visible = false
  })

loader.start([sceneReady]).then(() => {
  if (!character) return
  character.onStep = (x, y, z, yaw) => footprints.stamp(x, y, z, yaw)
  // 책상에 앉으면 타자 연습, 싱크대 앞에 서면 설거지 게임, 냉장고 앞에 서면 얼초 만들기, 일어나면 창을 닫아요
  character.onAction = (action) => {
    if (action === null) endActivity()
    else if (action === 'door') void (place === 'house' ? enterGameRoom() : leaveGameRoom())
    else startActivity(action)
  }
  pointer = new Pointer(stage, room, paper.ground, character, marker, hintEl, controls)
  // 게임방에서 아직 준비 중인 물건(오락기 · 런닝머신 · 짐볼)을 누르면 통 튀고 안내만 해요
  pointer.onItem = (obj) => {
    gameRoom?.bounce(obj)
    character?.smile(0.8)
    hintEl.textContent = obj.userData.hint
  }
  stage.zoomTarget = 1
  intro.t = 0
})

// ---------- 앱 창: 타자 연습 (책상) · 설거지 게임 (싱크대) · 얼초 만들기 (냉장고) · 완벽한 잠을 사수하라 (침대) ----------
// 배경음악 · 효과음은 하나를 같이 써요 (♪로 끄면 둘 다 꺼져요)
const music = new Chiptune()
const typing = new TypingApp(music)
const dishes = new DishGame(music)
const choco = new ChocoGame(music)
const sleep = new SleepGame(music)
const kkomantle = new Kkomantle(music)
const jelly = new JellyGame(music)
let zoomBeforeApp = 1
/** 지금 창을 띄운 동작 (sit: 타자 연습, wash: 설거지, chill: 얼초 만들기, lie: 완벽한 잠을 사수하라, read: 꼬맨틀, play: 말랑젤리 쌓기) */
type Activity = 'sit' | 'wash' | 'chill' | 'lie' | 'read' | 'play'
let activity: Activity | null = null
let openTimer = 0
/** 3D 아이맥 화면: 꺼져 있다가 책상에 앉으면 환하게 켜져요 */
const SCREEN_OFF = new THREE.Color('#4a4d55')
const SCREEN_ON = new THREE.Color('#ffffff')

function startActivity(action: string) {
  if (action !== 'sit' && action !== 'wash' && action !== 'chill' && action !== 'lie' && action !== 'read' && action !== 'play') return
  activity = action
  zoomBeforeApp = stage.zoomTarget
  stage.zoomTarget = Math.max(stage.zoomTarget, 1.8)
  // 모니터가 먼저 켜지거나 싱크대 · 냉장고 앞에 서거나 침대에 누운 뒤, 창이 TV처럼 켜져요
  const app = { sit: typing, wash: dishes, chill: choco, lie: sleep, read: kkomantle, play: jelly }[action]
  openTimer = window.setTimeout(() => app.open(), 450)
}

function endActivity() {
  if (!activity) return
  activity = null
  window.clearTimeout(openTimer)
  stage.zoomTarget = zoomBeforeApp
  typing.close()
  dishes.close()
  choco.close()
  sleep.close()
  kkomantle.close()
  jelly.close()
}

function onAppClose() {
  endActivity()
  character?.standUp()
}

typing.onKey = () => character?.typeKey()
typing.onHit = () => character?.smile(0.8)
typing.onClose = onAppClose
dishes.onScrub = () => character?.scrub()
dishes.onDish = () => character?.smile(0.8)
dishes.onClose = onAppClose
choco.onWork = () => character?.knead()
choco.onGood = () => character?.smile(0.8)
choco.onClose = onAppClose
// 꿈속에서 양 · 별을 모으면 자면서 방긋
sleep.onCollect = () => character?.smile(0.8)
sleep.onClose = onAppClose
// 꼬맨틀 정답을 맞히면 방긋
kkomantle.onSolve = () => character?.smile(2)
kkomantle.onClose = onAppClose
// 말랑젤리: 젤리를 움직이면 버튼 딸깍딸깍, 줄을 터뜨리면 방긋
jelly.onPlay = () => character?.pressButtons()
jelly.onClear = () => character?.smile(0.8)
jelly.onClose = onAppClose

// ---------- 게임방: 문을 누르면 베이지색 동그라미가 오므라들었다가 게임방에서 다시 열려요 ----------
// 게임방은 집과 같은 자리에 겹쳐 있고, 지나갈 때 집 · 게임방 중 하나만 보여요. 카메라 · 걷기 · 클릭은 그대로 같이 써요
const iris = new Iris()
const houseLabels = createLabels()
/** 지금 있는 곳 (moving: 화면 전환 중) */
let place: 'house' | 'moving' | 'game' = 'house'
let gameRoom: GameRoom | null = null
const backHomeEl = document.getElementById('back-home')!

/** 캐릭터 가슴께가 화면 어디에 있는지 (px) */
function characterOnScreen() {
  const v = character!.root.position.clone().setY(character!.root.position.y + 0.9).project(stage.camera)
  return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }
}

/** 집 ↔ 게임방: 화면이 덮인 동안 보이는 방 · 걷기 규칙 · 누를 것 목록을 바꾸고, 캐릭터를 문 앞에 세워요 */
async function switchPlace(to: 'house' | 'game') {
  if (!character || !pointer || !gameRoom || place === 'moving' || place === to) return
  place = 'moving'
  pointer.enabled = false
  character.steer(null)
  const from = characterOnScreen()
  await iris.close(from.x, from.y)

  const game = to === 'game'
  room.group.visible = !game
  houseLabels.visible = !game
  gameRoom.group.visible = game
  footprints.group.visible = !game
  setNavLayout(game ? gameRoom.layout : HOUSE_LAYOUT)
  pointer.room = game ? gameRoom : room
  pointer.defaultHint = game ? GAME_ROOM_HINTS.default : DEFAULT_HINT
  hintEl.textContent = pointer.defaultHint
  document.body.classList.toggle('is-game-room', game)
  // 들어온 문 앞에 서서 방 안쪽을 봐요
  if (game) character.placeAt(gameRoom.spawn, gameRoom.spawnYaw)
  else character.placeAt(room.doorSpot.approach, 0)
  // 카메라도 캐릭터 쪽으로 바로 옮겨요
  stage.focus.set(character.root.position.x, stage.focus.y, character.root.position.z)
  stage.update(0)

  const at = characterOnScreen()
  await iris.open(at.x, at.y)
  place = to
  pointer.enabled = true
}

const enterGameRoom = () => switchPlace('game')
const leaveGameRoom = () => switchPlace('house')
backHomeEl.addEventListener('click', () => void leaveGameRoom())

// ---------- 줌 버튼 ----------
document.getElementById('zoom-in')!.addEventListener('click', () => stage.zoomBy(1.25))
document.getElementById('zoom-out')!.addEventListener('click', () => stage.zoomBy(0.8))

// 개발 중에만 콘솔에서 상태를 확인할 수 있게 열어둬요 (예: __app.stage.camera.zoom)
if (import.meta.env.DEV) {
  Object.assign(window, { __app: { stage, room, intro, choco, sleep, enterGameRoom, leaveGameRoom, kkomantle, jelly, get gameRoom() { return gameRoom }, get character() { return character }, get pointer() { return pointer } } })
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
  dishes.update(dt)
  choco.update(dt)
  sleep.update(dt)
  jelly.update(dt)
  room.monitorScreen.color.lerp(activity === 'sit' ? SCREEN_ON : SCREEN_OFF, 1 - Math.exp(-dt * 6))
  footprints.update(dt)
  gameRoom?.update(dt)
  stage.update(dt)
})
