import { useState } from 'react'
import type { SourceId } from '../types'
import { DiscIcon, MusicIcon, RadioIcon } from './Icons'

const GRADIENTS = [
  'from-violet-600/60 to-fuchsia-500/40',
  'from-sky-600/60 to-indigo-500/40',
  'from-amber-500/60 to-rose-500/40',
  'from-emerald-600/60 to-teal-500/40',
  'from-pink-600/60 to-orange-400/40',
  'from-indigo-600/60 to-cyan-400/40',
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function Artwork({ src, seed, source, className = '', rounded = 'rounded-md', iconSize = 20 }: {
  src?: string
  seed: string
  source?: SourceId
  className?: string
  rounded?: string
  iconSize?: number
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const show = src && failed !== src
  const Icon = source === 'radio' ? RadioIcon : source === 'archive' ? DiscIcon : MusicIcon
  return (
    <div className={`relative shrink-0 overflow-hidden bg-elevated ${rounded} ${className}`}>
      {show ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
          className={`h-full w-full ${source === 'radio' ? 'object-contain bg-white/[0.03] p-[8%]' : 'object-cover'}`}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${GRADIENTS[hash(seed) % GRADIENTS.length]}`}>
          <Icon size={iconSize} className="text-white/80" />
        </div>
      )}
    </div>
  )
}
