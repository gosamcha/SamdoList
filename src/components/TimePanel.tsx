import { useEffect, useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
import clsx from 'clsx'
import type { Category, PlannerTask } from '../types'
import type { RecordSet } from '../plannerTypes'
import {
  addDays,
  getPlannerDate,
  getTaskRange,
  localDateAt,
  minutesToTimeLabel,
  sleepStartDateTime,
  timeToMinutes,
} from '../utils/time'

const HOUR_HEIGHT = 42
const EXTRA_LANE_HEIGHT = 20

type TimePanelProps = {
  selectedDate: string
  dayStart: string
  categories: Category[]
  tasks: PlannerTask[]
  records: RecordSet
  captureMode?: boolean
  hourHeight?: number
  extraLaneHeight?: number
  captureTargetHeight?: number
  showTaskLabels?: boolean
  hiddenLabelCategoryIds?: number[]
  currentTimeColor?: string
}

function TimePanel({
  selectedDate,
  dayStart,
  categories,
  tasks,
  records,
  captureMode = false,
  hourHeight = HOUR_HEIGHT,
  extraLaneHeight = EXTRA_LANE_HEIGHT,
  captureTargetHeight,
  showTaskLabels = true,
  hiddenLabelCategoryIds = [],
  currentTimeColor = '#111827',
}: TimePanelProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (captureMode) return

    const updateNow = () => setNow(new Date())
    updateNow()

    const intervalId = window.setInterval(updateNow, 30_000)

    return () => window.clearInterval(intervalId)
  }, [captureMode])
  const hiddenLabelCategoryIdSet = useMemo(
    () => new Set(hiddenLabelCategoryIds),
    [hiddenLabelCategoryIds],
  )

  const categoryMap = useMemo(() => {
      return new Map(categories.map((category) => [category.id, category]))
    }, [categories])

    const dayStartMinutes = timeToMinutes(dayStart)

    const sleepLayout = useMemo(() => {
      const blocks: Array<{
        hourIndex: number
        leftPercent: number
        widthPercent: number
      }> = []

      // 각 시간 줄에서 수면으로 칠해지는 비율. 0은 전부 깨어 있음, 1은 전부 수면임.
      const sleepRatios = Array.from({ length: 24 }, () => 0)

      const prevDate = addDays(selectedDate, -1)
      const nextDate = addDays(selectedDate, 1)

      const gridStart = localDateAt(selectedDate, dayStart).getTime()
      const gridEnd = gridStart + 24 * 60 * 60 * 1000

      function addSleepRange(startMs: number, endMs: number) {
        const start = Math.max(startMs, gridStart)
        const end = Math.min(endMs, gridEnd)

        if (end <= start) return

        let cursor = (start - gridStart) / 1000 / 60
        const endOffset = (end - gridStart) / 1000 / 60

        while (cursor < endOffset) {
          const hourStart = Math.floor(cursor / 60) * 60
          const hourEnd = hourStart + 60
          const segmentEnd = Math.min(endOffset, hourEnd)

          const hourIndex = Math.floor(hourStart / 60)
          const leftPercent = ((cursor - hourStart) / 60) * 100
          const widthPercent = ((segmentEnd - cursor) / 60) * 100

          blocks.push({
            hourIndex,
            leftPercent,
            widthPercent,
          })

          if (sleepRatios[hourIndex] !== undefined) {
            sleepRatios[hourIndex] = Math.min(
              1,
              sleepRatios[hourIndex] + widthPercent / 100,
            )
          }

          cursor = segmentEnd
        }
      }

      if (records.current?.wakeTime) {
        const wakeTime = localDateAt(
          selectedDate,
          records.current.wakeTime,
        ).getTime()

        if (records.prev?.sleepTime) {
          const sleepTime = sleepStartDateTime(
            prevDate,
            records.prev.sleepTime,
            dayStart,
          ).getTime()

          addSleepRange(sleepTime, wakeTime)
        } else {
          addSleepRange(gridStart, wakeTime)
        }
      }

      if (records.current?.sleepTime) {
        const sleepTime = sleepStartDateTime(
          selectedDate,
          records.current.sleepTime,
          dayStart,
        ).getTime()

        if (records.next?.wakeTime) {
          const wakeTime = localDateAt(
            nextDate,
            records.next.wakeTime,
          ).getTime()

          addSleepRange(sleepTime, wakeTime)
        } else {
          addSleepRange(sleepTime, gridEnd)
        }
      }

      return {
        blocks,
        sleepRatios,
      }
    }, [
      dayStart,
      records.current?.wakeTime,
      records.current?.sleepTime,
      records.next?.wakeTime,
      records.prev?.sleepTime,
      selectedDate,
    ])

    const { blocks: sleepBlocks, sleepRatios } = sleepLayout

    const timeLayout = useMemo(() => {
      type TaskRange = {
        task: PlannerTask
        taskKey: string

        // DayStart 기준으로 계산한 시작·종료 위치
        startOffset: number
        endOffset: number
      }

      type HourTaskSegment = {
        range: TaskRange

        // 현재 시간 줄 안에서 잘린 시작·종료 위치
        segmentStart: number
        segmentEnd: number
      }

      type HourLayout = {
        hourIndex: number
        top: number
        height: number

        // 해당 시간 줄에서 동시에 겹치는 최대 투두 수
        laneCount: number
      }

      type TaskBlock = {
        task: PlannerTask
        taskKey: string
        hourIndex: number
        leftPercent: number
        widthPercent: number

        // 몇 번째 세로 칸에 배치할지
        laneIndex: number
        // 이 시간 줄의 전체 세로 칸 수
        laneCount: number

        showTitle: boolean
      }

      function compareTaskRange(a: TaskRange, b: TaskRange) {
        if (a.startOffset !== b.startOffset) {
          return a.startOffset - b.startOffset
        }

        const aCreatedAt =
          a.task.createdAt ?? Number.MAX_SAFE_INTEGER
        const bCreatedAt =
          b.task.createdAt ?? Number.MAX_SAFE_INTEGER

        if (aCreatedAt !== bCreatedAt) {
          return aCreatedAt - bCreatedAt
        }

        return (
          (a.task.id ?? Number.MAX_SAFE_INTEGER) -
          (b.task.id ?? Number.MAX_SAFE_INTEGER)
        )
      }

      //* 시간이 설정된 투두를 DayStart 기준 범위로 변환
      const ranges: TaskRange[] = tasks.flatMap((task, index) => {
        if (!task.startTime || !task.endTime) return []

        const range = getTaskRange(
          task.startTime,
          task.endTime,
          dayStart,
        )

        // 타임 탭의 24시간 범위 밖에 있는 부분은 잘라냄
        const startOffset = Math.max(0, range.startOffset)
        const endOffset = Math.min(24 * 60, range.endOffset)

        if (endOffset <= startOffset) return []

        return [
          {
            task,

            taskKey:
              task.id !== undefined
                ? `task-${task.id}`
                : `task-${task.createdAt ?? index}-${index}`,

            startOffset,
            endOffset,
          },
        ]
      })

      ranges.sort(compareTaskRange)

      //동시에 겹치는 최대 투두 개수를 계산함.
      function getMaximumOverlap(
        segments: HourTaskSegment[],
      ) {
        const events: Array<{
          minute: number
          change: number
        }> = []

        segments.forEach(({ segmentStart, segmentEnd }) => {
          events.push({
            minute: segmentStart,
            change: 1,
          })

          events.push({
            minute: segmentEnd,
            change: -1,
          })
        })

        events.sort((a, b) => {
          if (a.minute !== b.minute) {
            return a.minute - b.minute
          }

          return a.change - b.change
        })

        let currentCount = 0
        let maximumCount = 0

        events.forEach((event) => {
          currentCount += event.change
          maximumCount = Math.max(maximumCount, currentCount)
        })

        return Math.max(1, maximumCount)
      }

      const rawHourData = Array.from(
        { length: 24 },
        (_, hourIndex) => {
          const hourStart = hourIndex * 60
          const hourEnd = hourStart + 60

          const segments: HourTaskSegment[] = ranges
            .filter(
              (range) =>
                range.startOffset < hourEnd &&
                range.endOffset > hourStart,
            )
            .map((range) => ({
              range,
              segmentStart: Math.max(
                hourStart,
                range.startOffset,
              ),
              segmentEnd: Math.min(
                hourEnd,
                range.endOffset,
              ),
            }))

          const maximumOverlap =
            getMaximumOverlap(segments)

          const displayLaneCount = Math.min(
            Math.max(1, maximumOverlap),
            3,
          )

          const overlapExtra =
            displayLaneCount <= 2
              ? 0
              : extraLaneHeight +
                (displayLaneCount - 3) * extraLaneHeight

          // displayLaneCount는 동시에 필요한 세로 칸 수임.
          // 시간대 안에 존재하는 전체 투두 개수와는 다르므로,
          // 여기서 segments를 slice하면 서로 겹치지 않는 뒤쪽 투두까지 사라짐.
          const laneEndOffsets = Array.from(
            { length: displayLaneCount },
            () => Number.NEGATIVE_INFINITY,
          )

          const assignedSegments = [...segments]
            .sort((a, b) =>
              compareTaskRange(a.range, b.range),
            )
            .flatMap((segment) => {
              const laneIndex = laneEndOffsets.findIndex(
                (endOffset) =>
                  endOffset <= segment.segmentStart,
              )

              // 같은 순간에 네 개 이상 겹친 경우에는 앞선 세 개만 표시함.
              // 이후 빈 lane이 생긴 뒤 시작하는 투두는 정상적으로 다시 표시됨.
              if (laneIndex === -1) {
                return []
              }

              laneEndOffsets[laneIndex] =
                segment.segmentEnd

              return [
                {
                  ...segment,
                  laneIndex,
                },
              ]
            })

          return {
            hourIndex,
            overlapExtra,
            laneCount: displayLaneCount,
            assignedSegments,
          }
        },
      )

      const resolvedHourData = (() => {
        if (!captureMode || !captureTargetHeight) {
          return rawHourData.map((hourData) => ({
            ...hourData,
            height: hourHeight + hourData.overlapExtra,
          }))
        }

        const totalOverlapExtra = rawHourData.reduce(
          (sum, hourData) => sum + hourData.overlapExtra,
          0,
        )

        const sleepUnitCount = sleepRatios.reduce(
          (sum, ratio) => sum + ratio,
          0,
        )
        const awakeUnitCount = 24 - sleepUnitCount

        const availableBaseHeight = Math.max(
          0,
          captureTargetHeight - totalOverlapExtra,
        )

        // 완전히 자는 한 시간은 작게 고정하고, 남은 높이를 깨어 있는 시간에 균등 배분함.
        let compactSleepHourHeight = Math.min(24, availableBaseHeight / 24)
        let awakeHourHeight = compactSleepHourHeight

        if (awakeUnitCount > 0) {
          awakeHourHeight =
            (availableBaseHeight -
              sleepUnitCount * compactSleepHourHeight) /
            awakeUnitCount

          if (awakeHourHeight < compactSleepHourHeight) {
            compactSleepHourHeight = availableBaseHeight / 24
            awakeHourHeight = compactSleepHourHeight
          }
        } else if (sleepUnitCount > 0) {
          compactSleepHourHeight =
            availableBaseHeight / sleepUnitCount
          awakeHourHeight = compactSleepHourHeight
        }

        const preliminaryHourData = rawHourData.map((hourData) => {
          const sleepRatio = sleepRatios[hourData.hourIndex] ?? 0
          const awakeRatio = 1 - sleepRatio

          return {
            ...hourData,
            height:
              sleepRatio * compactSleepHourHeight +
              awakeRatio * awakeHourHeight +
              hourData.overlapExtra,
          }
        })

        const preliminaryTotalHeight = preliminaryHourData.reduce(
          (sum, hourData) => sum + hourData.height,
          0,
        )

        const heightScale =
          preliminaryTotalHeight > 0
            ? captureTargetHeight / preliminaryTotalHeight
            : 1

        return preliminaryHourData.map((hourData) => ({
          ...hourData,
          height: hourData.height * heightScale,
        }))
      })()

      let accumulatedTop = 0

      const hourLayouts: HourLayout[] =
        resolvedHourData.map((hourData) => {
          const layout: HourLayout = {
            hourIndex: hourData.hourIndex,
            top: accumulatedTop,
            height: hourData.height,
            laneCount: hourData.laneCount,
          }

          accumulatedTop += hourData.height

          return layout
        })

      const taskBlocks: TaskBlock[] = []

      resolvedHourData.forEach((hourData) => {
        const hourStart = hourData.hourIndex * 60

        hourData.assignedSegments.forEach(
          ({ range, segmentStart, segmentEnd, laneIndex }) => {
            // 제목은 반드시 실제 시작 시간이 포함된 첫 구간에만 표시함.
            // 짧은 구간이어도 ellipsis로 축약되어 시작 위치에서 보임.
            const showTitle =
              Math.abs(segmentStart - range.startOffset) < 0.001

            taskBlocks.push({
              task: range.task,
              taskKey: range.taskKey,
              hourIndex: hourData.hourIndex,

              // 시간 위치와 길이는 기존처럼 가로축으로 계산
              leftPercent:
                ((segmentStart - hourStart) / 60) * 100,

              widthPercent:
                ((segmentEnd - segmentStart) / 60) * 100,

              laneIndex,
              laneCount: hourData.laneCount,
              showTitle,
            })
          },
        )
      })

      return {
        hourLayouts,
        taskBlocks,

        // 모든 시간 줄 높이를 더한 최종 타임 탭 높이
        totalHeight: accumulatedTop,
      }
    }, [
      tasks,
      dayStart,
      hourHeight,
      extraLaneHeight,
      captureMode,
      captureTargetHeight,
      sleepRatios,
    ])

    const {
      hourLayouts,
      taskBlocks,
      totalHeight,
    } = timeLayout

    const currentTimeMarker = useMemo(() => {
      // 캡처 화면은 기존 디자인을 그대로 유지함.
      if (captureMode) return null

      // 현재 시간이 속한 플래너 날짜에서만 표시함.
      if (getPlannerDate(now, dayStart) !== selectedDate) return null

      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      let currentOffset = currentMinutes - dayStartMinutes

      if (currentOffset < 0) currentOffset += 24 * 60

      const hourIndex = Math.floor(currentOffset / 60)
      const minuteInHour = currentOffset % 60

      // 현재 타임 탭은 한 시간 줄이 6칸이므로 한 셀은 10분임.
      const cellIndex = Math.min(5, Math.floor(minuteInHour / 10))
      const hourLayout = hourLayouts[hourIndex]

      if (!hourLayout) return null

      return {
        hourIndex,
        cellIndex,
      }
    }, [
      captureMode,
      now,
      dayStart,
      selectedDate,
      dayStartMinutes,
      hourLayouts,
    ])

  return (
    <section
      className={clsx(
        'overflow-hidden border border-neutral-200 bg-white',
        captureMode ? 'h-full rounded-[30px]' : 'rounded-2xl',
      )}
    >
      <div
        className={clsx(
          captureMode
            ? 'h-full overflow-hidden'
            : 'max-h-[72vh] overflow-auto',
        )}
      >
        <div className="relative" style={{ height: totalHeight }}>
          {hourLayouts.map((hourLayout) => {
            const { hourIndex, top, height } = hourLayout

            const label = minutesToTimeLabel(
              dayStartMinutes + hourIndex * 60,
            )

            return (
              <div
                key={hourIndex}
                className="absolute left-0 right-0 border-t border-neutral-200"
                style={{
                  // 시간 줄마다 높이가 다를 수 있으므로
                  // 미리 계산한 top과 height를 사용함
                  top,
                  height,
                }}
              >
                <div
                  className={clsx(
                    'absolute left-0 font-black leading-none text-neutral-400',
                    captureMode
                      ? 'flex w-12 items-center justify-center text-center text-[22px]'
                      : 'top-1 w-6 text-center text-sm',
                  )}
                  style={
                    captureMode
                      ? {
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }
                      : undefined
                  }
                >
                  {label.slice(0, 2)}
                </div>

                <div
                  className={clsx(
                    'grid h-full grid-cols-6',
                    captureMode ? 'ml-12' : 'ml-7',
                  )}
                >
                  {Array.from({ length: 6 }).map(
                    (__, cellIndex) => (
                      <div
                        key={cellIndex}
                        className="border-l border-neutral-200"
                      />
                    ),
                  )}
                </div>
              </div>
            )
          })}

          {sleepBlocks.map((block, index) => {
            const hourLayout =
              hourLayouts[block.hourIndex]

            if (!hourLayout) return null

            return (
              <div
                key={index}
                className={clsx(
                  'pointer-events-none absolute right-0 z-0',
                  captureMode ? 'left-12' : 'left-7',
                )}
                style={{
                  // 늘어난 시간 줄 높이에 맞춰 수면 배경도 같이 늘림
                  top: hourLayout.top,
                  height: hourLayout.height,
                }}
              >
                <div
                  className="absolute bg-neutral-200/25"
                  style={{
                    left: `${block.leftPercent}%`,
                    width: `${block.widthPercent}%`,
                    top: 0,
                    height: '100%',
                  }}
                />
              </div>
            )
          })}

          {taskBlocks.map(
            ({
              task,
              taskKey,
              hourIndex,
              leftPercent,
              widthPercent,
              laneIndex,
              laneCount,
              showTitle,
            }) => {
              const category =
                categoryMap.get(task.categoryId)

              const hourLayout =
                hourLayouts[hourIndex]

              if (!hourLayout) return null

              const strong = task.status !== 'todo'
              const color =
                category?.color ?? '#d1d5db'

              /*
              * 시간 줄 안쪽 여백과 투두 사이 간격
              */
              const verticalPadding = captureMode ? 4 : 3
              const laneGap = captureMode ? 3 : 2

              /*
              * 현재 시간 줄 높이를 겹치는 투두 개수만큼 나눔.
              *
              * laneCount가 1이면 한 칸 전체 사용
              * laneCount가 2이면 위·아래 절반씩 사용
              * laneCount가 3이면 늘어난 시간 줄을 3칸으로 사용
              */
              const laneHeight =
                (
                  hourLayout.height -
                  verticalPadding * 2 -
                  laneGap * (laneCount - 1)
                ) / laneCount

              const blockTop =
                verticalPadding +
                laneIndex * (laneHeight + laneGap)

              return (
                <div
                  key={`${taskKey}-${hourIndex}`}
                  className={clsx(
                    'absolute right-0',
                    // 시간 그리드와 정확히 같은 가로 좌표계를 사용해야
                    // 50분처럼 뒤쪽에 시작하는 일정도 왼쪽으로 밀리지 않음.
                    captureMode ? 'left-12' : 'left-7',
                  )}
                  style={{
                    // 동적으로 계산된 시간 줄 위치와 높이 사용
                    top: hourLayout.top,
                    height: hourLayout.height,
                  }}
                >
                  <div
                    className={clsx(
                      'absolute min-w-0 overflow-hidden shadow-sm',
                      captureMode
                        ? 'rounded-[12px] px-1.5 py-1'
                        : 'rounded-md px-1.5 py-0.5 text-xs leading-tight',
                    )}
                    style={{
                      /*
                      * 시간 위치와 길이는 가로축으로 유지함.
                      * 세로축만 겹치는 투두 개수에 따라 나눔.
                      */
                      // 계산 기준은 시간 그리드와 완전히 동일하게 유지하고,
                      // 정확한 시작 위치의 안쪽으로만 작은 여백을 추가함.
                      // 따라서 12:50 일정은 50분 선보다 앞에 나타나지 않음.
                      left: `calc(${leftPercent}% + ${captureMode ? 5 : 4}px)`,
                      width: `max(2px, calc(${widthPercent}% - ${captureMode ? 10 : 8}px))`,

                      top: blockTop,
                      height: laneHeight,

                      border: `1px solid ${color}${strong ? '70' : '55'}`,
                      backgroundColor: `${color}${strong ? '30' : '20'}`,
                      opacity: strong ? 1 : 0.82,
                    }}
                  >
                    {/* 제목은 투두가 처음 나타나는 블록에서만 표시 */}
                    {showTitle &&
                      showTaskLabels &&
                      !hiddenLabelCategoryIdSet.has(task.categoryId) && (
                      <div
                        className={clsx(
                          'block min-w-0 w-full overflow-hidden text-ellipsis whitespace-nowrap font-bold',
                          captureMode
                            ? laneCount >= 3
                              ? 'text-[12px] leading-tight'
                              : 'text-[16px] leading-tight'
                            : 'text-[10px] leading-tight',
                          task.status === 'partial' &&
                            'text-neutral-400',
                        )}
                      >
                        {task.title}
                      </div>
                    )}
                  </div>
                </div>
              )
            },
          )}

          {currentTimeMarker && (() => {
            const markerHourLayout =
              hourLayouts[currentTimeMarker.hourIndex]

            if (!markerHourLayout) return null

            return (
              <div
                className="pointer-events-none absolute right-0 left-7 z-30"
                style={{
                  top: markerHourLayout.top,
                  height: markerHourLayout.height,
                }}
                aria-hidden="true"
              >
                <div className="grid h-full grid-cols-6">
                  {Array.from({ length: 6 }).map((_, cellIndex) => (
                    <div
                      key={cellIndex}
                      className="grid h-full place-items-center"
                    >
                      {cellIndex === currentTimeMarker.cellIndex && (
                        <Heart
                          size={20}
                          strokeWidth={2.5}
                          color={currentTimeColor}
                          fill={currentTimeColor}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </section>
  )
}


export default TimePanel