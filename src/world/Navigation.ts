import * as THREE from 'three'
import { PAPER_Y } from './Paper'

interface Rect {
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
const WALKABLE: [room: Rect, walk: Rect][] = [
  [BEDROOM, { minX: -2.6, maxX: PARTITION_X, minZ: -2.6, maxZ: 2.6 }],
  [KITCHEN, { minX: PARTITION_X, maxX: KITCHEN.maxX - 0.6, minZ: -2.6, maxZ: 2.6 }],
]
/** 종이 위에서 걸어갈 수 있는 범위 */
const WORLD: Rect = { minX: -8.5, maxX: 15, minZ: -8.5, maxZ: 9 }
/** 캐릭터 몸 두께만큼 벽과 띄우는 여유 */
const MARGIN = 0.3
/** 가구와 띄우는 여유 (드래그로 걸을 때만 가구를 피해요) */
const FURNITURE_MARGIN = 0.25

const grow = (r: Rect, m: number): Rect => ({ minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m })

/** 지나갈 수 없는 영역: 왼쪽 벽, 뒤쪽 벽, 침실 · 주방 사이 칸막이 */
const BLOCKERS: Rect[] = [
  grow({ minX: -3.2, maxX: -3.0, minZ: -3.2, maxZ: 3.2 }, MARGIN),
  grow({ minX: -3.2, maxX: KITCHEN.maxX, minZ: -3.2, maxZ: -3.0 }, MARGIN),
  grow({ minX: PARTITION_X - 0.1, maxX: PARTITION_X + 0.1, minZ: -3.2, maxZ: -1.6 }, MARGIN),
]

/** 벽 끝을 돌아가기 위한 경유 지점 */
const WAYPOINTS = [
  new THREE.Vector3(-2.4, 0, 3.95), // 집 앞쪽으로 나와서 왼쪽 벽 끝 옆
  new THREE.Vector3(-3.9, 0, 4.2), // 왼쪽 벽 앞쪽 끝
  new THREE.Vector3(-3.9, 0, -3.9), // 두 벽이 만나는 모서리 바깥
  new THREE.Vector3(KITCHEN.maxX + 0.75, 0, -2.4), // 집 오른쪽으로 나와서 뒤쪽 벽 끝 옆
  new THREE.Vector3(KITCHEN.maxX + 1.0, 0, -3.9), // 뒤쪽 벽 오른쪽 끝
  new THREE.Vector3(PARTITION_X - 0.55, 0, -1.15), // 칸막이 앞 (침실 쪽)
  new THREE.Vector3(PARTITION_X + 0.55, 0, -1.15), // 칸막이 앞 (주방 쪽)
]

/** 가구 영역 (Room이 만들어질 때 채워요) */
let furniture: Rect[] = []

/** 가구 오브젝트들의 바닥 영역을 장애물로 등록해요 */
export function setObstacles(objects: THREE.Object3D[]) {
  const box = new THREE.Box3()
  furniture = objects.map((o) => {
    box.setFromObject(o)
    return grow({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z }, FURNITURE_MARGIN)
  })
}

const inRect = (r: Rect, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ

const onRect = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ

export const isInsideHouse = (x: number, z: number) => onRect(BEDROOM, x, z) || onRect(KITCHEN, x, z)

/** 집 안은 마룻바닥 높이(0), 집 밖은 종이 높이 */
export const groundHeight = (x: number, z: number) => (isInsideHouse(x, z) ? 0 : PAPER_Y)

/** 클릭한 지점을 걸어갈 수 있는 위치로 보정해요 */
export function clampTarget(point: THREE.Vector3) {
  const t = new THREE.Vector3(point.x, 0, point.z)
  const limit = WALKABLE.find(([room]) => onRect(room, t.x, t.z))?.[1] ?? WORLD
  t.x = THREE.MathUtils.clamp(t.x, limit.minX, limit.maxX)
  t.z = THREE.MathUtils.clamp(t.z, limit.minZ, limit.maxZ)

  // 벽 영역 안이면 가장 가까운 바깥 가장자리로 밀어내요
  for (const r of BLOCKERS) {
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
  const solids = [...BLOCKERS, ...furniture].filter((r) => !inRect(r, from.x, from.z))
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

function isClear(a: THREE.Vector3, b: THREE.Vector3) {
  // 출발점이 이미 벽 영역에 걸쳐 있으면 그 벽은 무시해요 (빠져나올 수 있게)
  return BLOCKERS.every((r) => inRect(r, a.x, a.z) || !segmentHitsRect(a, b, r))
}

/**
 * from → to 경로를 경유 지점 목록으로 돌려줘요 (출발점 제외).
 * 노드가 몇 개 안 돼서 단순한 다익스트라로 충분해요.
 */
export function planPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const nodes = [from, ...WAYPOINTS, to]
  const end = nodes.length - 1
  const dist = nodes.map(() => Infinity)
  const prev = nodes.map(() => -1)
  const done = nodes.map(() => false)
  dist[0] = 0

  for (let iter = 0; iter < nodes.length; iter++) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || dist[u] === Infinity) break
    done[u] = true
    if (u === end) break
    for (let v = 0; v < nodes.length; v++) {
      if (done[v] || !isClear(nodes[u], nodes[v])) continue
      const d = dist[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z)
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
      }
    }
  }

  if (prev[end] < 0) return [to.clone()]
  const path: THREE.Vector3[] = []
  for (let i = end; i > 0; i = prev[i]) path.unshift(nodes[i].clone())
  return path
}
