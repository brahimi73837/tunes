import type { ReactNode } from 'react'
import { useAsync } from '../lib/hooks'
import { navigate } from '../lib/router'
import { totalDuration } from '../lib/util'
import * as archive from '../sources/archive'
import * as audius from '../sources/audius'
import * as radio from '../sources/radio'
import { usePlayer } from '../store/player'
import { useLibrary } from '../store/library'
import { toast } from '../store/ui'
import { Artwork } from '../components/Artwork'
import { CardGrid, CardGridSkeleton, EmptyState, ErrorState, StationCard } from '../components/Cards'
import { ExternalIcon, ListPlusIcon } from '../components/Icons'
import { SourceBadge, TrackList, TrackListSkeleton } from '../components/TrackList'
import type { SourceId, Track } from '../types'
import { Page, PlayShuffleButtons, Section } from './common'

export function CollectionHeader({ artwork, seed, source, kind, title, subtitle, children, art }: {
  artwork?: string
  seed: string
  source?: SourceId
  kind: string
  title: string
  subtitle: ReactNode
  children?: ReactNode
  art?: ReactNode
}) {
  return (
    <div className="relative -mx-4 mb-6 overflow-hidden px-4 pb-6 pt-4 sm:-mx-6 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10">
        {artwork && <img src={artwork} alt="" className="h-full w-full scale-150 object-cover opacity-25 blur-3xl" referrerPolicy="no-referrer" />}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/10 to-bg" />
      </div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
        {art ?? <Artwork src={artwork} seed={seed} source={source} className="h-40 w-40 shadow-2xl shadow-black/50 sm:h-48 sm:w-48" rounded="rounded-xl" iconSize={48} />}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">{kind}</div>
          <h1 className="mt-1 line-clamp-2 break-words text-3xl font-black tracking-tight text-white sm:text-5xl" data-testid="collection-title">
            {title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">{subtitle}</div>
        </div>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}

function SaveButton({ tracks, name }: { tracks: Track[]; name: string }) {
  return (
    <button
      type="button"
      className="btn-ghost py-2.5"
      onClick={() => {
        const id = useLibrary.getState().createPlaylist(name, tracks)
        toast(`Saved “${name}” to your library`, 'success', { label: 'Open', run: () => navigate(`/playlist/${id}`) })
      }}
    >
      <ListPlusIcon size={16} /> Save to library
    </button>
  )
}

export function ArchiveAlbumView({ id }: { id: string }) {
  const res = useAsync(`album:${id}`, (s) => archive.albumTracks(id, s))
  const album = res.data?.album
  const tracks = res.data?.tracks ?? []
  const play = (shuffle = false) => usePlayer.getState().playTracks(tracks, 0, { shuffle })
  return (
    <Page>
      <CollectionHeader
        artwork={archive.artworkFor(id)}
        seed={id}
        source="archive"
        kind="Album · Internet Archive"
        title={album?.title ?? (res.loading ? 'Loading…' : id)}
        subtitle={
          album && (
            <>
              <span className="font-semibold text-white">{album.artist}</span>
              <span>· {tracks.length} tracks</span>
              {totalDuration(tracks.map((t) => t.duration)) && <span>· {totalDuration(tracks.map((t) => t.duration))}</span>}
            </>
          )
        }
      >
        <PlayShuffleButtons onPlay={() => play()} onShuffle={() => play(true)} disabled={!tracks.length}>
          {album && <SaveButton tracks={tracks} name={album.title} />}
          <a className="btn-ghost py-2.5" href={`https://archive.org/details/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer">
            <ExternalIcon size={15} /> archive.org
          </a>
        </PlayShuffleButtons>
      </CollectionHeader>
      {res.error ? (
        <ErrorState message={res.error} onRetry={res.retry} />
      ) : res.loading ? (
        <TrackListSkeleton />
      ) : tracks.length ? (
        <TrackList tracks={tracks} showSource={false} testId="album-tracks" />
      ) : (
        <EmptyState title="No playable audio in this item" body="Some Archive items only have formats browsers can’t play." />
      )}
    </Page>
  )
}

export function AudiusPlaylistView({ id }: { id: string }) {
  const res = useAsync(`audius-pl:${id}`, (s) => audius.getPlaylist(id, s))
  const tracks = res.data?.tracks ?? []
  const meta = res.data?.playlist
  const first = tracks[0]
  const name = meta?.title ?? (first ? `${first.artist} & more` : 'Playlist')
  const play = (shuffle = false) => usePlayer.getState().playTracks(tracks, 0, { shuffle })
  return (
    <Page>
      <CollectionHeader
        artwork={meta?.artwork ?? first?.artwork}
        seed={id}
        source="audius"
        kind={`${meta?.kind === 'album' ? 'Album' : 'Playlist'} · Audius`}
        title={res.loading ? 'Loading…' : name}
        subtitle={<>{meta && <span className="font-semibold text-white">{meta.artist}</span>}<SourceBadge source="audius" /> <span>{tracks.length} tracks</span>{totalDuration(tracks.map((t) => t.duration)) && <span>· {totalDuration(tracks.map((t) => t.duration))}</span>}</>}
      >
        <PlayShuffleButtons onPlay={() => play()} onShuffle={() => play(true)} disabled={!tracks.length}>
          {tracks.length > 0 && <SaveButton tracks={tracks} name={name} />}
        </PlayShuffleButtons>
      </CollectionHeader>
      {res.error ? <ErrorState message={res.error} onRetry={res.retry} /> : res.loading ? <TrackListSkeleton /> : tracks.length ? <TrackList tracks={tracks} showSource={false} /> : <EmptyState title="No streamable tracks in this playlist" />}
    </Page>
  )
}

const GENRE_TO_TAG: Record<string, string> = {
  'Hip-Hop/Rap': 'hiphop', 'Lo-Fi': 'lofi', 'R&B/Soul': 'rnb', Alternative: 'alternative',
}

export function GenreView({ genre }: { genre: string }) {
  const tracks = useAsync(`genre:${genre}`, (s) => audius.trending(genre, s))
  const tag = GENRE_TO_TAG[genre] ?? genre.toLowerCase()
  const stations = useAsync(`genre-radio:${tag}`, (s) => radio.search({ tag, max: 10 }, s))
  const list = tracks.data ?? []
  return (
    <Page>
      <CollectionHeader
        seed={genre}
        kind="Genre"
        title={genre}
        subtitle="Trending this week on Audius, plus live stations"
        art={<div className="flex h-40 w-40 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-6xl font-black text-white shadow-2xl sm:h-48 sm:w-48">{genre[0]}</div>}
      >
        <PlayShuffleButtons onPlay={() => usePlayer.getState().playTracks(list)} onShuffle={() => usePlayer.getState().playTracks(list, 0, { shuffle: true })} disabled={!list.length} />
      </CollectionHeader>
      <Section title="Trending tracks">
        {tracks.error ? <ErrorState message={tracks.error} onRetry={tracks.retry} /> : tracks.loading ? <TrackListSkeleton /> : list.length ? <TrackList tracks={list} showSource={false} testId="genre-tracks" /> : <EmptyState title="Nothing trending in this genre right now" />}
      </Section>
      {(stations.loading || !!stations.data?.length) && (
        <Section title={`${genre} radio`}>
          {stations.data ? <CardGrid>{stations.data.map((s, i, l) => <StationCard key={s.id} station={s} list={l} index={i} />)}</CardGrid> : <CardGridSkeleton count={5} />}
        </Section>
      )}
    </Page>
  )
}
