import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_THEME, THEME_SETTING_KEYS } from './plannerTypes'
import type { Session } from '@supabase/supabase-js'
import DailyPlannerPage from './pages/DailyPlannerPage'
import LoginScreen from './components/LoginScreen'
import { db } from './db'
import { supabase } from './lib/supabase'
import { addDays, getPlannerDate, startOfWeekMonday } from './utils/time'
import { openPlannerSync, plannerWindow } from './lib/realtimeSync'
import { startLocalChangeSync } from './lib/localSync'

const WeeklySummaryPage = lazy(() => import('./pages/WeeklySummaryPage'))

function Loading({ done, total, label }: { done?: number; total?: number; label: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 500)
    return () => clearInterval(timer)
  }, [])
  return <main className="entry-screen"><section className="entry-card" aria-live="polite"><img src="/favicon.png" alt="" className="entry-icon" /><h1>SamdoList</h1>
    <p>{label}</p>
    <progress aria-label={label} value={done} max={total} className="my-3 w-full" />
    <p className="text-sm text-neutral-500">{total ? done + ' / ' + total + ' steps · ' : ''}{seconds}s elapsed</p>
  </section></main>
}

function Planner({ userId }: { userId: string }) {
  const [page, setPage] = useState<'daily' | 'weekly'>('daily')
  const [date, setDate] = useState('')
  const [sync, setSync] = useState<ReturnType<typeof openPlannerSync>>()
  const covered = useRef(new Set<string>())
  const [retry, setRetry] = useState(0)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(false)
  const [offline, setOffline] = useState(false)
  const [readyWeek, setReadyWeek] = useState('')
  const week = date && startOfWeekMonday(date)

  useEffect(() => {
    startLocalChangeSync()
    const connection = openPlannerSync(userId)
    setSync(connection)
    return () => connection.close()
  }, [userId])

  useEffect(() => {
    if (!sync || offline || (week && covered.current.has(week))) return
    let active = true
    setError(false)
    async function load() {
      const initial = covered.current.size === 0
      const target = week || getPlannerDate(new Date(), (await db.settings.get('dayStart'))?.value)
      const range = plannerWindow(target, initial ? 2 : 0)
      await sync!.load(range, initial, (done, total) => {
        if (active) setProgress({ done, total })
      })
      if (!active) return
      for (let monday = range.start; monday <= range.end; monday = addDays(monday, 7)) {
        covered.current.add(monday)
      }
      const selected = week || getPlannerDate(new Date(), (await db.settings.get('dayStart'))?.value)
      if (!active) return
      if (!week) setDate(selected)
      setReadyWeek(startOfWeekMonday(selected))
    }
    void load().catch(err => {
      if (active) { console.error(err); setError(true) }
    })
    return () => { active = false }
  }, [sync, week, retry, offline])

  if (error && !offline) return <main className="entry-screen"><section className="entry-card"><img src="/favicon.png" alt="" className="entry-icon" /><h1>SamdoList</h1>
    <p>Could not load your cloud records.</p>
    <button onClick={() => { setError(false); setRetry(n => n + 1) }}>RETRY</button>
    <button className="ml-4" onClick={async () => {
      if (!date) setDate(getPlannerDate(new Date(), (await db.settings.get('dayStart'))?.value))
      setOffline(true)
    }}>OPEN LOCAL RECORDS</button>
  </section></main>
  if (!offline && (!readyWeek || !covered.current.has(week))) {
    return <Loading {...progress} label={progress.total && progress.done === progress.total - 1 ? 'Saving to this device' : 'Loading planner records'} />
  }
  const navigate = (next: string) => { if (next) setDate(next) }
  if (page === 'weekly') return <Suspense fallback={<Loading label="Opening weekly summary" />}>
    <WeeklySummaryPage selectedDate={date} onSelectedDateChange={navigate} onOpenDaily={() => setPage('daily')} />
  </Suspense>
  return <DailyPlannerPage userId={userId} selectedDate={date} onSelectedDateChange={navigate} onOpenWeekly={() => setPage('weekly')} />
}

export default function App() {
  const accent = useLiveQuery(() => db.settings.bulkGet([THEME_SETTING_KEYS.primaryBg, THEME_SETTING_KEYS.primaryText, THEME_SETTING_KEYS.statusTodo, THEME_SETTING_KEYS.statusDone]), [])
  useEffect(() => {
    const style = document.documentElement.style
    style.setProperty('--main-theme', accent?.[0]?.value || DEFAULT_THEME.primaryBg)
    style.setProperty('--check-empty', accent?.[2]?.value || DEFAULT_THEME.statusTodo)
    style.setProperty('--check-done', accent?.[3]?.value || DEFAULT_THEME.statusDone)
    style.setProperty('--main-theme-text', accent?.[1]?.value || DEFAULT_THEME.primaryText)
  }, [accent])
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, value) => setSession(value))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <Loading label="Checking sign-in" />
  return session ? <Planner key={session.user.id} userId={session.user.id} /> : <LoginScreen />
}
