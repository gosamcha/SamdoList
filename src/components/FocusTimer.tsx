import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import type { Category } from '../types'
import type { ThemeColors } from '../plannerTypes'
import { getPlannerDate, minutesToTimeLabel } from '../utils/time'
import './FocusTimer.css'

type Session = { id: string; startedAt: number; stoppedAt?: number; title: string; categoryId: string; dayStart: string }
type Props = { userId: string; categories: Category[]; theme: ThemeColors; dayStart: string; onSaved: (date: string) => void }

function readSession(key: string): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null')
    return s && typeof s.id === 'string' && Number.isFinite(s.startedAt) &&
      (s.stoppedAt === undefined || (Number.isFinite(s.stoppedAt) && s.stoppedAt >= s.startedAt)) &&
      typeof s.title === 'string' && typeof s.categoryId === 'string' && /^\d{2}:\d{2}$/.test(s.dayStart) ? s : null
  } catch { return null }
}

export function roundedRange(startedAt: number, stoppedAt: number) {
  const start = new Date(startedAt)
  start.setMinutes(Math.round(start.getMinutes() / 10) * 10, 0, 0)
  const end = new Date(stoppedAt)
  end.setMinutes(Math.round(end.getMinutes() / 10) * 10, 0, 0)
  if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 600_000)
  const label = (d: Date) => minutesToTimeLabel(d.getHours() * 60 + d.getMinutes())
  return { start, end, startTime: label(start), endTime: label(end) }
}

export default function FocusTimer({ userId, categories, theme, dayStart, onSaved }: Props) {
  const key = `samdolist:focus-timer:${userId}`
  const [session, setSession] = useState<Session | null>(() => readSession(key))
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const running = !!session && session.stoppedAt === undefined

  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === key) setSession(readSession(key))
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [key])

  function update(next: Session | null) {
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next))
      else localStorage.removeItem(key)
      setError('')
    } catch { setError('Unable to keep the timer in this browser. Please keep this page open.') }
    setSession(next)
  }

  const seconds = session ? Math.max(0, Math.floor(((session.stoppedAt ?? now) - session.startedAt) / 1000)) : 0
  const elapsed = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const range = session ? roundedRange(session.startedAt, session.stoppedAt ?? now) : null
  const date = range && session ? getPlannerDate(range.start, session.dayStart) : ''

  async function save() {
    if (!session || session.stoppedAt === undefined || !range || saveLock.current) return
    const title = session.title.trim()
    const categoryId = Number(session.categoryId)
    if (!title || !session.categoryId || !categories.some(c => c.id === categoryId)) {
      setError('Enter a task name and select a category.')
      return
    }
    if (range.end.getTime() - range.start.getTime() >= 86_400_000) {
      setError('For sessions of 24 hours or more, add a separate task for each day manually.')
      return
    }
    saveLock.current = true
    setSaving(true)
    try {
      await db.transaction('rw', db.tasks, async () => {
        // A persistent session ID also prevents duplicate saves from another tab.
        if (await db.tasks.filter(task => task.syncId === session.id).first()) return
        const tasks = await db.tasks.where('date').equals(date).toArray()
        await db.tasks.add({ syncId: session.id, date, categoryId, title,
          startTime: range.startTime, endTime: range.endTime, status: 'todo',
          order: Math.max(-1, ...tasks.filter(t => t.categoryId === categoryId).map(t => t.order ?? -1)) + 1,
          createdAt: Date.now(), memo: '' })
      })
      update(null)
      onSaved(date)
    } catch { setError('Unable to save. Your session is still available. Please try again.') }
    finally { saveLock.current = false; setSaving(false) }
  }

  return <section className="focus-timer" aria-label="Focus timer">
    <h2 className="desk-heading">Timer</h2>
    <output className="focus-timer-clock" aria-label="Elapsed time" style={{ color: theme.primaryBg }}>{elapsed}</output>
    {session && range && <p className="focus-timer-range">{date.slice(5).replace('-', '/')} · {range.startTime}{session.stoppedAt !== undefined ? ` – ${range.endTime}` : ' · Running'}</p>}
    {!session && <p className="focus-timer-range">Start the timer, save your session as a task.</p>}
    <div className="focus-timer-actions">
      {!session && <button type="button" style={{ background: theme.primaryBg, color: theme.primaryText }} onClick={() => {
        const startedAt = Date.now()
        setNow(startedAt)
        update({ id: crypto.randomUUID(), startedAt, title: '', categoryId: String(categories.find(c => c.id !== undefined)?.id ?? ''), dayStart })
      }}>Start</button>}
      {running && <button type="button" style={{ background: theme.primaryBg, color: theme.primaryText }} onClick={() => update({ ...session!, stoppedAt: Date.now() })}>Stop</button>}
      {session && <button type="button" style={{ background: theme.primaryBg, color: theme.primaryText }} disabled={saving} onClick={() => { if (window.confirm('Discard this timer session?')) update(null) }}>Cancel</button>}
    </div>
    {session && session.stoppedAt !== undefined && <form className="focus-timer-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <label>Task name<input value={session.title} maxLength={200} disabled={saving} onChange={e => update({ ...session, title: e.target.value })} placeholder="What did you work on?" required /></label>
      <label>Category<select value={session.categoryId} disabled={saving} onChange={e => update({ ...session, categoryId: e.target.value })} required>
        <option value="">Select a category</option>
        {categories.filter(c => c.id !== undefined).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <p className="focus-timer-range">Rounded to 10 minutes · Minimum 10 minutes</p>
      <button type="submit" disabled={saving} style={{ background: theme.primaryBg, color: theme.primaryText }}>{saving ? 'Saving…' : 'Save task'}</button>
    </form>}
    {error && <p className="focus-timer-error" role="alert">{error}</p>}
  </section>
}
