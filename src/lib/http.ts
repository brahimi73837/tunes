export async function fetchJson<T>(url: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Request timed out', 'TimeoutError')), opts.timeoutMs ?? 12000)
  const onAbort = () => ctrl.abort(opts.signal?.reason)
  opts.signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

export function isHttps(url: string | undefined | null): url is string {
  return !!url && /^https:\/\//i.test(url.trim())
}

/** Images are auto-upgraded by browsers, but be explicit and drop anything that isn't http(s). */
export function httpsImage(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  const u = url.trim()
  if (u.startsWith('https://')) return u
  if (u.startsWith('http://')) return 'https://' + u.slice(7)
  return undefined
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
