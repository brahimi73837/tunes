import { useState } from 'react'
import { usePlayback, usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import { Artwork } from './Artwork'
import { PlayButton, SeekBar, SleepTimerButton, TransportControls, Visualizer, VolumeControl } from './Controls'
import { CloseIcon, MaximizeIcon, MinimizeIcon, MoreIcon, NextIcon, QueueIcon, WaveIcon } from './Icons'
import { MenuButton } from './Menu'
import { LikeButton, LiveBadge, SourceBadge } from './TrackList'
import { trackMenuItems } from './trackActions'

function NowPlayingInfo({ onOpen }: { onOpen: () => void }) {
  const t = usePlayer((s) => s.queue[s.index]?.track)
  const error = usePlayback((s) => s.error)
  if (!t) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-14 w-14 shrink-0 rounded-md bg-white/5" />
        <div className="text-sm text-zinc-500">Nothing playing</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="now-playing">
      <button type="button" onClick={onOpen} aria-label="Open now playing" className="shrink-0 transition hover:opacity-90">
        <Artwork src={t.artwork} seed={t.id} source={t.source} className="h-12 w-12 sm:h-14 sm:w-14 shadow-md shadow-black/40" />
      </button>
      <div className="min-w-0">
        <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-sm font-semibold text-white hover:underline" data-testid="now-playing-title">
          {t.title}
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
          {t.isLive && <LiveBadge />}
          <span className="truncate">{error ? <span className="text-rose-300">{error}</span> : t.artist}</span>
        </div>
      </div>
      <LikeButton track={t} className="ml-1 hidden h-8 w-8 shrink-0 sm:inline-flex" />
    </div>
  )
}

export function PlayerBar() {
  const [expanded, setExpanded] = useState(false)
  const queueOpen = useUI((s) => s.queueOpen)
  const visualizerOn = useUI((s) => s.visualizer)
  const hasTrack = usePlayer((s) => s.index >= 0)
  const current = usePlayer((s) => s.queue[s.index]?.track)
  const currentTime = usePlayback((s) => s.currentTime)
  const duration = usePlayback((s) => s.duration)
  const pct = duration && !current?.isLive ? (currentTime / duration) * 100 : 0

  return (
    <>
      <footer
        data-testid="player-bar"
        className="relative z-30 border-t border-line bg-surface/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl sm:px-4 sm:py-3"
      >
        {/* Mobile: thin progress line + compact controls */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10 sm:hidden">
          <div className="h-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:gap-4">
          <NowPlayingInfo onOpen={() => hasTrack && setExpanded(true)} />

          <div className="hidden flex-col items-center gap-1 sm:flex">
            <TransportControls />
            <SeekBar className="w-full max-w-xl" />
          </div>

          <div className="flex items-center justify-end gap-1">
            <div className="flex items-center gap-1 sm:hidden">
              {current && <LikeButton track={current} className="h-9 w-9" />}
              <PlayButton />
              <button type="button" aria-label="Next" className="icon-btn h-9 w-9 text-zinc-200" onClick={() => usePlayer.getState().next()} disabled={!hasTrack}>
                <NextIcon size={18} />
              </button>
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              {visualizerOn && hasTrack && <Visualizer bars={10} className="mr-1 hidden h-6 w-14 xl:block" />}
              <SleepTimerButton className="hidden lg:inline-flex" />
              <button
                type="button"
                aria-label="Queue"
                aria-pressed={queueOpen}
                title="Queue (Q)"
                className={`icon-btn h-8 w-8 ${queueOpen ? 'text-accent-strong hover:text-accent-strong' : ''}`}
                onClick={() => useUI.getState().setQueueOpen(!queueOpen)}
              >
                <QueueIcon size={18} />
              </button>
              <VolumeControl className="hidden md:flex" />
              <button type="button" aria-label="Compact mode" title="Compact mode" className="icon-btn h-8 w-8" onClick={() => useUI.getState().toggleMini()}>
                <MinimizeIcon size={16} />
              </button>
            </div>
          </div>
        </div>
      </footer>
      {expanded && current && <NowPlayingSheet onClose={() => setExpanded(false)} />}
    </>
  )
}

/** Full-screen now-playing view (mobile primary controls; also a nice desktop "lean back" view). */
export function NowPlayingSheet({ onClose }: { onClose: () => void }) {
  const t = usePlayer((s) => s.queue[s.index]?.track)
  const visualizerOn = useUI((s) => s.visualizer)
  if (!t) return null
  return (
    <div className="fade-in fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg" role="dialog" aria-label="Now playing" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {t.artwork && <img src={t.artwork} alt="" className="h-full w-full scale-125 object-cover opacity-30 blur-3xl" referrerPolicy="no-referrer" />}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
      </div>
      <div className="relative flex items-center justify-between p-4">
        <button type="button" aria-label="Close" className="icon-btn h-10 w-10 bg-white/5" onClick={onClose} autoFocus>
          <CloseIcon />
        </button>
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Now playing</div>
        <MenuButton label="More" className="icon-btn h-10 w-10 bg-white/5" items={() => trackMenuItems(t)}>
          <MoreIcon />
        </MenuButton>
      </div>
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 pb-10">
        <Artwork src={t.artwork} seed={t.id} source={t.source} className="aspect-square w-full shadow-2xl shadow-black/60" rounded="rounded-2xl" iconSize={64} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xl font-bold text-white">{t.title}</div>
            <div className="mt-1 flex items-center gap-2 truncate text-sm text-zinc-400">
              <SourceBadge source={t.source} />
              <span className="truncate">{t.artist}</span>
            </div>
          </div>
          <LikeButton track={t} size={24} className="h-10 w-10 shrink-0" />
        </div>
        {visualizerOn && <Visualizer bars={40} className="h-12 w-full" />}
        <SeekBar />
        <TransportControls size="lg" />
        <div className="flex items-center justify-between">
          <SleepTimerButton />
          <VolumeControl />
          <button type="button" aria-label="Toggle visualizer" title="Visualizer" className={`icon-btn h-8 w-8 ${visualizerOn ? 'text-accent-strong' : ''}`} onClick={() => useUI.getState().toggleVisualizer()}>
            <WaveIcon size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Compact mode: a small floating card, handy when the window is shrunk next to work. */
export function MiniPlayer() {
  const t = usePlayer((s) => s.queue[s.index]?.track)
  const visualizerOn = useUI((s) => s.visualizer)
  return (
    <div className="flex h-full items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-2xl" data-testid="mini-player">
        <div className="flex items-center gap-3">
          <Artwork src={t?.artwork} seed={t?.id ?? 'none'} source={t?.source} className="h-16 w-16" rounded="rounded-lg" iconSize={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-white">{t?.title ?? 'Nothing playing'}</div>
            <div className="truncate text-sm text-zinc-400">{t?.artist ?? 'Pick something from the full view'}</div>
          </div>
          {t && <LikeButton track={t} className="h-9 w-9" />}
          <button type="button" aria-label="Exit compact mode" title="Exit compact mode" className="icon-btn h-9 w-9" onClick={() => useUI.getState().toggleMini()}>
            <MaximizeIcon size={16} />
          </button>
        </div>
        {visualizerOn && t && <Visualizer bars={28} className="mt-3 h-8 w-full" />}
        <SeekBar className="mt-2" />
        <div className="mt-1 flex items-center justify-between">
          <TransportControls />
        </div>
        <VolumeControl className="mt-2 justify-center" />
      </div>
    </div>
  )
}
