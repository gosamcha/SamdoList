import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
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
  hideTime: boolean // 시간 탭에 표시하지 않을지
  memo: string
}

type RecordSet = {
  prev?: DailyRecord
  current?: DailyRecord
  next?: DailyRecord
}

const HOUR_HEIGHT = 42

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

// 상단 카드 왼쪽에 표시할 이미지 저장 key
const PROFILE_IMAGE_KEY = 'profile.image'

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
  const dateInputRef = useRef<HTMLInputElement>(null)

// yyyy-mm-dd 형태를 07/09 형태로 바꿈
const displayDate = useMemo(() => {
  return selectedDate.slice(5).replace('-', '/')
}, [selectedDate])

function moveDate(amount: number) {
  setSelectedDate((prevDate) => addDays(prevDate, amount))
}

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

  // IndexedDB settings에서 상단 프로필 이미지를 불러옴
  const profileImage =
    useLiveQuery(async () => {
      const result = await db.settings.get(PROFILE_IMAGE_KEY)
      return result?.value ?? ''
    }, []) ?? ''

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

  async function saveProfileImage(file?: File) {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있음.')
      return
    }

    const reader = new FileReader()

    reader.onload = async () => {
      await db.settings.put({
        key: PROFILE_IMAGE_KEY,
        value: String(reader.result),
      })
    }

    // 이미지를 base64 문자열로 바꿔서 IndexedDB에 저장
    reader.readAsDataURL(file)
  }

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

    const startTime = draft.hideTime ? undefined : draft.startTime
    const endTime = draft.hideTime ? undefined : draft.endTime

    if (!draft.hideTime && startTime === endTime) {
      alert('시작 시간과 종료 시간이 같을 수 없음.')
      return
    }

    const memo = draft.memo.trim().slice(0, 300)

    if (draft.editingId) {
      await db.tasks.update(draft.editingId, {
        categoryId: draft.categoryId,
        title,
        startTime,
        endTime,
        memo,
      })
    } else {
      await db.tasks.add({
        date: selectedDate,
        categoryId: draft.categoryId,
        title,
        startTime,
        endTime,
        memo,
        status: 'todo',
        createdAt: Date.now(),
      })
    }

    setDraft(null)
  }

  async function deleteDraftTask() {
    if (!draft?.editingId) {
      setDraft(null)
      return
    }

    const ok = window.confirm('해당 할 일은 영구적으로 삭제됩니다.')
    if (!ok) return

    await db.tasks.delete(draft.editingId)
    setDraft(null)
  }

  function openNewTask(category: Category) {
    if (!category.id) return

    const startTime = getCurrentFiveMinuteTime()
    const endTime = addMinutesToTime(startTime, 30)

    setDraft({
      categoryId: category.id,
      title: '',
      startTime,
      endTime,
      hideTime: false,
      memo: '',
    })
  }

  function openEditTask(task: PlannerTask) {
    setDraft({
      editingId: task.id,
      categoryId: task.categoryId,
      title: task.title,
      startTime: task.startTime ?? getCurrentFiveMinuteTime(),
      endTime: task.endTime ?? addMinutesToTime(getCurrentFiveMinuteTime(), 30),
      hideTime: !(task.startTime && task.endTime),
      memo: task.memo ?? '',
    })
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
          <div className="flex min-w-0 flex-1 items-center gap-1 pl-6">
            {/* 전날 이동 */}
            <button
              type="button"
              onClick={() => moveDate(-1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
              aria-label="전날"
            >
              <ChevronLeft size={24} strokeWidth={3} />
            </button>

            {/* 날짜 표시 + 실제 date input */}
            <div className="relative">
              <button
                type="button"
                className="bg-transparent p-0"
                style={{
                  color: theme.primaryBg,
                  fontSize: '40px',
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
              >
                {displayDate}
              </button>

              {/* 
                iOS에서는 숨긴 input을 JS로 여는 게 잘 안 될 수 있어서,
                투명한 date input을 날짜 글자 위에 덮어둠.
                날짜 글자를 누르면 실제 input을 누르는 구조임.
              */}
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="날짜 선택"
              />
            </div>

            {/* 다음날 이동 */}
            <button
              type="button"
              onClick={() => moveDate(1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
              aria-label="다음날"
            >
              <ChevronRight size={24} strokeWidth={3} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-600"
          >
            DayStart {dayStart}
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
        <div className="rounded-3xl border border-neutral-200 bg-white p-3">
          <div className="flex gap-3">
            {/* 왼쪽 이미지 영역 */}
            <div className="shrink-0">
              <label className="grid h-24 w-24 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-white bg-white text-center text-xs font-bold text-neutral-400">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt="사용자 이미지"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>
                    사진
                    <br />
                    추가
                  </span>
                )}

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    void saveProfileImage(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>

            {/* 오른쪽 정보 영역 */}
            <div className="min-w-0 flex-1">
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-black">Progress Bar</span>
                  <span className="text-lg font-black">{completionRate}%</span>
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
                <label className="text-sm font-black">
                  Wake-Up
                  <TimeSelect
                    value={currentRecord?.wakeTime ?? ''}
                    onChange={(value) =>
                      updateDailyRecord({
                        wakeTime: value,
                      })
                    }
                  />
                </label>

                <label className="text-sm font-black">
                  Sleep
                  <TimeSelect
                    value={currentRecord?.sleepTime ?? ''}
                    onChange={(value) =>
                      updateDailyRecord({
                        sleepTime: value,
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowTimeTab((prev) => !prev)}
            className={clsx(
              'flex-1 rounded-2xl border px-3 py-3 tracking-[0.06em]',
              !showTimeTab && 'border-neutral-200 bg-white text-neutral-500',
            )}
            style={{
              borderColor: showTimeTab ? theme.primaryBg : undefined,
              backgroundColor: showTimeTab ? theme.primaryBg : undefined,
              color: showTimeTab ? theme.primaryText : undefined,

              // 폰트 강제 적용
              fontSize: '15px',
              fontWeight: 900,
            }}
          >
            TIME TAB
          </button>

          <button
            type="button"
            onClick={() => setShowTodoTab((prev) => !prev)}
            className={clsx(
              'flex-1 rounded-2xl border px-3 py-3 tracking-[0.06em]',
              !showTodoTab && 'border-neutral-200 bg-white text-neutral-500',
            )}
            style={{
              borderColor: showTodoTab ? theme.primaryBg : undefined,
              backgroundColor: showTodoTab ? theme.primaryBg : undefined,
              color: showTodoTab ? theme.primaryText : undefined,

              // 폰트 강제 적용
              fontSize: '15px',
              fontWeight: 900,
            }}
          >
            TODO TAB
          </button>
        </div>

        {visibleTabCount === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            No tabs turned on
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
          theme={theme}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveTask}
          onDelete={deleteDraftTask}
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
                <div className="absolute left-0 top-1 w-6 text-right text-sm font-black text-neutral-400">
                  {label.slice(0, 2)}
                </div>

                <div className="ml-7 grid h-full grid-cols-6">
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
              className="pointer-events-none absolute left-7 right-0 z-0"
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
                className="absolute left-8 right-2"
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
  onCycleStatus: (task: PlannerTask) => void
}

function TodoPanel({
  categories,
  tasks,
  theme,
  onCreateTask,
  onEditTask,
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
            empty category
          </div>
        )}

        {grouped.map(({ category, tasks }) => (
          <div key={category.id} className="mb-3">
            {/* 카테고리 이름을 누르면 해당 카테고리로 새 투두 생성 */}
            <button
              type="button"
              onClick={() => onCreateTask(category)}
              className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-neutral-100"
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />

              <span className="text-base font-black">{category.name}</span>

            </button>

            {tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
                empty
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {tasks.map((task) => (
                  <TodoItem
                    key={task.id}
                    task={task}
                    theme={theme}
                    onCycleStatus={onCycleStatus}
                    onEditTask={onEditTask}
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
                  onCycleStatus={onCycleStatus}
                  onEditTask={onEditTask}
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
  theme: ThemeColors
  onCycleStatus: (task: PlannerTask) => void
  onEditTask: (task: PlannerTask) => void
}

function TodoItem({
  task,
  theme,
  onCycleStatus,
  onEditTask,
}: TodoItemProps) {
  const statusText = task.status === 'done' ? 'O' : task.status === 'partial' ? '△' : ''

  const statusColor =
    task.status === 'done'
      ? theme.statusDone
      : task.status === 'partial'
        ? theme.statusPartial
        : theme.statusTodo

  const hasTime = Boolean(task.startTime && task.endTime)

  return (
    <div className="flex items-center gap-2 py-2">
      {/* 체크박스만 상태 변경 담당 */}
      <button
        type="button"
        onClick={() => onCycleStatus(task)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 text-sm font-black"
        style={{
          borderColor: statusColor,
          color: statusColor,
        }}
      >
        {statusText}
      </button>

      {/* 체크박스를 제외한 투두 영역을 누르면 수정 팝업 */}
      <button
        type="button"
        onClick={() => onEditTask(task)}
        className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left hover:bg-neutral-100"
      >
        <div
          className={clsx(
            'truncate text-sm font-bold leading-tight',
            task.status === 'partial' && 'text-neutral-600',
          )}
        >
          {task.title}
        </div>

        {hasTime && (
          <div className="mt-0.5 text-xs font-semibold text-neutral-400">
            {task.startTime} - {task.endTime}
          </div>
        )}
      </button>
    </div>
  )
}

type TaskModalProps = {
  draft: TaskDraft
  theme: ThemeColors
  onChange: (draft: TaskDraft) => void
  onClose: () => void
  onSave: () => void
  onDelete: () => void
}

function TaskModal({
  draft,
  theme,
  onChange,
  onClose,
  onSave,
  onDelete,
}: TaskModalProps) {
  const memoLength = draft.memo.length

  return (
    // 검은 여백을 누르면 취소
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black">
            {draft.editingId ? 'Edit TO-DO' : 'Add TO-DO'}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-neutral-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-bold">
            What TO-DO
            <input
              value={draft.title}
              onChange={(event) =>
                onChange({
                  ...draft,
                  title: event.target.value,
                })
              }
              placeholder="e.g. Report Writing "
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
            />
          </label>

          <div
            className={draft.hideTime ? 'opacity-45' : ''}
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-bold">
                START
                <TimeSelect
                  value={draft.startTime}
                  disabled={draft.hideTime}
                  onChange={(value) =>
                    onChange({
                      ...draft,
                      startTime: value,
                    })
                  }
                />
              </label>

              <label className="block text-sm font-bold">
                END
                <TimeSelect
                  value={draft.endTime}
                  disabled={draft.hideTime}
                  onChange={(value) =>
                    onChange({
                      ...draft,
                      endTime: value,
                    })
                  }
                />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-neutral-600">
            <input
              type="checkbox"
              checked={draft.hideTime}
              onChange={(event) =>
                onChange({
                  ...draft,
                  hideTime: event.target.checked,
                })
              }
              className="h-4 w-4"
            />
            No Time
          </label>

          <label className="block text-sm font-bold">
            MEMO
            <textarea
              value={draft.memo}
              maxLength={300}
              onChange={(event) =>
                onChange({
                  ...draft,
                  memo: event.target.value.slice(0, 300),
                })
              }
              placeholder="Simple Things Only"
              className="mt-1 h-28 w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 leading-relaxed"
            />
            <div className="mt-1 text-right text-xs font-bold text-neutral-400">
              {memoLength}/300
            </div>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border border-red-200 px-4 py-3 font-black text-red-500"
            >
              {draft.editingId ? 'DELETE' : 'CANCEL'}
            </button>

            <button
              type="button"
              onClick={onSave}
              className="rounded-xl px-4 py-3 font-black"
              style={{
                backgroundColor: theme.primaryBg,
                color: theme.primaryText,
              }}
            >
              SAVE
            </button>
          </div>
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

        <CollapsibleSection title="Time Display">
          <label className="block text-sm font-bold">
            DayStart
            <TimeSelect
              value={dayStart}
              onChange={updateDayStart}
            />
          </label>
        </CollapsibleSection>

        <CollapsibleSection title="Main Theme Color">
          <div className="space-y-3">
            <ColorSetting
              label="Button Background"
              value={theme.primaryBg}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.primaryBg, value)
              }
            />

            <ColorSetting
              label="Button Text"
              value={theme.primaryText}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.primaryText, value)
              }
            />

            <ColorSetting
              label="Check Box"
              value={theme.statusTodo}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.statusTodo, value)
              }
            />

            <ColorSetting
              label="Check O"
              value={theme.statusDone}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.statusDone, value)
              }
            />

            <ColorSetting
              label="Check △"
              value={theme.statusPartial}
              onChange={(value) =>
                updateThemeColor(THEME_SETTING_KEYS.statusPartial, value)
              }
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Setting Category">
          <div className="mb-3 grid grid-cols-[1fr_52px] gap-2">
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="New Category"
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
            Add Category
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
                    DELETE
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
  disabled?: boolean
}

function splitTime(value: string) {
  const [hour, minute] = value.split(':')

  return {
    hour: hour ?? '00',
    minute: minute ?? '00',
  }
}

function TimeSelect({ value, onChange, disabled = false }: TimeSelectProps) {
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
        disabled={disabled}
        onChange={(event) => updateTime(event.target.value, minute)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {HOUR_OPTIONS.map((hourOption) => (
          <option key={hourOption} value={hourOption}>
            {hourOption}
          </option>
        ))}
      </select>

      <span className="text-sm font-bold text-neutral-500">:</span>

      <select
        value={minute}
        disabled={disabled}
        onChange={(event) => updateTime(hour, event.target.value)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {MINUTE_OPTIONS.map((minuteOption) => (
          <option key={minuteOption} value={minuteOption}>
            {minuteOption}
          </option>
        ))}
      </select>

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
          {open ? 'FOLD' : 'UNFOLD'}
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