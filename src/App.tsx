import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DailyPlannerPage from './pages/DailyPlannerPage'
import WeeklySummaryPage from './pages/WeeklySummaryPage'
import { db } from './db'
import { getPlannerDate } from './utils/time'

type PageName = 'daily' | 'weekly'

function App() {
  const [page, setPage] = useState<PageName>('daily')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

  if (selectedDate === null) return null

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
    <DailyPlannerPage
      selectedDate={selectedDate}
      onSelectedDateChange={setSelectedDate}
      onOpenWeekly={() => setPage('weekly')}
    />
  )
}

export default App