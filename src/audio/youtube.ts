/**
 * Plays YouTube tracks through the official IFrame Player, kept off-screen so only the audio
 * is heard. It mimics the slice of HTMLMediaElement the engine uses (src/load/play/pause,
 * currentTime, duration, events…) so the engine can treat it like its <audio> element.
 */

interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(s: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  setVolume(v: number): void
  mute(): void
  unMute(): void
  getPlayerState(): number
  destroy(): void
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

/** YT.PlayerState */
const S = { Unstarted: -1, Ended: 0, Playing: 1, Paused: 2, Buffering: 3, Cued: 5 } as const

/** IFrame error codes → a MediaError-like code + human reason. */
const ERRORS: Record<number, [number, string]> = {
  2: [4, 'invalid video'],
  5: [3, 'YouTube player error'],
  100: [4, 'video removed or private'],
  101: [4, 'owner blocks playback outside YouTube'],
  150: [4, 'owner blocks playback outside YouTube'],
}
const BLOCKED_MS = 4000
const SEEK_SETTLE_MS = 2000

let apiPromise: Promise<void> | null = null
function loadApi(): Promise<void> {
  apiPromise ??= new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) return resolve()
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => {
      apiPromise = null
      reject(new Error('Could not load the YouTube player'))
    }
    document.head.appendChild(s)
  })
  return apiPromise
}

export const youTubeId = (src: string) => src.match(/(?:[?&]v=|youtu\.be\/|^)([\w-]{11})(?:$|[&?#])/)?.[1] ?? ''

export class YouTubeMedia extends EventTarget {
  readonly host: HTMLDivElement
  private player: YTPlayer | null = null
  private ready: Promise<YTPlayer> | null = null
  private videoId = ''
  private needsLoad = false
  private startAt = 0
  private time = 0
  /** Where we last seeked to: getCurrentTime() keeps reporting the old spot for a moment. */
  private seekTarget: { t: number; at: number } | null = null
  private dur = NaN
  private poll = 0
  private blockedTimer = 0
  private vol = 100
  private mute = false
  private metaSent = false

  paused = true
  ended = false
  readyState = 0
  playbackRate = 1
  error: { code: number; message: string } | null = null

  constructor() {
    super()
    this.host = document.createElement('div')
    this.host.id = 'tunes-youtube'
    this.host.dataset.visible = 'false'
    this.host.className = 'yt-host'
    const inner = document.createElement('div')
    this.host.appendChild(inner)
    document.body.appendChild(this.host)
  }

  private emit(type: string) {
    this.dispatchEvent(new Event(type))
  }

  private ensurePlayer(): Promise<YTPlayer> {
    this.ready ??= loadApi().then(
      () =>
        new Promise<YTPlayer>((resolve) => {
          const p = new window.YT!.Player(this.host.firstElementChild as HTMLElement, {
            width: 200,
            height: 200,
            host: 'https://www.youtube-nocookie.com',
            playerVars: { autoplay: 0, controls: 1, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, origin: location.origin },
            events: {
              onReady: () => {
                this.player = p
                p.setVolume(this.vol)
                if (this.mute) p.mute()
                resolve(p)
              },
              onStateChange: (e: { data: number }) => this.onState(e.data),
              onError: (e: { data: number }) => this.onError(e.data),
            },
          })
        }),
    )
    this.ready.catch(() => (this.ready = null))
    return this.ready
  }

  private onState(state: number) {
    if (!this.videoId) return
    switch (state) {
      case S.Playing:
        clearTimeout(this.blockedTimer)
        this.paused = false
        this.ended = false
        this.readyState = 4
        this.syncDuration()
        this.startPolling()
        this.emit('playing')
        break
      case S.Buffering:
        clearTimeout(this.blockedTimer)
        this.readyState = Math.max(this.readyState, 1)
        this.syncDuration()
        this.emit('waiting')
        break
      case S.Paused:
        this.paused = true
        this.stopPolling()
        this.emit('pause')
        break
      case S.Ended:
        this.paused = true
        this.ended = true
        this.stopPolling()
        this.emit('ended')
        break
      case S.Cued:
      case S.Unstarted:
        this.readyState = Math.max(this.readyState, 1)
        break
    }
  }

  private onError(code: number) {
    if (!this.videoId) return
    clearTimeout(this.blockedTimer)
    this.stopPolling()
    const [c, message] = ERRORS[code] ?? [3, 'YouTube player error']
    this.error = { code: c, message }
    this.emit('error')
  }

  private syncDuration() {
    const d = this.player?.getDuration() ?? 0
    if (d > 0 && d !== this.dur) {
      this.dur = d
      if (!this.metaSent) {
        this.metaSent = true
        this.emit('loadedmetadata')
      }
      this.emit('durationchange')
    }
  }

  private startPolling() {
    this.stopPolling()
    this.poll = window.setInterval(() => {
      if (!this.player) return
      const t = this.player.getCurrentTime() || 0
      const s = this.seekTarget
      if (s && Math.abs(t - s.t) > 2 && Date.now() - s.at < SEEK_SETTLE_MS) return
      this.seekTarget = null
      this.time = t
      this.syncDuration()
      this.emit('timeupdate')
    }, 250)
  }

  private stopPolling() {
    clearInterval(this.poll)
  }

  get src() {
    return this.videoId ? `https://www.youtube.com/watch?v=${this.videoId}` : ''
  }
  set src(url: string) {
    this.videoId = youTubeId(url)
    this.needsLoad = !!this.videoId
    this.startAt = 0
    this.time = 0
    this.seekTarget = null
    this.dur = NaN
    this.metaSent = false
    this.readyState = 0
    this.paused = true
    this.ended = false
    this.error = null
  }
  getAttribute(name: string) {
    return name === 'src' && this.videoId ? this.src : null
  }
  removeAttribute(name: string) {
    if (name !== 'src') return
    this.videoId = ''
    this.needsLoad = false
    this.stopPolling()
    clearTimeout(this.blockedTimer)
    this.player?.stopVideo()
    this.paused = true
    this.readyState = 0
    this.reveal(false)
  }

  /** Loading is deferred to play(): a cued-but-unplayed video costs a network round trip for nothing. */
  load() {}

  async play(): Promise<void> {
    if (!this.videoId) return
    const id = this.videoId
    const p = await this.ensurePlayer()
    if (id !== this.videoId) return
    this.paused = false
    if (this.needsLoad) {
      this.needsLoad = false
      p.loadVideoById({ videoId: id, startSeconds: this.startAt || undefined })
    } else {
      p.playVideo()
    }
    // Mobile browsers won't start a cross-origin player without a tap inside it.
    clearTimeout(this.blockedTimer)
    this.blockedTimer = window.setTimeout(() => {
      const st = p.getPlayerState()
      if (id === this.videoId && st !== S.Playing && st !== S.Buffering && !this.error) {
        this.paused = true
        this.reveal(true)
        this.emit('blocked')
      }
    }, BLOCKED_MS)
  }

  pause() {
    clearTimeout(this.blockedTimer)
    this.paused = true
    this.player?.pauseVideo()
  }

  get currentTime() {
    return this.needsLoad ? this.startAt : this.time
  }
  set currentTime(sec: number) {
    if (this.needsLoad || !this.player) {
      this.startAt = sec
      return
    }
    this.time = sec
    this.seekTarget = { t: sec, at: Date.now() }
    this.player.seekTo(sec, true)
    this.emit('timeupdate')
  }

  get duration() {
    return this.dur
  }

  get volume() {
    return this.vol / 100
  }
  set volume(v: number) {
    this.vol = Math.round(Math.min(1, Math.max(0, v)) * 100)
    this.player?.setVolume(this.vol)
  }
  get muted() {
    return this.mute
  }
  set muted(m: boolean) {
    this.mute = m
    if (m) this.player?.mute()
    else this.player?.unMute()
  }

  /** Shows the (otherwise hidden) player, e.g. so a phone user can tap it to start. */
  reveal(show: boolean) {
    this.host.dataset.visible = String(show)
    this.emit('visibility')
  }
  get visible() {
    return this.host.dataset.visible === 'true'
  }
}
