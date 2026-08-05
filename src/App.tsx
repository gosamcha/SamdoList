import { useState } from 'react'
import DailyPlannerPage from './pages/DailyPlannerPage'
import WeeklySummaryPage from './pages/WeeklySummaryPage'
import { formatDateLocal } from './utils/time'

type PageName = 'daily' | 'weekly'

function App() {
  const [page, setPage] = useState<PageName>('daily')
  const [selectedDate, setSelectedDate] = useState(formatDateLocal())

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