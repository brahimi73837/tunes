import { useSyncExternalStore } from 'react'

/** Hash routing so GitHub Pages deep links always hit index.html. Routes look like #/search?q=x */
export interface Route {
  path: string[]
  query: URLSearchParams
  raw: string
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [p, q = ''] = raw.split('?')
  return { path: p.split('/').filter(Boolean).map(safeDecode), query: new URLSearchParams(q), raw }
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

let current = parse()
const listeners = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse()
  listeners.forEach((l) => l())
})

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => current,
  )
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = to.startsWith('#') ? to : `#${to}`
  if (opts.replace) {
    history.replaceState(null, '', hash)
    current = parse()
    listeners.forEach((l) => l())
  } else {
    window.location.hash = hash
  }
}

export const href = (to: string) => `#${to}`
