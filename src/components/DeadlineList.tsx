import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { db } from '../db'
import { formatDateLocal } from '../utils/time'

type Deadline = { title: string; due: string; done: boolean }

export default function DeadlineList({ userId, mobile, close }: {
  userId: string
  mobile: boolean
  close: () => void
}) {
  const prefix = 'deadline.' + userId + '.'
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(formatDateLocal())
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const items = useLiveQuery(async () => {
    const rows = await db.settings.where('key').startsWith(prefix).toArray()
    return rows.map(row => ({ key: row.key, ...JSON.parse(row.value) as Deadline }))
      .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  }, [prefix])
  useEffect(() => { if (mobile && !dialog.current?.open) dialog.current?.showModal() }, [mobile])
  const today = formatDateLocal()
  const content = <>
    <header><span className="deadline-dot" aria-hidden="true" /><h2 className="desk-heading">{mobile ? 'Deadline List' : 'Check List'}</h2><button type="button" aria-label="ADD DEADLINE" aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={17}/></button>
      {mobile && <button type="button" onClick={close} aria-label="CLOSE"><X size={18} /></button>}
    </header>
    {adding && <form onSubmit={async event => {
      event.preventDefault()
      if (!title.trim() || !due || saving) return
      setSaving(true)
      try {
        await db.settings.add({ key: prefix + crypto.randomUUID(), value: JSON.stringify({ title: title.trim(), due, done: false }) })
        setTitle('')
        setAdding(false)
      } finally { setSaving(false) }
    }}>
      <input autoFocus required maxLength={200} aria-label="Task" placeholder="Task with a deadline" value={title} onChange={e => setTitle(e.target.value)} />
      <div className="flex gap-2"><input type="date" required aria-label="Due date" value={due} onChange={e => setDue(e.target.value)} />
        <button className="primary-action" disabled={saving || !title.trim()}>ADD</button></div>
    </form>}
    {items?.length === 0 && <p className="text-sm text-neutral-500">No deadlines yet.</p>}
    <ul>{items?.map(item => <li key={item.key}>
      <button type="button" className="deadline-toggle" aria-label={'MARK COMPLETE: ' + item.title} aria-pressed={item.done}
        onClick={() => db.transaction('rw', db.settings, async () => {
          const row = await db.settings.get(item.key)
          if (!row) return
          const data: Deadline = JSON.parse(row.value)
          await db.settings.update(item.key, { value: JSON.stringify({ ...data, done: !data.done }) })
        })}>{item.done && <Check size={14}/>}</button>
      <div className="min-w-0 flex-1"><span className={item.done ? 'line-through text-neutral-400' : ''}>{item.title}</span>
        <time className={!item.done && item.due < today ? 'text-rose-700' : 'text-neutral-500'}>{item.due}</time></div>
      <button type="button" aria-label={'DELETE: ' + item.title} onClick={() => {
        if (window.confirm('Delete “' + item.title + '”?')) void db.settings.delete(item.key)
      }}><Trash2 size={15}/></button>
    </li>)}</ul>
  </>
  return mobile ? <dialog ref={dialog} onCancel={close} aria-label="Deadline List" className="deadline-card deadline-dialog">{content}</dialog>
    : <section className="deadline-card">{content}</section>
}
