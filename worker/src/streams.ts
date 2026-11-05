/**
 * Ad-free YouTube audio, the way ytify does it: Invidious servers fetch the stream from
 * YouTube (they hold the PO tokens a Worker can't mint) and proxy the bytes, so the app can
 * play them in a plain <audio> element. Only a few public servers work at any moment, so we
 * race all of them and keep the one that actually serves audio past the first megabyte
 * (where YouTube cuts off unattested streams).
 */

import { parseInvidious, probeFormat, type StreamInfo } from './invidious'

export type { AudioFormat, StreamInfo } from './invidious'

/** Known-good hosts first; the rest are tried too because the public list churns weekly. */
export const DEFAULT_INSTANCES = [
  'yt.omada.cafe',
  'yt.chocolatemoo53.com',
  'invidious.schenkel.eti.br',
  'invidious.kemonomimi.nl',
  'echostreamz.com',
  'inv.thepixora.com',
  'invidious.protokolla.fi',
  'inv.in.projectsegfau.lt',
  'inv.riverside.rocks',
]

const LOOKUP_TIMEOUT_MS = 9000
const PROBE_TIMEOUT_MS = 6000
const FAILURE_COOLDOWN_MS = 10 * 60_000
const DIRECTORY_TTL_MS = 6 * 3600_000

/** Per-isolate memory: hosts that just failed sit out for a while. */
const failedAt = new Map<string, number>()
let directory: { at: number; hosts: string[] } | null = null

const timeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))])

async function fromInstance(host: string, id: string): Promise<StreamInfo> {
  const res = await timeout(
    fetch(`https://${host}/api/v1/videos/${encodeURIComponent(id)}?local=true`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (tunes)' } }),
    LOOKUP_TIMEOUT_MS,
    host,
  )
  if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`)
  const info = parseInvidious(host, id, await res.json().catch(() => null))
  if (!info) throw new Error(`${host}: no playable audio`)
  // Fetch a few bytes past the first megabyte: that's where unattested streams get cut off.
  const probe = await timeout(fetch(probeFormat(info).url, { headers: { Range: 'bytes=1100000-1100255' } }), PROBE_TIMEOUT_MS, `${host} probe`)
  await probe.body?.cancel()
  // 416 means the file is shorter than the probe offset, which is fine.
  if (probe.status !== 206 && probe.status !== 200 && probe.status !== 416) throw new Error(`${host}: stream HTTP ${probe.status}`)
  return info
}

/** Hosts that also answer browsers directly (they send CORS headers); the app races these itself. */
export const BROWSER_INSTANCES = ['yt.chocolatemoo53.com', 'yt.omada.cafe']

/** Adds API-enabled, CORS-enabled hosts from the public directory (refreshed every few hours). */
async function discovered(): Promise<string[]> {
  if (directory && Date.now() - directory.at < DIRECTORY_TTL_MS) return directory.hosts
  try {
    const res = await timeout(fetch('https://api.invidious.io/instances.json?sort_by=health'), 4000, 'directory')
    const list = (await res.json()) as [string, { api?: boolean; cors?: boolean; type?: string }][]
    const hosts = list.filter(([, i]) => i.type === 'https' && i.api && i.cors).map(([h]) => h)
    directory = { at: Date.now(), hosts }
    return hosts
  } catch {
    directory = { at: Date.now(), hosts: directory?.hosts ?? [] }
    return directory.hosts
  }
}

export async function browserPool(): Promise<string[]> {
  return [...new Set([...BROWSER_INSTANCES, ...(await discovered())])]
}

export async function instancePool(configured?: string): Promise<string[]> {
  const base = configured ? configured.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_INSTANCES
  return [...new Set([...base, ...(await discovered())])]
}

/** Races every usable host; the first one that serves real audio wins. */
export async function resolveStream(id: string, opts: { instances: string[]; exclude?: string[] }): Promise<StreamInfo> {
  if (!/^[\w-]{11}$/.test(id)) throw new Error('Invalid video id')
  const excluded = new Set(opts.exclude ?? [])
  const usable = opts.instances.filter((h) => !excluded.has(h))
  const now = Date.now()
  const healthy = usable.filter((h) => now - (failedAt.get(h) ?? 0) > FAILURE_COOLDOWN_MS)
  // If everything is cooling down, try them all anyway rather than fail outright.
  const candidates = healthy.length ? healthy : usable
  if (!candidates.length) throw new Error('No stream servers left to try')
  try {
    return await Promise.any(
      candidates.map((h) =>
        fromInstance(h, id).catch((e) => {
          failedAt.set(h, Date.now())
          throw e
        }),
      ),
    )
  } catch (e) {
    const reasons = e instanceof AggregateError ? e.errors.map((x) => (x instanceof Error ? x.message : String(x))) : [String(e)]
    throw new Error(`No stream server could play this (${reasons.slice(0, 4).join('; ')})`)
  }
}
