import type {
  HabitDefinition,
  HabitStatus,
  MoodLevel,
} from '../types'
import type { ThemeColors } from '../plannerTypes'

export const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

export type WeeklySleepRow = {
  dayLabel: string
  startPercent?: number
  endPercent?: number
  durationText: string
}

type ProgressCycleListProps = {
  progressRates: number[]
  theme: ThemeColors
  captureMode?: boolean
}

function ProgressRing({
  value,
  label,
  theme,
  captureMode = false,
}: {
  value: number
  label: string
  theme: ThemeColors
  captureMode?: boolean
}) {
  const size = captureMode ? 118 : 58
  const strokeWidth = captureMode ? 12 : 7
  const radius = 50 - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (circumference * value) / 100

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#e5e5e5"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={theme.primaryBg}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div
              className="font-black leading-none"
              style={{ fontSize: captureMode ? 30 : 15 }}
            >
              {label}
            </div>
            <div
              className="mt-1 font-black leading-none text-neutral-400"
              style={{ fontSize: captureMode ? 18 : 10 }}
            >
              {value}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProgressCycleList({
  progressRates,
  theme,
  captureMode = false,
}: ProgressCycleListProps) {
  return (
    <section
      className="h-full rounded-3xl border border-neutral-200 bg-white"
      style={{ padding: captureMode ? '22px 16px' : '14px 8px' }}
    >
      <div
        className="mb-2 text-center font-black"
        style={{ fontSize: captureMode ? 26 : 12 }}
      >
        Progress
      </div>

      <div
        className="grid grid-rows-7 gap-1"
        style={{
          height: captureMode
            ? 'calc(100% - 54px)'
            : 'calc(100% - 32px)',
        }}
      >
        {WEEKDAY_LABELS.map((label, index) => (
          <ProgressRing
            key={`${label}-${index}`}
            value={progressRates[index] ?? 0}
            label={label}
            theme={theme}
            captureMode={captureMode}
          />
        ))}
      </div>
    </section>
  )
}

type SleepTrackerProps = {
  rows: WeeklySleepRow[]
  theme: ThemeColors
  captureMode?: boolean
}

const SLEEP_TIME_LABELS = ['22', '00', '02', '04', '06', '08', '10', '12']

export function SleepTracker({
  rows,
  theme,
  captureMode = false,
}: SleepTrackerProps) {
  const titleSize = captureMode ? 28 : 17
  const labelSize = captureMode ? 15 : 10
  const rowHeight = captureMode ? 27 : 25

  return (
    <section
      className={`${captureMode ? 'h-full' : ''} overflow-hidden rounded-3xl border border-neutral-200 bg-white`}
      style={{ padding: captureMode ? 20 : 14 }}
    >
      <div
        className="font-black leading-none"
        style={{ fontSize: titleSize }}
      >
        Sleep Tracker
      </div>

      <div
        className="mt-3 grid items-end gap-2"
        style={{
          gridTemplateColumns: captureMode
            ? '34px minmax(0, 1fr) 94px'
            : '20px minmax(0, 1fr) 55px',
        }}
      >
        <div />
        <div className="flex justify-between text-neutral-400">
          {SLEEP_TIME_LABELS.map((label) => (
            <span
              key={label}
              className="font-bold leading-none"
              style={{ fontSize: labelSize }}
            >
              {label}
            </span>
          ))}
        </div>
        <div
          className="text-right font-bold leading-none text-neutral-400"
          style={{ fontSize: labelSize }}
        >
          Duration
        </div>
      </div>

      <div className={captureMode ? 'mt-2 space-y-1' : 'mt-2 space-y-1.5'}>
        {rows.map((row, index) => {
          const hasRange =
            row.startPercent !== undefined &&
            row.endPercent !== undefined &&
            row.endPercent > row.startPercent

          return (
            <div
              key={`${row.dayLabel}-${index}`}
              className="grid items-center gap-2"
              style={{
                minHeight: rowHeight,
                gridTemplateColumns: captureMode
                  ? '34px minmax(0, 1fr) 94px'
                  : '20px minmax(0, 1fr) 55px',
              }}
            >
              <div
                className="text-center font-black leading-none"
                style={{ fontSize: captureMode ? 22 : 12 }}
              >
                {row.dayLabel}
              </div>

              <div
                className="relative overflow-hidden rounded-full bg-neutral-100"
                style={{ height: captureMode ? 15 : 9 }}
              >
                {hasRange ? (
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: `${row.startPercent}%`,
                      width: `${row.endPercent! - row.startPercent!}%`,
                      backgroundColor: theme.primaryBg,
                    }}
                  />
                ) : null}
              </div>

              <div
                className="text-right font-black leading-none text-neutral-500"
                style={{ fontSize: captureMode ? 20 : 10 }}
              >
                {row.durationText}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type MoodTrackerProps = {
  moodLabels: string[]
  moods: MoodLevel[]
  theme: ThemeColors
  onChangeMood?: (dayIndex: number, mood: MoodLevel) => void
  captureMode?: boolean
}

export function MoodTracker({
  moodLabels,
  moods,
  theme,
  onChangeMood,
  captureMode = false,
}: MoodTrackerProps) {
  const resolvedLabels = Array.from({ length: 4 }, (_, index) =>
    moodLabels[index]?.trim() || `Mood ${index + 1}`,
  )

  const points = moods
    .map((mood, index) => {
      const x = ((index + 0.5) / 7) * 100
      const y = ((mood + 0.5) / 4) * 100
      return `${x},${y}`
    })
    .join(' ')

  const chartHeight = captureMode ? 200 : 165

  return (
    <section
      className={`${captureMode ? 'h-full' : ''} rounded-3xl border border-neutral-200 bg-white`}
      style={{ padding: captureMode ? 20 : 14 }}
    >
      <div
        className="font-black"
        style={{ fontSize: captureMode ? 28 : 17 }}
      >
        Mood Tracker
      </div>

      <div
        className="mt-3 grid gap-3"
        style={{
          gridTemplateColumns: captureMode ? '104px minmax(0, 1fr)' : '58px minmax(0, 1fr)',
        }}
      >
        <div
          className="grid grid-rows-4"
          style={{ height: chartHeight }}
        >
          {resolvedLabels.map((label) => (
            <div
              key={label}
              className="flex items-center font-black text-neutral-500"
              style={{ fontSize: captureMode ? 21 : 10 }}
            >
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="relative" style={{ height: chartHeight }}>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            >
              <polyline
                points={points}
                fill="none"
                stroke={theme.primaryBg}
                strokeWidth={captureMode ? 3.6 : 3}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>

            {moods.map((mood, index) => {
              const x = ((index + 0.5) / 7) * 100
              const y = ((mood + 0.5) / 4) * 100
              const dotSize = captureMode ? 16 : 11

              return (
                <span
                  key={`${index}-${mood}`}
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: dotSize,
                    height: dotSize,
                    backgroundColor: theme.primaryBg,
                    border: '2px solid #ffffff',
                    boxShadow: `0 0 0 1px ${theme.primaryBg}`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )
            })}

            <div className="absolute inset-0 grid grid-cols-7">
              {WEEKDAY_LABELS.map((dayLabel, dayIndex) => (
                <div key={`${dayLabel}-${dayIndex}`} className="grid grid-rows-4">
                  {resolvedLabels.map((label, moodIndex) => (
                    <button
                      key={`${label}-${moodIndex}`}
                      type="button"
                      aria-label={`${dayLabel} ${label}`}
                      disabled={!onChangeMood}
                      onClick={() =>
                        onChangeMood?.(dayIndex, moodIndex as MoodLevel)
                      }
                      className="h-full w-full disabled:cursor-default"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-7">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="text-center font-black"
                style={{ fontSize: captureMode ? 22 : 11 }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

type HabitTrackerProps = {
  habits: HabitDefinition[]
  habitStatuses: Record<string, HabitStatus[]>
  theme: ThemeColors
  onCycleStatus?: (habitId: string, dayIndex: number) => void
  captureMode?: boolean
}

const HABIT_SYMBOLS: Record<HabitStatus, string> = {
  todo: 'X',
  done: 'O',
  partial: '△',
}

function getHabitStatusColor(status: HabitStatus, theme: ThemeColors) {
  if (status === 'done') return theme.statusDone
  if (status === 'partial') return theme.statusPartial
  return theme.statusTodo
}

export function HabitTracker({
  habits,
  habitStatuses,
  theme,
  onCycleStatus,
  captureMode = false,
}: HabitTrackerProps) {
  const rows = Array.from({ length: 4 }, (_, index) => habits[index])
  const rowHeight = captureMode ? 58 : 38
  const labelColumnWidth = captureMode ? 104 : 58

  return (
    <section
      className={`${captureMode ? 'h-full' : ''} overflow-hidden rounded-3xl border border-neutral-200 bg-white`}
      style={{ padding: captureMode ? 20 : 14 }}
    >
      <div
        className="font-black leading-none"
        style={{ fontSize: captureMode ? 28 : 17 }}
      >
        Habit Tracker
      </div>

      <div
        className="mt-3 grid gap-x-3"
        style={{
          gridTemplateColumns: `${labelColumnWidth}px minmax(0, 1fr)`,
        }}
      >
        <div />

        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="text-center font-black leading-none"
              style={{ fontSize: captureMode ? 22 : 11 }}
            >
              {label}
            </div>
          ))}
        </div>

        {rows.map((habit, rowIndex) => {
          const statuses = habit
            ? habitStatuses[habit.id] ?? Array<HabitStatus>(7).fill('todo')
            : []

          return (
            <div key={habit?.id ?? `empty-${rowIndex}`} className="contents">
              <div
                className="min-w-0 truncate font-black text-neutral-600"
                style={{
                  minHeight: rowHeight,
                  lineHeight: `${rowHeight}px`,
                  fontSize: captureMode ? 21 : 11,
                }}
              >
                {habit?.name ?? ''}
              </div>

              <div
                className="grid grid-cols-7"
                style={{ minHeight: rowHeight }}
              >
                {WEEKDAY_LABELS.map((_, dayIndex) => {
                  if (!habit) {
                    return <div key={`empty-${rowIndex}-${dayIndex}`} />
                  }

                  const status = statuses[dayIndex] ?? 'todo'

                  return (
                    <button
                      key={`${habit.id}-${dayIndex}`}
                      type="button"
                      disabled={!onCycleStatus}
                      onClick={() => onCycleStatus?.(habit.id, dayIndex)}
                      className="grid place-items-center leading-none disabled:cursor-default"
                      style={{
                        minHeight: rowHeight,
                        color: getHabitStatusColor(status, theme),
                        fontSize: captureMode ? 27 : 15,
                        fontWeight: 900,
                      }}
                      aria-label={`${habit.name} ${dayIndex + 1} ${status}`}
                    >
                      {HABIT_SYMBOLS[status]}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}