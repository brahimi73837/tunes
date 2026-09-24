import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  /** Nested items render as a second panel replacing the first. */
  submenu?: MenuItem[]
  separator?: boolean
}

/** A small popover menu rendered in a portal and anchored to a trigger element. */
export function Menu({ anchor, items, onClose, align = 'right' }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [stack, setStack] = useState<{ title: string; items: MenuItem[] }[]>([])
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const visible = stack.length ? stack[stack.length - 1].items : items

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const el = ref.current
    const w = el?.offsetWidth ?? 220
    const h = el?.offsetHeight ?? 200
    let left = align === 'right' ? r.right - w : r.left
    let top = r.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6)
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    setPos({ top, left })
  }, [anchor, align, visible])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [stack])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fade-in fixed z-[70] max-h-[60vh] w-60 overflow-y-auto rounded-xl border border-line bg-elevated/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl scroll-thin"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const i = btns.indexOf(document.activeElement as HTMLButtonElement)
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus()
      }}
    >
      {stack.length > 0 && (
        <button
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:bg-white/5"
          onClick={() => setStack((s) => s.slice(0, -1))}
        >
          ‹ {stack[stack.length - 1].title}
        </button>
      )}
      {visible.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-40 ${it.danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-zinc-200 hover:bg-white/[0.07]'}`}
            onClick={() => {
              if (it.submenu) setStack((s) => [...s, { title: it.label, items: it.submenu! }])
              else {
                it.onClick?.()
                onClose()
              }
            }}
          >
            <span className="flex w-4 shrink-0 justify-center text-zinc-400">{it.icon}</span>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.submenu && <span className="text-zinc-500">›</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

/** Convenience: a trigger button that toggles a Menu. */
export function MenuButton({ items, children, className, label, align }: { items: () => MenuItem[]; children: ReactNode; className?: string; label: string; align?: 'left' | 'right' }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        className={className}
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(anchor ? null : e.currentTarget)
        }}
      >
        {children}
      </button>
      {anchor && <Menu anchor={anchor} items={items()} onClose={() => setAnchor(null)} align={align} />}
    </>
  )
}
