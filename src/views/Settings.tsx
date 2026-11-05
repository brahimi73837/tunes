import type { ReactNode } from 'react'
import { useSettings, type Quality } from '../store/settings'
import { Page, Section } from './common'

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: 'high', label: 'High', hint: 'Up to 320 kbps. Best sound.' },
  { id: 'normal', label: 'Normal', hint: 'About 160 kbps. Indistinguishable for most people.' },
  { id: 'saver', label: 'Data saver', hint: 'About 64–96 kbps. For mobile data.' },
]

function Toggle({ checked, onChange, label, hint, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: ReactNode; testId: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 rounded-xl border border-line bg-white/[0.02] p-4 hover:bg-white/[0.04]">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="mt-1 block text-sm text-zinc-400">{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span aria-hidden className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}

export function SettingsView() {
  const s = useSettings()
  return (
    <Page title="Settings">
      <div className="max-w-2xl">
        <Section title="Streaming quality">
          <div role="radiogroup" aria-label="Streaming quality" className="grid gap-2 sm:grid-cols-3">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                type="button"
                role="radio"
                aria-checked={s.quality === q.id}
                data-testid={`quality-${q.id}`}
                onClick={() => s.set({ quality: q.id })}
                className={`rounded-xl border p-4 text-left transition ${s.quality === q.id ? 'border-accent bg-accent/10' : 'border-line bg-white/[0.02] hover:bg-white/[0.05]'}`}
              >
                <span className="block text-sm font-semibold text-white">{q.label}</span>
                <span className="mt-1 block text-xs text-zinc-400">{q.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Applies from the next track.</p>
        </Section>

        <Section title="Playback">
          <div className="flex flex-col gap-2">
            <Toggle
              label="Autoplay similar songs"
              hint="When your queue ends, keep going with songs like the last one."
              checked={s.autoplay}
              onChange={(autoplay) => s.set({ autoplay })}
              testId="setting-autoplay"
            />
            <Toggle
              label="Use YouTube’s player as a last resort"
              hint={
                <>
                  Songs normally play ad-free: from JioSaavn, or as YouTube audio through a privacy proxy. If neither works for a song, YouTube’s own player can take over — <b className="text-zinc-200">it may show ads</b>. Turn off to skip such songs instead.
                </>
              }
              checked={s.youtubePlayerFallback}
              onChange={(youtubePlayerFallback) => s.set({ youtubePlayerFallback })}
              testId="setting-yt-fallback"
            />
          </div>
        </Section>

        <Section title="About">
          <p className="text-sm leading-relaxed text-zinc-400">
            Tunes plays music from YouTube Music and JioSaavn without ads, accounts or tracking, plus independent artists on Audius, the Internet Archive and live radio. Your library lives in this browser only — back it up from the Library page. Lyrics are from{' '}
            <a className="underline hover:text-white" href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a> and YouTube Music.
          </p>
        </Section>
      </div>
    </Page>
  )
}
