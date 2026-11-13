/**
 * 타자 연습 배경음악 · 효과음.
 * 음악 파일 없이 Web Audio로 직접 만드는 짧은 칩튠이에요 (통통 튀는 C장조 4마디 반복).
 * 브라우저 정책상 소리는 사용자가 버튼을 누른 뒤에만 켤 수 있어서, OK 버튼에서 start()를 불러요.
 */

/** [멜로디(MIDI 번호, null은 쉼표)] 8분음표 32칸 = 4마디 */
const MELODY: (number | null)[] = [
  76, 79, 84, 79, 81, 79, 76, null,
  74, 76, 79, 76, 74, 72, 74, null,
  76, 79, 84, 86, 88, 86, 84, 79,
  81, 79, 76, 74, 72, null, 72, null,
]
/** 베이스: 4분음표 16칸 */
const BASS: (number | null)[] = [48, 55, 48, 55, 43, 50, 43, 50, 45, 52, 45, 52, 43, 50, 48, null]

const SOUND_KEY = 'tiny-room-sound'
const LOOKAHEAD = 0.12

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export class Chiptune {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private timer = 0
  private step = 0
  private nextTime = 0
  private readonly tempo = 132
  private noise: AudioBuffer | null = null
  /** 배경음악으로 예약해 둔 음들 (멈출 때 바로 끊어요) */
  private readonly voices = new Set<AudioScheduledSourceNode>()
  private _muted = false

  constructor() {
    try {
      this._muted = localStorage.getItem(SOUND_KEY) === 'off'
    } catch {
      // 저장소를 못 쓰면 기본값(소리 켜짐)
    }
    // 탭이 가려지면 잠깐 멈췄다가, 다시 보이면 이어서 재생해요
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return
      if (document.hidden) void this.ctx.suspend()
      else if (this.timer) void this.ctx.resume()
    })
  }

  get muted() {
    return this._muted
  }

  toggleMute() {
    this._muted = !this._muted
    if (this.master) this.master.gain.value = this._muted ? 0 : 1
    try {
      localStorage.setItem(SOUND_KEY, this._muted ? 'off' : 'on')
    } catch {
      // 이번 판에만 적용
    }
    return this._muted
  }

  /** 배경음악 시작 (사용자 클릭 안에서 불러야 소리가 나요) */
  start() {
    const ctx = this.ensure()
    if (!ctx) return
    void ctx.resume()
    this.stopLoop()
    this.step = 0
    this.nextTime = ctx.currentTime + 0.05
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stop() {
    this.stopLoop()
  }

  sfx(kind: 'hit' | 'miss' | 'clear' | 'open' | 'click') {
    const ctx = this.ensure()
    if (!ctx) return
    void ctx.resume()
    const t = ctx.currentTime
    switch (kind) {
      case 'hit':
        this.tone(t, 880, 0.09, 'sine', 0.16, 1320)
        this.tone(t + 0.06, 1320, 0.08, 'sine', 0.1)
        break
      case 'miss':
        this.tone(t, 260, 0.22, 'triangle', 0.18, 120)
        break
      case 'clear':
        ;[72, 76, 79, 84].forEach((n, i) => this.tone(t + i * 0.07, freq(n), 0.1, 'square', 0.06))
        break
      case 'open':
        this.tone(t, 523, 0.08, 'sine', 0.1, 784)
        break
      case 'click':
        // 버튼을 누르면 톡: 짧게 튀어 오르는 소리
        this.tone(t, 620, 0.06, 'sine', 0.12, 980)
        this.tone(t, 1240, 0.04, 'triangle', 0.03)
        break
    }
  }

  // ---------- 내부 ----------

  private ensure() {
    if (this.ctx) return this.ctx
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return null
    this.ctx = new AudioCtor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this._muted ? 0 : 1
    this.master.connect(this.ctx.destination)
    // 하이햇용 짧은 잡음
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return this.ctx
  }

  private stopLoop() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = 0
    // 미리 예약해 둔 음까지 끊어서, 끄는 순간 바로 조용해져요
    for (const voice of this.voices) {
      try {
        voice.stop()
      } catch {
        // 이미 끝난 음
      }
    }
    this.voices.clear()
  }

  /** 배경음악 음으로 등록해 두고, 끝나면 목록에서 빼요 */
  private track(source: AudioScheduledSourceNode) {
    this.voices.add(source)
    source.addEventListener('ended', () => this.voices.delete(source))
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx) return
    const eighth = 60 / this.tempo / 2
    // 타이머가 늦게 돌아 밀린 음은 한꺼번에 치지 않고 건너뛰어요 (겹쳐 들리지 않게)
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const i = this.step % MELODY.length
      const note = MELODY[i]
      if (note !== null) this.track(this.tone(this.nextTime, freq(note), eighth * 0.9, 'square', 0.045))
      if (i % 2 === 0) {
        const bass = BASS[i / 2]
        if (bass !== null) this.track(this.tone(this.nextTime, freq(bass), eighth * 1.6, 'triangle', 0.11))
      } else {
        this.track(this.hat(this.nextTime))
      }
      this.nextTime += eighth
      this.step += 1
    }
  }

  /** 짧게 톡 튀는 음 하나 (endFreq를 주면 음높이가 미끄러져요) */
  private tone(at: number, f: number, length: number, type: OscillatorType, volume: number, endFreq?: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    osc.type = type
    osc.frequency.setValueAtTime(f, at)
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + length)
    filter.type = 'lowpass'
    filter.frequency.value = 2600 // 네모파를 둥글둥글하게
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(filter).connect(gain).connect(this.master!)
    osc.start(at)
    osc.stop(at + length + 0.02)
    return osc
  }

  private hat(at: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7000
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.025, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04)
    src.connect(filter).connect(gain).connect(this.master!)
    src.start(at)
    return src
  }
}
