import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Menu, Pencil, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import clsx from 'clsx'
import { db, seedInitialData } from './db'
import type { Category, DailyRecord, PlannerTask, TaskStatus } from './types'
import {
  addDays,
  formatDateLocal,
  getTaskRange,
  localDateAt,
  minutesToTimeLabel,
  sleepStartDateTime,
  timeToMinutes,
} from './utils/time'

type TaskDraft = {
  editingId?: number
  categoryId: number
  title: string
  startTime: string
  endTime: string
}

type RecordSet = {
  prev?: DailyRecord
  current?: DailyRecord
  next?: DailyRecord
}

const HOUR_HEIGHT = 53

// 앱 전체에서 쓰는 테마 색상 타입
type ThemeColors = {
  primaryBg: string        // Progress bar, 주요 버튼 배경색
  primaryText: string      // 주요 버튼 글자색
  statusTodo: string       // 빈 체크박스 색
  statusDone: string       // O 색
  statusPartial: string    // △ 색
}

// 기본 테마 색상
const DEFAULT_THEME: ThemeColors = {
  primaryBg: '#bdbbf0',
  primaryText: '#ffffff',
  statusTodo: '#a3a3a3',
  statusDone: '#918deb',
  statusPartial: '#525252',
}

// IndexedDB settings 테이블에 저장할 key 이름
const THEME_SETTING_KEYS = {
  primaryBg: 'theme.primaryBg',
  primaryText: 'theme.primaryText',
  statusTodo: 'theme.statusTodo',
  statusDone: 'theme.statusDone',
  statusPartial: 'theme.statusPartial',
} as const

// 00시 ~ 23시
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
)

// 5분 단위
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, '0'),
)

function getCurrentFiveMinuteTime() {
  const now = new Date()
  const totalMinutes = now.getHours() * 60 + now.getMinutes()
  const roundedMinutes = Math.floor(totalMinutes / 5) * 5

  return minutesToTimeLabel(roundedMinutes)
}

// HH:mm에 분을 더함
function addMinutesToTime(time: string, amount: number) {
  const totalMinutes = timeToMinutes(time) + amount
  return minutesToTimeLabel(totalMinutes)
}

const nextStatus: Record<TaskStatus, TaskStatus> = {
  todo: 'done',
  done: 'partial',
  partial: 'todo',
}

function App() {
  const [selectedDate, setSelectedDate] = useState(formatDateLocal())
  const [showTimeTab, setShowTimeTab] = useState(true)
  const [showTodoTab, setShowTodoTab] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft | null>(null)

  useEffect(() => {
    void seedInitialData()
  }, [])

  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []

  const tasks =
    useLiveQuery(
      () => db.tasks.where('date').equals(selectedDate).toArray(),
      [selectedDate],
    ) ?? []

  const dayStart =
    useLiveQuery(async () => {
      const result = await db.settings.get('dayStart')
      return result?.value ?? '08:00'
    }, []) ?? '08:00'

  // 메뉴에서 설정한 테마 색상을 IndexedDB에서 불러옴
  // 저장된 값이 없으면 DEFAULT_THEME 사용
  const theme: ThemeColors =
    useLiveQuery(async () => {
      const [
        primaryBg,
        primaryText,
        statusTodo,
        statusDone,
        statusPartial,
      ] = await Promise.all([
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

  const records: RecordSet =
    useLiveQuery(async () => {
      const prevDate = addDays(selectedDate, -1)
      const nextDate = addDays(selectedDate, 1)

      const [prev, current, next] = await Promise.all([
        db.records.get(prevDate),
        db.records.get(selectedDate),
        db.records.get(nextDate),
      ])

      return { prev, current, next }
    }, [selectedDate]) ?? {}

  const completionRate = useMemo(() => {
    if (tasks.length === 0) return 0

    const score = tasks.reduce((sum, task) => {
      if (task.status === 'done') return sum + 1
      if (task.status === 'partial') return sum + 0.5
      return sum
    }, 0)

    return Math.round((score / tasks.length) * 100)
  }, [tasks])

  const currentRecord = records.current

  // 기상시간 / 취침시간을 날짜별 기록으로 저장
  async function updateDailyRecord(patch: Partial<DailyRecord>) {
    const previous = await db.records.get(selectedDate)
    await db.records.put({
      date: selectedDate,
      ...previous,
      ...patch,
    })
  }

  async function saveTask() {
    if (!draft) return

    const title = draft.title.trim()
    if (!title) return

    const startTime = draft.startTime
    const endTime = draft.endTime

    if (startTime === endTime) {
      alert('시작 시간과 종료 시간이 같을 수 없음.')
      return
    }

    if (draft.editingId) {
      await db.tasks.update(draft.editingId, {
        categoryId: draft.categoryId,
        title,
        startTime,
        endTime,
      })
    } else {
      await db.tasks.add({
        date: selectedDate,
        categoryId: draft.categoryId,
        title,
        startTime,
        endTime,
        status: 'todo',
        createdAt: Date.now(),
      })
    }

    setDraft(null)
  }

  function openNewTask(category: Category) {
    if (!category.id) return

    // 새 투두를 만들 때 시작 시간은 현재 시간 기준
    // 5분 단위로 내림 처리
    const startTime = getCurrentFiveMinuteTime()

    // 종료 시간은 기본적으로 시작 시간 + 30분
    const endTime = addMinutesToTime(startTime, 30)

    setDraft({
      categoryId: category.id,
      title: '',
      startTime,
      endTime,
    })
  }

  function openEditTask(task: PlannerTask) {
    setDraft({
      editingId: task.id,
      categoryId: task.categoryId,
      title: task.title,
      startTime: task.startTime ?? '',
      endTime: task.endTime ?? '',
    })
  }

  async function deleteTask(taskId?: number) {
    if (!taskId) return
    await db.tasks.delete(taskId)
  }

  async function cycleTaskStatus(task: PlannerTask) {
    if (!task.id) return

    await db.tasks.update(task.id, {
      status: nextStatus[task.status],
    })
  }

  const visibleTabCount = Number(showTimeTab) + Number(showTodoTab)

  return (
    <main className="min-h-screen bg-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-lg font-bold"
          />

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-600"
          >
            시작 {dayStart}
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border border-neutral-200 p-2"
            aria-label="메뉴 열기"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold">일정 달성률</span>
              <span className="font-bold">{completionRate}%</span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${completionRate}%`,
                  backgroundColor: theme.primaryBg,
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold">
              기상시간
              <TimeSelect
                value={currentRecord?.wakeTime ?? ''}
                onChange={(value) =>
                  updateDailyRecord({
                    wakeTime: value || undefined,
                  })
                }
              />
            </label>

            <label className="text-sm font-semibold">
              취침시간
              <TimeSelect
                value={currentRecord?.sleepTime ?? ''}
                onChange={(value) =>
                  updateDailyRecord({
                    sleepTime: value || undefined,
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowTimeTab((prev) => !prev)}
            className={clsx(
              'flex-1 rounded-xl border px-3 py-2 text-sm font-bold',
              !showTimeTab && 'border-neutral-200 bg-white text-neutral-500',
            )}
            style={
              showTimeTab
                ? {
                    borderColor: theme.primaryBg,
                    backgroundColor: theme.primaryBg,
                    color: theme.primaryText,
                  }
                : undefined
            }
          >
            TIME TAB {showTimeTab}
          </button>

          <button
            type="button"
            onClick={() => setShowTodoTab((prev) => !prev)}
            className={clsx(
              'flex-1 rounded-xl border px-3 py-2 text-sm font-bold',
              !showTodoTab && 'border-neutral-200 bg-white text-neutral-500',
            )}
            style={
              showTodoTab
                ? {
                    borderColor: theme.primaryBg,
                    backgroundColor: theme.primaryBg,
                    color: theme.primaryText,
                  }
                : undefined
            }
          >
            TODO TAB {showTodoTab}
          </button>
        </div>

        {visibleTabCount === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            켜진 탭이 없음
          </div>
        ) : (
          <div
            className={clsx(
              'mt-3 grid gap-3',
              visibleTabCount === 2 ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {showTimeTab && (
              <TimePanel
                selectedDate={selectedDate}
                dayStart={dayStart}
                categories={categories}
                tasks={tasks}
                records={records}
              />
            )}

            {showTodoTab && (
              <TodoPanel
                categories={categories}
                tasks={tasks}
                theme={theme}
                onCreateTask={openNewTask}
                onEditTask={openEditTask}
                onDeleteTask={deleteTask}
                onCycleStatus={cycleTaskStatus}
              />
            )}
          </div>
        )}
      </section>

      {menuOpen && (
        <MenuDrawer
          dayStart={dayStart}
          categories={categories}
          theme={theme}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {draft && (
        <TaskModal
          draft={draft}
          categories={categories}
          theme={theme}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveTask}
        />
      )}
    </main>
  )
}

type TimePanelProps = {
  selectedDate: string
  dayStart: string
  categories: Category[]
  tasks: PlannerTask[]
  records: RecordSet
}

function TimePanel({
  selectedDate,
  dayStart,
  categories,
  tasks,
  records,
}: TimePanelProps) {
  const categoryMap = useMemo(() => {
      return new Map(categories.map((category) => [category.id, category]))
    }, [categories])

    const timedTasks = tasks.filter((task) => task.startTime && task.endTime)
    const totalHeight = HOUR_HEIGHT * 24
    const dayStartMinutes = timeToMinutes(dayStart)

    const taskBlocks = useMemo(() => {
      return timedTasks.flatMap((task) => {
        if (!task.startTime || !task.endTime) return []

        const range = getTaskRange(task.startTime, task.endTime, dayStart)

        const blocks: Array<{
          task: PlannerTask
          hourIndex: number
          leftPercent: number
          widthPercent: number
          blockIndex: number
        }> = []

        let cursor = range.startOffset
        let blockIndex = 0

        while (cursor < range.endOffset) {
          const hourStart = Math.floor(cursor / 60) * 60
          const hourEnd = hourStart + 60

          // 이번 블록이 끝나는 지점
          const segmentEnd = Math.min(range.endOffset, hourEnd)

          // 현재 블록이 몇 번째 시간 줄에 들어가는지
          const hourIndex = Math.floor(hourStart / 60)

          // 한 시간 안에서 시작 위치를 가로로 계산
          const leftPercent = ((cursor - hourStart) / 60) * 100

          // 한 시간 안에서 차지하는 길이를 가로로 계산
          const widthPercent = ((segmentEnd - cursor) / 60) * 100

          blocks.push({
            task,
            hourIndex,
            leftPercent,
            widthPercent,
            blockIndex,
          })

          cursor = segmentEnd
          blockIndex += 1
        }

        return blocks
      })
    }, [timedTasks, dayStart])

    const sleepBlocks = useMemo(() => {
      const blocks: Array<{
        hourIndex: number
        leftPercent: number
        widthPercent: number
      }> = []

      const prevDate = addDays(selectedDate, -1)
      const nextDate = addDays(selectedDate, 1)

      // 시간 탭 시작 시각
      // 예: 2026-07-08 08:00
      const gridStart = localDateAt(selectedDate, dayStart).getTime()

      // 시간 탭 종료 시각
      // 시작 시각으로부터 24시간 뒤
      const gridEnd = gridStart + 24 * 60 * 60 * 1000

      function addSleepRange(startMs: number, endMs: number) {
        // 화면 범위를 벗어난 부분은 잘라냄
        const start = Math.max(startMs, gridStart)
        const end = Math.min(endMs, gridEnd)

        if (end <= start) return

        // gridStart 기준으로 몇 분 떨어져 있는지 계산
        let cursor = (start - gridStart) / 1000 / 60
        const endOffset = (end - gridStart) / 1000 / 60

        while (cursor < endOffset) {
          // 현재 cursor가 속한 시간 줄의 시작
          // 예: cursor = 150이면 2시간 30분 지점 → hourStart = 120
          const hourStart = Math.floor(cursor / 60) * 60

          // 현재 시간 줄의 끝
          const hourEnd = hourStart + 60

          // 이번 조각의 끝
          const segmentEnd = Math.min(endOffset, hourEnd)

          // 몇 번째 시간 줄인지
          const hourIndex = Math.floor(hourStart / 60)

          // 한 시간 안에서 시작 위치
          // 예: 30분부터면 50%
          const leftPercent = ((cursor - hourStart) / 60) * 100

          // 한 시간 안에서 차지하는 너비
          // 예: 30분짜리면 50%
          const widthPercent = ((segmentEnd - cursor) / 60) * 100

          blocks.push({
            hourIndex,
            leftPercent,
            widthPercent,
          })

          cursor = segmentEnd
        }
      }

      // 오늘 기상시간이 있으면
      // 전날 취침시간이 있을 때: 전날 취침시간 ~ 오늘 기상시간
      // 전날 취침시간이 없을 때: 시간 탭 시작 ~ 오늘 기상시간
      if (records.current?.wakeTime) {
        const wakeTime = localDateAt(selectedDate, records.current.wakeTime).getTime()

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

      // 오늘 취침시간이 있으면
      // 다음날 기상시간이 있을 때: 오늘 취침시간 ~ 다음날 기상시간
      // 다음날 기상시간이 없을 때: 오늘 취침시간 ~ 시간 탭 끝
      if (records.current?.sleepTime) {
        const sleepTime = sleepStartDateTime(
          selectedDate,
          records.current.sleepTime,
          dayStart,
        ).getTime()

        if (records.next?.wakeTime) {
          const wakeTime = localDateAt(nextDate, records.next.wakeTime).getTime()
          addSleepRange(sleepTime, wakeTime)
        } else {
          addSleepRange(sleepTime, gridEnd)
        }
      }

      return blocks
    }, [
      dayStart,
      records.current?.wakeTime,
      records.current?.sleepTime,
      records.next?.wakeTime,
      records.prev?.sleepTime,
      selectedDate,
    ])

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">

      <div className="max-h-[72vh] overflow-auto">
        <div className="relative" style={{ height: totalHeight }}>
          {Array.from({ length: 24 }).map((_, hourIndex) => {
            const label = minutesToTimeLabel(dayStartMinutes + hourIndex * 60)

            return (
              <div
                key={hourIndex}
                className="absolute left-0 right-0 border-t border-neutral-200"
                style={{
                  top: hourIndex * HOUR_HEIGHT,
                  height: HOUR_HEIGHT,
                }}
              >
                <div className="absolute left-0 top-1 w-9 text-right text-xs font-bold text-neutral-400">
                  {label.slice(0, 2)}
                </div>

                <div className="ml-11 grid h-full grid-cols-6">
                  {Array.from({ length: 6 }).map((__, cellIndex) => (
                    <div
                      key={cellIndex}
                      className="border-l border-neutral-200"
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {sleepBlocks.map((block, index) => (
            <div
              key={index}
              className="pointer-events-none absolute left-11 right-0 z-0"
              style={{
                top: block.hourIndex * HOUR_HEIGHT,
                height: HOUR_HEIGHT,
              }}
            >
              <div
                className="absolute bg-neutral-200/25" // 연한회색 100 진회색 300
                style={{
                  left: `${block.leftPercent}%`,
                  width: `${block.widthPercent}%`,
                  top: 0,
                  height: '100%',
                }}
              />
            </div>
          ))}

          {taskBlocks.map(({ task, hourIndex, leftPercent, widthPercent, blockIndex }) => {
            const category = categoryMap.get(task.categoryId)

            // 세로 위치는 "몇 번째 시간 줄인지"로만 결정함
            const top = hourIndex * HOUR_HEIGHT

            const strong = task.status !== 'todo'
            const color = category?.color ?? '#d1d5db'

            return (
              // 한 시간 줄 전체를 감싸는 영역
              // left-12는 왼쪽 시간 숫자 칸을 피하려고 둔 여백
              <div
                key={`${task.id}-${blockIndex}-${hourIndex}`}
                className="absolute left-12 right-2"
                style={{
                  top,
                  height: HOUR_HEIGHT,
                }}
              >
                {/* 
                  실제 일정 블록
                  여기서 left와 width가 가로 시간을 의미
                */}
                <div
                  className="absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-xs font-black leading-tight shadow-sm"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,

                    top: 4,
                    height: HOUR_HEIGHT - 8,

                    borderColor: color,
                    backgroundColor: `${color}${strong ? '80' : '33'}`,
                    opacity: strong ? 1 : 0.72,
                  }}
                >
                  {blockIndex === 0 && (
                    <div
                      className={clsx(
                        task.status === 'partial' && 'text-neutral-400',
                      )}
                    >
                      {task.title}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

type TodoPanelProps = {
  categories: Category[]
  tasks: PlannerTask[]
  theme: ThemeColors
  onCreateTask: (category: Category) => void
  onEditTask: (task: PlannerTask) => void
  onDeleteTask: (taskId?: number) => void
  onCycleStatus: (task: PlannerTask) => void
}

function TodoPanel({
  categories,
  tasks,
  theme,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onCycleStatus,
}: TodoPanelProps) {
  // 모든 카테고리를 기본으로 보여줌
  // 해당 카테고리에 투두가 없어도 화면에 표시됨
  const grouped = categories.map((category) => ({
    category,
    tasks: tasks.filter((task) => task.categoryId === category.id),
  }))

  const uncategorized = tasks.filter(
    (task) => !categories.some((category) => category.id === task.categoryId),
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* 투두리스트 탭 제목 제거 */}
      <div className="max-h-[72vh] overflow-auto p-3">
        {categories.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            카테고리가 없음. 메뉴에서 카테고리를 먼저 추가해야 함.
          </div>
        )}

        {grouped.map(({ category, tasks }) => (
          <div key={category.id} className="mb-5">
            {/* 카테고리 이름을 누르면 해당 카테고리로 새 투두 생성 */}
            <button
              type="button"
              onClick={() => onCreateTask(category)}
              className="mb-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-neutral-100"
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />

              <span className="text-lg font-black">{category.name}</span>

              <span className="ml-auto rounded-full bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-500">
                + 추가
              </span>
            </button>

            {tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
                아직 할 일이 없음
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {tasks.map((task) => (
                  <TodoItem
                    key={task.id}
                    task={task}
                    category={category}
                    theme={theme}
                    onCycleStatus={onCycleStatus}
                    onEditTask={onEditTask}
                    onDeleteTask={onDeleteTask}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {uncategorized.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-lg font-black">삭제된 카테고리</h3>

            <div className="divide-y divide-neutral-200">
              {uncategorized.map((task) => (
                <TodoItem
                  key={task.id}
                  task={task}
                  theme={theme}
                  category={{ name: '삭제된 카테고리', color: '#d1d5db' }}
                  onCycleStatus={onCycleStatus}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

type TodoItemProps = {
  task: PlannerTask
  category: Category
  theme: ThemeColors
  onCycleStatus: (task: PlannerTask) => void
  onEditTask: (task: PlannerTask) => void
  onDeleteTask: (taskId?: number) => void
}

function TodoItem({
  task,
  category,
  theme,
  onCycleStatus,
  onEditTask,
  onDeleteTask,
}: TodoItemProps) {
  const statusText = task.status === 'done' ? 'O' : task.status === 'partial' ? '△' : ''

  // 현재 상태에 따라 체크박스 색상 결정
  const statusColor =
    task.status === 'done'
      ? theme.statusDone
      : task.status === 'partial'
        ? theme.statusPartial
        : theme.statusTodo
  
  return (
    <div className="flex items-center gap-2 py-3">
      <button
        type="button"
        onClick={() => onCycleStatus(task)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 text-sm font-black"
        style={{
          borderColor: statusColor,
          color: statusColor,
        }}
      >
        {statusText}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={clsx(
            'truncate text-base font-black',
            task.status === 'partial' && 'text-neutral-400',
          )}
        >
          {task.title}
        </div>

        {task.startTime && task.endTime && (
          <div className="text-sm font-semibold text-neutral-400">
            {task.startTime} - {task.endTime}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onEditTask(task)}
        className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100"
        aria-label="수정"
      >
        <Pencil size={17} />
      </button>

      <button
        type="button"
        onClick={() => onDeleteTask(task.id)}
        className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100"
        aria-label="삭제"
      >
        <Trash2 size={17} />
      </button>

      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
    </div>
  )
}

type TaskModalProps = {
  draft: TaskDraft
  categories: Category[]
  theme: ThemeColors
  onChange: (draft: TaskDraft) => void
  onClose: () => void
  onSave: () => void
}

function TaskModal({ draft, categories, theme, onChange, onClose, onSave }: TaskModalProps) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black">
            {draft.editingId ? '할 일 수정' : '할 일 추가'}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-neutral-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-bold">
            카테고리
            <select
              value={draft.categoryId}
              onChange={(event) =>
                onChange({
                  ...draft,
                  categoryId: Number(event.target.value),
                })
              }
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold">
            할 일 이름
            <input
              value={draft.title}
              onChange={(event) =>
                onChange({
                  ...draft,
                  title: event.target.value,
                })
              }
              placeholder="예: 보고서 작성 25페이지"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-bold">
              시작 시간
              <TimeSelect
                value={draft.startTime}
                onChange={(value) =>
                  onChange({
                    ...draft,
                    startTime: value,
                  })
                }
              />
            </label>

            <label className="block text-sm font-bold">
              종료 시간
              <TimeSelect
                value={draft.endTime}
                onChange={(value) =>
                  onChange({
                    ...draft,
                    endTime: value,
                  })
                }
              />
            </label>
          </div>

          <p className="text-xs leading-relaxed text-neutral-500">
            할 일 이름만 입력하면 투두리스트에만 생성되고, 시작/종료 시간을 같이 입력하면 시간 탭에도 표시됨.
          </p>

          <button
            type="button"
            onClick={onSave}
            className="w-full rounded-xl px-4 py-3 font-black"
            style={{
              backgroundColor: theme.primaryBg,
              color: theme.primaryText,
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

type MenuDrawerProps = {
  dayStart: string
  categories: Category[]
  theme: ThemeColors
  onClose: () => void
}

function MenuDrawer({ dayStart, categories, theme, onClose }: MenuDrawerProps) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#9ec9ef')

  async function updateDayStart(value: string) {
    await db.settings.put({
      key: 'dayStart',
      value,
    })
  }

  // 테마 색상 저장
  async function updateThemeColor(key: string, value: string) {
    await db.settings.put({
      key,
      value,
    })
  }

  async function addCategory() {
    const name = newCategoryName.trim()
    if (!name) return

    await db.categories.add({
      name,
      color: newCategoryColor,
    })

    setNewCategoryName('')
  }

  async function deleteCategory(categoryId?: number) {
    if (!categoryId) return

    const ok = window.confirm('카테고리를 삭제할까요? 기존 투두는 남아 있지만 삭제된 카테고리로 표시됩니다.')
    if (!ok) return

    await db.categories.delete(categoryId)
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/30">
      <aside className="ml-auto h-full w-[88vw] max-w-md overflow-auto bg-white p-4 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black">메뉴</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-neutral-100"
          >
            <X size={22} />
          </button>
        </div>

        <CollapsibleSection title="시간 표시">
          <label className="block text-sm font-bold">
            하루의 시작
            <TimeSelect
              value={dayStart}
              onChange={updateDayStart}
            />
          </label>

          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            시간 탭은 이 시간을 기준으로 24시간을 보여줌.
          </p>
        </CollapsibleSection>

        <CollapsibleSection title="메인 테마 색상">
          <div className="space-y-3">
            <ColorSetting
              label="버튼 / Progress bar 색"
              value={theme.primaryBg}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.primaryBg, value)
              }
            />

            <ColorSetting
              label="버튼 글자 색"
              value={theme.primaryText}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.primaryText, value)
              }
            />

            <ColorSetting
              label="빈 체크박스 색"
              value={theme.statusTodo}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.statusTodo, value)
              }
            />

            <ColorSetting
              label="O 색"
              value={theme.statusDone}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.statusDone, value)
              }
            />

            <ColorSetting
              label="△ 색"
              value={theme.statusPartial}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.statusPartial, value)
              }
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="카테고리 관리"  defaultOpen>
          <div className="mb-3 grid grid-cols-[1fr_52px] gap-2">
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="새 카테고리 이름"
              className="rounded-xl border border-neutral-200 px-3 py-2"
            />

            <input
              type="color"
              value={newCategoryColor}
              onChange={(event) => setNewCategoryColor(event.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white p-1"
            />
          </div>

          <button
            type="button"
            onClick={addCategory}
            className="mb-4 w-full rounded-xl px-4 py-3 font-black"
            style={{
              backgroundColor: theme.primaryBg,
              color: theme.primaryText,
            }}
          >
            카테고리 추가
          </button>

          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl border border-neutral-200 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />

                  <input
                    value={category.name}
                    onChange={(event) =>
                      category.id &&
                      db.categories.update(category.id, {
                        name: event.target.value,
                      })
                    }
                    className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 font-bold"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="color"
                    value={category.color}
                    onChange={(event) =>
                      category.id &&
                      db.categories.update(category.id, {
                        color: event.target.value,
                      })
                    }
                    className="h-10 w-16 rounded-xl border border-neutral-200 bg-white p-1"
                  />

                  <button
                    type="button"
                    onClick={() => deleteCategory(category.id)}
                    className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-500"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        
      </aside>
    </div>
  )
}

type TimeSelectProps = {
  value: string
  onChange: (value: string) => void
}

function splitTime(value: string) {
  const [hour, minute] = value.split(':')

  return {
    hour: hour ?? '00',
    minute: minute ?? '00',
  }
}

function TimeSelect({ value, onChange }: TimeSelectProps) {
  // 값이 비어 있으면 화면상 기본값은 현재 시간으로 표시
  // 새 투두는 openNewTask에서 이미 값이 들어오므로 보통 비어 있지 않음
  const safeValue = value || getCurrentFiveMinuteTime()
  const { hour, minute } = splitTime(safeValue)

  function updateTime(nextHour: string, nextMinute: string) {
    onChange(`${nextHour}:${nextMinute}`)
  }

  return (
    <div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
      <select
        value={hour}
        onChange={(event) => updateTime(event.target.value, minute)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {HOUR_OPTIONS.map((hourOption) => (
          <option key={hourOption} value={hourOption}>
            {hourOption}
          </option>
        ))}
      </select>

      <span className="text-sm font-bold text-neutral-500">시</span>

      <select
        value={minute}
        onChange={(event) => updateTime(hour, event.target.value)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {MINUTE_OPTIONS.map((minuteOption) => (
          <option key={minuteOption} value={minuteOption}>
            {minuteOption}
          </option>
        ))}
      </select>

      <span className="text-sm font-bold text-neutral-500">분</span>
    </div>
  )
}

type ColorSettingProps = {
  label: string
  value: string
  onChange: (value: string) => void
}

// 메뉴에서 색상을 바꾸는 공통 컴포넌트
function ColorSetting({ label, value, onChange }: ColorSettingProps) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-bold">
      <span>{label}</span>

      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-16 rounded-xl border border-neutral-200 bg-white p-1"
      />
    </label>
  )
}

type CollapsibleSectionProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

// 메뉴 안에서 각 설정 묶음을 접었다 펼치는 공통 컴포넌트
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-3 text-left"
      >
        <span className="text-base font-black">{title}</span>

        <span className="text-xs font-bold text-neutral-500">
          {open ? '접기' : '펼치기'}
        </span>
      </button>

      {open && (
        <div className="border-t border-neutral-200 p-3">
          {children}
        </div>
      )}
    </section>
  )
}

export default App