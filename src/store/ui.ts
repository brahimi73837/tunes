import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/util'

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
}

interface UIState {
  toasts: Toast[]
  helpOpen: boolean
  queueOpen: boolean
  miniMode: boolean
  visualizer: boolean
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void
  dismiss: (id: string) => void
  setHelp: (open: boolean) => void
  setQueueOpen: (open: boolean) => void
  toggleMini: () => void
  toggleVisualizer: () => void
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      toasts: [],
      helpOpen: false,
      queueOpen: false,
      miniMode: false,
      visualizer: true,
      toast: (text, kind = 'info', action) => {
        const id = uid('t_')
        // Collapse identical consecutive toasts (e.g. a burst of skipped tracks).
        const toasts = get().toasts.filter((t) => t.text !== text).slice(-3)
        set({ toasts: [...toasts, { id, text, kind, action }] })
        setTimeout(() => get().dismiss(id), action ? 6000 : 3500)
      },
      dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setHelp: (helpOpen) => set({ helpOpen }),
      setQueueOpen: (queueOpen) => set({ queueOpen }),
      toggleMini: () => set((s) => ({ miniMode: !s.miniMode })),
      toggleVisualizer: () => set((s) => ({ visualizer: !s.visualizer })),
    }),
    { name: 'tunes.ui', partialize: (s) => ({ miniMode: s.miniMode, visualizer: s.visualizer, queueOpen: s.queueOpen }) },
  ),
)

export const toast = (...args: Parameters<UIState['toast']>) => useUI.getState().toast(...args)
