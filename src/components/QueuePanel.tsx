import { useState } from 'react'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import { formatTime } from '../lib/util'
import { Artwork } from './Artwork'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, GripIcon, ListPlusIcon, MoreIcon, TrashIcon } from './Icons'
import { MenuButton } from './Menu'
import { EmptyState } from './Cards'
import { Equalizer, LiveBadge } from './TrackList'
import { playlistSubmenu, trackMenuItems } from './trackActions'
import type { QueueItem } from '../types'

export function QueuePanel() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
  const p = usePlayer.getState
  const current = queue[index]
  const upcoming = queue.slice(index + 1)
  const history = index > 0 ? queue.slice(0, index) : []

  const row = (q: QueueItem, i: number) => {
    const isCurrent = i === index
    return (
      <div
        key={q.uid}
        data-testid="queue-item"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', q.track.title)
          setDrag({ from: i, over: null })
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (drag) setDrag({ ...drag, over: i })
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragEnd={() => setDrag(null)}
        onDrop={(e) => {
          e.preventDefault()
          if (drag && drag.from !== i) p().moveInQueue(drag.from, i)
          setDrag(null)
        }}
        onDoubleClick={() => p().jumpTo(q.uid)}
        className={`group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.05] ${isCurrent ? 'bg-white/[0.05]' : ''} ${i < index ? 'opacity-50' : ''}`}
      >
        {drag && drag.over === i && drag.from !== i && (
          <div className={`pointer-events-none absolute inset-x-2 h-0.5 rounded bg-accent ${drag.from < i ? '-bottom-px' : '-top-px'}`} />
        )}
        <GripIcon size={14} className="shrink-0 cursor-grab text-zinc-600 opacity-0 group-hover:opacity-100" />
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => p().jumpTo(q.uid)} aria-label={`Play ${q.track.title}`}>
          <Artwork src={q.track.artwork} seed={q.track.id} source={q.track.source} className="h-9 w-9" iconSize={14} />
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 truncate text-sm ${isCurrent ? 'font-semibold text-accent-strong' : 'text-zinc-100'}`}>
              {isCurrent && <Equalizer playing={isPlaying} />}
              <span className="truncate">{q.track.title}</span>
            </div>
            <div className="truncate text-xs text-zinc-500">{q.track.artist}</div>
          </div>
        </button>
        <span className="text-[11px] tabular-nums text-zinc-500 group-hover:hidden">{q.track.isLive ? <LiveBadge /> : q.track.duration ? formatTime(q.track.duration) : ''}</span>
        <div className="hidden items-center group-hover:flex group-focus-within:flex">
          <MenuButton
            label="More"
            className="icon-btn h-7 w-7"
            items={() =>
              trackMenuItems(q.track, [
                { label: 'Move up', icon: <ArrowUpIcon size={14} />, disabled: i === 0, onClick: () => p().moveInQueue(i, i - 1) },
                { label: 'Move down', icon: <ArrowDownIcon size={14} />, disabled: i === queue.length - 1, onClick: () => p().moveInQueue(i, i + 1) },
                { label: 'Remove from queue', icon: <TrashIcon size={14} />, danger: true, onClick: () => p().removeFromQueue(q.uid) },
              ])
            }
          >
            <MoreIcon size={16} />
          </MenuButton>
          <button type="button" aria-label={`Remove ${q.track.title} from queue`} title="Remove" className="icon-btn h-7 w-7" onClick={() => p().removeFromQueue(q.uid)}>
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <aside data-testid="queue-panel" className="flex h-full w-full flex-col border-l border-line bg-surface" aria-label="Queue">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="text-base font-bold text-white">Queue</h2>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <MenuButton
              label="Save queue as playlist"
              className="icon-btn h-8 w-8"
              items={() => playlistSubmenu(queue.map((q) => q.track))}
            >
              <ListPlusIcon size={16} />
            </MenuButton>
          )}
          <button type="button" className="btn-ghost px-3 py-1 text-xs" disabled={upcoming.length === 0 && history.length === 0} onClick={() => p().clearQueue()} data-testid="clear-queue">
            Clear
          </button>
          <button type="button" aria-label="Close queue" className="icon-btn h-8 w-8" onClick={() => useUI.getState().setQueueOpen(false)}>
            <CloseIcon size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 scroll-thin">
        {queue.length === 0 ? (
          <div className="p-2">
            <EmptyState title="Your queue is empty" body="Play something or use “Add to queue” on any track." />
          </div>
        ) : (
          <>
            {current && (
              <>
                <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Now playing</div>
                {row(current, index)}
              </>
            )}
            <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Next up {upcoming.length > 0 && <span className="normal-case tracking-normal text-zinc-600">· {upcoming.length}</span>}
            </div>
            {upcoming.length ? upcoming.map((q, j) => row(q, index + 1 + j)) : <div className="px-2 py-3 text-sm text-zinc-500">Nothing queued after this.</div>}
            {history.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Played</div>
                {history.map((q, j) => row(q, j))}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
