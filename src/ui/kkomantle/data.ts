import { ANSWER_WORDS } from './answers'

/**
 * 꼬맨틀 단어 데이터 (public/kkomantle/, scripts/build-kkomantle-data.py로 만들어요).
 * 단어마다 int8 벡터가 있고, 두 단어의 유사도는 코사인 유사도(벡터 곱)예요.
 * 처음 게임을 열 때 한 번만 받아요 (약 3MB).
 */

export interface WordData {
  words: string[]
  /** 단어 → 번호 */
  index: Map<string, number>
  vectors: Int8Array
  dim: number
  /** 정답 후보 단어 번호 */
  answers: number[]
}

/** 비밀 단어 하나에 대한 계산 결과 */
export interface Round {
  answer: number
  /** 모든 단어의 유사도 (-1 ~ 1) */
  sims: Float32Array
  /** 단어 번호 → 순위 (정답 0, 가장 가까운 단어 1, ...) */
  rank: Int32Array
  /** 가까운 순서대로 단어 번호 (0번은 정답) */
  order: Int32Array
}

/** 순위를 알려 주는 범위 (그 밖은 "1000위 밖") */
export const RANK_SHOWN = 1000

let loading: Promise<WordData> | null = null

export function loadWords(): Promise<WordData> {
  loading ??= (async () => {
    const base = `${import.meta.env.BASE_URL}kkomantle/`
    const [meta, text, bin] = await Promise.all([
      fetch(`${base}meta.json`).then((r) => ok(r).json()),
      fetch(`${base}words.txt`).then((r) => ok(r).text()),
      fetch(`${base}vectors.bin`).then((r) => ok(r).arrayBuffer()),
    ])
    const words = text.split('\n').map((w) => w.trim())
    const vectors = new Int8Array(bin)
    if (vectors.length !== words.length * meta.dim) throw new Error('단어 데이터가 맞지 않아요')
    const index = new Map(words.map((w, i) => [w, i]))
    // 정답 후보는 일상 낱말 목록(answers.ts) 중 단어 책에 있는 것만. 하나도 없으면 데이터에 든 후보를 써요
    const curated = [...new Set(ANSWER_WORDS)].map((w) => index.get(w)).filter((i): i is number => i !== undefined)
    return { words, index, vectors, dim: meta.dim, answers: curated.length ? curated : meta.answers }
  })()
  // 실패하면 다음에 다시 받아 볼 수 있게
  loading.catch(() => (loading = null))
  return loading
}

function ok(res: Response) {
  if (!res.ok) throw new Error(`단어 데이터를 받지 못했어요 (${res.status})`)
  return res
}

/** 비밀 단어를 정하고 모든 단어와의 유사도 · 순위를 미리 계산해요 (2만 단어도 금방이에요) */
export function makeRound(data: WordData, answer: number): Round {
  const { vectors, dim, words } = data
  const n = words.length
  const sims = new Float32Array(n)
  const a = answer * dim
  for (let i = 0; i < n; i++) {
    let dot = 0
    const b = i * dim
    for (let k = 0; k < dim; k++) dot += vectors[a + k] * vectors[b + k]
    sims[i] = dot / (127 * 127)
  }
  sims[answer] = 1
  const order = Int32Array.from({ length: n }, (_, i) => i).sort((x, y) => sims[y] - sims[x])
  const rank = new Int32Array(n)
  order.forEach((wordIndex, r) => (rank[wordIndex] = r))
  return { answer, sims, rank, order }
}

/** 한국 시간(UTC+9, 서머타임 없음) 기준 */
const KST = 9 * 3600_000
const DAY = 86400_000
/** 꼬맨틀 1일째 (이 날부터 #1, #2, ...) */
const FIRST_DAY = Date.UTC(2026, 10, 19)

/** 오늘 날짜 'YYYY-MM-DD' (한국 시간, 밤 12시에 바뀌어요) */
export const todayKey = (now = Date.now()) => new Date(now + KST).toISOString().slice(0, 10)

/** 오늘이 몇 번째 꼬맨틀인지 (1부터) */
export const dayNumber = (day: string) => Math.floor((Date.parse(day) - FIRST_DAY) / DAY) + 1

/** 다음 밤 12시(한국 시간)까지 남은 ms */
export const msUntilNextDay = (now = Date.now()) => DAY - ((now + KST) % DAY)

/**
 * 그날의 비밀 단어: 날짜만으로 정해서 누가 언제 열어도 같은 단어예요.
 * 정답 후보를 정해진 순서로 한 번 섞어 두고 하루에 하나씩 넘겨요 (후보를 다 돌기 전엔 같은 단어가 안 나와요).
 */
export function dailyAnswer(data: WordData, day: string) {
  const list = [...data.answers].sort((x, y) => (data.words[x] < data.words[y] ? -1 : 1))
  const random = mulberry32(0x6b6b6f6d)
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  const n = dayNumber(day) - 1
  return list[((n % list.length) + list.length) % list.length]
}

/** 시드가 같으면 늘 같은 순서를 내는 작은 난수 */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 화면에 보여 주는 유사도: 100점 만점, 소수 둘째 자리 */
export const simScore = (sim: number) => Math.round(sim * 10000) / 100
