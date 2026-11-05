import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { HabitDefinition, HabitStatus, MoodLevel, WeeklyRecord } from '../types'
import { DEFAULT_WEEKLY_MOOD_LABELS, DEFAULT_WEEKLY_MOOD_LEVEL, MAX_WEEKLY_HABITS, WEEKLY_HABITS_KEY, WEEKLY_MOOD_LABELS_KEY } from '../plannerTypes'

const nextHabitStatus: Record<HabitStatus, HabitStatus> = {
  todo: 'done',
  done: 'partial',
  partial: 'todo',
}

function parseMoodLabels(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '[]')

    if (!Array.isArray(parsed)) return [...DEFAULT_WEEKLY_MOOD_LABELS]

    return Array.from({ length: 4 }, (_, index) =>
      typeof parsed[index] === 'string'
        ? parsed[index].slice(0, 20)
        : DEFAULT_WEEKLY_MOOD_LABELS[index],
    )
  } catch {
    return [...DEFAULT_WEEKLY_MOOD_LABELS]
  }
}

function parseHabits(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '[]')

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item): item is HabitDefinition =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.name === 'string',
      )
      .slice(0, MAX_WEEKLY_HABITS)
      .map((item) => ({
        id: item.id,
        name: item.name.slice(0, 30),
      }))
  } catch {
    return []
  }
}

function normalizeMoods(values?: MoodLevel[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const value = values?.[index]

    return value === 0 || value === 1 || value === 2 || value === 3
      ? value
      : DEFAULT_WEEKLY_MOOD_LEVEL
  }) as MoodLevel[]
}

function normalizeHabitStatuses(
  habits: HabitDefinition[],
  stored?: Record<string, HabitStatus[]>,
) {
  return Object.fromEntries(
    habits.map((habit) => [
      habit.id,
      Array.from({ length: 7 }, (_, index) => {
        const status = stored?.[habit.id]?.[index]
        return status === 'done' || status === 'partial' ? status : 'todo'
      }),
    ]),
  ) as Record<string, HabitStatus[]>
}

export function useWeekTrackers(weekStart: string) {
  const moodLabels =
    useLiveQuery(async () => {
      const setting = await db.settings.get(WEEKLY_MOOD_LABELS_KEY)
      return parseMoodLabels(setting?.value)
    }, []) ?? [...DEFAULT_WEEKLY_MOOD_LABELS]

  const habits =
    useLiveQuery(async () => {
      const setting = await db.settings.get(WEEKLY_HABITS_KEY)
      return parseHabits(setting?.value)
    }, []) ?? []

  const weeklyRecord = useLiveQuery(
    () => db.weeklyRecords.get(weekStart),
    [weekStart],
  )
  const currentWeeklyRecord =
    weeklyRecord?.weekStart === weekStart ? weeklyRecord : undefined


  const moods = normalizeMoods(currentWeeklyRecord?.moods)
  const habitStatuses = normalizeHabitStatuses(habits, currentWeeklyRecord?.habitStatuses)

  function updateWeek(change: (record: WeeklyRecord) => Partial<WeeklyRecord>) {
    return db.transaction('rw', db.weeklyRecords, async () => {
      const record = (await db.weeklyRecords.get(weekStart)) ?? { weekStart }
      await db.weeklyRecords.put({ ...record, ...change(record) })
    })
  }
  function changeMood(day: number, mood: MoodLevel) {
    return updateWeek(record => {
      const next = normalizeMoods(record.moods)
      next[day] = mood
      return { moods: next }
    })
  }
  function cycleHabitStatus(id: string, day: number) {
    return updateWeek(record => {
      const next = normalizeHabitStatuses(habits, record.habitStatuses)[id]
      if (!next) return {}
      next[day] = nextHabitStatus[next[day]]
      return { habitStatuses: { ...record.habitStatuses, [id]: next } }
    })
  }
  return { moodLabels, habits, currentWeeklyRecord, moods, habitStatuses, changeMood, cycleHabitStatus, updateWeek }
}
