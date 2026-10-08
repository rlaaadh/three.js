import * as THREE from 'three'
import { PAPER_Y } from './Paper'

/** 방 바닥 판의 절반 크기 */
export const ROOM_HALF = 3.2
/** 방 안에서 걸어갈 수 있는 범위 */
const INSIDE_LIMIT = 2.6
/** 종이 위에서 걸어갈 수 있는 범위 */
const WORLD_LIMIT = 8.5
/** 캐릭터 몸 두께만큼 벽과 띄우는 여유 */
const MARGIN = 0.3

interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** 지나갈 수 없는 영역: 왼쪽 벽(x≈-3.1)과 뒤쪽 벽(z≈-3.1) */
const BLOCKERS: Rect[] = [
  { minX: -3.2 - MARGIN, maxX: -3.0 + MARGIN, minZ: -3.2 - MARGIN, maxZ: 3.2 + MARGIN },
  { minX: -3.2 - MARGIN, maxX: 3.2 + MARGIN, minZ: -3.2 - MARGIN, maxZ: -3.0 + MARGIN },
]

/** 벽 끝을 돌아가기 위한 경유 지점 */
const WAYPOINTS = [
  new THREE.Vector3(-2.4, 0, 3.95), // 방 앞쪽으로 나와서 왼쪽 벽 끝 옆
  new THREE.Vector3(3.95, 0, -2.4), // 방 오른쪽으로 나와서 뒤쪽 벽 끝 옆
  new THREE.Vector3(-3.9, 0, 4.2), // 왼쪽 벽 앞쪽 끝
  new THREE.Vector3(4.2, 0, -3.9), // 뒤쪽 벽 오른쪽 끝
  new THREE.Vector3(-3.9, 0, -3.9), // 두 벽이 만나는 모서리 바깥
]

export const isInsideRoom = (x: number, z: number) => Math.abs(x) <= ROOM_HALF && Math.abs(z) <= ROOM_HALF

/** 방 안은 마룻바닥 높이(0), 방 밖은 종이 높이 */
export const groundHeight = (x: number, z: number) => (isInsideRoom(x, z) ? 0 : PAPER_Y)

const inRect = (r: Rect, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ

/** 클릭한 지점을 걸어갈 수 있는 위치로 보정해요 */
export function clampTarget(point: THREE.Vector3) {
  const t = new THREE.Vector3(point.x, 0, point.z)
  const limit = isInsideRoom(t.x, t.z) ? INSIDE_LIMIT : WORLD_LIMIT
  t.x = THREE.MathUtils.clamp(t.x, -limit, limit)
  t.z = THREE.MathUtils.clamp(t.z, -limit, limit)

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
