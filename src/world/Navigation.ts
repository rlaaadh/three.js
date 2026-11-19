import * as THREE from 'three'
import { PAPER_Y } from './Paper'

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** 침실과 주방 경계 (반쪽 칸막이 벽이 있는 x) */
export const PARTITION_X = 3.2
/** 침실 바닥 판 범위 */
export const BEDROOM: Rect = { minX: -3.2, maxX: PARTITION_X, minZ: -3.2, maxZ: 3.2 }
/** 주방 · 식탁 바닥 판 범위 (침실보다 오른쪽으로 조금 더 넓어요) */
export const KITCHEN: Rect = { minX: PARTITION_X, maxX: 10.4, minZ: -3.2, maxZ: 3.2 }
/** 집 안에서 걸어갈 수 있는 범위: 바깥 가장자리에서 조금 안쪽 (침실 ↔ 주방 경계는 그대로 이어져요) */
const HOUSE_WALKABLE: [room: Rect, walk: Rect][] = [
  [BEDROOM, { minX: -2.6, maxX: PARTITION_X, minZ: -2.6, maxZ: 2.6 }],
  [KITCHEN, { minX: PARTITION_X, maxX: KITCHEN.maxX - 0.6, minZ: -2.6, maxZ: 2.6 }],
]
/** 종이 위에서 걸어갈 수 있는 범위 */
const WORLD: Rect = { minX: -8.5, maxX: 15, minZ: -8.5, maxZ: 9 }
/** 캐릭터 몸 두께만큼 벽과 띄우는 여유 */
const MARGIN = 0.3
/** 가구와 띄우는 여유 (클릭 · 드래그 모두 가구를 통과하지 않아요) */
const FURNITURE_MARGIN = 0.25

const grow = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m })

/** 지나갈 수 없는 영역: 왼쪽 벽, 뒤쪽 벽, 침실 · 주방 사이 칸막이 */
const HOUSE_BLOCKERS: Rect[] = [
  grow({ minX: -3.2, maxX: -3.0, minZ: -3.2, maxZ: 3.2 }, MARGIN),
  grow({ minX: -3.2, maxX: KITCHEN.maxX, minZ: -3.2, maxZ: -3.0 }, MARGIN),
  grow({ minX: PARTITION_X - 0.1, maxX: PARTITION_X + 0.1, minZ: -3.2, maxZ: -1.6 }, MARGIN),
]

/**
 * 걸어 다니는 규칙 묶음: 집과 게임방이 하나씩 갖고, 지금 있는 곳 것으로 바꿔 끼워요 (setNavLayout)
 * - walkable: [바닥 판, 그 안에서 걸을 수 있는 범위]
 * - blockers: 벽 (캐릭터 몸 두께만큼 넓혀서)
 * - furniture: 통과하지 못하는 가구 · 화분 · 나무
 */
export interface NavLayout {
  walkable: [room: Rect, walk: Rect][]
  blockers: Rect[]
  furniture: Rect[]
}

export const HOUSE_LAYOUT: NavLayout = {
  walkable: HOUSE_WALKABLE,
  blockers: HOUSE_BLOCKERS,
  furniture: [],
}

let layout = HOUSE_LAYOUT

export function setNavLayout(next: NavLayout) {
  layout = next
}

/** 왼쪽 · 뒤쪽 벽만 있는 방 하나짜리 규칙 (게임방) */
export function singleRoomLayout(room: Rect, objects: THREE.Object3D[]): NavLayout {
  return {
    walkable: [[room, { minX: room.minX + 0.6, maxX: room.maxX - 0.6, minZ: room.minZ + 0.6, maxZ: room.maxZ - 0.6 }]],
    blockers: [
      grow({ minX: room.minX, maxX: room.minX + 0.2, minZ: room.minZ, maxZ: room.maxZ }, MARGIN),
      grow({ minX: room.minX, maxX: room.maxX, minZ: room.minZ, maxZ: room.minZ + 0.2 }, MARGIN),
    ],
    furniture: obstacleRects(objects),
  }
}

/** 가구 오브젝트들의 바닥 영역 */
function obstacleRects(objects: THREE.Object3D[]) {
  const box = new THREE.Box3()
  return objects.map((o) => {
    box.setFromObject(o)
    return grow({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z }, FURNITURE_MARGIN)
  })
}

/** 집 가구를 장애물로 등록해요 (Room이 만들어질 때) */
export function setObstacles(objects: THREE.Object3D[]) {
  HOUSE_LAYOUT.furniture = obstacleRects(objects)
}

/** 집 밖 나무 · 꽃처럼 나중에 다 자란 물건을 장애물로 더해요 (인트로가 끝난 뒤) */
export function addObstacles(objects: THREE.Object3D[]) {
  HOUSE_LAYOUT.furniture.push(...obstacleRects(objects))
}

const inRect = (r: Rect, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ

const onRect = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ

/** 지금 있는 곳(집 · 게임방)의 바닥 판 위인지 */
export const isInsideHouse = (x: number, z: number) => layout.walkable.some(([room]) => onRect(room, x, z))

/** 집 안은 마룻바닥 높이(0), 집 밖은 종이 높이 */
export const groundHeight = (x: number, z: number) => (isInsideHouse(x, z) ? 0 : PAPER_Y)

/** 클릭한 지점을 걸어갈 수 있는 위치로 보정해요 */
export function clampTarget(point: THREE.Vector3) {
  const t = new THREE.Vector3(point.x, 0, point.z)
  const limit = layout.walkable.find(([room]) => onRect(room, t.x, t.z))?.[1] ?? WORLD
  t.x = THREE.MathUtils.clamp(t.x, limit.minX, limit.maxX)
  t.z = THREE.MathUtils.clamp(t.z, limit.minZ, limit.maxZ)

  // 벽 영역 안이면 가장 가까운 바깥 가장자리로 밀어내요
  for (const r of layout.blockers) {
    if (!inRect(r, t.x, t.z)) continue
    const options = [
      { d: t.x - r.minX, apply: () => (t.x = r.minX - 0.01) },
      { d: r.maxX - t.x, apply: () => (t.x = r.maxX + 0.01) },
      { d: t.z - r.minZ, apply: () => (t.z = r.minZ - 0.01) },
      { d: r.maxZ - t.z, apply: () => (t.z = r.maxZ + 0.01) },
    ]
    options.sort((a, b) => a.d - b.d)[0].apply()
  }
  t.y = groundHeight(t.x, t.z)
  return t
}

/**
 * 드래그로 걸을 때 한 걸음 움직인 위치를 돌려줘요.
 * 벽 · 가구에 막히면 막히지 않은 축으로만 미끄러지듯 움직여요.
 * (출발점이 이미 걸쳐 있는 영역은 빠져나올 수 있게 무시해요)
 */
export function slideMove(from: THREE.Vector3, dx: number, dz: number) {
  const solids = [...layout.blockers, ...layout.furniture].filter((r) => !inRect(r, from.x, from.z))
  const free = (x: number, z: number) =>
    x >= WORLD.minX && x <= WORLD.maxX && z >= WORLD.minZ && z <= WORLD.maxZ && solids.every((r) => !inRect(r, x, z))

  if (free(from.x + dx, from.z + dz)) return { x: from.x + dx, z: from.z + dz }
  if (free(from.x + dx, from.z)) return { x: from.x + dx, z: from.z }
  if (free(from.x, from.z + dz)) return { x: from.x, z: from.z + dz }
  return { x: from.x, z: from.z }
}

/** 선분이 사각형 내부를 지나는지 (Liang–Barsky) */
function segmentHitsRect(a: THREE.Vector3, b: THREE.Vector3, r: Rect) {
  const eps = 1e-3
  const dx = b.x - a.x
  const dz = b.z - a.z
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q > 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return (
    clip(-dx, a.x - (r.minX + eps)) &&
    clip(dx, r.maxX - eps - a.x) &&
    clip(-dz, a.z - (r.minZ + eps)) &&
    clip(dz, r.maxZ - eps - a.z) &&
    t1 - t0 > eps
  )
}

/** 길찾기 칸 크기 (m) */
const CELL = 0.15

/** 지나갈 수 없는 곳: 벽 + 가구. 출발점이 이미 걸쳐 있는 영역은 빠져나올 수 있게 빼요 */
function solidsFrom(from: THREE.Vector3) {
  return [...layout.blockers, ...layout.furniture].filter((r) => !inRect(r, from.x, from.z))
}

function isClear(a: THREE.Vector3, b: THREE.Vector3, solids: Rect[]) {
  return solids.every((r) => !segmentHitsRect(a, b, r))
}

/** 아주 작은 최소 힙 (A* 열린 목록) */
class Heap {
  private readonly items: number[] = []
  constructor(private readonly score: Float32Array) {}
  get size() {
    return this.items.length
  }
  push(v: number) {
    const a = this.items
    a.push(v)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.score[a[p]] <= this.score[a[i]]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/**
 * from → to 경로를 지나갈 점 목록으로 돌려줘요 (출발점 제외).
 * 벽뿐 아니라 가구도 통과하지 않아요: 바닥을 작은 칸으로 나눠 A*로 길을 찾고, 직선으로 갈 수 있는 구간은 펴요.
 * 목표가 가구 위(둘레 여유 포함)면 가장 가까운 빈 바닥까지만 가요.
 */
export function planPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const solids = solidsFrom(from)
  const free = (x: number, z: number) => solids.every((r) => !inRect(r, x, z))
  if (free(to.x, to.z) && isClear(from, to, solids)) return [to.clone()]

  const cols = Math.ceil((WORLD.maxX - WORLD.minX) / CELL)
  const rows = Math.ceil((WORLD.maxZ - WORLD.minZ) / CELL)
  const cx = (c: number) => WORLD.minX + (c + 0.5) * CELL
  const cz = (r: number) => WORLD.minZ + (r + 0.5) * CELL
  const cellOf = (x: number, z: number) => {
    const c = THREE.MathUtils.clamp(Math.floor((x - WORLD.minX) / CELL), 0, cols - 1)
    const r = THREE.MathUtils.clamp(Math.floor((z - WORLD.minZ) / CELL), 0, rows - 1)
    return r * cols + c
  }
  const blocked = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) blocked[r * cols + c] = free(cx(c), cz(r)) ? 0 : 1

  // 목표 칸이 막혀 있으면 가장 가까운 빈 칸으로 (넓혀 가며 찾기)
  let goal = cellOf(to.x, to.z)
  let target = to.clone()
  if (blocked[goal]) {
    const gc = goal % cols
    const gr = Math.floor(goal / cols)
    let best = -1
    let bestD = Infinity
    for (let ring = 1; ring < 40 && best < 0; ring++) {
      for (let r = gr - ring; r <= gr + ring; r++) {
        for (let c = gc - ring; c <= gc + ring; c++) {
          if (r < 0 || c < 0 || r >= rows || c >= cols || blocked[r * cols + c]) continue
          const d = Math.hypot(cx(c) - to.x, cz(r) - to.z)
          if (d < bestD) {
            bestD = d
            best = r * cols + c
          }
        }
      }
    }
    if (best < 0) return []
    goal = best
    target = new THREE.Vector3(cx(goal % cols), to.y, cz(Math.floor(goal / cols)))
    if (isClear(from, target, solids)) return [target]
  }

  const start = cellOf(from.x, from.z)
  blocked[start] = 0
  const g = new Float32Array(cols * rows).fill(Infinity)
  const f = new Float32Array(cols * rows).fill(Infinity)
  const prev = new Int32Array(cols * rows).fill(-1)
  const closed = new Uint8Array(cols * rows)
  const gc = goal % cols
  const gr = Math.floor(goal / cols)
  const h = (i: number) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr)
  const open = new Heap(f)
  g[start] = 0
  f[start] = h(start)
  open.push(start)
  const steps: [number, number, number][] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ]
  let found = false
  while (open.size) {
    const u = open.pop()
    if (closed[u]) continue
    if (u === goal) {
      found = true
      break
    }
    closed[u] = 1
    const uc = u % cols
    const ur = Math.floor(u / cols)
    for (const [dc, dr, cost] of steps) {
      const c = uc + dc
      const r = ur + dr
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue
      const v = r * cols + c
      if (blocked[v] || closed[v]) continue
      // 대각선은 양옆이 다 비어 있을 때만 (모서리를 깎아 지나가지 않게)
      if (dc && dr && (blocked[ur * cols + c] || blocked[r * cols + uc])) continue
      const nd = g[u] + cost
      if (nd < g[v]) {
        g[v] = nd
        f[v] = nd + h(v)
        prev[v] = u
        open.push(v)
      }
    }
  }
  if (!found) return []

  // 칸 경로 → 직선으로 이어지는 구간은 건너뛰어 꺾이는 점만 남겨요
  const cells: THREE.Vector3[] = []
  for (let i = goal; i !== start && i >= 0; i = prev[i]) cells.unshift(new THREE.Vector3(cx(i % cols), 0, cz(Math.floor(i / cols))))
  cells[cells.length - 1] = target
  const path: THREE.Vector3[] = []
  let at = from.clone()
  let i = 0
  while (i < cells.length) {
    let j = cells.length - 1
    while (j > i && !isClear(at, cells[j], solids)) j--
    path.push(cells[j])
    at = cells[j]
    i = j + 1
  }
  return path
}
