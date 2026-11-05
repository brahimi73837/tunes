import { useEffect, useRef } from 'react'
import { useAsync } from '../lib/hooks'
import { activeLine, getLyrics } from '../sources/lyrics'
import { usePlayback, usePlayer } from '../store/player'
import type { Track } from '../types'

/** Synced lyrics follow the song (click a line to jump there); plain lyrics just scroll. */
export function LyricsPanel({ track, className = '' }: { track: Track; className?: string }) {
  const res = useAsync(track.isLive ? null : `lyrics:${track.id}`, (s) => getLyrics(track, s))
  const time = usePlayback((s) => s.currentTime)
  const lines = res.data?.synced
  const current = lines ? activeLine(lines, time) : -1
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (current < 0 || !box.current) return
    const el = box.current.querySelector<HTMLElement>(`[data-line="${current}"]`)
    if (!el) return
    // Keep the sung line about a third of the way down, scrolling only this panel.
    box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 3, behavior: 'smooth' })
  }, [current])

  let body: React.ReactNode
  if (track.isLive) body = <Note>No lyrics for live radio.</Note>
  else if (res.loading) body = <Note>Looking for lyrics…</Note>
  else if (res.error || !res.data) body = <Note>No lyrics found for this song.</Note>
  else if (lines)
    body = lines.map((l, i) => (
      <button
        key={i}
        type="button"
        data-line={i}
        aria-current={i === current ? 'true' : undefined}
        onClick={() => usePlayer.getState().seek(l.at)}
        className={`block w-full py-1.5 text-left text-xl font-bold leading-snug transition sm:text-2xl ${i === current ? 'text-white' : i < current ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-600 hover:text-zinc-300'}`}
      >
        {l.text || '♪'}
      </button>
    ))
  else body = <p className="whitespace-pre-line text-lg font-semibold leading-relaxed text-zinc-200">{res.data.plain}</p>

  return (
    <div className={`relative flex min-h-0 flex-col ${className}`} data-testid="lyrics">
      <div ref={box} className="relative min-h-0 flex-1 overflow-y-auto scroll-thin pr-2 [mask-image:linear-gradient(transparent,black_8%,black_85%,transparent)]">
        <div className="py-[30%]">{body}</div>
      </div>
      {res.data && <div className="pt-2 text-[11px] text-zinc-500">Lyrics: {res.data.source}{lines ? ' · synced' : ''}</div>}
    </div>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="text-center text-sm text-zinc-500">{children}</p>
