import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'

import DailyPlannerPage from './pages/DailyPlannerPage'
import WeeklySummaryPage from './pages/WeeklySummaryPage'
import LoginScreen from './components/LoginScreen'
import InitialCloudUpload from './components/InitialCloudUpload'
import CloudRestore from './components/CloudRestore'

import { db } from './db'
import { supabase } from './lib/supabase'
import { getPlannerDate } from './utils/time'

type PageName = 'daily' | 'weekly'

function App() {
  const [page, setPage] = useState<PageName>('daily')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [showInitialUpload, setShowInitialUpload] = useState(false)
  const [showCloudRestore, setShowCloudRestore] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const dayStart = useLiveQuery(async () => {
    const result = await db.settings.get('dayStart')
    return result?.value ?? '08:00'
  }, [])

  // 앱에 처음 접속했을 때만 DayStart 기준으로 첫 날짜를 결정함.
  // 예: DayStart가 08:00이면 08/05 02:00 접속 시 08/04 페이지를 엶.
  useEffect(() => {
    if (dayStart === undefined || selectedDate !== null) return

    setSelectedDate(getPlannerDate(new Date(), dayStart))
  }, [dayStart, selectedDate])

  if (authLoading) {
    return null
  }

  if (!session) {
    return <LoginScreen />
  }

  const isInitialUpload =
  new URLSearchParams(window.location.search).get('initialUpload') === '1'

  if (isInitialUpload || showInitialUpload) {
    return <InitialCloudUpload />
  }
  if (showCloudRestore) {
    return <CloudRestore />
  }
  

  if (selectedDate === null) {
    return null
  }

  if (page === 'weekly') {
    return (
      <WeeklySummaryPage
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
        onOpenDaily={() => setPage('daily')}
      />
    )
  }

return (
  <>
    <DailyPlannerPage
      selectedDate={selectedDate}
      onSelectedDateChange={setSelectedDate}
      onOpenWeekly={() => setPage('weekly')}
    />

    <div
        style={{
          position: 'fixed',
          right: '12px',
          bottom: '12px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
      <button
        type="button"
        onClick={() => setShowInitialUpload(true)}
        style={{
          padding: '8px 12px',
          fontSize: '12px',
        }}
      >
        Cloud Migration
      </button>

      <button
        type="button"
        onClick={() => setShowCloudRestore(true)}
        style={{
          padding: '8px 12px',
          fontSize: '12px',
        }}
      >
        Cloud Restore
      </button>
    </div>
  </>
) }

export default App