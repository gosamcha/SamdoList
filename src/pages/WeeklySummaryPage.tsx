import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageDown,
  Menu,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, seedInitialData } from '../db'
import type {
  HabitDefinition,
  HabitStatus,
  MoodLevel,
  PlannerTask,
  WeeklyRecord,
} from '../types'
import type { ThemeColors } from '../plannerTypes'
import {
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
  CAPTURE_TIME_LABELS_KEY,
  CATEGORY_ORDER_KEY,
  DEFAULT_THEME,
  DEFAULT_WEEKLY_MOOD_LABELS,
  DEFAULT_WEEKLY_MOOD_LEVEL,
  MAX_WEEKLY_HABITS,
  THEME_SETTING_KEYS,
  WEEKLY_HABITS_KEY,
  WEEKLY_MOOD_LABELS_KEY,
} from '../plannerTypes'
import {
  addDays,
  formatWeekRange,
  getWeekDates,
  localDateAt,
  sleepStartDateTime,
  startOfWeekMonday,
} from '../utils/time'
import { createPlannerImageBlob } from '../components/CaptureView'
import MenuDrawer from '../components/MenuDrawer'
import WeeklyCaptureView from '../components/WeeklyCaptureView'
import {
  HabitTracker,
  MoodTracker,
  ProgressCycleList,
  SleepTracker,
  WEEKDAY_LABELS,
  type WeeklySleepRow,
} from '../components/WeeklySummarySections'

type WeeklySummaryPageProps = {
  selectedDate: string
  onSelectedDateChange: (date: string) => void
  onOpenDaily: () => void
}

const nextHabitStatus: Record<HabitStatus, HabitStatus> = {
  todo: 'done',
  done: 'partial',
  partial: 'todo',
}

function parseStoredNumberArray(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '[]')

    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => typeof item === 'number')
      : []
  } catch {
    return []
  }
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

function getCompletionRate(tasks: PlannerTask[]) {
  if (tasks.length === 0) return 0

  const score = tasks.reduce((sum, task) => {
    if (task.status === 'done') return sum + 1
    if (task.status === 'partial') return sum + 0.5
    return sum
  }, 0)

  return Math.round((score / tasks.length) * 100)
}

function createHabitId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `habit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function WeeklySummaryPage({
  selectedDate,
  onSelectedDateChange,
  onOpenDaily,
}: WeeklySummaryPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [weeklyMemo, setWeeklyMemo] = useState('')
  const [captureSaving, setCaptureSaving] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  const weekStart = useMemo(
    () => startOfWeekMonday(selectedDate),
    [selectedDate],
  )
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const weekEnd = weekDates[6]
  const weekLabel = useMemo(() => formatWeekRange(weekStart), [weekStart])

  useEffect(() => {
    void seedInitialData()
  }, [])

  const categories =
    useLiveQuery(async () => {
      const [storedCategories, orderSetting] = await Promise.all([
        db.categories.toArray(),
        db.settings.get(CATEGORY_ORDER_KEY),
      ])

      let storedOrder: number[] = []

      try {
        const parsed = JSON.parse(orderSetting?.value ?? '[]')
        storedOrder = Array.isArray(parsed)
          ? parsed.filter((value): value is number => typeof value === 'number')
          : []
      } catch {
        storedOrder = []
      }

      const orderMap = new Map(
        storedOrder.map((categoryId, index) => [categoryId, index]),
      )

      return [...storedCategories].sort((a, b) => {
        const aOrder =
          a.id === undefined
            ? Number.MAX_SAFE_INTEGER
            : orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const bOrder =
          b.id === undefined
            ? Number.MAX_SAFE_INTEGER
            : orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER

        if (aOrder !== bOrder) return aOrder - bOrder
        return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
      })
    }, []) ?? []

  const dayStart =
    useLiveQuery(async () => {
      const result = await db.settings.get('dayStart')
      return result?.value ?? '08:00'
    }, []) ?? '08:00'

  const theme: ThemeColors =
    useLiveQuery(async () => {
      const [primaryBg, primaryText, statusTodo, statusDone, statusPartial] =
        await Promise.all([
          db.settings.get(THEME_SETTING_KEYS.primaryBg),
          db.settings.get(THEME_SETTING_KEYS.primaryText),
          db.settings.get(THEME_SETTING_KEYS.statusTodo),
          db.settings.get(THEME_SETTING_KEYS.statusDone),
          db.settings.get(THEME_SETTING_KEYS.statusPartial),
        ])

      return {
        primaryBg: primaryBg?.value ?? DEFAULT_THEME.primaryBg,
        primaryText: primaryText?.value ?? DEFAULT_THEME.primaryText,
        statusTodo: statusTodo?.value ?? DEFAULT_THEME.statusTodo,
        statusDone: statusDone?.value ?? DEFAULT_THEME.statusDone,
        statusPartial: statusPartial?.value ?? DEFAULT_THEME.statusPartial,
      }
    }, []) ?? DEFAULT_THEME

  const captureSettings =
    useLiveQuery(async () => {
      const [timeLabelsSetting, hiddenCategorySetting] = await Promise.all([
        db.settings.get(CAPTURE_TIME_LABELS_KEY),
        db.settings.get(CAPTURE_HIDDEN_CATEGORY_IDS_KEY),
      ])

      return {
        showTimeLabels: timeLabelsSetting?.value !== 'false',
        hiddenCategoryIds: parseStoredNumberArray(hiddenCategorySetting?.value),
      }
    }, []) ?? {
      showTimeLabels: true,
      hiddenCategoryIds: [],
    }

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

  const tasks =
    useLiveQuery(
      () => db.tasks.where('date').between(weekStart, weekEnd, true, true).toArray(),
      [weekEnd, weekStart],
    ) ?? []

  const dailyRecords =
    useLiveQuery(
      () =>
        db.records
          .where('date')
          .between(addDays(weekStart, -1), weekEnd, true, true)
          .toArray(),
      [weekEnd, weekStart],
    ) ?? []

  useEffect(() => {
    setWeeklyMemo(currentWeeklyRecord?.memo ?? '')
  }, [currentWeeklyRecord?.memo, weekStart])

  const progressRates = useMemo(() => {
    const tasksByDate = new Map<string, PlannerTask[]>()

    for (const task of tasks) {
      const dayTasks = tasksByDate.get(task.date) ?? []
      dayTasks.push(task)
      tasksByDate.set(task.date, dayTasks)
    }

    return weekDates.map((date) => getCompletionRate(tasksByDate.get(date) ?? []))
  }, [tasks, weekDates])

  const sleepRows = useMemo<WeeklySleepRow[]>(() => {
    const recordsByDate = new Map(dailyRecords.map((record) => [record.date, record]))
    const rangeMinutes = 14 * 60

    return weekDates.map((date, index) => {
      const previousDate = addDays(date, -1)
      const previousRecord = recordsByDate.get(previousDate)
      const currentRecord = recordsByDate.get(date)
      const sleepTime = previousRecord?.sleepTime
      const wakeTime = currentRecord?.wakeTime

      if (!sleepTime || !wakeTime) {
        return {
          dayLabel: WEEKDAY_LABELS[index],
          durationText: 'XXh XXm',
        }
      }

      const sleepStart = sleepStartDateTime(previousDate, sleepTime, dayStart)
      const wake = localDateAt(date, wakeTime)

      if (wake.getTime() <= sleepStart.getTime()) {
        return {
          dayLabel: WEEKDAY_LABELS[index],
          durationText: 'XXh XXm',
        }
      }

      const timelineStart = localDateAt(previousDate, '22:00')
      const durationMinutes = Math.round(
        (wake.getTime() - sleepStart.getTime()) / 60000,
      )
      const startOffset =
        (sleepStart.getTime() - timelineStart.getTime()) / 60000
      const endOffset = (wake.getTime() - timelineStart.getTime()) / 60000
      const startPercent = Math.max(0, Math.min(100, (startOffset / rangeMinutes) * 100))
      const endPercent = Math.max(0, Math.min(100, (endOffset / rangeMinutes) * 100))
      const hours = Math.floor(durationMinutes / 60)
      const minutes = durationMinutes % 60

      return {
        dayLabel: WEEKDAY_LABELS[index],
        startPercent,
        endPercent,
        durationText: `${hours}h ${String(minutes).padStart(2, '0')}m`,
      }
    })
  }, [dailyRecords, dayStart, weekDates])

  const moods = useMemo(
    () => normalizeMoods(currentWeeklyRecord?.moods),
    [currentWeeklyRecord?.moods],
  )

  const habitStatuses = useMemo(
    () => normalizeHabitStatuses(habits, currentWeeklyRecord?.habitStatuses),
    [currentWeeklyRecord?.habitStatuses, habits],
  )

  function moveWeek(amount: number) {
    onSelectedDateChange(addDays(selectedDate, amount * 7))
  }

  async function updateWeeklyRecord(patch: Partial<WeeklyRecord>) {
    const previous = await db.weeklyRecords.get(weekStart)

    await db.weeklyRecords.put({
      ...previous,
      weekStart,
      ...patch,
    })
  }

  function changeWeeklyMemo(value: string) {
    const nextMemo = value.slice(0, 300)
    setWeeklyMemo(nextMemo)
    void updateWeeklyRecord({ memo: nextMemo })
  }

  function changeMood(dayIndex: number, mood: MoodLevel) {
    const nextMoods = [...moods]
    nextMoods[dayIndex] = mood
    void updateWeeklyRecord({ moods: nextMoods })
  }

  function cycleHabitStatus(habitId: string, dayIndex: number) {
    const nextStatuses = {
      ...habitStatuses,
      [habitId]: [...(habitStatuses[habitId] ?? Array<HabitStatus>(7).fill('todo'))],
    }
    const currentStatus = nextStatuses[habitId][dayIndex] ?? 'todo'
    nextStatuses[habitId][dayIndex] = nextHabitStatus[currentStatus]
    void updateWeeklyRecord({ habitStatuses: nextStatuses })
  }

  async function updateMoodLabel(index: number, value: string) {
    const nextLabels = [...moodLabels]
    nextLabels[index] = value.slice(0, 20)

    await db.settings.put({
      key: WEEKLY_MOOD_LABELS_KEY,
      value: JSON.stringify(nextLabels),
    })
  }

  async function addHabit(name: string) {
    const trimmedName = name.trim()

    if (!trimmedName || habits.length >= MAX_WEEKLY_HABITS) return

    if (habits.some((habit) => habit.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('A habit with this name already exists')
      return
    }

    await db.settings.put({
      key: WEEKLY_HABITS_KEY,
      value: JSON.stringify([
        ...habits,
        { id: createHabitId(), name: trimmedName.slice(0, 30) },
      ]),
    })
  }

  async function renameHabit(habitId: string, name: string) {
    const trimmedName = name.trim().slice(0, 30)
    if (!trimmedName) return

    const nextHabits = habits.map((habit) =>
      habit.id === habitId
        ? { ...habit, name: trimmedName }
        : habit,
    )

    await db.settings.put({
      key: WEEKLY_HABITS_KEY,
      value: JSON.stringify(nextHabits),
    })
  }

  async function deleteHabit(habitId: string) {
    const ok = window.confirm('Delete this habit')
    if (!ok) return

    await db.settings.put({
      key: WEEKLY_HABITS_KEY,
      value: JSON.stringify(habits.filter((habit) => habit.id !== habitId)),
    })
  }

  async function reorderCategory(sourceId: number, targetId: number) {
    if (sourceId === targetId) return

    const orderedIds = categories.flatMap((category) =>
      category.id === undefined ? [] : [category.id],
    )
    const sourceIndex = orderedIds.indexOf(sourceId)
    const targetIndex = orderedIds.indexOf(targetId)

    if (sourceIndex === -1 || targetIndex === -1) return

    orderedIds.splice(sourceIndex, 1)
    orderedIds.splice(targetIndex, 0, sourceId)

    await db.settings.put({
      key: CATEGORY_ORDER_KEY,
      value: JSON.stringify(orderedIds),
    })
  }

  async function updateCaptureTimeLabels(show: boolean) {
    await db.settings.put({
      key: CAPTURE_TIME_LABELS_KEY,
      value: String(show),
    })
  }

  async function toggleCaptureCategoryVisibility(categoryId: number) {
    const nextIds = captureSettings.hiddenCategoryIds.includes(categoryId)
      ? captureSettings.hiddenCategoryIds.filter((id) => id !== categoryId)
      : [...captureSettings.hiddenCategoryIds, categoryId]

    await db.settings.put({
      key: CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
      value: JSON.stringify(nextIds),
    })
  }

  async function saveWeeklyImage() {
    if (!captureRef.current || captureSaving) return

    setCaptureSaving(true)

    try {
      const blob = await createPlannerImageBlob(captureRef.current, '')
      const fileName = `samdolist-weekly-${weekStart}.png`
      const imageUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = imageUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
    } catch (error) {
      console.error(error)
      alert('An error occurred while saving the image')
    } finally {
      setCaptureSaving(false)
    }
  }

  return (
    <main className="samdolist-app min-h-screen bg-neutral-100">
      <style>{`
        .samdolist-app button,
        .samdolist-app .force-bold-text {
          font-weight: 900 !important;
          -webkit-text-stroke: 0.22px currentColor;
        }
      `}</style>

      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => moveWeek(-1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
              aria-label="Previous week"
            >
              <ChevronLeft size={24} strokeWidth={3} />
            </button>

            <div className="relative min-w-0">
              <button
                type="button"
                className="truncate bg-transparent p-0"
                style={{
                  color: theme.primaryBg,
                  fontSize: 'clamp(23px, 7vw, 38px)',
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '-0.045em',
                }}
              >
                {weekLabel}
              </button>

              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={(event) => onSelectedDateChange(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Select week"
              />
            </div>

            <button
              type="button"
              onClick={() => moveWeek(1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
              aria-label="Next week"
            >
              <ChevronRight size={24} strokeWidth={3} />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenDaily}
            className="rounded-xl border border-neutral-200 p-2"
            aria-label="Open daily planner"
          >
            <CalendarDays size={22} />
          </button>

          <button
            type="button"
            onClick={() => void saveWeeklyImage()}
            disabled={captureSaving}
            className="rounded-xl border border-neutral-200 p-2 disabled:opacity-40"
            aria-label="Save weekly image"
          >
            <ImageDown size={22} />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border border-neutral-200 p-2"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-3">
        <div
          className="grid items-stretch gap-3"
          style={{
            gridTemplateColumns: 'clamp(82px, 19vw, 155px) minmax(0, 1fr)',
          }}
        >
          <ProgressCycleList progressRates={progressRates} theme={theme} />

          <div className="min-w-0 space-y-3">
            <SleepTracker rows={sleepRows} theme={theme} />

            <MoodTracker
              moodLabels={moodLabels}
              moods={moods}
              theme={theme}
              onChangeMood={changeMood}
            />

            <HabitTracker
              habits={habits}
              habitStatuses={habitStatuses}
              theme={theme}
              onCycleStatus={cycleHabitStatus}
            />
          </div>
        </div>

        <div className="mt-3 rounded-3xl border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: theme.primaryBg }}
              />
              <span className="text-sm font-black">Weekly Memo</span>
            </div>

            <span className="text-xs font-bold text-neutral-400">
              {weeklyMemo.length}/300
            </span>
          </div>

          <textarea
            value={weeklyMemo}
            maxLength={300}
            onChange={(event) => changeWeeklyMemo(event.target.value)}
            placeholder="A short note about this week"
            className="min-h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base font-medium leading-relaxed text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white sm:text-sm"
          />
        </div>
      </section>

      {menuOpen && (
        <MenuDrawer
          dayStart={dayStart}
          categories={categories}
          theme={theme}
          onReorderCategory={reorderCategory}
          showCaptureTimeLabels={captureSettings.showTimeLabels}
          hiddenCaptureCategoryIds={captureSettings.hiddenCategoryIds}
          onChangeCaptureTimeLabels={updateCaptureTimeLabels}
          onToggleCaptureCategory={toggleCaptureCategoryVisibility}
          moodLabels={moodLabels}
          habits={habits}
          onChangeMoodLabel={updateMoodLabel}
          onAddHabit={addHabit}
          onRenameHabit={renameHabit}
          onDeleteHabit={deleteHabit}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <WeeklyCaptureView
        captureRef={captureRef}
        weekLabel={weekLabel}
        weeklyMemo={weeklyMemo}
        progressRates={progressRates}
        sleepRows={sleepRows}
        moodLabels={moodLabels}
        moods={moods}
        habits={habits}
        habitStatuses={habitStatuses}
        theme={theme}
      />
    </main>
  )
}

export default WeeklySummaryPage