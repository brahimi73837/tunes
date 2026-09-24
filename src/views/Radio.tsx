import { useEffect, useState } from 'react'
import { useAsync, useDebounced } from '../lib/hooks'
import { navigate, useRoute } from '../lib/router'
import * as radio from '../sources/radio'
import { usePlayer } from '../store/player'
import { CardGrid, CardGridSkeleton, EmptyState, ErrorState, StationCard } from '../components/Cards'
import { RadioIcon, SearchIcon, ShuffleIcon } from '../components/Icons'
import { Page } from './common'

export function RadioView() {
  const { query } = useRoute()
  const tag = query.get('tag') ?? ''
  const country = query.get('country') ?? ''
  const sort = (query.get('sort') === 'clickcount' ? 'clickcount' : 'votes') as radio.RadioSort
  const name = query.get('name') ?? ''
  const [nameInput, setNameInput] = useState(name)
  const debouncedName = useDebounced(nameInput.trim(), 350)

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ tag, country, sort, name })
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    for (const k of [...next.keys()]) if (!next.get(k) || (k === 'sort' && next.get(k) === 'votes')) next.delete(k)
    const qs = next.toString()
    navigate(`/radio${qs ? `?${qs}` : ''}`, { replace: true })
  }

  useEffect(() => {
    if (debouncedName !== name) update({ name: debouncedName })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName])

  const key = `radio:${tag}:${country}:${sort}:${name}`
  const stations = useAsync(key, (s) => radio.search({ tag: tag || undefined, countrycode: country || undefined, name: name || undefined, order: sort, max: 60 }, s))

  return (
    <Page title="Radio">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Genres" data-testid="radio-genres">
          <button type="button" className={`chip ${!tag ? 'chip-active' : ''}`} onClick={() => update({ tag: '' })}>
            Top stations
          </button>
          {radio.GENRE_CHIPS.map((g) => (
            <button key={g} type="button" className={`chip capitalize ${tag === g ? 'chip-active' : ''}`} onClick={() => update({ tag: tag === g ? '' : g })} data-testid={`radio-chip-${g}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input className="input pl-9" placeholder="Station name…" value={nameInput} onChange={(e) => setNameInput(e.target.value)} aria-label="Filter by station name" />
          </div>
          <select className="input w-auto" value={country} onChange={(e) => update({ country: e.target.value })} aria-label="Country">
            {radio.COUNTRIES.map(([code, label]) => (
              <option key={code} value={code} className="bg-elevated">
                {label}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort by">
            <option value="votes" className="bg-elevated">Most voted</option>
            <option value="clickcount" className="bg-elevated">Most played</option>
          </select>
          {!!stations.data?.length && (
            <button type="button" className="btn-ghost ml-auto" onClick={() => usePlayer.getState().playTracks(stations.data!, 0, { shuffle: true })}>
              <ShuffleIcon size={15} /> Shuffle stations
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {stations.error ? (
          <ErrorState message={stations.error} onRetry={stations.retry} />
        ) : stations.loading ? (
          <CardGridSkeleton count={10} />
        ) : stations.data?.length ? (
          <CardGrid testId="radio-results">
            {stations.data.map((s, i, list) => (
              <StationCard key={s.id} station={s} list={list} index={i} />
            ))}
          </CardGrid>
        ) : (
          <EmptyState icon={<RadioIcon size={32} />} title="No stations found" body="Only https streams can play here, which filters out some stations. Try another genre or country." />
        )}
        <p className="mt-6 text-xs text-zinc-600">Station directory by radio-browser.info. Only secure (https) streams are listed.</p>
      </div>
    </Page>
  )
}
