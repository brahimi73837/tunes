import { useEffect, useRef, useState } from 'react'
import { useAsync } from '../lib/hooks'
import { href, navigate } from '../lib/router'
import { decodePlaylist, encodePlaylist, shareUrl } from '../lib/share'
import { downloadFile, totalDuration } from '../lib/util'
import { LIKED_ID, useLibrary, type ExportFile } from '../store/library'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { Playlist } from '../types'
import { Artwork } from '../components/Artwork'
import { EmptyState, ErrorState } from '../components/Cards'
import { askConfirm, askText } from '../components/Dialog'
import { DownloadIcon, EditIcon, HeartFillIcon, MoreIcon, MusicIcon, PlusIcon, SearchIcon, ShareIcon, TrashIcon, UploadIcon } from '../components/Icons'
import { MenuButton } from '../components/Menu'
import { TrackList, TrackListSkeleton } from '../components/TrackList'
import { createPlaylistWith } from '../components/trackActions'
import { CollectionHeader } from './Collections'
import { Page, PlayShuffleButtons } from './common'

function Mosaic({ p, className }: { p: Playlist; className: string }) {
  if (p.id === LIKED_ID) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-accent to-accent-2 shadow-2xl shadow-black/50 ${className}`}>
        <HeartFillIcon size={56} className="text-white" />
      </div>
    )
  }
  const arts = [...new Set(p.tracks.map((t) => t.artwork).filter(Boolean))].slice(0, 4) as string[]
  if (arts.length < 4) return <Artwork src={arts[0]} seed={p.id} className={`shadow-2xl shadow-black/50 ${className}`} rounded="" iconSize={48} />
  return (
    <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden shadow-2xl shadow-black/50 ${className}`}>
      {arts.map((a) => (
        <img key={a} src={a} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
      ))}
    </div>
  )
}

export async function sharePlaylist(p: Playlist) {
  try {
    const url = shareUrl(await encodePlaylist({ name: p.name, tracks: p.tracks }))
    try {
      await navigator.clipboard.writeText(url)
      toast('Share link copied — open it in any browser to import this playlist', 'success')
    } catch {
      await askText({ title: 'Copy this share link', initial: url, confirmLabel: 'Done' })
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not create link', 'error')
  }
}

export function exportPlaylists(ids?: string[], filename = 'tunes-playlists') {
  const data = useLibrary.getState().exportData(ids)
  downloadFile(`${filename}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
  toast(`Exported ${data.playlists.length} ${data.playlists.length === 1 ? 'playlist' : 'playlists'}`, 'success')
}

export function PlaylistView({ id }: { id: string }) {
  const p = useLibrary((s) => s.playlists.find((x) => x.id === id))
  const lib = useLibrary.getState
  if (!p) {
    return (
      <Page>
        <EmptyState title="Playlist not found" body="It may have been deleted." action={<a className="btn-ghost" href={href('/library')}>Go to library</a>} />
      </Page>
    )
  }
  const isLiked = p.id === LIKED_ID
  const play = (shuffle = false) => usePlayer.getState().playTracks(p.tracks, 0, { shuffle })
  const rename = async () => {
    const name = await askText({ title: 'Rename playlist', initial: p.name, confirmLabel: 'Save' })
    if (name) lib().renamePlaylist(p.id, name)
  }
  const remove = async () => {
    if (await askConfirm({ title: `Delete “${p.name}”?`, message: 'This can’t be undone. Export it first if you might want it back.', confirmLabel: 'Delete', danger: true })) {
      lib().deletePlaylist(p.id)
      navigate('/library')
      toast('Playlist deleted')
    }
  }

  return (
    <Page>
      <CollectionHeader
        seed={p.id}
        kind={isLiked ? 'Built-in playlist' : 'Playlist'}
        title={p.name}
        art={<Mosaic p={p} className="h-40 w-40 rounded-xl sm:h-48 sm:w-48" />}
        artwork={p.tracks.find((t) => t.artwork)?.artwork}
        subtitle={
          <>
            <span>
              {p.tracks.length} {p.tracks.length === 1 ? 'track' : 'tracks'}
            </span>
            {totalDuration(p.tracks.map((t) => t.duration)) && <span>· {totalDuration(p.tracks.map((t) => t.duration))}</span>}
            {p.tracks.some((t) => t.isLive) && <span>· includes live radio</span>}
          </>
        }
      >
        <PlayShuffleButtons onPlay={() => play()} onShuffle={() => play(true)} disabled={!p.tracks.length}>
          <button type="button" className="btn-ghost py-2.5" onClick={() => void sharePlaylist(p)} disabled={!p.tracks.length} data-testid="share-playlist">
            <ShareIcon size={15} /> Share link
          </button>
          <MenuButton
            label="Playlist options"
            className="icon-btn h-10 w-10 bg-white/[0.06] hover:bg-white/10"
            align="left"
            items={() => [
              ...(!isLiked ? [{ label: 'Rename…', icon: <EditIcon size={14} />, onClick: () => void rename() }] : []),
              { label: 'Add to queue', icon: <PlusIcon size={14} />, disabled: !p.tracks.length, onClick: () => (usePlayer.getState().addToQueue(p.tracks), toast('Added to queue')) },
              { label: 'Export as JSON', icon: <DownloadIcon size={14} />, onClick: () => exportPlaylists([p.id], `tunes-${p.name.replace(/[^\w-]+/g, '-').toLowerCase()}`) },
              { label: 'Duplicate', icon: <MusicIcon size={14} />, onClick: () => navigate(`/playlist/${lib().createPlaylist(`${p.name} (copy)`, p.tracks)}`) },
              ...(!isLiked ? [{ label: '', separator: true }, { label: 'Delete playlist', icon: <TrashIcon size={14} />, danger: true, onClick: () => void remove() }] : []),
            ]}
          >
            <MoreIcon />
          </MenuButton>
        </PlayShuffleButtons>
      </CollectionHeader>

      {p.tracks.length ? (
        <>
          <TrackList
            tracks={p.tracks}
            testId="playlist-tracks"
            onReorder={(from, to) => lib().moveTrack(p.id, from, to)}
            extraMenu={(_, i) => [
              { label: 'Move up', disabled: i === 0, onClick: () => lib().moveTrack(p.id, i, i - 1) },
              { label: 'Move down', disabled: i === p.tracks.length - 1, onClick: () => lib().moveTrack(p.id, i, i + 1) },
              { label: `Remove from ${isLiked ? 'Liked' : 'this playlist'}`, icon: <TrashIcon size={14} />, danger: true, onClick: () => lib().removeTrackAt(p.id, i) },
            ]}
          />
          <p className="mt-4 px-2 text-xs text-zinc-600">Drag tracks to reorder.</p>
        </>
      ) : (
        <EmptyState
          icon={isLiked ? <HeartFillIcon size={32} /> : <MusicIcon size={32} />}
          title={isLiked ? 'Tracks you like will appear here' : 'This playlist is empty'}
          body={isLiked ? 'Tap the heart on any track or station.' : 'Use “Add to playlist” from any track’s ••• menu, or drag tracks onto it in the sidebar.'}
          action={
            <a className="btn-primary" href={href('/search')}>
              <SearchIcon size={16} /> Find music
            </a>
          }
        />
      )}
    </Page>
  )
}

export function LibraryView() {
  const playlists = useLibrary((s) => s.playlists)
  const fileRef = useRef<HTMLInputElement>(null)

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ExportFile
      const n = useLibrary.getState().importData(data)
      toast(`Imported ${n} ${n === 1 ? 'playlist' : 'playlists'}`, 'success')
    } catch (e) {
      toast(e instanceof Error ? `Import failed: ${e.message}` : 'Import failed', 'error')
    }
  }

  return (
    <Page title="Your library">
      <div className="-mt-2 mb-6 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => void createPlaylistWith([])} data-testid="new-playlist">
          <PlusIcon size={16} /> New playlist
        </button>
        <button type="button" className="btn-ghost" onClick={() => exportPlaylists()}>
          <DownloadIcon size={16} /> Export all
        </button>
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
          <UploadIcon size={16} /> Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onImport(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="-mx-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
        {playlists.map((p) => (
          <a key={p.id} href={href(`/playlist/${p.id}`)} className="group flex flex-col gap-3 rounded-xl p-3 transition hover:bg-white/[0.05]" data-testid="library-playlist">
            <Mosaic p={p} className="aspect-square w-full rounded-lg" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{p.name}</div>
              <div className="text-xs text-zinc-400">
                {p.tracks.length} {p.tracks.length === 1 ? 'track' : 'tracks'}
              </div>
            </div>
          </a>
        ))}
        <button type="button" onClick={() => void createPlaylistWith([])} className="flex flex-col gap-3 rounded-xl p-3 text-left transition hover:bg-white/[0.05]">
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-line text-zinc-500">
            <PlusIcon size={36} />
          </div>
          <div className="text-sm font-semibold text-zinc-300">New playlist</div>
        </button>
      </div>

      <div className="mt-10 max-w-2xl rounded-xl border border-line bg-white/[0.03] p-5 text-sm text-zinc-400">
        <h2 className="mb-2 font-bold text-zinc-200">Backing up your playlists</h2>
        <p>
          Everything is stored in this browser only (localStorage) — there are no accounts. To keep your playlists safe or move them to another browser, use <b className="text-zinc-200">Export all</b> to download a JSON
          file and <b className="text-zinc-200">Import JSON</b> to restore it. For a single playlist, <b className="text-zinc-200">Share link</b> puts the whole playlist in a URL you can open anywhere.
        </p>
      </div>
    </Page>
  )
}

export function ImportView({ payload }: { payload: string }) {
  const res = useAsync(`import:${payload}`, () => decodePlaylist(payload))
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => setSaved(null), [payload])
  const data = res.data
  return (
    <Page>
      {res.error ? (
        <ErrorState message={`this share link looks broken (${res.error})`} />
      ) : !data ? (
        <TrackListSkeleton />
      ) : (
        <>
          <CollectionHeader
            seed={payload.slice(0, 20)}
            artwork={data.tracks.find((t) => t.artwork)?.artwork}
            kind="Shared playlist"
            title={data.name}
            subtitle={<span>{data.tracks.length} tracks · not saved yet</span>}
          >
            <div className="flex flex-wrap gap-2">
              {saved ? (
                <a className="btn-primary" href={href(`/playlist/${saved}`)}>
                  Open in library
                </a>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="save-import"
                  onClick={() => {
                    const id = useLibrary.getState().createPlaylist(data.name, data.tracks)
                    setSaved(id)
                    toast(`Saved “${data.name}” to your library`, 'success')
                  }}
                >
                  <DownloadIcon size={16} /> Save to my library
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => usePlayer.getState().playTracks(data.tracks)} disabled={!data.tracks.length}>
                Play
              </button>
            </div>
          </CollectionHeader>
          <TrackList tracks={data.tracks} testId="import-tracks" />
        </>
      )}
    </Page>
  )
}
