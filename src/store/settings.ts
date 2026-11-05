import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Quality = 'high' | 'normal' | 'saver'

interface SettingsState {
  /** Streaming quality: high ≈ 320/160 kbps, normal ≈ 160/128, saver ≈ 96/64. */
  quality: Quality
  /** When the queue runs out, keep going with songs like the last one. */
  autoplay: boolean
  /** Last resort when no ad-free stream works: YouTube's own player, which can show ads. */
  youtubePlayerFallback: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: 'high',
      autoplay: true,
      youtubePlayerFallback: true,
      set: (patch) => set(patch),
    }),
    { name: 'tunes.settings', version: 1, partialize: ({ quality, autoplay, youtubePlayerFallback }) => ({ quality, autoplay, youtubePlayerFallback }) },
  ),
)

export const settings = () => useSettings.getState()
