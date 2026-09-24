import { useEffect, useRef, useState } from 'react'
import { href, navigate, useRoute } from '../lib/router'
import { LIKED_ID, useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import type { Track } from '../types'
import { CloseIcon, FocusIcon, HeartFillIcon, HomeIcon, KeyboardIcon, LibraryIcon, MusicIcon, PlusIcon, RadioIcon, SearchIcon } from './Icons'
import { Equalizer, TRACK_MIME } from './TrackList'
import { addToPlaylist, createPlaylistWith } from './trackActions'
import { startFocusMode, useFocusModeState } from '../views/focus'

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, match: (p: string[]) => p.length === 0 },
  { to: '/search', label: 'Search', icon: SearchIcon, match: (p: string[]) => p[0] === 'search' },
  { to: '/radio', label: 'Radio', icon: RadioIcon, match: (p: string[]) => p[0] === 'radio' },
  { to: '/library', label: 'Library', icon: LibraryIcon, match: (p: string[]) => p[0] === 'library' },
]

export function Logo() {
  return (
    <a href={href('/')} className="flex items-center gap-2.5 px-2 text-white" aria-label="Tunes home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 shadow-lg shadow-accent/30">
        <MusicIcon size={17} className="text-white" />
      </span>
      <span className="text-lg font-extrabold tracking-tight">Tunes</span>
    </a>
  )
}

function readDroppedTracks(e: React.DragEvent): Track[] | null {
  try {
    const raw = e.dataTransfer.getData(TRACK_MIME)
    return raw ? (JSON.parse(raw) as Track[]) : null
  } catch {
    return null
  }
}

export function Sidebar() {
  const { path } = useRoute()
  const playlists = useLibrary((s) => s.playlists)
  const playingPlaylist = usePlayer((s) => s.queue[s.index]?.track.id)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  return (
    <nav className="flex h-full flex-col gap-2 bg-surface/60 p-3" aria-label="Main">
      <div className="py-2">
        <Logo />
      </div>
      <ul className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = n.match(path)
          return (
            <li key={n.to}>
              <a
                href={href(n.to)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'}`}
              >
                <n.icon size={19} />
                {n.label}
              </a>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Playlists</span>
        <button type="button" aria-label="New playlist" title="New playlist" className="icon-btn h-7 w-7 hover:bg-white/10" onClick={() => void createPlaylistWith([])}>
          <PlusIcon size={16} />
        </button>
      </div>
      <ul className="-mx-1 flex-1 overflow-y-auto px-1 scroll-thin" data-testid="sidebar-playlists">
        {playlists.map((p) => {
          const active = path[0] === 'playlist' && path[1] === p.id
          const containsCurrent = isPlaying && !!playingPlaylist && p.tracks.some((t) => t.id === playingPlaylist)
          return (
            <li key={p.id}>
              <a
                href={href(`/playlist/${p.id}`)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(TRACK_MIME)) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setDropTarget(p.id)
                  }
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTarget(null)
                  const tracks = readDroppedTracks(e)
                  if (!tracks) return
                  if (p.id === LIKED_ID) tracks.forEach((t) => !useLibrary.getState().playlists[0].tracks.some((x) => x.id === t.id) && useLibrary.getState().toggleLike(t))
                  else addToPlaylist(p.id, tracks)
                }}
                className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition ${active ? 'bg-white/[0.08] text-white' : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'} ${dropTarget === p.id ? 'ring-2 ring-accent' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${p.id === LIKED_ID ? 'bg-gradient-to-br from-accent to-accent-2' : 'bg-elevated'}`}>
                  {p.id === LIKED_ID ? <HeartFillIcon size={15} className="text-white" /> : <MusicIcon size={15} className="text-zinc-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-xs text-zinc-500">{p.tracks.length} {p.tracks.length === 1 ? 'track' : 'tracks'}</span>
                </span>
                {containsCurrent && <Equalizer playing />}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="px-3 text-[11px] leading-relaxed text-zinc-600">Tip: drag any track onto a playlist to add it.</p>
    </nav>
  )
}

export function MobileNav() {
  const { path } = useRoute()
  return (
    <nav className="grid grid-cols-4 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden" aria-label="Main">
      {NAV.map((n) => {
        const active = n.match(path)
        return (
          <a key={n.to} href={href(n.to)} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-white' : 'text-zinc-500'}`}>
            <n.icon size={20} />
            {n.label}
          </a>
        )
      })}
    </nav>
  )
}

export function TopBar() {
  const route = useRoute()
  const q = route.path[0] === 'search' ? route.query.get('q') ?? '' : ''
  const [value, setValue] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)
  const focusMode = useFocusModeState()

  // Keep the box in sync when navigating (back/forward, genre links).
  useEffect(() => {
    if (document.activeElement !== inputRef.current || route.path[0] !== 'search') setValue(q)
  }, [q, route.path])

  const onChange = (v: string) => {
    setValue(v)
    const tab = route.path[0] === 'search' ? route.query.get('tab') ?? 'all' : 'all'
    const target = `/search?q=${encodeURIComponent(v)}${tab !== 'all' ? `&tab=${tab}` : ''}`
    navigate(target, { replace: route.path[0] === 'search' })
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="md:hidden">
        <a href={href('/')} aria-label="Home" className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2">
          <MusicIcon size={17} className="text-white" />
        </a>
      </div>
      <form
        role="search"
        className="relative w-full max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          onChange(value)
        }}
      >
        <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          ref={inputRef}
          id="global-search"
          data-testid="search-input"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search artists, tracks, albums, stations…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => route.path[0] !== 'search' && value === '' && navigate('/search')}
          className="h-10 w-full rounded-full border border-line bg-white/[0.06] pl-10 pr-16 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-accent/50 focus:bg-white/[0.09] [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button type="button" aria-label="Clear search" className="icon-btn absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => (onChange(''), inputRef.current?.focus())}>
            <CloseIcon size={16} />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-zinc-500 sm:block">/</kbd>
        )}
      </form>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => void startFocusMode()}
          disabled={focusMode}
          className="btn-ghost hidden py-1.5 sm:inline-flex"
          title="Queue lofi & ambient radio for deep work"
          data-testid="focus-mode"
        >
          <FocusIcon size={16} /> {focusMode ? 'Tuning in…' : 'Focus mode'}
        </button>
        <button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className="icon-btn h-9 w-9 bg-white/[0.06] hover:bg-white/10" onClick={() => useUI.getState().setHelp(true)}>
          <KeyboardIcon size={18} />
        </button>
      </div>
    </header>
  )
}


export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2 sm:bottom-24" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`toast-in pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium shadow-2xl shadow-black/50 ${t.kind === 'error' ? 'bg-rose-950/95 text-rose-100 ring-1 ring-rose-500/30' : 'bg-white text-zinc-900'}`}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              className="shrink-0 font-bold underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.run()
                useUI.getState().dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek 10 seconds back / forward'],
  ['Shift + ← / →', 'Previous / next track'],
  ['↑ / ↓', 'Volume up / down'],
  ['M', 'Mute / unmute'],
  ['S', 'Toggle shuffle'],
  ['R', 'Cycle repeat (off → all → one)'],
  ['L', 'Like / unlike current track'],
  ['Q', 'Show / hide queue'],
  ['/', 'Focus search'],
  ['?', 'This help'],
  ['Esc', 'Close dialogs / leave search box'],
]

export function HelpOverlay() {
  const open = useUI((s) => s.helpOpen)
  if (!open) return null
  const close = () => useUI.getState().setHelp(false)
  return (
    <div className="fade-in fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()} data-testid="help-overlay">
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close" className="icon-btn h-8 w-8" onClick={close} autoFocus>
            <CloseIcon size={18} />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-line bg-white/5 px-2 py-0.5 font-mono text-xs text-zinc-200">{k}</kbd>
              </dt>
              <dd className="text-zinc-400">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-zinc-500">Hardware media keys and OS media controls work too.</p>
      </div>
    </div>
  )
}
