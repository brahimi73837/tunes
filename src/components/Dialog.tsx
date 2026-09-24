import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

interface DialogReq {
  kind: 'text' | 'confirm'
  title: string
  message?: string
  initial?: string
  placeholder?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (v: string | boolean | null) => void
}

const useDialogStore = create<{ req: DialogReq | null }>(() => ({ req: null }))

function open(req: Omit<DialogReq, 'resolve'>): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().req?.resolve(null)
    useDialogStore.setState({ req: { ...req, resolve } })
  })
}

export const askText = (o: { title: string; initial?: string; placeholder?: string; confirmLabel?: string }) =>
  open({ kind: 'text', ...o }) as Promise<string | null>

export const askConfirm = async (o: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) =>
  (await open({ kind: 'confirm', ...o })) === true

export function DialogHost() {
  const req = useDialogStore((s) => s.req)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!req) return
    setValue(req.initial ?? '')
    setTimeout(() => (req.kind === 'text' ? inputRef.current?.select() : confirmRef.current?.focus()), 20)
  }, [req])

  if (!req) return null
  const close = (v: string | boolean | null) => {
    req.resolve(v)
    useDialogStore.setState({ req: null })
  }
  const submit = () => {
    if (req.kind === 'confirm') close(true)
    else if (value.trim()) close(value.trim())
  }

  return (
    <div
      className="fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && close(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close(null)
        e.stopPropagation()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={req.title}
        className="w-full max-w-sm rounded-2xl border border-line bg-elevated p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2 className="text-base font-bold text-white">{req.title}</h2>
        {req.message && <p className="mt-1.5 text-sm text-zinc-400">{req.message}</p>}
        {req.kind === 'text' && (
          <input ref={inputRef} className="input mt-4" value={value} placeholder={req.placeholder} maxLength={120} onChange={(e) => setValue(e.target.value)} />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => close(null)}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="submit"
            disabled={req.kind === 'text' && !value.trim()}
            className={req.danger ? 'btn bg-rose-500 text-white hover:bg-rose-400' : 'btn-primary'}
          >
            {req.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}
