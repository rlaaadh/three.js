import './champion.css'
import { fetchRanking, limitNickname, rankingEnabled, submitRanking } from './typing/ranking'

/**
 * 1등 한마디 (모든 게임 랭킹 공용).
 * 랭킹 등록으로 새 1등이 되면 팝업이 떠서 자리를 내준 이전 1등에게 한마디를 남겨요.
 * 남긴 한마디는 랭킹 목록 1등 줄 위에 말풍선으로 보여요.
 * 테이블 · 권한은 supabase/champion_notes.sql을 Supabase SQL Editor에서 한 번 실행하면 만들어져요.
 *
 * board: 어느 랭킹인지 — rain · dish · sleep · sleep_speed · jelly · ramen · kkomantle:YYYY-MM-DD
 */

/** 한마디는 10자까지 */
export const NOTE_MAX = 10

const TABLE = 'champion_notes'
const SUBMIT_FN = 'submit_champion_note'
const CLEAR_FN = 'clear_champion_note'

interface ChampionNote {
  message: string
  to_nickname: string
}

/** 목록의 1등 줄 (머리글 줄은 빼고) */
const firstRow = (list: HTMLElement) => list.querySelector<HTMLElement>('.trank__row:not(.trank__head)')
const nameOf = (row: HTMLElement | null) => row?.querySelector('.trank__name')?.textContent ?? undefined

/** 등록하기 전 지금 1등 닉네임 (없거나 못 불러오면 undefined) */
export async function championBefore(fetchTop: (limit: number) => Promise<{ nickname: string }[]>) {
  try {
    return (await fetchTop(1))[0]?.nickname
  } catch {
    return undefined
  }
}

/** 랭킹 목록을 그린 뒤 불러요: 1등이 남긴 한마디가 있으면 1등 줄 위에 말풍선 */
export async function showChampionNote(list: HTMLElement, board: string) {
  list.querySelector('.trank__brag')?.remove()
  const row = firstRow(list)
  const champion = nameOf(row)
  if (!row || !champion || !rankingEnabled()) return
  let note: ChampionNote | undefined
  try {
    ;[note] = await fetchRanking<ChampionNote>(TABLE, 'message,to_nickname', 'created_at.desc', 1, {
      board: `eq.${board}`,
      nickname: `eq.${champion}`,
    })
  } catch {
    return // 한마디는 없어도 랭킹은 그대로
  }
  // 그새 목록을 다시 그렸거나, 옛 한마디를 지우는 중이면 버려요
  if (!note || !row.isConnected || firstRow(list) !== row || list.dataset.bragOff) return
  list.querySelector('.trank__brag')?.remove()
  const bubble = document.createElement('li')
  bubble.className = 'trank__brag'
  bubble.setAttribute('aria-label', `1등 ${champion}님의 한마디: ${note.message} (이전 1등 ${note.to_nickname}님에게)`)
  // "to. 이전 1등" 먼저, 그 뒤에 한마디
  bubble.innerHTML = `
    <span class="trank__brag-to">to. ${escapeHtml(note.to_nickname)}</span>
    <span class="trank__brag-msg">${escapeHtml(note.message)}</span>`
  row.before(bubble)
}

/**
 * 등록하고 목록을 다시 그린 뒤 불러요.
 * 내가 새 1등이고 이전 1등이 다른 사람이면 한마디 팝업을 띄워요.
 * 예전에 1등일 때 남긴 한마디는 이번 1등과 상관없어서 팝업을 띄울 때 지워요
 * (건너뛰기 · Esc · 창 닫기로 안 남겨도 옛 한마디가 남지 않게).
 */
export function celebrateChampion(list: HTMLElement, board: string, nickname: string, previous: string | undefined) {
  if (!previous || previous === nickname || nameOf(firstRow(list)) !== nickname) return
  const host = list.closest<HTMLElement>('.appwin__window') ?? document.body
  host.querySelector('.champ')?.remove()

  const root = document.createElement('div')
  root.className = 'champ'
  root.innerHTML = `
    <form class="champ__card" role="dialog" aria-modal="true" aria-labelledby="champ-title" autocomplete="off">
      <p class="champ__crown" aria-hidden="true">👑</p>
      <p class="champ__title" id="champ-title">신기록! 1등이 되었어요</p>
      <p class="champ__sub"><b>${escapeHtml(previous)}</b>님을 제쳤어요!<br />이전 1등에게 한마디 남겨 볼까요?</p>
      <div class="trank__form champ__form">
        <input type="text" maxlength="${NOTE_MAX}" placeholder="한마디 (${NOTE_MAX}자까지)" aria-label="이전 1등에게 한마디" spellcheck="false" />
        <span class="champ__count" aria-hidden="true">0/${NOTE_MAX}</span>
      </div>
      <p class="champ__note" aria-live="polite"></p>
      <div class="tresult__buttons">
        <button type="submit" class="tbutton tbutton--main">남기기</button>
        <button type="button" class="tbutton" data-action="skip">건너뛰기</button>
      </div>
    </form>`
  host.append(root)

  // 옛 한마디 지우기: 화면에서 바로 빼고, 서버에서도 지워요 (새 한마디 등록은 지운 뒤에)
  list.dataset.bragOff = '1'
  list.querySelector('.trank__brag')?.remove()
  const cleared = submitRanking(CLEAR_FN, { board, nickname }).catch(() => undefined)

  const form = root.querySelector<HTMLFormElement>('form')!
  const input = root.querySelector<HTMLInputElement>('input')!
  const count = root.querySelector<HTMLElement>('.champ__count')!
  const note = root.querySelector<HTMLElement>('.champ__note')!
  const buttons = root.querySelectorAll<HTMLButtonElement>('button')
  limitNickname(input, NOTE_MAX)
  const syncCount = () => (count.textContent = `${Math.min(input.value.length, NOTE_MAX)}/${NOTE_MAX}`)
  input.addEventListener('input', syncCount)
  input.addEventListener('compositionend', syncCount)

  const close = () => {
    root.remove()
    list.closest<HTMLElement>('.trank')?.querySelector<HTMLButtonElement>('.tbutton')?.focus({ preventScroll: true })
  }
  // 팝업 안 키는 게임 · 창으로 안 넘겨요 (Esc는 창을 닫지 않고 팝업만 닫아요)
  root.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  root.querySelector('[data-action="skip"]')!.addEventListener('click', close)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const message = input.value.trim().slice(0, NOTE_MAX)
    if (!message) {
      note.textContent = '한마디를 적어 주세요'
      input.focus()
      return
    }
    buttons.forEach((b) => (b.disabled = true))
    input.disabled = true
    note.textContent = '남기는 중...'
    try {
      await cleared
      await submitRanking(SUBMIT_FN, { board, nickname, to_nickname: previous, message })
      close()
      delete list.dataset.bragOff
      await showChampionNote(list, board)
    } catch (error) {
      note.textContent = (error as Error).message
      buttons.forEach((b) => (b.disabled = false))
      input.disabled = false
    }
  })
  requestAnimationFrame(() => input.focus({ preventScroll: true }))
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
