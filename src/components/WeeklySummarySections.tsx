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
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
          height: captureMode
            ? 'calc(100% - 54px)'
            : 'calc(100% - 32px)',
          rowGap: captureMode ? 4 : 2,
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
  const gridColumns = captureMode
    ? '38px minmax(0, 1fr) 122px'
    : '24px minmax(0, 1fr) 76px'
  const sleepColumnGap = captureMode ? 20 : 12
  const timelineWidth = captureMode ? '92%' : '100%'
  const resolvedRows = Array.from({ length: 7 }, (_, index) =>
    rows[index] ?? {
      dayLabel: WEEKDAY_LABELS[index],
      durationText: 'XXh XXm',
    },
  )

  return (
    <section
      className="overflow-hidden rounded-3xl border border-neutral-200 bg-white"
      style={{
        height: captureMode ? '100%' : undefined,
        padding: captureMode ? 20 : 14,
        display: 'grid',
        gridTemplateRows: captureMode
          ? '34px 22px minmax(0, 1fr)'
          : '24px 18px auto',
        rowGap: captureMode ? 12 : 10,
      }}
    >
      <div
        className="font-black leading-none"
        style={{ fontSize: titleSize }}
      >
        Sleep Tracker
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns,
          columnGap: sleepColumnGap,
          alignItems: 'center',
        }}
      >
        <div />
        <div
          className="mx-auto flex justify-between text-neutral-400"
          style={{ width: timelineWidth }}
        >
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
      </div>

      <div
        style={
          captureMode
            ? {
                display: 'grid',
                gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
                minHeight: 0,
                height: '100%',
              }
            : {
                display: 'grid',
                gridTemplateRows: 'repeat(7, 34px)',
                rowGap: 5,
              }
        }
      >
        {resolvedRows.map((row, index) => {
          const hasRange =
            row.startPercent !== undefined &&
            row.endPercent !== undefined &&
            row.endPercent > row.startPercent

          return (
            <div
              key={`${row.dayLabel}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: gridColumns,
                columnGap: sleepColumnGap,
                alignItems: 'center',
                minHeight: 0,
              }}
            >
              <div
                className="text-center font-black leading-none"
                style={{ fontSize: captureMode ? 22 : 12 }}
              >
                {row.dayLabel}
              </div>

              <div
                className="relative mx-auto overflow-hidden rounded-full bg-neutral-100"
                style={{
                  width: timelineWidth,
                  height: captureMode ? 15 : 9,
                }}
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
                className="text-center font-black leading-none text-neutral-500"
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

const TRACKER_LABEL_WIDTH_CAPTURE = 112
const TRACKER_LABEL_WIDTH_SCREEN = 86

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
  const resolvedMoods = Array.from(
    { length: 7 },
    (_, index) => moods[index] ?? 1,
  ) as MoodLevel[]

  const points = resolvedMoods
    .map((mood, index) => {
      const x = ((index + 0.5) / 7) * 100
      const y = ((mood + 0.5) / 4) * 100
      return `${x},${y}`
    })
    .join(' ')

  const labelColumnWidth = captureMode
    ? TRACKER_LABEL_WIDTH_CAPTURE
    : TRACKER_LABEL_WIDTH_SCREEN
  const columnGap = captureMode ? 14 : 10
  const axisHeight = captureMode ? 30 : 22
  const lineWidth = captureMode ? 3 : 2
  const dotSize = captureMode ? 12 : 8

  return (
    <section
      className="overflow-hidden rounded-3xl border border-neutral-200 bg-white"
      style={{
        height: captureMode ? '100%' : undefined,
        padding: captureMode ? 20 : 14,
        display: 'grid',
        gridTemplateRows: captureMode
          ? '34px minmax(0, 1fr)'
          : '24px 190px',
        rowGap: captureMode ? 12 : 8,
      }}
    >
      <div
        className="font-black leading-none"
        style={{ fontSize: captureMode ? 28 : 17 }}
      >
        Mood Tracker
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${labelColumnWidth}px minmax(0, 1fr)`,
          columnGap,
          minHeight: 0,
          width: captureMode ? 'calc(100% - 20px)' : '100%',
          marginLeft: captureMode ? 'auto' : undefined,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
            minHeight: 0,
            paddingBottom: axisHeight,
          }}
        >
          {resolvedLabels.map((label) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-end pr-4 font-black text-neutral-500"
              style={{ fontSize: captureMode ? 21 : 10 }}
            >
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: `minmax(0, 1fr) ${axisHeight}px`,
            minHeight: 0,
          }}
        >
          <div className="relative min-h-0">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            >
              <polyline
                points={points}
                fill="none"
                stroke={theme.primaryBg}
                strokeWidth={lineWidth}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>

            {resolvedMoods.map((mood, index) => {
              const x = ((index + 0.5) / 7) * 100
              const y = ((mood + 0.5) / 4) * 100

              return (
                <span
                  key={`${index}-${mood}`}
                  className="pointer-events-none absolute"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '9999px',
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff',
                    borderStyle: 'solid',
                    borderColor: theme.primaryBg,
                    borderWidth: lineWidth,
                    boxShadow: 'none',
                    outline: 'none',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )
            })}

            <div
              className="absolute inset-0"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              }}
            >
              {WEEKDAY_LABELS.map((dayLabel, dayIndex) => (
                <div
                  key={`${dayLabel}-${dayIndex}`}
                  style={{
                    display: 'grid',
                    gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
                  }}
                >
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              alignItems: 'end',
            }}
          >
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
  const labelColumnWidth = captureMode
    ? TRACKER_LABEL_WIDTH_CAPTURE
    : TRACKER_LABEL_WIDTH_SCREEN
  const columnGap = captureMode ? 14 : 10
  const headerHeight = captureMode ? 30 : 24

  return (
    <section
      className="overflow-hidden rounded-3xl border border-neutral-200 bg-white"
      style={{
        height: captureMode ? '100%' : undefined,
        padding: captureMode ? 20 : 14,
        display: 'grid',
        gridTemplateRows: captureMode
          ? '34px minmax(0, 1fr)'
          : '24px 180px',
        rowGap: captureMode ? 12 : 8,
      }}
    >
      <div
        className="font-black leading-none"
        style={{ fontSize: captureMode ? 28 : 17 }}
      >
        Habit Tracker
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: `${headerHeight}px repeat(4, minmax(0, 1fr))`,
          minHeight: 0,
          height: '100%',
          width: captureMode ? 'calc(100% - 20px)' : '100%',
          marginLeft: captureMode ? 'auto' : undefined,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${labelColumnWidth}px minmax(0, 1fr)`,
            columnGap,
            alignItems: 'center',
          }}
        >
          <div />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            }}
          >
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
        </div>

        {rows.map((habit, rowIndex) => {
          const statuses = habit
            ? habitStatuses[habit.id] ?? Array<HabitStatus>(7).fill('todo')
            : []

          return (
            <div
              key={habit?.id ?? `empty-${rowIndex}`}
              style={{
                display: 'grid',
                gridTemplateColumns: `${labelColumnWidth}px minmax(0, 1fr)`,
                columnGap,
                alignItems: 'stretch',
                minHeight: 0,
              }}
            >
              <div
                className="flex min-w-0 items-center font-black text-neutral-600"
                style={{
                  minHeight: 0,
                  fontSize: captureMode ? 21 : 11,
                }}
              >
                <span className="truncate">{habit?.name ?? ''}</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  minHeight: 0,
                }}
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
                      className="grid h-full place-items-center leading-none disabled:cursor-default"
                      style={{
                        minHeight: 0,
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