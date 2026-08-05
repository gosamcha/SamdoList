import type { RefObject } from 'react'
import type {
  HabitDefinition,
  HabitStatus,
  MoodLevel,
} from '../types'
import type { ThemeColors } from '../plannerTypes'
import {
  HabitTracker,
  MoodTracker,
  ProgressCycleList,
  SleepTracker,
  type WeeklySleepRow,
} from './WeeklySummarySections'

type WeeklyCaptureViewProps = {
  captureRef: RefObject<HTMLDivElement | null>
  weekLabel: string
  weeklyMemo: string
  progressRates: number[]
  sleepRows: WeeklySleepRow[]
  moodLabels: string[]
  moods: MoodLevel[]
  habits: HabitDefinition[]
  habitStatuses: Record<string, HabitStatus[]>
  theme: ThemeColors
}

function WeeklyCaptureView({
  captureRef,
  weekLabel,
  weeklyMemo,
  progressRates,
  sleepRows,
  moodLabels,
  moods,
  habits,
  habitStatuses,
  theme,
}: WeeklyCaptureViewProps) {
  return (
    <div
      className="pointer-events-none fixed left-[-10000px] top-0"
      aria-hidden="true"
    >
      <div
        ref={captureRef}
        className="overflow-hidden bg-neutral-100"
        style={{ width: 1080, height: 1350 }}
      >
        <div
          className="mb-6 bg-white px-8 pb-5 pt-7"
          style={{ boxShadow: '0 10px 18px rgba(15, 23, 42, 0.08)' }}
        >
          <div className="flex h-[88px] min-w-0 items-end gap-6">
            <div
              className="shrink-0 font-black leading-none"
              style={{
                color: theme.primaryBg,
                fontSize: 61,
                letterSpacing: '-0.045em',
              }}
            >
              {weekLabel}
            </div>

            <div className="flex min-h-[56px] min-w-0 flex-1 items-end pb-1">
              {weeklyMemo.trim() ? (
                <div
                  className="truncate font-semibold text-neutral-400"
                  style={{ fontSize: 18, letterSpacing: '0.01em' }}
                >
                  {weeklyMemo.trim()}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div
            className="grid gap-5"
            style={{
              height: 1166,
              gridTemplateColumns: '190px minmax(0, 1fr)',
            }}
          >
            <ProgressCycleList
              progressRates={progressRates}
              theme={theme}
              captureMode
            />

            <div className="flex min-h-0 flex-col gap-5">
              <div className="shrink-0" style={{ height: 360 }}>
                <SleepTracker
                  rows={sleepRows}
                  theme={theme}
                  captureMode
                />
              </div>

              <div className="shrink-0" style={{ height: 350 }}>
                <MoodTracker
                  moodLabels={moodLabels}
                  moods={moods}
                  theme={theme}
                  captureMode
                />
              </div>

              <div className="min-h-0 flex-1">
                <HabitTracker
                  habits={habits}
                  habitStatuses={habitStatuses}
                  theme={theme}
                  captureMode
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WeeklyCaptureView