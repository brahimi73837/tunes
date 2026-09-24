import { resolveStreamUrl } from '../sources'
import { attachEngine, usePlayback, usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { Track } from '../types'

const STALL_MS = 10_000
const RESUME_KEY = 'tunes.resume'
const MAX_CONSECUTIVE_FAILURES = 5

/**
 * Owns the one and only <audio> element. Never sets `crossOrigin`: most radio streams
 * and some content nodes don't send CORS headers, and a CORS-mode request would fail.
 */
export function initEngine() {
  if (document.getElementById('tunes-audio')) return
  const audio = document.createElement('audio')
  audio.id = 'tunes-audio'
  audio.preload = 'auto'
  document.body.appendChild(audio)

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

  const markProgress = () => (lastProgressAt = Date.now())
  const player = () => usePlayer.getState()

  function applyVolume(volume: number, muted: boolean) {
    // Squared curve feels closer to perceived loudness than linear.
    audio.volume = Math.min(1, Math.max(0, volume * volume))
    audio.muted = muted
  }

  function doPlay() {
    markProgress()
    const p = audio.play()
    p?.catch((err: DOMException) => {
      if (err?.name === 'NotAllowedError') {
        usePlayer.setState({ isPlaying: false })
        usePlayback.setState({ buffering: false })
        toast('Press play to start listening')
      }
      // AbortError: a newer load() superseded this play — expected. Other errors surface via the 'error' event.
    })
  }

  async function load(t: Track, autoplay: boolean, startAt = 0) {
    const my = ++token
    track = t
    loadedId = t.id
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
    audio.src = url
    audio.load()
    if (autoplay) doPlay()
  }

  function play() {
    const cur = player().current()
    if (!cur) return
    if (loadedId !== cur.track.id || !audio.src) {
      void load(cur.track, true, readResume(cur.uid))
      return
    }
    // A paused live stream resumes from stale buffer; reconnect to be live again.
    if (track?.isLive && pausedAt && Date.now() - pausedAt > 3000) {
      audio.src = url
      audio.load()
    }
    usePlayback.setState({ buffering: audio.readyState < 3 })
    doPlay()
  }

  function pause() {
    pausedAt = Date.now()
    audio.pause()
    usePlayback.setState({ buffering: false })
  }

  function seek(sec: number) {
    if (!track || track.isLive) return
    if (audio.readyState === 0) {
      pendingSeek = sec
      usePlayback.setState({ currentTime: sec })
      return
    }
    const max = isFinite(audio.duration) ? audio.duration - 0.25 : sec
    audio.currentTime = Math.max(0, Math.min(sec, max))
    markProgress()
    usePlayback.setState({ currentTime: audio.currentTime })
  }

  function stop() {
    token++
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    track = null
    loadedId = null
    usePlayback.setState({ currentTime: 0, duration: 0, buffering: false })
    document.title = 'Tunes'
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  }

  function fail(reason: string) {
    if (failedToken === token || !track) return
    failedToken = token
    failures++
    const title = track.title
    const q = player().queue.length
    usePlayback.setState({ buffering: false, error: reason })
    if (q <= 1 || failures >= Math.min(q, MAX_CONSECUTIVE_FAILURES)) {
      failures = 0
      audio.pause()
      usePlayer.setState({ isPlaying: false })
      toast(`Couldn't play “${title}” (${reason}).`, 'error')
      return
    }
    toast(`Skipped “${title}” — ${reason}`, 'error')
    player().next({ auto: true, failed: true })
  }

  audio.addEventListener('timeupdate', () => {
    const t = audio.currentTime
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
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek > 0 && isFinite(audio.duration)) {
      audio.currentTime = Math.min(pendingSeek, audio.duration - 1)
      pendingSeek = 0
    }
  })
  audio.addEventListener('durationchange', () => {
    const d = audio.duration
    usePlayback.setState({ duration: isFinite(d) ? d : track?.duration || 0 })
  })
  audio.addEventListener('playing', () => {
    failures = 0
    markProgress()
    usePlayback.setState({ buffering: false, error: null })
    if (!player().isPlaying) usePlayer.setState({ isPlaying: true })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
  })
  audio.addEventListener('waiting', () => usePlayback.setState({ buffering: true }))
  audio.addEventListener('pause', () => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    // Paused by something other than us (OS, headphones unplugged…): reflect it.
    if (!audio.ended && player().isPlaying && audio.src && audio.readyState > 0) {
      pausedAt = Date.now()
      usePlayer.setState({ isPlaying: false })
    }
  })
  audio.addEventListener('ended', () => player().next({ auto: true }))
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return
    const code = audio.error?.code
    fail(code === 4 ? 'format not supported or stream offline' : code === 2 ? 'network error' : 'playback error')
  })

  // Stall watchdog + sleep timer + resume position.
  setInterval(() => {
    const s = player()
    if (s.isPlaying && track && !audio.ended && Date.now() - lastProgressAt > STALL_MS) {
      fail(audio.readyState === 0 ? 'no response from stream' : 'stream stalled')
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
      localStorage.setItem(RESUME_KEY, JSON.stringify({ uid: cur.uid, t: Math.floor(audio.currentTime) }))
    } catch {
      /* storage full or blocked */
    }
  }
  setInterval(saveResume, 5000)
  window.addEventListener('pagehide', saveResume)

  function syncPositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const d = audio.duration
    if (!isFinite(d) || d <= 0) return
    try {
      navigator.mediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate || 1 })
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

  attachEngine({
    load: (t, autoplay, startAt) => void load(t, autoplay, startAt),
    play,
    pause,
    seek,
    currentTime: () => audio.currentTime || 0,
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
