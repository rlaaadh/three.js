import './kkomantle.css'
import type { Chiptune } from '../Chiptune'
import { RetroWindow } from '../RetroWindow'
import { NICKNAME_MAX, RANK_LIMIT, limitNickname, rankingEnabled, rememberNickname, savedNickname, submitMessage } from '../typing/ranking'
import { fetchKkomantleTop, submitKkomantleScore, type KkomantleScore } from './ranking'
import { RANK_SHOWN, dailyAnswer, dayNumber, loadWords, makeRound, msUntilNextDay, simScore, todayKey, type Round, type WordData } from './data'

type Phase = 'intro' | 'playing' | 'result'

interface Guess {
  word: string
  index: number
  sim: number
  rank: number
  /** 몇 번째 추측인지 (1부터) */
  no: number
}

/** 오늘 넣은 단어 · 걸린 시간 · 끝났는지 (새로고침해도 이어서, 하루가 지나면 버려요) */
const SAVE_KEY = 'tiny-room-kkomantle-today'

interface Saved {
  day: string
  words: string[]
  /** 지금까지 걸린 시간(초) */
  elapsed: number
  done: 'solved' | 'gaveup' | null
}

const clock = (sec: number) => {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * 책꽂이에서 여는 꼬맨틀 (꼬맨틀.app): 비밀 단어를 맞히는 단어 유사도 게임.
 * 단어를 넣으면 비밀 단어와 얼마나 비슷한지(유사도 · 가까운 순위)를 알려 줘요. 정답을 맞히면 끝, 포기하면 정답 공개.
 * 비밀 단어는 하루에 하나 (모두 같은 단어), 한국 시간 밤 12시에 새 단어 · 새 랭킹으로 바뀌어요.
 * 하루에 한 번만 풀 수 있고, 오늘 넣은 단어는 저장돼서 창을 닫거나 새로고침해도 이어서 해요.
 */
export class Kkomantle {
  /** 단어를 맞혔을 때 (캐릭터가 방긋) */
  onSolve: (() => void) | null = null
  onClose: (() => void) | null = null

  private readonly win: RetroWindow
  private phase: Phase = 'intro'
  /** 지금 풀고 있는 단어의 날짜 */
  private day = ''
  private data: WordData | null = null
  private round: Round | null = null
  private guesses: Guess[] = []
  private latest: Guess | null = null
  private startedAt = 0
  private timer = 0
  /** 멈춘 순간 (0이면 멈추지 않음). 멈춘 동안은 시간이 흐르지 않아요 */
  private pausedAt = 0

  constructor(private readonly music: Chiptune) {
    this.win = new RetroWindow(music, '꼬맨틀.app', '꼬맨틀 단어 유사도 게임')
    this.win.onClose = () => {
      window.clearInterval(this.timer)
      // 하던 판을 두고 창을 닫으면 그동안은 시간이 흐르지 않아요
      if (this.phase === 'playing') {
        if (!this.pausedAt) this.pausedAt = performance.now()
        // 풀던 중일 때만 저장 (끝난 날 기록을 '안 끝남'으로 덮어쓰지 않게)
        this.save()
      }
      this.onClose?.()
    }
    this.win.onEscape = () => this.onEscape()
  }

  get isOpen() {
    return this.win.isOpen
  }

  open() {
    if (this.win.isOpen) return
    this.win.open()
    // 늘 처음 화면부터. 하던 판이 있으면 "이어서 하기"를 눌러야 시간이 다시 흘러요
    this.showIntro()
  }

  close() {
    this.win.close()
  }

  // ---------- 처음 화면 ----------

  private showIntro(message = '') {
    this.phase = 'intro'
    window.clearInterval(this.timer)
    const day = todayKey()
    const saved = readSaved(day)
    // 오늘 맞혔거나 포기했으면 정답을 이미 아니까 내일까지 다시 못 해요
    const done = !!saved?.done
    const startLabel = saved && !done ? '이어서 하기' : '시작하기'
    this.win.body.innerHTML = `
      <div class="kkom kkom--intro">
        <div class="kkom__card">
          <div class="kkom__art" aria-hidden="true">${BOOKS_ART}</div>
          <p class="kkom__badge">꼬맨틀</p>
          <p class="kkom__day">${dayNumber(day)}번째 오늘의 단어 · 다음 단어까지 <span data-ref="countdown">${countdown()}</span></p>
          <p class="kkom__lead">책꽂이 어딘가에 숨은 <b>오늘의 비밀 단어</b>를 맞혀요!</p>
          <ul class="kkom__rules">
            <li>단어를 넣으면 비밀 단어와 얼마나 <b>비슷한 뜻</b>인지 유사도로 알려 줘요</li>
            <li>가까운 단어 <b>${RANK_SHOWN}위 안</b>에 들면 순위도 알려 줘요</li>
            <li>유사도가 높은 단어를 실마리로 점점 좁혀 가요</li>
            <li>단어는 <b>하루에 하나</b>, 모두 같은 단어예요. 밤 12시에 새 단어 · 새 랭킹!</li>
          </ul>
          <p class="kkom__note" data-ref="note" aria-live="polite">${escapeHtml(message)}</p>
          <div class="kkom__buttons">
            <span class="kkom__start${done ? ' is-done' : ''}">
              ${done ? '<span class="kkom__tip" role="tooltip" id="kkom-tip">내일 다시 도전해주세요</span>' : ''}
              <button type="button" class="tbutton tbutton--main" data-action="start"${done ? ' disabled aria-describedby="kkom-tip"' : ''}>${startLabel}</button>
            </span>
            ${rankingEnabled() ? '<button type="button" class="tbutton" data-action="ranking">🏆 랭킹 보기</button>' : ''}
          </div>
        </div>
        ${rankingEnabled() ? RANK_VIEW : ''}
      </div>
    `
    const start = this.win.body.querySelector<HTMLButtonElement>('[data-action="start"]')!
    start.addEventListener('click', () => void this.startRound(start))
    this.win.body.querySelector('[data-action="ranking"]')?.addEventListener('click', () => this.openRankingView())
    this.win.body.querySelector('[data-action="close-ranking"]')?.addEventListener('click', () => this.closeRankingView())
    // 단어 데이터는 처음 화면이 뜨자마자 미리 받아 둬요
    void loadWords().catch(() => {})
    this.tickCountdown()
  }

  /** 다음 단어까지 남은 시간을 1초마다 새로 그려요. 밤 12시가 지나면 새 단어 처음 화면으로 */
  private tickCountdown() {
    const shownDay = todayKey()
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => {
      if (todayKey() !== shownDay) {
        this.showIntro('밤 12시가 지나서 새 단어가 나왔어요!')
        return
      }
      const el = this.win.body.querySelector<HTMLElement>('[data-ref="countdown"]')
      if (el) el.textContent = countdown()
    }, 1000)
  }

  private async startRound(button?: HTMLButtonElement) {
    if (readSaved(todayKey())?.done) return
    const note = this.win.body.querySelector<HTMLElement>('[data-ref="note"]')
    if (button) button.disabled = true
    if (note) note.textContent = '단어 책 펼치는 중...'
    try {
      this.data ??= await loadWords()
    } catch (error) {
      if (note) note.textContent = (error as Error).message
      if (button) button.disabled = false
      return
    }
    const day = todayKey()
    const saved = readSaved(day)
    this.day = day
    this.round = makeRound(this.data, dailyAnswer(this.data, day))
    const round = this.round
    // 오늘 넣었던 단어들을 그대로 되살려요
    this.guesses = []
    for (const word of saved?.words ?? []) {
      const index = this.data.index.get(word)
      if (index === undefined || this.guesses.some((g) => g.index === index)) continue
      this.guesses.push({ word, index, sim: round.sims[index], rank: round.rank[index], no: this.guesses.length + 1 })
    }
    this.latest = this.guesses.at(-1) ?? null
    this.startedAt = performance.now() - (saved?.elapsed ?? 0) * 1000
    this.pausedAt = 0
    this.phase = 'playing'
    this.save()
    // 잔잔한 책장 노래 (시작 · 새 단어 버튼을 누른 순간이라 소리가 나요)
    this.music.start(100, 'book')
    this.showPlay()
  }

  // ---------- 게임 화면 ----------

  private showPlay() {
    const round = this.round!
    const near = (r: number) => simScore(round.sims[round.order[r]]).toFixed(2)
    this.win.body.innerHTML = `
      <div class="kkom kkom--play">
        <div class="kkom__top">
          <span class="tbadge">추측 <b data-ref="tries">0</b>번</span>
          <span class="tbadge" data-ref="time">0:00</span>
          <button type="button" class="tback" data-action="pause">⏸ 멈춤 <small>Esc</small></button>
          <button type="button" class="tback" data-action="giveup">포기하기</button>
        </div>
        <p class="kkom__hint">가장 가까운 단어 <b>${near(1)}</b> · 10번째 <b>${near(10)}</b> · ${RANK_SHOWN}번째 <b>${near(RANK_SHOWN)}</b></p>
        <form class="kkom__form" data-ref="form" autocomplete="off">
          <input data-ref="input" type="text" maxlength="10" placeholder="단어를 적어 보세요" aria-label="추측할 단어" spellcheck="false" autocapitalize="off" />
          <button type="submit" class="tprac__enter">추측</button>
        </form>
        <p class="kkom__msg" data-ref="msg" aria-live="polite"></p>
        <div class="kkom__table">
          <div class="kkom__row kkom__head" aria-hidden="true">
            <span class="kkom__no">#</span><span class="kkom__word">단어</span><span class="kkom__sim">유사도</span><span class="kkom__rank">순위</span>
          </div>
          <ol class="kkom__list" data-ref="list"></ol>
        </div>
        <div class="kkom__pause" data-ref="pause" hidden>
          <div class="kkom__pause-card">
            <p class="kkom__pause-title">잠깐 멈춤</p>
            <p class="kkom__pause-desc">추측 <b data-ref="pause-tries">0</b>번 · <span data-ref="pause-time">0:00</span>에서 멈췄어요</p>
            <div class="kkom__buttons">
              <button type="button" class="tbutton tbutton--main" data-action="resume">계속하기</button>
              <button type="button" class="tbutton" data-action="quit">그만하기</button>
            </div>
            <p class="kkom__pause-tip">Esc를 한 번 더 누르면 이어서 해요</p>
          </div>
        </div>
      </div>
    `
    const form = this.win.body.querySelector<HTMLFormElement>('[data-ref="form"]')!
    const input = this.win.body.querySelector<HTMLInputElement>('[data-ref="input"]')!
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      this.guess(input.value)
      input.value = ''
      input.focus()
    })
    this.win.body.querySelector('[data-action="giveup"]')!.addEventListener('click', () => this.finish(false))
    this.win.body.querySelector('[data-action="pause"]')!.addEventListener('click', () => this.pause())
    this.win.body.querySelector('[data-action="resume"]')!.addEventListener('click', () => this.resume())
    // 그만하기: 창을 닫아요. 판은 그대로 두니까 책꽂이를 다시 누르면 이어서 해요
    this.win.body.querySelector('[data-action="quit"]')!.addEventListener('click', () => this.close())
    this.renderGuesses()
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.renderTime(), 500)
    this.renderTime()
    input.focus({ preventScroll: true })
  }

  // ---------- 멈춤 ----------

  /** Esc: 랭킹 보기 닫기 → 게임 중이면 멈춤 → 멈춤 화면에서는 계속하기. 그 밖(처음 화면 · 결과)에는 창을 닫아요 */
  private onEscape() {
    if (this.closeRankingView()) return true
    if (this.phase !== 'playing') return false
    if (this.pausedAt) this.resume()
    else this.pause()
    return true
  }

  private pause() {
    if (this.phase !== 'playing' || this.pausedAt) return
    const overlay = this.win.body.querySelector<HTMLElement>('[data-ref="pause"]')
    if (!overlay) return
    this.pausedAt = performance.now()
    window.clearInterval(this.timer)
    this.music.stop()
    this.save()
    const input = this.win.body.querySelector<HTMLInputElement>('[data-ref="input"]')
    if (input) {
      input.disabled = true
      input.blur()
    }
    this.win.body.querySelector<HTMLElement>('.kkom--play')?.classList.add('is-paused')
    this.win.body.querySelector<HTMLElement>('[data-ref="pause-tries"]')!.textContent = String(this.guesses.length)
    this.win.body.querySelector<HTMLElement>('[data-ref="pause-time"]')!.textContent = clock(this.elapsed())
    overlay.hidden = false
    overlay.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus({ preventScroll: true })
  }

  private resume() {
    if (this.phase !== 'playing' || !this.pausedAt) return
    this.unpauseClock()
    this.win.body.querySelector<HTMLElement>('[data-ref="pause"]')!.hidden = true
    this.win.body.querySelector<HTMLElement>('.kkom--play')?.classList.remove('is-paused')
    this.music.start(100, 'book')
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.renderTime(), 500)
    this.renderTime()
    const input = this.win.body.querySelector<HTMLInputElement>('[data-ref="input"]')!
    input.disabled = false
    input.focus({ preventScroll: true })
  }

  /** 멈춘 동안 흐른 시간만큼 시작 시각을 미뤄서 시간 기록에서 빼요 */
  private unpauseClock() {
    if (!this.pausedAt) return
    this.startedAt += performance.now() - this.pausedAt
    this.pausedAt = 0
  }

  private guess(raw: string) {
    const data = this.data!
    const round = this.round!
    const word = raw.replace(/\s+/g, '').trim()
    const msg = this.win.body.querySelector<HTMLElement>('[data-ref="msg"]')!
    if (!word) return
    const index = data.index.get(word)
    if (index === undefined) {
      msg.textContent = `'${word}'은(는) 단어 책에 없어요 😢`
      msg.className = 'kkom__msg is-bad'
      this.music.sfx('buzz')
      return
    }
    const already = this.guesses.find((g) => g.index === index)
    if (already) {
      this.latest = already
      msg.textContent = `'${word}'은(는) 이미 넣어 본 단어예요`
      msg.className = 'kkom__msg'
      this.renderGuesses()
      return
    }
    const guess: Guess = { word, index, sim: round.sims[index], rank: round.rank[index], no: this.guesses.length + 1 }
    this.guesses.push(guess)
    this.latest = guess
    this.save()
    if (index === round.answer) {
      this.finish(true)
      return
    }
    msg.textContent = guess.rank <= RANK_SHOWN ? warmth(guess.rank) : ''
    msg.className = 'kkom__msg'
    this.music.sfx(guess.rank <= 10 ? 'ding' : guess.rank <= RANK_SHOWN ? 'hit' : 'click')
    this.renderGuesses()
  }

  /** 기록 표: 맨 위에 방금 넣은 단어, 그 아래로 유사도 높은 순 */
  private renderGuesses() {
    const list = this.win.body.querySelector<HTMLElement>('[data-ref="list"]')
    const tries = this.win.body.querySelector<HTMLElement>('[data-ref="tries"]')
    if (!list) return
    if (tries) tries.textContent = String(this.guesses.length)
    if (!this.guesses.length) {
      list.innerHTML = '<li class="kkom__empty">아직 넣은 단어가 없어요. 아무 단어나 먼저 넣어 봐요!</li>'
      return
    }
    const sorted = [...this.guesses].sort((a, b) => b.sim - a.sim)
    const rows = this.latest ? [this.latest, ...sorted] : sorted
    list.innerHTML = rows
      .map((g, i) => {
        const isLatest = i === 0 && !!this.latest
        return `<li class="kkom__row${isLatest ? ' is-latest' : ''}${g.rank === 0 ? ' is-answer' : ''}">
          <span class="kkom__no">${g.no}</span>
          <span class="kkom__word">${escapeHtml(g.word)}</span>
          <span class="kkom__sim">${simScore(g.sim).toFixed(2)}</span>
          ${rankCell(g.rank)}
        </li>${isLatest && rows.length > 1 ? '<li class="kkom__divider" aria-hidden="true"></li>' : ''}`
      })
      .join('')
  }

  private elapsed() {
    return ((this.pausedAt || performance.now()) - this.startedAt) / 1000
  }

  private renderTime() {
    const el = this.win.body.querySelector<HTMLElement>('[data-ref="time"]')
    if (this.phase !== 'playing') return
    // 풀던 중에 밤 12시가 지나면 그 단어는 끝, 새 단어로
    if (this.day !== todayKey()) {
      this.round = null
      this.music.stop()
      this.showIntro('밤 12시가 지나서 새 단어가 나왔어요!')
      return
    }
    if (el) el.textContent = clock(this.elapsed())
  }

  // ---------- 결과 ----------

  private finish(solved: boolean) {
    window.clearInterval(this.timer)
    const time = Math.round(this.elapsed() * 10) / 10
    this.phase = 'result'
    this.save(solved ? 'solved' : 'gaveup', time)
    this.music.stop()
    this.music.sfx(solved ? 'clear' : 'miss')
    if (solved) this.onSolve?.()
    this.showResult(solved, time)
  }

  /** 결과 화면 (끝난 날 다시 열어도 이 화면) */
  private showResult(solved: boolean, time: number) {
    const data = this.data!
    const round = this.round!
    window.clearInterval(this.timer)
    this.phase = 'result'
    const tries = this.guesses.length
    const answer = data.words[round.answer]
    const hasRank = rankingEnabled() && solved
    const nearest = Array.from(round.order.slice(1, 11), (i) => `<li><span>${escapeHtml(data.words[i])}</span><b>${simScore(round.sims[i]).toFixed(2)}</b></li>`).join('')
    this.win.body.innerHTML = `
      <div class="kkom kkom--result">
        <div class="tresult__card kkom__result">
          <p class="tresult__title">${solved ? '정답이에요! 🎉' : '아쉬워요, 정답은...'}</p>
          <p class="kkom__answer">${escapeHtml(answer)}</p>
          <div class="tresult__lines">
            <div class="tresult__line"><span>추측 횟수</span><b>${tries}번</b></div>
            <div class="tresult__line"><span>걸린 시간</span><b>${formatTime(time)}</b></div>
          </div>
          <p class="kkom__near-title">'${escapeHtml(answer)}'와(과) 가까운 단어</p>
          <ol class="kkom__near">${nearest}</ol>
          <p class="kkom__day">오늘 단어는 끝! 다음 단어까지 <span data-ref="countdown">${countdown()}</span></p>
          <div class="tresult__buttons">
            ${hasRank ? '<button type="button" class="tbutton tbutton--main" data-action="rank">🏆 랭킹 등록</button>' : ''}
            ${rankingEnabled() && !solved ? '<button type="button" class="tbutton" data-action="rank">🏆 오늘의 랭킹</button>' : ''}
            <button type="button" class="tbutton" data-action="quit">닫기</button>
          </div>
        </div>
        ${rankingEnabled() ? rankCard(hasRank) : ''}
      </div>
    `
    this.win.body.querySelectorAll('[data-action="quit"]').forEach((b) => b.addEventListener('click', () => this.close()))
    if (rankingEnabled()) this.bindRanking(hasRank ? { tries, time_sec: time, day: this.day } : null)
    this.tickCountdown()
  }

  /** 오늘 기록을 브라우저에 저장 (끝났으면 done과 최종 시간도) */
  private save(done: Saved['done'] = null, time?: number) {
    if (!this.round || !this.day) return
    const saved: Saved = { day: this.day, words: this.guesses.map((g) => g.word), elapsed: time ?? Math.round(this.elapsed() * 10) / 10, done }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved))
    } catch {
      // 저장소를 못 쓰면 넘어가요
    }
  }

  // ---------- 랭킹 (다른 게임과 같은 방식) ----------

  /** record가 없으면 (포기한 날) 등록 없이 오늘의 랭킹만 봐요 */
  private bindRanking(record: Omit<KkomantleScore, 'nickname'> | null) {
    const el = this.win.body
    const resultCard = el.querySelector<HTMLElement>('.kkom__result')!
    const card = el.querySelector<HTMLElement>('.trank')!
    el.querySelector('[data-action="back-result"]')?.addEventListener('click', () => {
      card.hidden = true
      resultCard.hidden = false
    })
    const form = el.querySelector<HTMLFormElement>('[data-ref="rankForm"]')
    const input = el.querySelector<HTMLInputElement>('[data-ref="nickname"]')
    const button = form?.querySelector<HTMLButtonElement>('button')
    const list = el.querySelector<HTMLElement>('[data-ref="rankList"]')!
    const note = el.querySelector<HTMLElement>('[data-ref="rankNote"]')!
    if (input) {
      input.value = savedNickname().slice(0, NICKNAME_MAX)
      limitNickname(input)
    }
    let mine: KkomantleScore | null = null
    let loaded = false

    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!record || !input || !button) return
      const nickname = input.value.trim().slice(0, NICKNAME_MAX)
      if (!nickname) {
        note.textContent = '닉네임을 적어 주세요'
        input.focus()
        return
      }
      button.disabled = true
      input.disabled = true
      note.textContent = '올리는 중...'
      try {
        mine = { ...record, nickname }
        const result = await submitKkomantleScore(mine)
        rememberNickname(nickname)
        note.textContent = submitMessage(result)
        form.classList.add('is-done')
        await this.renderRanking(list, mine)
      } catch (error) {
        mine = null
        note.textContent = (error as Error).message
        button.disabled = false
        input.disabled = false
      }
    })
    el.querySelector('[data-action="rank"]')!.addEventListener('click', () => {
      resultCard.hidden = true
      card.hidden = false
      if (!loaded) {
        loaded = true
        void this.renderRanking(list, mine)
      }
      input?.focus({ preventScroll: true })
    })
  }

  private openRankingView() {
    const card = this.win.body.querySelector<HTMLElement>('.kkom__card')
    const view = this.win.body.querySelector<HTMLElement>('[data-ref="rankView"]')
    if (!card || !view || this.phase !== 'intro') return
    card.hidden = true
    view.hidden = false
    const list = view.querySelector<HTMLElement>('[data-ref="rankList"]')!
    list.innerHTML = '<li class="trank__empty">불러오는 중...</li>'
    void this.renderRanking(list, null)
  }

  /** 랭킹 보기를 닫았으면 true (Esc가 창 대신 랭킹만 닫아요) */
  private closeRankingView() {
    // 결과 화면의 랭킹 → 결과 카드로
    const resultRank = this.win.body.querySelector<HTMLElement>('.kkom--result .trank')
    if (resultRank && !resultRank.hidden) {
      resultRank.hidden = true
      this.win.body.querySelector<HTMLElement>('.kkom__result')!.hidden = false
      return true
    }
    const view = this.win.body.querySelector<HTMLElement>('[data-ref="rankView"]')
    if (!view || view.hidden) return false
    view.hidden = true
    const card = this.win.body.querySelector<HTMLElement>('.kkom__card')
    if (card) card.hidden = false
    return true
  }

  /** 오늘의 TOP 10: 순위 · 닉네임 · 추측 횟수 · 걸린 시간 (비밀 단어는 보여 주지 않아요) */
  private async renderRanking(list: HTMLElement, mine: KkomantleScore | null) {
    try {
      const top = await fetchKkomantleTop(this.phase === 'result' && this.day ? this.day : todayKey())
      if (!list.isConnected) return
      list.innerHTML = top.length
        ? top
            .map((row, i) => {
              const isMine = !!mine && row.nickname === mine.nickname
              return `<li class="trank__row${isMine ? ' is-mine' : ''}">
                <span class="trank__no">${i + 1}</span>
                <span class="trank__name">${escapeHtml(row.nickname)}</span>
                <span class="trank__round">${row.tries}번</span>
                <span class="trank__score">${formatTime(Number(row.time_sec))}</span>
              </li>`
            })
            .join('')
        : '<li class="trank__empty">오늘은 아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</li>'
    } catch (error) {
      if (list.isConnected) list.innerHTML = `<li class="trank__empty">${escapeHtml((error as Error).message)}</li>`
    }
  }
}

/** 순위 칸: 1000위 안이면 막대 + "n위", 밖이면 "1000위 밖" */
function rankCell(rank: number) {
  if (rank === 0) return '<span class="kkom__rank is-answer">정답!</span>'
  if (rank > RANK_SHOWN) return `<span class="kkom__rank is-far">${RANK_SHOWN}위 밖</span>`
  const fill = Math.max(4, Math.round(((RANK_SHOWN - rank) / RANK_SHOWN) * 100))
  return `<span class="kkom__rank"><i class="kkom__bar"><i style="width:${fill}%"></i></i>${rank}위</span>`
}

/** 가까워질수록 신나는 한마디 */
function warmth(rank: number) {
  if (rank <= 10) return '🔥 거의 다 왔어요!'
  if (rank <= 100) return '😮 아주 가까워요!'
  if (rank <= 300) return '🙂 가까워지고 있어요'
  return '👀 조금 관련 있어요'
}

function formatTime(sec: number) {
  if (sec < 60) return `${sec.toFixed(1)}초`
  const m = Math.floor(sec / 60)
  return `${m}분 ${Math.floor(sec % 60)}초`
}

/** 오늘 저장해 둔 기록 (다른 날 것이면 없는 셈) */
function readSaved(day: string): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null
    return saved && saved.day === day && Array.isArray(saved.words) ? saved : null
  } catch {
    return null
  }
}

/** 다음 밤 12시까지 "3시간 05분 12초" */
function countdown() {
  const s = Math.ceil(msUntilNextDay() / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${h}시간 ${pad(m)}분 ${pad(s % 60)}초`
}

/** 처음 화면 그림: 알록달록한 책 더미와 돋보기 */
const BOOKS_ART = `
<svg viewBox="0 0 220 120">
  <rect x="10" y="104" width="200" height="8" rx="4" fill="#d4a673"/>
  <rect x="24" y="38" width="22" height="66" rx="4" fill="#e8a598" stroke="#5a4033" stroke-width="3"/>
  <rect x="46" y="26" width="18" height="78" rx="4" fill="#a9c4a0" stroke="#5a4033" stroke-width="3"/>
  <rect x="64" y="46" width="24" height="58" rx="4" fill="#f2d48a" stroke="#5a4033" stroke-width="3"/>
  <rect x="88" y="32" width="16" height="72" rx="4" fill="#b9c7d9" stroke="#5a4033" stroke-width="3"/>
  <rect x="106" y="50" width="22" height="54" rx="4" fill="#e6b8c6" stroke="#5a4033" stroke-width="3" transform="rotate(-12 117 104)"/>
  <g fill="#fff8e6" opacity=".9"><rect x="29" y="50" width="12" height="4" rx="2"/><rect x="69" y="58" width="14" height="4" rx="2"/><rect x="92" y="44" width="8" height="4" rx="2"/></g>
  <circle cx="165" cy="58" r="26" fill="#fffaf0" stroke="#5a4033" stroke-width="5"/>
  <circle cx="165" cy="58" r="17" fill="#cfeaf5" opacity=".8"/>
  <path d="M157 50 q6 -6 13 -2" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="181" y="78" width="12" height="32" rx="6" fill="#c9a27e" stroke="#5a4033" stroke-width="4" transform="rotate(-40 187 94)"/>
  <text x="165" y="64" text-anchor="middle" font-size="18" fill="#ec6a52">?</text>
</svg>`

/** 결과 화면의 랭킹 카드: 맞힌 날은 등록 칸까지, 포기한 날은 보기만 */
function rankCard(canSubmit: boolean) {
  return `
  <section class="trank" aria-label="오늘의 랭킹" hidden>
    <p class="trank__title">🏆 오늘의 랭킹 TOP ${RANK_LIMIT}</p>
    ${
      canSubmit
        ? `<form class="trank__form" data-ref="rankForm" autocomplete="off">
      <input data-ref="nickname" type="text" maxlength="${NICKNAME_MAX}" placeholder="닉네임 (${NICKNAME_MAX}자까지)" aria-label="닉네임" spellcheck="false" />
      <button type="submit" class="tprac__enter">등록</button>
    </form>`
        : ''
    }
    <p class="trank__note" data-ref="rankNote" aria-live="polite"></p>
    ${RANK_HEAD()}
    <ol class="trank__list" data-ref="rankList"><li class="trank__empty">불러오는 중...</li></ol>
    <div class="tresult__buttons">
      <button type="button" class="tbutton" data-action="back-result">결과로</button>
      <button type="button" class="tbutton" data-action="quit">닫기</button>
    </div>
  </section>`
}

const RANK_VIEW = `
  <section class="trank" data-ref="rankView" aria-label="랭킹" hidden>
    <p class="trank__title">🏆 오늘의 랭킹 TOP ${RANK_LIMIT}</p>
    ${RANK_HEAD()}
    <ol class="trank__list" data-ref="rankList"><li class="trank__empty">불러오는 중...</li></ol>
    <div class="tresult__buttons">
      <button type="button" class="tbutton" data-action="close-ranking">닫기</button>
    </div>
  </section>`

function RANK_HEAD() {
  return `
  <div class="trank__row trank__head" aria-hidden="true">
    <span class="trank__no">순위</span>
    <span class="trank__name">닉네임</span>
    <span class="trank__round">추측</span>
    <span class="trank__score">시간</span>
  </div>`
}
