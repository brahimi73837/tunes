import { navigate } from '../lib/router'
import { LIKED_ID, useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { Track } from '../types'
import { askText } from './Dialog'
import { ExternalIcon, HeartFillIcon, HeartIcon, ListPlusIcon, NextIcon, PlusIcon, QueueIcon } from './Icons'
import type { MenuItem } from './Menu'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export async function createPlaylistWith(tracks: Track[]) {
  const name = await askText({ title: 'New playlist', placeholder: 'My playlist', confirmLabel: 'Create' })
  if (!name) return
  const id = useLibrary.getState().createPlaylist(name, tracks)
  toast(`Created “${name}”`, 'success', { label: 'Open', run: () => navigate(`/playlist/${id}`) })
}

export function addToPlaylist(id: string, tracks: Track[]) {
  const lib = useLibrary.getState()
  const pl = lib.playlists.find((p) => p.id === id)
  const added = lib.addTracks(id, tracks)
  if (!pl) return
  toast(added ? `Added ${tracks.length === 1 ? '' : plural(added, 'track') + ' '}to “${pl.name}”` : `Already in “${pl.name}”`, added ? 'success' : 'info')
}

export function playlistSubmenu(tracks: Track[]): MenuItem[] {
  const playlists = useLibrary.getState().playlists.filter((p) => p.id !== LIKED_ID)
  return [
    { label: 'New playlist…', icon: <PlusIcon size={16} />, onClick: () => void createPlaylistWith(tracks) },
    ...(playlists.length ? [{ label: '', separator: true }] : []),
    ...playlists.map((p) => ({ label: p.name, onClick: () => addToPlaylist(p.id, tracks) })),
  ]
}

export function trackMenuItems(track: Track, extra: MenuItem[] = []): MenuItem[] {
  const player = usePlayer.getState()
  const liked = useLibrary.getState().playlists[0].tracks.some((t) => t.id === track.id)
  return [
    { label: 'Play next', icon: <NextIcon size={14} />, onClick: () => (player.playNext([track]), toast('Playing next')) },
    { label: 'Add to queue', icon: <QueueIcon size={16} />, onClick: () => (player.addToQueue([track]), toast('Added to queue')) },
    { label: 'Add to playlist', icon: <ListPlusIcon size={16} />, submenu: playlistSubmenu([track]) },
    {
      label: liked ? 'Remove from Liked' : 'Add to Liked',
      icon: liked ? <HeartFillIcon size={16} className="text-accent-2" /> : <HeartIcon size={16} />,
      onClick: () => useLibrary.getState().toggleLike(track),
    },
    ...(track.pageUrl ? [{ label: `Open on ${track.source === 'audius' ? 'Audius' : track.source === 'archive' ? 'Archive.org' : 'station site'}`, icon: <ExternalIcon size={16} />, onClick: () => window.open(track.pageUrl, '_blank', 'noopener') }] : []),
    ...(extra.length ? [{ label: '', separator: true }, ...extra] : []),
  ]
}

export function collectionMenuItems(getTracks: () => Promise<Track[]>): MenuItem[] {
  const run = (fn: (t: Track[]) => void) => async () => {
    try {
      const tracks = await getTracks()
      if (!tracks.length) return toast('No playable tracks here', 'error')
      fn(tracks)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load tracks', 'error')
    }
  }
  const player = usePlayer.getState()
  return [
    { label: 'Play next', icon: <NextIcon size={14} />, onClick: run((t) => (player.playNext(t), toast(`${plural(t.length, 'track')} playing next`))) },
    { label: 'Add to queue', icon: <QueueIcon size={16} />, onClick: run((t) => (player.addToQueue(t), toast(`Added ${plural(t.length, 'track')} to queue`))) },
    { label: 'Save as playlist…', icon: <ListPlusIcon size={16} />, onClick: run((t) => void createPlaylistWith(t)) },
  ]
}


