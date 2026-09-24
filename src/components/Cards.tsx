import { useState, type ReactNode } from 'react'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { SourceId, Track } from '../types'
import { Artwork } from './Artwork'
import { MoreIcon, PauseIcon, PlayIcon } from './Icons'
import { MenuButton, type MenuItem } from './Menu'
import { Equalizer } from './TrackList'

interface CardProps {
  id: string
  title: string
  subtitle: string
  artwork?: string
  source: SourceId
  onOpen?: () => void
  /** Returns tracks to play; may be async (e.g. fetch an album). */
  getTracks: () => Track[] | Promise<Track[]>
  menu?: () => MenuItem[]
  round?: boolean
  badge?: ReactNode
  testId?: string
  /** Track id that means "this card is playing" (for radio stations). */
  activeTrackId?: string
}

export function Card(p: CardProps) {
  const [loading, setLoading] = useState(false)
  const currentId = usePlayer((s) => s.queue[s.index]?.track.id)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const active = !!p.activeTrackId && p.activeTrackId === currentId

  const play = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (active) return usePlayer.getState().togglePlay()
    setLoading(true)
    try {
      const tracks = await p.getTracks()
      if (!tracks.length) toast('No playable tracks here', 'error')
      else usePlayer.getState().playTracks(tracks, 0)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      data-testid={p.testId}
      className="group relative flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl p-3 transition hover:bg-white/[0.05]"
      onClick={p.onOpen ?? play}
    >
      <div className="relative">
        <Artwork src={p.artwork} seed={p.id} source={p.source} className="aspect-square w-full shadow-lg shadow-black/40" rounded={p.round ? 'rounded-full' : 'rounded-lg'} iconSize={36} />
        <button
          type="button"
          aria-label={active && isPlaying ? `Pause ${p.title}` : `Play ${p.title}`}
          onClick={play}
          className={`absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-xl shadow-black/50 transition hover:scale-105 hover:bg-accent-strong ${active || loading ? 'opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100'}`}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : active && isPlaying ? (
            <PauseIcon size={18} />
          ) : (
            <PlayIcon size={18} className="translate-x-px" />
          )}
        </button>
        {p.badge && <div className="absolute left-2 top-2">{p.badge}</div>}
      </div>
      <div className="min-w-0 pr-6">
        <div className={`flex items-center gap-2 truncate text-sm font-semibold ${active ? 'text-accent-strong' : 'text-white'}`}>
          {active && <Equalizer playing={isPlaying} />}
          <span className="truncate">{p.title}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{p.subtitle}</div>
      </div>
      {p.menu && (
        <MenuButton label={`More options for ${p.title}`} className="icon-btn absolute bottom-3 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100" items={p.menu}>
          <MoreIcon size={16} />
        </MenuButton>
      )}
    </div>
  )
}

export function CardGrid({ children, testId, rows }: { children: ReactNode; testId?: string; rows?: 'one' }) {
  return (
    <div
      data-testid={testId}
      className={`-mx-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 ${rows === 'one' ? 'grid-rows-1 auto-rows-[0] overflow-hidden' : ''}`}
    >
      {children}
    </div>
  )
}

export function CardGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="-mx-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 p-3">
          <div className="skeleton aspect-square w-full rounded-lg" />
          <div className="skeleton h-3 w-3/4 rounded" />
          <div className="skeleton h-2.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  )
}

/** A radio station tile. Playing it queues the whole visible station list so next/prev hop stations. */
export function StationCard({ station, list, index }: { station: Track; list: Track[]; index: number }) {
  return (
    <Card
      id={station.id}
      title={station.title}
      subtitle={station.artist}
      artwork={station.artwork}
      source="radio"
      activeTrackId={station.id}
      getTracks={() => [...list.slice(index), ...list.slice(0, index)]}
      testId="station-card"
    />
  )
}

export function EmptyState({ title, body, icon, action }: { title: string; body?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 text-zinc-500">{icon}</div>}
      <div className="font-semibold text-zinc-200">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
      <span>Couldn’t load: {message}</span>
      {onRetry && (
        <button className="btn-ghost py-1.5" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
