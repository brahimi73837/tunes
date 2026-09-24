import { useEffect, useRef, useState } from 'react'
import { isAbortError } from './http'

const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 5 * 60_000

/** Fetch helper with abort-on-change and a short in-memory cache keyed by `key`. */
export function useAsync<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>) {
  const cached = key ? (cache.get(key) as { at: number; data: T } | undefined) : undefined
  const fresh = cached && Date.now() - cached.at < TTL ? cached.data : undefined
  const [state, setState] = useState<{ key: string | null; data?: T; error?: string; loading: boolean }>({ key, data: fresh, loading: !!key && fresh === undefined })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key) {
      setState({ key, loading: false })
      return
    }
    const hit = cache.get(key) as { at: number; data: T } | undefined
    if (hit && Date.now() - hit.at < TTL && nonce === 0) {
      setState({ key, data: hit.data, loading: false })
      return
    }
    const ctrl = new AbortController()
    setState((s) => ({ key, data: s.key === key ? s.data : undefined, loading: true }))
    fnRef.current(ctrl.signal).then(
      (data) => {
        cache.set(key, { at: Date.now(), data })
        if (!ctrl.signal.aborted) setState({ key, data, loading: false })
      },
      (e) => {
        if (ctrl.signal.aborted || isAbortError(e)) return
        setState({ key, error: e instanceof Error ? e.message : String(e), loading: false })
      },
    )
    return () => ctrl.abort()
  }, [key, nonce])

  const matches = state.key === key
  return {
    data: matches ? state.data : fresh,
    error: matches ? state.error : undefined,
    loading: matches ? state.loading : !!key && fresh === undefined,
    retry: () => {
      if (key) cache.delete(key)
      setNonce((n) => n + 1)
    },
  }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
