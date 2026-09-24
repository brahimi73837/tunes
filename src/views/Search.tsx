import { useAsync, useDebounced } from '../lib/hooks'
import { href, navigate, useRoute } from '../lib/router'
import * as archive from '../sources/archive'
import * as audius from '../sources/audius'
import * as radio from '../sources/radio'
import { Card, CardGrid, CardGridSkeleton, EmptyState, ErrorState, StationCard } from '../components/Cards'
import { SearchIcon } from '../components/Icons'
import { TrackList, TrackListSkeleton } from '../components/TrackList'
import { collectionMenuItems } from '../components/trackActions'
import { AlbumCard } from './Home'
import { GenreTiles, Page, Section } from './common'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'audius', label: 'Audius' },
  { id: 'archive', label: 'Archive' },
  { id: 'radio', label: 'Radio' },
] as const
type Tab = (typeof TABS)[number]['id']

export function SearchView() {
  const route = useRoute()
  const rawQ = (route.query.get('q') ?? '').trim()
  const tab = (TABS.some((t) => t.id === route.query.get('tab')) ? route.query.get('tab') : 'all') as Tab
  const q = useDebounced(rawQ, 350)
  const pending = q !== rawQ
  const want = (t: Tab) => (q && (tab === 'all' || tab === t) ? q : null)

  const tracks = useAsync(want('audius') && `s:audius:${q}`, (s) => audius.searchTracks(q, s))
  const lists = useAsync(want('audius') && `s:audius-pl:${q}`, (s) => audius.searchPlaylists(q, s))
  const albums = useAsync(want('archive') && `s:archive:${q}`, (s) => archive.searchAlbums(q, s))
  const stations = useAsync(want('radio') && `s:radio:${q}`, (s) => radio.searchByName(q, s))

  const setTab = (t: Tab) => navigate(`/search?q=${encodeURIComponent(rawQ)}${t === 'all' ? '' : `&tab=${t}`}`, { replace: true })

  if (!rawQ) {
    return (
      <Page title="Search">
        <p className="-mt-3 mb-6 text-sm text-zinc-400">
          Independent artists on Audius, free albums and live recordings on the Internet Archive, and live radio from around the world. Press <kbd className="rounded border border-line px-1.5 text-xs">/</kbd> anywhere to search.
        </p>
        <Section title="Browse all">
          <GenreTiles />
        </Section>
      </Page>
    )
  }

  const loadingAny = pending || tracks.loading || lists.loading || albums.loading || stations.loading
  const nothing =
    !loadingAny && !tracks.error && !albums.error && !stations.error &&
    (tab === 'all' ? !tracks.data?.length && !albums.data?.length && !stations.data?.length && !lists.data?.length
      : tab === 'audius' ? !tracks.data?.length && !lists.data?.length
      : tab === 'archive' ? !albums.data?.length
      : !stations.data?.length)

  return (
    <Page>
      <div className="sticky top-16 z-10 -mx-4 mb-4 flex items-center gap-2 bg-bg/80 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6" role="tablist" aria-label="Sources">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-testid={`tab-${t.id}`} className={`chip ${tab === t.id ? 'chip-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        {loadingAny && <span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Searching" />}
      </div>

      {nothing && (
        <EmptyState icon={<SearchIcon size={32} />} title={`No results for “${q}”`} body="Check the spelling, try fewer words, or switch source tabs." />
      )}

      {(tab === 'all' || tab === 'audius') && (
        <Section title={tab === 'all' ? 'Tracks · Audius' : 'Tracks'} testId="results-audius" action={tab === 'all' && (tracks.data?.length ?? 0) > 6 ? <TabLink tab="audius" q={rawQ} /> : undefined}>
          {tracks.error ? <ErrorState message={tracks.error} onRetry={tracks.retry} /> : tracks.loading || pending ? <TrackListSkeleton rows={tab === 'all' ? 6 : 10} /> : tracks.data?.length ? <TrackList tracks={tab === 'all' ? tracks.data.slice(0, 6) : tracks.data} showSource={false} testId="audius-tracks" /> : <Muted>No Audius tracks.</Muted>}
        </Section>
      )}

      {(tab === 'all' || tab === 'radio') && (
        <Section title={tab === 'all' ? 'Stations · Radio' : 'Stations'} testId="results-radio" action={tab === 'all' && (stations.data?.length ?? 0) > 5 ? <TabLink tab="radio" q={rawQ} /> : undefined}>
          {stations.error ? (
            <ErrorState message={stations.error} onRetry={stations.retry} />
          ) : stations.loading || pending ? (
            <CardGridSkeleton count={5} />
          ) : stations.data?.length ? (
            <CardGrid testId="radio-results">{(tab === 'all' ? stations.data.slice(0, 5) : stations.data).map((s, i, list) => <StationCard key={s.id} station={s} list={list} index={i} />)}</CardGrid>
          ) : (
            <Muted>No https stations matched. Try the Radio tab’s genre chips.</Muted>
          )}
        </Section>
      )}

      {(tab === 'all' || tab === 'archive') && (
        <Section title={tab === 'all' ? 'Albums · Internet Archive' : 'Albums & recordings'} testId="results-archive" action={tab === 'all' && (albums.data?.length ?? 0) > 5 ? <TabLink tab="archive" q={rawQ} /> : undefined}>
          {albums.error ? (
            <ErrorState message={albums.error} onRetry={albums.retry} />
          ) : albums.loading || pending ? (
            <CardGridSkeleton count={5} />
          ) : albums.data?.length ? (
            <CardGrid testId="archive-results">{(tab === 'all' ? albums.data.slice(0, 5) : albums.data).map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
          ) : (
            <Muted>No Archive albums.</Muted>
          )}
        </Section>
      )}

      {(tab === 'all' || tab === 'audius') && !!lists.data?.length && (
        <Section title="Playlists · Audius" testId="results-audius-playlists">
          <CardGrid>
            {(tab === 'all' ? lists.data.slice(0, 5) : lists.data).map((p) => (
              <Card
                key={p.id}
                id={p.id}
                title={p.title}
                subtitle={`${p.kind === 'album' ? 'Album' : 'Playlist'} · ${p.artist}`}
                artwork={p.artwork}
                source="audius"
                onOpen={() => navigate(`/audius-playlist/${p.id}`)}
                getTracks={() => audius.playlistTracks(p.id)}
                menu={() => collectionMenuItems(() => audius.playlistTracks(p.id))}
              />
            ))}
          </CardGrid>
        </Section>
      )}
    </Page>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="px-1 py-2 text-sm text-zinc-500">{children}</p>

function TabLink({ tab, q }: { tab: Tab; q: string }) {
  return (
    <a href={href(`/search?q=${encodeURIComponent(q)}&tab=${tab}`)} className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:underline">
      Show all
    </a>
  )
}
