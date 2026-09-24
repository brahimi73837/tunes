import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../lib/util'
import { usePlayback, usePlayer } from '../store/player'
import {
  Back10Icon, Fwd10Icon, MoonIcon, MuteIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon, VolumeIcon, VolumeLowIcon,
} from './Icons'
import { MenuButton } from './Menu'
import { LiveBadge } from './TrackList'

export function PlayButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const isPlaying = usePlayer((s) => s.isPlaying)
  const buffering = usePlayback((s) => s.buffering)
  const hasTrack = usePlayer((s) => s.index >= 0)
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-9 w-9'
  return (
    <button
      type="button"
      data-testid="play-pause"
      aria-label={isPlaying ? 'Pause' : 'Play'}
      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      disabled={!hasTrack}
      onClick={() => usePlayer.getState().togglePlay()}
      className={`relative flex ${dim} shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100`}
    >
      {isPlaying && buffering && <span className="absolute inset-[-3px] animate-spin rounded-full border-2 border-transparent border-t-accent" />}
      {isPlaying ? <PauseIcon size={size === 'lg' ? 26 : 16} /> : <PlayIcon size={size === 'lg' ? 26 : 16} className="translate-x-px" />}
    </button>
  )
}

export function TransportControls({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const isLive = usePlayer((s) => !!s.queue[s.index]?.track.isLive)
  const hasTrack = usePlayer((s) => s.index >= 0)
  const p = usePlayer.getState
  const ico = size === 'lg' ? 24 : 18
  const btn = size === 'lg' ? 'h-12 w-12' : 'h-8 w-8'
  const toggleCls = (on: boolean) => `icon-btn ${btn} relative ${on ? 'text-accent-strong hover:text-accent-strong' : ''}`
  return (
    <div className={`flex items-center justify-center ${size === 'lg' ? 'gap-3' : 'gap-1.5 sm:gap-2'}`}>
      <button type="button" aria-label={`Shuffle ${shuffle ? 'on' : 'off'}`} aria-pressed={shuffle} title="Shuffle" className={toggleCls(shuffle)} onClick={() => p().toggleShuffle()}>
        <ShuffleIcon size={ico - 2} />
        {shuffle && <Dot />}
      </button>
      <button type="button" aria-label="Previous" title="Previous (Shift+←)" disabled={!hasTrack} className={`icon-btn ${btn} text-zinc-200`} onClick={() => p().prev()}>
        <PrevIcon size={ico} />
      </button>
      <button type="button" aria-label="Back 10 seconds" title="Back 10s (←)" disabled={!hasTrack || isLive} className={`icon-btn ${btn} hidden md:inline-flex`} onClick={() => p().seekBy(-10)}>
        <Back10Icon size={ico} />
      </button>
      <PlayButton size={size} />
      <button type="button" aria-label="Forward 10 seconds" title="Forward 10s (→)" disabled={!hasTrack || isLive} className={`icon-btn ${btn} hidden md:inline-flex`} onClick={() => p().seekBy(10)}>
        <Fwd10Icon size={ico} />
      </button>
      <button type="button" data-testid="next" aria-label="Next" title="Next (Shift+→)" disabled={!hasTrack} className={`icon-btn ${btn} text-zinc-200`} onClick={() => p().next()}>
        <NextIcon size={ico} />
      </button>
      <button type="button" aria-label={`Repeat ${repeat}`} title={`Repeat: ${repeat}`} className={toggleCls(repeat !== 'off')} onClick={() => p().cycleRepeat()}>
        <RepeatIcon size={ico - 2} />
        {repeat === 'one' && <span className="absolute right-0.5 top-0.5 rounded-full bg-accent px-1 text-[9px] font-bold leading-[13px] text-white">1</span>}
        {repeat !== 'off' && <Dot />}
      </button>
    </div>
  )
}

const Dot = () => <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent-strong" />

export function SeekBar({ className = '' }: { className?: string }) {
  const cur = usePlayer((s) => s.queue[s.index]?.track)
  const currentTime = usePlayback((s) => s.currentTime)
  const duration = usePlayback((s) => s.duration)
  const [scrub, setScrub] = useState<number | null>(null)
  if (cur?.isLive) {
    return (
      <div className={`flex h-4 items-center justify-center gap-2 text-xs text-zinc-400 ${className}`} data-testid="live-indicator">
        <LiveBadge /> <span className="tabular-nums">{formatTime(currentTime)}</span>
      </div>
    )
  }
  const d = duration || cur?.duration || 0
  const t = scrub ?? currentTime
  const pct = d ? Math.min(100, (t / d) * 100) : 0
  return (
    <div className={`flex items-center gap-2 text-[11px] tabular-nums text-zinc-400 ${className}`} data-testid="seek">
      <span className="w-10 text-right">{formatTime(t)}</span>
      <input
        type="range"
        className="slider"
        aria-label="Seek"
        min={0}
        max={d || 1}
        step={0.5}
        value={t}
        disabled={!cur}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={() => {
          if (scrub != null) usePlayer.getState().seek(scrub)
          setScrub(null)
        }}
        onKeyUp={() => {
          if (scrub != null) usePlayer.getState().seek(scrub)
          setScrub(null)
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className="w-10">{formatTime(d)}</span>
    </div>
  )
}

export function VolumeControl({ className = '' }: { className?: string }) {
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const eff = muted ? 0 : volume
  const Icon = eff === 0 ? MuteIcon : eff < 0.5 ? VolumeLowIcon : VolumeIcon
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (M)" className="icon-btn h-8 w-8" onClick={() => usePlayer.getState().toggleMute()}>
        <Icon size={18} />
      </button>
      <input
        type="range"
        className="slider w-24"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={eff}
        style={{ '--pct': `${eff * 100}%` } as React.CSSProperties}
        onChange={(e) => usePlayer.getState().setVolume(Number(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

export function SleepTimerButton({ className = '' }: { className?: string }) {
  const sleepAt = usePlayer((s) => s.sleepAt)
  const endOfTrack = usePlayer((s) => s.sleepEndOfTrack)
  const [, force] = useState(0)
  useEffect(() => {
    if (!sleepAt) return
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [sleepAt])
  const active = !!sleepAt || endOfTrack
  const left = sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)) : 0
  const set = usePlayer.getState().setSleep
  return (
    <MenuButton
      label={active ? (endOfTrack ? 'Sleep timer: end of track' : `Sleep timer: ${left} min left`) : 'Sleep timer'}
      className={`icon-btn relative h-8 gap-1 px-1.5 ${active ? 'text-accent-strong hover:text-accent-strong' : ''} ${className}`}
      align="right"
      items={() => [
        ...[15, 30, 45, 60, 90].map((m) => ({ label: `${m} minutes`, onClick: () => set(m) })),
        { label: 'End of current track', onClick: () => set('end') },
        ...(active ? [{ label: '', separator: true }, { label: 'Turn off timer', onClick: () => set(null), danger: true }] : []),
      ]}
    >
      <MoonIcon size={17} />
      {active && <span className="text-[11px] font-semibold tabular-nums">{endOfTrack ? 'end' : `${left}m`}</span>}
    </MenuButton>
  )
}

/**
 * Decorative visualizer. A real analyser needs crossOrigin on the <audio> element, which
 * would break most radio streams, so this animates from play state instead of samples.
 */
export function Visualizer({ bars = 32, className = '' }: { bars?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const buffering = usePlayback((s) => s.buffering)
  const active = isPlaying && !buffering
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const levels = new Float32Array(bars).fill(0.05)
    const targets = new Float32Array(bars).fill(0.05)
    const phase = Array.from({ length: bars }, () => Math.random() * Math.PI * 2)
    let raf = 0
    let last = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < (reduce ? 200 : 33)) return
      last = now
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const t = now / 1000
      for (let i = 0; i < bars; i++) {
        if (activeRef.current) {
          // Bass-heavy envelope with a slow "beat" and per-bar jitter.
          const env = 0.35 + 0.65 * Math.pow(1 - i / bars, 0.8)
          const beat = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.1 + (i < bars / 4 ? 0 : 1.3)))
          const wobble = 0.5 + 0.5 * Math.sin(t * (1.7 + (i % 5) * 0.37) + phase[i])
          if (Math.random() < 0.18) targets[i] = Math.max(0.08, env * beat * (0.45 + 0.55 * wobble) * (0.7 + Math.random() * 0.3))
        } else targets[i] = 0.04
        levels[i] += (targets[i] - levels[i]) * 0.25
      }
      const gap = 2
      const bw = (w - gap * (bars - 1)) / bars
      const grad = ctx.createLinearGradient(0, h, 0, 0)
      grad.addColorStop(0, '#8b7bff')
      grad.addColorStop(1, '#ff6fb5')
      ctx.fillStyle = grad
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(2, levels[i] * h)
        ctx.beginPath()
        ctx.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(2, bw / 2))
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [bars])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
