import { useEffect, useRef } from 'react'
import { useRoute } from './lib/router'
import { useShortcuts } from './lib/shortcuts'
import { useUI } from './store/ui'
import { HelpOverlay, MobileNav, Sidebar, Toasts, TopBar } from './components/Chrome'
import { DialogHost } from './components/Dialog'
import { MiniPlayer, PlayerBar } from './components/PlayerBar'
import { QueuePanel } from './components/QueuePanel'
import { ArchiveAlbumView, AudiusPlaylistView, GenreView } from './views/Collections'
import { Home } from './views/Home'
import { ImportView, LibraryView, PlaylistView } from './views/Library'
import { RadioView } from './views/Radio'
import { SearchView } from './views/Search'
import { EmptyState } from './components/Cards'
import { Page } from './views/common'

function Routes() {
  const { path } = useRoute()
  const [a, b] = path
  switch (a) {
    case undefined:
      return <Home />
    case 'search':
      return <SearchView />
    case 'radio':
      return <RadioView />
    case 'library':
      return <LibraryView />
    case 'playlist':
      return <PlaylistView key={b} id={b} />
    case 'album':
      return <ArchiveAlbumView key={b} id={b} />
    case 'audius-playlist':
      return <AudiusPlaylistView key={b} id={b} />
    case 'genre':
      return <GenreView key={b} genre={b} />
    case 'import':
      return <ImportView payload={path.slice(1).join('/')} />
    default:
      return (
        <Page>
          <EmptyState title="Page not found" body="That link doesn’t point anywhere in Tunes." action={<a className="btn-primary" href="#/">Go home</a>} />
        </Page>
      )
  }
}

export default function App() {
  useShortcuts()
  const mini = useUI((s) => s.miniMode)
  const queueOpen = useUI((s) => s.queueOpen)
  const route = useRoute()
  const mainRef = useRef<HTMLElement>(null)
  const routeKey = route.path.join('/')

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [routeKey])

  if (mini) {
    return (
      <>
        <MiniPlayer />
        <Toasts />
        <HelpOverlay />
        <DialogHost />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-line md:block xl:w-72">
          <Sidebar />
        </aside>
        <main ref={mainRef} id="main" className="relative min-w-0 flex-1 overflow-y-auto scroll-thin">
          <TopBar />
          <Routes />
        </main>
        {queueOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => useUI.getState().setQueueOpen(false)} />
            <div className="fixed inset-y-0 right-0 z-40 w-[min(22rem,100%)] lg:static lg:z-auto lg:w-80 lg:shrink-0 xl:w-96">
              <QueuePanel />
            </div>
          </>
        )}
      </div>
      <PlayerBar />
      <MobileNav />
      <Toasts />
      <HelpOverlay />
      <DialogHost />
    </div>
  )
}
