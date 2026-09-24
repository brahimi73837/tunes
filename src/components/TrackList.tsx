import { memo, useState } from 'react'
import { formatTime } from '../lib/util'
import { useIsLiked, useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { SOURCES } from '../sources'
import type { Track } from '../types'
import { Artwork } from './Artwork'
import { GripIcon, HeartFillIcon, HeartIcon, MoreIcon, PlayIcon } from './Icons'
import { MenuButton, type MenuItem } from './Menu'
import { trackMenuItems } from './trackActions'

export const TRACK_MIME = 'application/x-tunes-tracks'

export function Equalizer({ playing, className = '' }: { playing: boolean; className?: string }) {
  return (
    <span className={`inline-flex h-3.5 items-end gap-[2px] ${playing ? '' : 'eq-paused'} ${className}`} aria-label={playing ? 'Now playing' : 'Paused'}>
      {[0, 0.25, 0.5].map((d) => (
        <span key={d} className="eq-bar h-full w-[3px] rounded-sm bg-accent" style={{ animationDelay: `${-d}s` }} />
      ))}
    </span>
  )
}

export function LiveBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300 ${className}`}>
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose-400" /> Live
    </span>
  )
}

export function SourceBadge({ source }: { source: Track['source'] }) {
  const s = SOURCES[source]
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.badge}`}>{s.label}</span>
}

export function LikeButton({ track, size = 18, className = '' }: { track: Track; size?: number; className?: string }) {
  const liked = useIsLiked(track.id)
  return (
    <button
      type="button"
      aria-label={liked ? 'Remove from Liked' : 'Add to Liked'}
      aria-pressed={liked}
      title={liked ? 'Remove from Liked' : 'Add to Liked'}
      className={`icon-btn ${liked ? 'text-accent-2 hover:text-accent-2' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        useLibrary.getState().toggleLike(track)
      }}
    >
      {liked ? <HeartFillIcon size={size} /> : <HeartIcon size={size} />}
    </button>
  )
}

interface ListProps {
  tracks: Track[]
  onPlay?: (index: number) => void
  onReorder?: (from: number, to: number) => void
  extraMenu?: (track: Track, index: number) => MenuItem[]
  showSource?: boolean
  numbered?: boolean
  testId?: string
}

export function TrackList({ tracks, onPlay, onReorder, extraMenu, showSource = true, numbered = true, testId }: ListProps) {
  const currentId = usePlayer((s) => s.queue[s.index]?.track.id)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
  const play = onPlay ?? ((i: number) => usePlayer.getState().playTracks(tracks, i))

  return (
    <div role="list" data-testid={testId} className="flex flex-col">
      {tracks.map((t, i) => (
        <TrackRow
          key={`${t.id}-${i}`}
          track={t}
          index={i}
          numbered={numbered}
          showSource={showSource}
          active={t.id === currentId}
          playing={isPlaying}
          onPlay={() => play(i)}
          extraMenu={extraMenu}
          reorderable={!!onReorder}
          dropIndicator={drag && drag.over === i && drag.from !== i ? (drag.from < i ? 'below' : 'above') : null}
          onDragStart={() => setDrag({ from: i, over: null })}
          onDragEnter={() => drag && setDrag({ ...drag, over: i })}
          onDragEnd={() => setDrag(null)}
          onDrop={() => {
            if (drag && onReorder && drag.from !== i) onReorder(drag.from, i)
            setDrag(null)
          }}
        />
      ))}
    </div>
  )
}

interface RowProps {
  track: Track
  index: number
  numbered: boolean
  showSource: boolean
  active: boolean
  playing: boolean
  onPlay: () => void
  extraMenu?: (track: Track, index: number) => MenuItem[]
  reorderable: boolean
  dropIndicator: 'above' | 'below' | null
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
  onDrop: () => void
}

const TrackRow = memo(function TrackRow(p: RowProps) {
  const { track: t } = p
  return (
    <div
      role="listitem"
      data-track-id={t.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = p.reorderable ? 'copyMove' : 'copy'
        e.dataTransfer.setData(TRACK_MIME, JSON.stringify([t]))
        e.dataTransfer.setData('text/plain', `${t.title} — ${t.artist}`)
        if (p.reorderable) p.onDragStart()
      }}
      onDragEnter={(e) => {
        if (!p.reorderable) return
        e.preventDefault()
        p.onDragEnter()
      }}
      onDragOver={(e) => p.reorderable && e.preventDefault()}
      onDragEnd={p.onDragEnd}
      onDrop={(e) => {
        if (!p.reorderable) return
        e.preventDefault()
        p.onDrop()
      }}
      onDoubleClick={p.onPlay}
      className={`group relative grid cursor-default grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.05] sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.6fr)_auto] ${p.active ? 'bg-white/[0.04]' : ''}`}
    >
      {p.dropIndicator && <div className={`pointer-events-none absolute inset-x-2 h-0.5 rounded bg-accent ${p.dropIndicator === 'above' ? '-top-px' : '-bottom-px'}`} />}
      <div className="relative hidden w-8 items-center justify-center text-sm tabular-nums text-zinc-500 sm:flex">
        {p.reorderable && <GripIcon size={14} className="absolute -left-1.5 hidden cursor-grab text-zinc-600 group-hover:block" />}
        <span className="group-hover:invisible">
          {p.active ? <Equalizer playing={p.playing} /> : p.numbered ? p.index + 1 : ''}
        </span>
        <button type="button" aria-label={`Play ${t.title}`} onClick={p.onPlay} className="icon-btn invisible absolute text-white group-hover:visible">
          <PlayIcon size={14} />
        </button>
      </div>

      <button type="button" onClick={p.onPlay} className="flex min-w-0 items-center gap-3 text-left" aria-label={`Play ${t.title} by ${t.artist}`}>
        <Artwork src={t.artwork} seed={t.id} source={t.source} className="h-10 w-10" iconSize={16} />
        <div className="min-w-0">
          <div className={`truncate text-sm font-medium ${p.active ? 'text-accent-strong' : 'text-zinc-100'}`}>{t.title}</div>
          <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-zinc-400">
            {t.isLive && <LiveBadge className="sm:hidden" />}
            <span className="truncate">{t.artist}</span>
          </div>
        </div>
      </button>

      <div className="hidden min-w-0 items-center gap-2 text-xs text-zinc-500 sm:flex">
        {p.showSource && <SourceBadge source={t.source} />}
        {t.meta && <span className="truncate">{t.meta}</span>}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <LikeButton track={t} size={16} className={`h-8 w-8 ${'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100'}`} />
        <span className="hidden w-12 text-right text-xs tabular-nums text-zinc-500 sm:block">{t.isLive ? <LiveBadge /> : t.duration ? formatTime(t.duration) : '–'}</span>
        <MenuButton label={`More options for ${t.title}`} className="icon-btn h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 aria-expanded:opacity-100" items={() => trackMenuItems(t, p.extraMenu?.(t, p.index))}>
          <MoreIcon size={18} />
        </MenuButton>
      </div>
    </div>
  )
})

export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <div className="skeleton h-10 w-10 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="skeleton h-2.5 w-1/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
