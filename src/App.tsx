import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'

import DailyPlannerPage from './pages/DailyPlannerPage'
import WeeklySummaryPage from './pages/WeeklySummaryPage'
import LoginScreen from './components/LoginScreen'

import { db } from './db'
import { supabase } from './lib/supabase'
import { getPlannerDate } from './utils/time'
import { startRealtimeSync, syncCloudSnapshotToLocal } from './lib/realtimeSync'
import { startLocalChangeSync } from './lib/localSync'

type PageName = 'daily' | 'weekly'

function App() {
  const [page, setPage] = useState<PageName>('daily')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cloudReady, setCloudReady] = useState(false)

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
    if (
      !cloudReady ||
      dayStart === undefined ||
      selectedDate !== null
    ) {
      return
    }

    setSelectedDate(
      getPlannerDate(new Date(), dayStart),
    )
  }, [cloudReady, dayStart, selectedDate])

  useEffect(() => {
    const userId = session?.user.id

    if (!userId) {
      setCloudReady(false)
      return
    }

    let cancelled = false

    /*
    * Realtime을 먼저 켜기
    * 그다음 현재 Supabase 전체 상태를 가져오면
    * snapshot을 가져오는 도중 발생하는 변경도
    * Realtime으로 받을 수 있음.
    */
    const stopRealtimeSync =
      startRealtimeSync(userId)

    const initializeCloud = async () => {
      try {
        await syncCloudSnapshotToLocal(userId)
      } catch (error) {
        console.error(
          '초기 클라우드 동기화 실패:',
          error,
        )
      } finally {
        if (!cancelled) {
          setCloudReady(true)
        }
      }
    }

    void initializeCloud()

    return () => {
      cancelled = true
      stopRealtimeSync()
    }
  }, [session?.user.id])

  useEffect(() => {
  if (!session?.user.id) return

    startLocalChangeSync()
  }, [session?.user.id])

  if (authLoading) {
    return null
  }

  if (!session) {
    return <LoginScreen />
  } 

  if (!cloudReady) {
    return null
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
  </>
) }

export default App