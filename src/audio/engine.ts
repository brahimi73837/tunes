import { SOURCES, resolveStreamUrl } from '../sources'
import { findAlternative } from '../sources/catalog'
import { attachEngine, usePlayback, usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { Track } from '../types'
import { YouTubeMedia } from './youtube'

const STALL_MS = 10_000
const RESUME_KEY = 'tunes.resume'
const MAX_CONSECUTIVE_FAILURES = 5

/** What the engine needs from a player; HTMLAudioElement and YouTubeMedia both fit. */
type Media = Pick<HTMLMediaElement, 'currentTime' | 'readyState' | 'ended' | 'paused' | 'volume' | 'muted' | 'playbackRate' | 'src' | 'play' | 'pause' | 'load' | 'getAttribute' | 'removeAttribute'> &
  EventTarget & { readonly duration: number; readonly error: { code: number; message?: string } | null }

/** The YouTube player can stand in for a JioSaavn track that won't load. */
const asYouTube = (t: Track): Track => ({ ...t, source: 'youtube', streamUrl: `https://www.youtube.com/watch?v=${t.youtubeId}` })

let ytPlayer: YouTubeMedia | null = null
/** Shows or hides the YouTube player (it plays hidden by default). */
export function showVideo(show: boolean) {
  ytPlayer?.reveal(show)
}

/**
 * Owns the one <audio> element and the hidden YouTube player, and switches between them per
 * track. Never sets `crossOrigin` on the audio element: most radio streams and some content
 * nodes don't send CORS headers, and a CORS-mode request would fail.
 */
export function initEngine() {
  if (document.getElementById('tunes-audio')) return
  const audio = document.createElement('audio')
  audio.id = 'tunes-audio'
  audio.preload = 'auto'
  document.body.appendChild(audio)
  const yt = new YouTubeMedia()
  ytPlayer = yt
  let media: Media = audio
  yt.addEventListener('visibility', () => usePlayback.setState({ videoVisible: yt.visible }))

  let token = 0
  let track: Track | null = null
  let loadedId: string | null = null
  let url = ''
  let pendingSeek = 0
  let lastTime = -1
  let lastProgressAt = Date.now()
  let failures = 0
  let failedToken = -1
  let pausedAt = 0
  let lastPositionSync = 0
  /** The load token on which we already tried another copy of the track. */
  let fallbackToken = -1

  const markProgress = () => (lastProgressAt = Date.now())
  const player = () => usePlayer.getState()

  function applyVolume(volume: number, muted: boolean) {
    // Squared curve feels closer to perceived loudness than linear.
    for (const m of [audio, yt]) {
      m.volume = Math.min(1, Math.max(0, volume * volume))
      m.muted = muted
    }
  }

  function use(next: Media) {
    if (next === media) return
    media.pause()
    media.removeAttribute('src')
    if (media === audio) audio.load()
    media = next
    usePlayback.setState({ backend: next === yt ? 'youtube' : 'audio' })
  }

  function doPlay() {
    markProgress()
    const p = media.play()
    p?.catch((err: DOMException) => {
      if (err?.name === 'NotAllowedError') {
        usePlayer.setState({ isPlaying: false })
        usePlayback.setState({ buffering: false })
        toast('Press play to start listening')
      }
      // AbortError: a newer load() superseded this play — expected. Other errors surface via the 'error' event.
    })
  }

  /** `queueId` stays the id of the queued track when we play a stand-in copy of it. */
  async function load(t: Track, autoplay: boolean, startAt = 0, queueId = t.id) {
    const my = ++token
    track = t
    loadedId = queueId
    failedToken = -1
    markProgress()
    lastTime = -1
    usePlayback.setState({ buffering: autoplay, currentTime: startAt, duration: t.duration || 0, error: null })
    updateMediaSession(t)
    document.title = `${t.title} · ${t.artist} — Tunes`
    const resolved = await resolveStreamUrl(t)
    if (my !== token) return
    url = resolved
    pendingSeek = t.isLive ? 0 : startAt
    use(t.source === 'youtube' ? yt : audio)
    media.src = url
    media.load()
    if (autoplay) {
      doPlay()
      SOURCES[t.source]?.onPlay?.(t)
    }
  }

  /**
   * Before giving up on a track, try another copy once: the YouTube upload for a JioSaavn
   * file, or (via the API) a JioSaavn file / a different YouTube upload for a YouTube video.
   */
  async function tryFallback(): Promise<boolean> {
    const t = track
    if (!t || t.isLive || fallbackToken === token || (t.source !== 'saavn' && t.source !== 'youtube')) return false
    fallbackToken = token
    const my = token
    const at = media.currentTime > 1 ? media.currentTime : 0
    const queueId = loadedId ?? t.id
    let alt: Track | null = null
    if (t.source === 'saavn' && t.youtubeId) alt = asYouTube(t)
    else alt = await findAlternative(t, t.source === 'saavn' ? 'saavn' : undefined).catch(() => null)
    if (!alt || my !== token || !player().isPlaying) return false
    await load({ ...alt, title: t.title, artist: t.artist, artwork: t.artwork ?? alt.artwork }, true, at, queueId)
    fallbackToken = token
    return true
  }

  function play() {
    const cur = player().current()
    if (!cur) return
    if (loadedId !== cur.track.id || !media.getAttribute('src')) {
      void load(cur.track, true, readResume(cur.uid))
      return
    }
    // A paused live stream resumes from stale buffer; reconnect to be live again.
    if (track?.isLive && pausedAt && Date.now() - pausedAt > 3000) {
      audio.src = url
      audio.load()
    }
    usePlayback.setState({ buffering: media.readyState < 3 })
    doPlay()
  }

  function pause() {
    pausedAt = Date.now()
    media.pause()
    usePlayback.setState({ buffering: false })
  }

  function seek(sec: number) {
    if (!track || track.isLive) return
    if (media.readyState === 0) {
      pendingSeek = sec
      media.currentTime = sec
      usePlayback.setState({ currentTime: sec })
      return
    }
    const max = isFinite(media.duration) ? media.duration - 0.25 : sec
    media.currentTime = Math.max(0, Math.min(sec, max))
    markProgress()
    usePlayback.setState({ currentTime: media.currentTime })
  }

  function stop() {
    token++
    media.pause()
    media.removeAttribute('src')
    if (media === audio) audio.load()
    track = null
    loadedId = null
    usePlayback.setState({ currentTime: 0, duration: 0, buffering: false })
    document.title = 'Tunes'
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }

  async function fail(reason: string) {
    if (failedToken === token || !track) return
    failedToken = token
    const my = token
    usePlayback.setState({ buffering: true })
    if (await tryFallback()) return
    // The user moved on while we looked for another copy: that's not this track's failure.
    if (my !== token || !track) return
    failures++
    const title = track.title
    const q = player().queue.length
    usePlayback.setState({ buffering: false, error: reason })
    if (q <= 1 || failures >= Math.min(q, MAX_CONSECUTIVE_FAILURES)) {
      failures = 0
      media.pause()
      usePlayer.setState({ isPlaying: false })
      toast(`Couldn't play “${title}” (${reason}).`, 'error')
      return
    }
    toast(`Skipped “${title}” — ${reason}`, 'error')
    player().next({ auto: true, failed: true })
  }

  /** Listens on both players, but only reacts to the one currently in use. */
  const on = (type: string, fn: () => void) => {
    for (const m of [audio, yt]) m.addEventListener(type, (e) => e.target === media && fn())
  }

  on('timeupdate', () => {
    const t = media.currentTime
    if (t !== lastTime) {
      lastTime = t
      markProgress()
    }
    usePlayback.setState({ currentTime: t })
    if (track && !track.isLive && Date.now() - lastPositionSync > 1000) {
      lastPositionSync = Date.now()
      syncPositionState()
    }
  })
  on('loadedmetadata', () => {
    if (pendingSeek > 0 && isFinite(media.duration)) {
      media.currentTime = Math.min(pendingSeek, media.duration - 1)
      pendingSeek = 0
    }
  })
  on('durationchange', () => {
    const d = media.duration
    usePlayback.setState({ duration: isFinite(d) ? d : track?.duration || 0 })
  })
  on('playing', () => {
    failures = 0
    markProgress()
    usePlayback.setState({ buffering: false, error: null })
    if (!player().isPlaying) usePlayer.setState({ isPlaying: true })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
  })
  on('waiting', () => usePlayback.setState({ buffering: true }))
  on('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    // Paused by something other than us (OS, headphones unplugged…): reflect it.
    if (!media.ended && player().isPlaying && media.getAttribute('src') && media.readyState > 0) {
      pausedAt = Date.now()
      usePlayer.setState({ isPlaying: false })
    }
  })
  on('ended', () => player().next({ auto: true }))
  on('error', () => {
    if (!media.getAttribute('src')) return
    const err = media.error
    void fail(err?.message ?? (err?.code === 4 ? 'format not supported or stream offline' : err?.code === 2 ? 'network error' : 'playback error'))
  })
  // Phones only start the YouTube player from a tap inside it; it is now shown for that.
  yt.addEventListener('blocked', () => {
    if (media !== yt) return
    usePlayer.setState({ isPlaying: false })
    usePlayback.setState({ buffering: false })
    toast('Tap the video to start playback')
  })

  // Stall watchdog + sleep timer + resume position.
  setInterval(() => {
    const s = player()
    if (s.isPlaying && track && !media.ended && Date.now() - lastProgressAt > STALL_MS) {
      void fail(media.readyState === 0 ? 'no response from stream' : 'stream stalled')
    }
    if (s.sleepAt && Date.now() >= s.sleepAt) {
      s.setSleep(null)
      s.pause()
      toast('Sleep timer: paused playback. Good night 🌙')
    }
  }, 1000)

  const saveResume = () => {
    const cur = player().current()
    if (!cur || cur.track.isLive) return
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ uid: cur.uid, t: Math.floor(media.currentTime) }))
    } catch {
      /* storage full or blocked */
    }
  }
  setInterval(saveResume, 5000)
  window.addEventListener('pagehide', saveResume)

  function syncPositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const d = media.duration
    if (!isFinite(d) || d <= 0) return
    try {
      navigator.mediaSession.setPositionState({ duration: d, position: Math.min(media.currentTime, d), playbackRate: media.playbackRate || 1 })
    } catch {
      /* ignore */
    }
  }

  function updateMediaSession(t: Track) {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.isLive ? 'Live radio' : t.meta ?? '',
      artwork: t.artwork ? [{ src: t.artwork, sizes: '480x480' }] : [],
    })
  }

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => player().play()],
      ['pause', () => player().pause()],
      ['stop', () => player().pause()],
      ['previoustrack', () => player().prev()],
      ['nexttrack', () => player().next()],
      ['seekbackward', (d) => player().seekBy(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => player().seekBy(d.seekOffset ?? 10)],
      ['seekto', (d) => d.seekTime != null && player().seek(d.seekTime)],
    ]
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn)
      } catch {
        /* action unsupported */
      }
    }
  }

  // Read-only peek for the e2e tests (the YouTube player's clock lives in a cross-origin iframe).
  ;(window as unknown as { __tunes: unknown }).__tunes = {
    backend: () => (media === yt ? 'youtube' : 'audio'),
    time: () => media.currentTime || 0,
    paused: () => media.paused,
  }

  attachEngine({
    load: (t, autoplay, startAt) => void load(t, autoplay, startAt),
    play,
    pause,
    seek,
    currentTime: () => media.currentTime || 0,
    applyVolume,
    stop,
  })

  const s = player()
  applyVolume(s.volume, s.muted)
  // Restore: show the last track, paused, without touching the network until Play.
  // Nobody wants the app to start blasting audio on load.
  usePlayer.setState({ isPlaying: false })
  const cur = s.current()
  if (cur) {
    updateMediaSession(cur.track)
    usePlayback.setState({ currentTime: readResume(cur.uid), duration: cur.track.duration || 0 })
  }
}

function readResume(uid: string): number {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null')
    return r?.uid === uid && typeof r.t === 'number' ? r.t : 0
  } catch {
    return 0
  }
}
