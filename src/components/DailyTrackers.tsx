import { startOfWeekMonday } from '../utils/time'
import type { ThemeColors } from '../plannerTypes'
import { HabitTracker, MoodTracker } from './WeeklySummarySections'
import { useWeekTrackers } from './useWeekTrackers'

export default function DailyTrackers({ date, theme }: { date: string; theme: ThemeColors }) {
  const week = useWeekTrackers(startOfWeekMonday(date))
  return <div className="daily-trackers">
    <HabitTracker habits={week.habits} habitStatuses={week.habitStatuses} theme={theme} onCycleStatus={week.cycleHabitStatus} />
    <MoodTracker moodLabels={week.moodLabels} moods={week.moods} theme={theme} onChangeMood={week.changeMood} />
  </div>
}
