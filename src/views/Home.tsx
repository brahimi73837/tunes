import { useAsync } from '../lib/hooks'
import { navigate } from '../lib/router'
import * as archive from '../sources/archive'
import * as audius from '../sources/audius'
import * as radio from '../sources/radio'
import { LIKED_ID, useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { Card, CardGrid, CardGridSkeleton, ErrorState, StationCard } from '../components/Cards'
import { FocusIcon, HeartFillIcon, PlayIcon, RadioIcon } from '../components/Icons'
import { TrackList, TrackListSkeleton } from '../components/TrackList'
import { collectionMenuItems } from '../components/trackActions'
import { startFocusMode, useFocusModeState } from './focus'
import { GenreTiles, Page, Section, SeeAll, greeting } from './common'
import type { Track } from '../types'

export async function curatedStations(signal?: AbortSignal): Promise<Track[]> {
  const tags = ['lofi', 'jazz', 'chillout', 'hits', 'classical', 'electronic']
  const lists = await Promise.allSettled(tags.map((tag) => radio.search({ tag, max: 2 }, signal)))
  const seen = new Set<string>()
  return lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
}

export function Home() {
  const trending = useAsync('home:trending', (s) => audius.trending(undefined, s))
  const stations = useAsync('home:stations', curatedStations)
  const playlists = useAsync('home:audius-playlists', (s) => audius.trendingPlaylists(s))
  const netlabels = useAsync('home:archive', (s) => archive.featured(s))
  const liked = useLibrary((s) => s.playlists.find((p) => p.id === LIKED_ID)!)
  const focusLoading = useFocusModeState()
  const current = usePlayer((s) => s.queue[s.index]?.track)

  return (
    <Page>
      <h1 className="mb-5 mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{greeting()}</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <QuickTile
          title={focusLoading ? 'Tuning in…' : 'Focus mode'}
          subtitle="Lofi & ambient radio, no interruptions"
          gradient="from-indigo-500 to-violet-700"
          icon={<FocusIcon size={22} />}
          onClick={() => void startFocusMode()}
          testId="focus-tile"
        />
        <QuickTile
          title="Liked tracks"
          subtitle={`${liked.tracks.length} ${liked.tracks.length === 1 ? 'track' : 'tracks'}`}
          gradient="from-accent to-accent-2"
          icon={<HeartFillIcon size={20} />}
          onClick={() => (liked.tracks.length ? usePlayer.getState().playTracks(liked.tracks) : navigate(`/playlist/${LIKED_ID}`))}
          secondary={() => navigate(`/playlist/${LIKED_ID}`)}
        />
        <QuickTile
          title="Live radio"
          subtitle={current?.isLive ? `On air: ${current.title}` : '30,000+ stations worldwide'}
          gradient="from-amber-500 to-rose-600"
          icon={<RadioIcon size={22} />}
          onClick={() => navigate('/radio')}
        />
      </div>

      <Section title="Trending on Audius" testId="home-trending" action={trending.data?.length ? <PlayAll tracks={trending.data} /> : undefined}>
        {trending.error ? <ErrorState message={trending.error} onRetry={trending.retry} /> : trending.data ? <TrackList tracks={trending.data.slice(0, 10)} testId="trending-list" /> : <TrackListSkeleton rows={10} />}
      </Section>

      <Section title="Browse by genre" testId="home-genres">
        <GenreTiles />
      </Section>

      <Section title="Radio picks" action={<SeeAll to="/radio" />} testId="home-radio">
        {stations.error ? (
          <ErrorState message={stations.error} onRetry={stations.retry} />
        ) : stations.data ? (
          <CardGrid>{stations.data.slice(0, 12).map((s, i, list) => <StationCard key={s.id} station={s} list={list} index={i} />)}</CardGrid>
        ) : (
          <CardGridSkeleton count={6} />
        )}
      </Section>

      <Section title="Trending playlists" testId="home-playlists">
        {playlists.error ? (
          <ErrorState message={playlists.error} onRetry={playlists.retry} />
        ) : playlists.data ? (
          <CardGrid>
            {playlists.data.slice(0, 12).map((p) => (
              <Card
                key={p.id}
                id={p.id}
                title={p.title}
                subtitle={`${p.artist}${p.trackCount ? ` · ${p.trackCount} tracks` : ''}`}
                artwork={p.artwork}
                source="audius"
                onOpen={() => navigate(`/audius-playlist/${p.id}`)}
                getTracks={() => audius.playlistTracks(p.id)}
                menu={() => collectionMenuItems(() => audius.playlistTracks(p.id))}
              />
            ))}
          </CardGrid>
        ) : (
          <CardGridSkeleton count={6} />
        )}
      </Section>

      <Section title="Free albums from the Internet Archive" testId="home-archive" action={<SeeAll to="/search?q=netlabel&tab=archive" label="More" />}>
        {netlabels.error ? (
          <ErrorState message={netlabels.error} onRetry={netlabels.retry} />
        ) : netlabels.data ? (
          <CardGrid>
            {netlabels.data.slice(0, 12).map((a) => (
              <AlbumCard key={a.id} album={a} />
            ))}
          </CardGrid>
        ) : (
          <CardGridSkeleton count={6} />
        )}
      </Section>
    </Page>
  )
}

export function AlbumCard({ album: a }: { album: { id: string; title: string; artist: string; artwork?: string; meta?: string } }) {
  const load = () => archive.albumTracks(a.id).then((r) => r.tracks)
  return (
    <Card
      id={a.id}
      title={a.title}
      subtitle={[a.artist, a.meta].filter(Boolean).join(' · ')}
      artwork={a.artwork}
      source="archive"
      onOpen={() => navigate(`/album/${encodeURIComponent(a.id)}`)}
      getTracks={load}
      menu={() => collectionMenuItems(load)}
      testId="album-card"
    />
  )
}

function PlayAll({ tracks }: { tracks: Track[] }) {
  return (
    <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => usePlayer.getState().playTracks(tracks)}>
      <PlayIcon size={12} /> Play all
    </button>
  )
}

function QuickTile({ title, subtitle, gradient, icon, onClick, secondary, testId }: { title: string; subtitle: string; gradient: string; icon: React.ReactNode; onClick: () => void; secondary?: () => void; testId?: string }) {
  return (
    <div className="group flex items-center gap-3 overflow-hidden rounded-xl bg-white/[0.05] pr-3 transition hover:bg-white/[0.09]" data-testid={testId}>
      <button type="button" onClick={onClick} className={`flex h-16 w-16 shrink-0 items-center justify-center bg-gradient-to-br text-white ${gradient}`} aria-label={title}>
        {icon}
      </button>
      <button type="button" onClick={secondary ?? onClick} className="min-w-0 flex-1 py-2 text-left">
        <div className="truncate font-bold text-white">{title}</div>
        <div className="truncate text-xs text-zinc-400">{subtitle}</div>
      </button>
      <button type="button" onClick={onClick} aria-label={`Start ${title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white opacity-0 shadow-lg transition group-hover:opacity-100 focus-visible:opacity-100">
        <PlayIcon size={14} className="translate-x-px" />
      </button>
    </div>
  )
}

