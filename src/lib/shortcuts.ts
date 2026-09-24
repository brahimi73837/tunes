import { useEffect } from 'react'
import { useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { toast, useUI } from '../store/ui'

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return true
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type
    return !['range', 'checkbox', 'radio', 'button'].includes(type)
  }
  return false
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const p = usePlayer.getState()
      const ui = useUI.getState()

      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.key === 'Escape') {
        if (ui.helpOpen) ui.setHelp(false)
        return
      }
      // Menus and dialogs keep native keyboard behaviour.
      if ((e.target as HTMLElement)?.closest?.('[role="menu"], [role="dialog"]')) return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          p.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) p.prev()
          else p.seekBy(-10)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) p.next()
          else p.seekBy(10)
          break
        case 'ArrowUp':
          e.preventDefault()
          p.setVolume(p.volume + 0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          p.setVolume(p.volume - 0.05)
          break
        case 'm':
        case 'M':
          p.toggleMute()
          toast(usePlayer.getState().muted ? 'Muted' : 'Unmuted')
          break
        case 's':
        case 'S':
          p.toggleShuffle()
          toast(`Shuffle ${usePlayer.getState().shuffle ? 'on' : 'off'}`)
          break
        case 'r':
        case 'R':
          p.cycleRepeat()
          toast(`Repeat: ${usePlayer.getState().repeat}`)
          break
        case 'l':
        case 'L': {
          const cur = p.current()
          if (cur) toast(useLibrary.getState().toggleLike(cur.track) ? 'Added to Liked' : 'Removed from Liked')
          break
        }
        case 'q':
        case 'Q':
          ui.setQueueOpen(!ui.queueOpen)
          break
        case '/': {
          e.preventDefault()
          if (ui.miniMode) ui.toggleMini()
          setTimeout(() => document.getElementById('global-search')?.focus(), 0)
          break
        }
        case '?':
          ui.setHelp(!ui.helpOpen)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
