import { useAsync } from '../lib/hooks'
import { href, navigate } from '../lib/router'
import { totalDuration } from '../lib/util'
import * as catalog from '../sources/catalog'
import type { MusicCard } from '../sources/catalog'
import { useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'
import { Artwork } from '../components/Artwork'
import { Card, CardGrid, CardGridSkeleton, EmptyState, ErrorState } from '../components/Cards'
import { ExternalIcon, ListPlusIcon, RadioIcon } from '../components/Icons'
import { TrackList, TrackListSkeleton } from '../components/TrackList'
import { collectionMenuItems } from '../components/trackActions'
import { startRadio } from '../lib/radio'
import type { Track } from '../types'
import { CollectionHeader } from './Collections'
import { Page, PlayShuffleButtons, Section } from './common'

/** Pages backed by YouTube Music: artists, albums and playlists. */

export const cardHref = (c: MusicCard) => (c.kind === 'artist' ? `/artist/${c.id}` : c.kind === 'playlist' ? `/yt-playlist/${c.id.replace(/^VL/, '')}` : `/yt-album/${c.id}`)

async function cardTracks(c: MusicCard): Promise<Track[]> {
  if (c.kind === 'artist') return (await catalog.artist(c.id)).topSongs
  if (c.kind === 'playlist') return (await catalog.youtubePlaylist(c.id.replace(/^VL/, ''))).tracks
  return (await catalog.album(c.id)).tracks
}

export function MusicCardTile({ card }: { card: MusicCard }) {
  return (
    <Card
      id={card.id}
      title={card.title}
      subtitle={card.subtitle ?? (card.kind === 'artist' ? 'Artist' : card.kind === 'single' ? 'Single' : card.kind === 'playlist' ? 'Playlist' : 'Album')}
      artwork={card.artwork}
      source="youtube"
      round={card.kind === 'artist'}
      onOpen={() => navigate(cardHref(card))}
      getTracks={() => cardTracks(card)}
      menu={card.kind === 'artist' ? undefined : () => collectionMenuItems(() => cardTracks(card))}
      testId={`${card.kind === 'single' ? 'album' : card.kind}-card`}
    />
  )
}

export function MusicCardGrid({ cards, testId }: { cards: MusicCard[]; testId?: string }) {
  return <CardGrid testId={testId}>{cards.map((c) => <MusicCardTile key={c.id} card={c} />)}</CardGrid>
}

function SaveButton({ tracks, name }: { tracks: Track[]; name: string }) {
  return (
    <button
      type="button"
      className="btn-ghost py-2.5"
      data-testid="save-collection"
      disabled={!tracks.length}
      onClick={() => {
        const id = useLibrary.getState().createPlaylist(name, tracks)
        toast(`Saved “${name}” to your library`, 'success', { label: 'Open', run: () => navigate(`/playlist/${id}`) })
      }}
    >
      <ListPlusIcon size={16} /> Save to library
    </button>
  )
}

const play = (tracks: Track[], shuffle = false) => tracks.length && usePlayer.getState().playTracks(tracks, 0, { shuffle })

export function ArtistView({ id }: { id: string }) {
  const res = useAsync(`artist:${id}`, (s) => catalog.artist(id, s))
  const a = res.data
  if (res.error) return <Page><ErrorState message={res.error} onRetry={res.retry} /></Page>
  return (
    <Page>
      <div className="relative -mx-4 mb-6 overflow-hidden px-4 pb-6 pt-16 sm:-mx-6 sm:px-6 sm:pt-24" data-testid="artist-header">
        <div className="pointer-events-none absolute inset-0 -z-10">
          {(a?.banner ?? a?.artwork) && <img src={a?.banner ?? a?.artwork} alt="" className="h-full w-full object-cover opacity-40" referrerPolicy="no-referrer" />}
          <div className="absolute inset-0 bg-gradient-to-b from-bg/20 via-bg/60 to-bg" />
        </div>
        <div className="flex items-end gap-5">
          <Artwork src={a?.artwork} seed={id} source="youtube" className="h-28 w-28 shrink-0 shadow-2xl shadow-black/60 sm:h-40 sm:w-40" rounded="rounded-full" iconSize={40} />
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">Artist</div>
            <h1 className="mt-1 line-clamp-2 break-words text-4xl font-black tracking-tight text-white sm:text-6xl" data-testid="collection-title">
              {a?.name ?? 'Loading…'}
            </h1>
          </div>
        </div>
        <div className="mt-6">
          <PlayShuffleButtons onPlay={() => a && play(a.topSongs)} onShuffle={() => a && play(a.topSongs, true)} disabled={!a?.topSongs.length}>
            {a?.topSongs[0] && (
              <button type="button" className="btn-ghost py-2.5" onClick={() => void startRadio(a.topSongs[0])} data-testid="artist-radio">
                <RadioIcon size={16} /> Radio
              </button>
            )}
          </PlayShuffleButtons>
        </div>
      </div>

      <Section title="Popular" testId="artist-top">
        {a ? a.topSongs.length ? <TrackList tracks={a.topSongs} showSource={false} testId="artist-songs" /> : <Muted>No songs listed.</Muted> : <TrackListSkeleton rows={5} />}
      </Section>
      {!a && <CardGridSkeleton count={6} />}
      {!!a?.albums.length && (
        <Section title="Albums" testId="artist-albums">
          <MusicCardGrid cards={a.albums} />
        </Section>
      )}
      {!!a?.singles.length && (
        <Section title="Singles & EPs" testId="artist-singles">
          <MusicCardGrid cards={a.singles} />
        </Section>
      )}
      {!!a?.related.length && (
        <Section title="Fans also like" testId="artist-related">
          <MusicCardGrid cards={a.related} />
        </Section>
      )}
      {a?.description && (
        <Section title="About">
          <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-zinc-400">{a.description}</p>
        </Section>
      )}
    </Page>
  )
}

export function YouTubeAlbumView({ id }: { id: string }) {
  const res = useAsync(`yt-album:${id}`, (s) => catalog.album(id, s))
  const al = res.data
  if (res.error) return <Page><ErrorState message={res.error} onRetry={res.retry} /></Page>
  const tracks = al?.tracks ?? []
  return (
    <Page>
      <CollectionHeader
        artwork={al?.artwork}
        seed={id}
        source="youtube"
        kind={al?.kind ?? 'Album'}
        title={al?.title ?? 'Loading…'}
        subtitle={
          al && (
            <>
              {al.artistId ? (
                <a href={href(`/artist/${al.artistId}`)} className="font-semibold text-white hover:underline" data-testid="album-artist">
                  {al.artist}
                </a>
              ) : (
                <span className="font-semibold text-white">{al.artist}</span>
              )}
              {al.year && <span>· {al.year}</span>}
              <span>· {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</span>
              {!!totalDuration(tracks.map((t) => t.duration)) && <span>· {totalDuration(tracks.map((t) => t.duration))}</span>}
            </>
          )
        }
      >
        <PlayShuffleButtons onPlay={() => play(tracks)} onShuffle={() => play(tracks, true)} disabled={!tracks.length}>
          {al && <SaveButton tracks={tracks} name={`${al.title} — ${al.artist}`} />}
        </PlayShuffleButtons>
      </CollectionHeader>
      {al ? tracks.length ? <TrackList tracks={tracks} showSource={false} testId="album-tracks" /> : <EmptyState title="No playable songs" body="YouTube Music lists no songs for this release." /> : <TrackListSkeleton rows={10} />}
    </Page>
  )
}

export function YouTubePlaylistView({ id }: { id: string }) {
  const res = useAsync(`yt-playlist:${id}`, (s) => catalog.youtubePlaylist(id, s))
  const pl = res.data
  if (res.error) return <Page><ErrorState message={res.error} onRetry={res.retry} /></Page>
  const tracks = pl?.tracks ?? []
  return (
    <Page>
      <CollectionHeader
        artwork={pl?.artwork ?? tracks[0]?.artwork}
        seed={id}
        source="youtube"
        kind="YouTube playlist"
        title={pl?.title ?? 'Loading…'}
        subtitle={
          pl && (
            <>
              {pl.author && <span className="font-semibold text-white">{pl.author}</span>}
              <span>· {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
              {!!totalDuration(tracks.map((t) => t.duration)) && <span>· {totalDuration(tracks.map((t) => t.duration))}</span>}
              <a href={`https://music.youtube.com/playlist?list=${id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-white">
                · <ExternalIcon size={12} /> YouTube Music
              </a>
            </>
          )
        }
      >
        <PlayShuffleButtons onPlay={() => play(tracks)} onShuffle={() => play(tracks, true)} disabled={!tracks.length}>
          {pl && <SaveButton tracks={tracks} name={pl.title} />}
        </PlayShuffleButtons>
      </CollectionHeader>
      {pl ? tracks.length ? <TrackList tracks={tracks} testId="yt-playlist-tracks" /> : <EmptyState title="Empty playlist" body="Nothing playable in this playlist (private or removed videos are skipped)." /> : <TrackListSkeleton rows={10} />}
    </Page>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="px-1 py-2 text-sm text-zinc-500">{children}</p>
