import type { ReactNode } from 'react'
import { href } from '../lib/router'
import { GENRES } from '../sources/audius'
import { PlayIcon, ShuffleIcon } from '../components/Icons'

export function Page({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="fade-in mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6">
      {title && <h1 className="mb-5 mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>}
      {children}
    </div>
  )
}

export function Section({ title, action, children, testId }: { title: string; action?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-8 first:mt-2" data-testid={testId}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SeeAll({ to, label = 'Show all' }: { to: string; label?: string }) {
  return (
    <a href={href(to)} className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:underline">
      {label}
    </a>
  )
}

export function PlayShuffleButtons({ onPlay, onShuffle, disabled, children }: { onPlay: () => void; onShuffle: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-primary px-6 py-2.5" onClick={onPlay} disabled={disabled} data-testid="play-all">
        <PlayIcon size={16} /> Play
      </button>
      <button type="button" className="btn-ghost py-2.5" onClick={onShuffle} disabled={disabled} data-testid="shuffle-all">
        <ShuffleIcon size={16} /> Shuffle
      </button>
      {children}
    </div>
  )
}

const GENRE_STYLES = [
  'from-violet-600 to-indigo-700', 'from-rose-500 to-orange-500', 'from-sky-500 to-blue-700', 'from-emerald-500 to-teal-700',
  'from-fuchsia-600 to-pink-600', 'from-amber-500 to-red-600', 'from-cyan-500 to-sky-700', 'from-lime-500 to-emerald-700',
  'from-indigo-500 to-purple-700', 'from-pink-500 to-rose-700', 'from-slate-500 to-slate-800', 'from-orange-500 to-amber-700',
]

export function GenreTiles({ limit }: { limit?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {GENRES.slice(0, limit).map((g, i) => (
        <a
          key={g}
          href={href(`/genre/${encodeURIComponent(g)}`)}
          className={`relative h-20 overflow-hidden rounded-xl bg-gradient-to-br p-3 text-base font-extrabold text-white shadow-lg shadow-black/30 transition hover:scale-[1.02] hover:brightness-110 sm:h-24 ${GENRE_STYLES[i % GENRE_STYLES.length]}`}
          data-testid="genre-tile"
        >
          {g}
          <span className="absolute -bottom-3 -right-2 text-6xl font-black text-white/10">{g[0]}</span>
        </a>
      ))}
    </div>
  )
}

export function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Late night listening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
