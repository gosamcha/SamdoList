import { useEffect, useMemo, useState } from 'react'
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

const HOUR_HEIGHT = 58

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

  async function updateDailyRecord(patch: Partial<DailyRecord>) {
    const previous = await db.records.get(selectedDate)

    await db.records.put({
      date: selectedDate,
      ...previous,
      ...patch,
    })
  }

  function openNewTask(category: Category) {
    if (!category.id) return

    setDraft({
      categoryId: category.id,
      title: '',
      startTime: '',
      endTime: '',
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

  async function saveTask() {
    if (!draft) return

    const title = draft.title.trim()
    if (!title) return

    const startTime = draft.startTime || undefined
    const endTime = draft.endTime || undefined

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
                className="h-full rounded-full bg-neutral-900 transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold">
              기상시간
              <input
                type="time"
                step={600}
                value={currentRecord?.wakeTime ?? ''}
                onChange={(event) => updateDailyRecord({ wakeTime: event.target.value })}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              />
            </label>

            <label className="text-sm font-semibold">
              취침시간
              <input
                type="time"
                step={600}
                value={currentRecord?.sleepTime ?? ''}
                onChange={(event) => updateDailyRecord({ sleepTime: event.target.value })}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
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
              showTimeTab
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-500',
            )}
          >
            시간 탭 {showTimeTab ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => setShowTodoTab((prev) => !prev)}
            className={clsx(
              'flex-1 rounded-xl border px-3 py-2 text-sm font-bold',
              showTodoTab
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-500',
            )}
          >
            투두리스트 탭 {showTodoTab ? 'ON' : 'OFF'}
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
                onCreateTask={openNewTask}
              />
            )}

            {showTodoTab && (
              <TodoPanel
                categories={categories}
                tasks={tasks}
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
          onClose={() => setMenuOpen(false)}
        />
      )}

      {draft && (
        <TaskModal
          draft={draft}
          categories={categories}
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
  onCreateTask: (category: Category) => void
}

function TimePanel({
  selectedDate,
  dayStart,
  categories,
  tasks,
  records,
  onCreateTask,
}: TimePanelProps) {
  const categoryMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]))
  }, [categories])

  const timedTasks = tasks.filter((task) => task.startTime && task.endTime)
  const totalHeight = HOUR_HEIGHT * 24
  const dayStartMinutes = timeToMinutes(dayStart)

  const sleepBlocks = useMemo(() => {
    const blocks: Array<{ top: number; height: number }> = []
    const prevDate = addDays(selectedDate, -1)
    const nextDate = addDays(selectedDate, 1)

    const gridStart = localDateAt(selectedDate, dayStart).getTime()
    const gridEnd = gridStart + 24 * 60 * 60 * 1000

    function addBlock(startMs: number, endMs: number) {
      const start = Math.max(startMs, gridStart)
      const end = Math.min(endMs, gridEnd)

      if (end <= start) return

      const top = ((start - gridStart) / 1000 / 60 / 60) * HOUR_HEIGHT
      const height = ((end - start) / 1000 / 60 / 60) * HOUR_HEIGHT

      blocks.push({ top, height })
    }

    if (records.prev?.sleepTime && records.current?.wakeTime) {
      const start = sleepStartDateTime(prevDate, records.prev.sleepTime, dayStart).getTime()
      const end = localDateAt(selectedDate, records.current.wakeTime).getTime()

      addBlock(start, end)
    }

    if (records.current?.sleepTime && records.next?.wakeTime) {
      const start = sleepStartDateTime(selectedDate, records.current.sleepTime, dayStart).getTime()
      const end = localDateAt(nextDate, records.next.wakeTime).getTime()

      addBlock(start, end)
    } else if (records.current?.sleepTime) {
      const start = sleepStartDateTime(selectedDate, records.current.sleepTime, dayStart).getTime()

      addBlock(start, gridEnd)
    }

    return blocks
  }, [dayStart, records.current, records.next, records.prev, selectedDate])

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black">시간 탭</h2>
          <span className="text-xs text-neutral-500">10분 단위</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCreateTask(category)}
              className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs font-bold"
              style={{ backgroundColor: `${category.color}33` }}
            >
              {category.name} 추가
            </button>
          ))}
        </div>
      </div>

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
              className="absolute left-12 right-2 rounded-lg bg-neutral-300/70"
              style={{
                top: block.top,
                height: Math.max(block.height, 14),
              }}
            />
          ))}

          {timedTasks.map((task) => {
            const category = categoryMap.get(task.categoryId)
            const range = getTaskRange(task.startTime!, task.endTime!, dayStart)
            const top = (range.startOffset / 60) * HOUR_HEIGHT
            const height = Math.max((range.duration / 60) * HOUR_HEIGHT, 22)
            const strong = task.status !== 'todo'
            const color = category?.color ?? '#d1d5db'

            return (
              <div
                key={task.id}
                className="absolute left-12 right-2 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-xs font-black leading-tight shadow-sm"
                style={{
                  top,
                  height,
                  borderColor: color,
                  backgroundColor: `${color}${strong ? '80' : '33'}`,
                  opacity: strong ? 1 : 0.72,
                }}
              >
                <div className={clsx(task.status === 'done' && 'line-through')}>
                  {task.title}
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
  onCreateTask: (category: Category) => void
  onEditTask: (task: PlannerTask) => void
  onDeleteTask: (taskId?: number) => void
  onCycleStatus: (task: PlannerTask) => void
}

function TodoPanel({
  categories,
  tasks,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onCycleStatus,
}: TodoPanelProps) {
  const grouped = categories
    .map((category) => ({
      category,
      tasks: tasks.filter((task) => task.categoryId === category.id),
    }))
    .filter((group) => group.tasks.length > 0)

  const uncategorized = tasks.filter(
    (task) => !categories.some((category) => category.id === task.categoryId),
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black">투두리스트 탭</h2>
          <span className="text-xs text-neutral-500">{tasks.length}개</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCreateTask(category)}
              className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs font-bold"
              style={{ backgroundColor: `${category.color}33` }}
            >
              {category.name} 추가
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto p-3">
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            아직 등록된 할 일이 없음
          </div>
        )}

        {grouped.map(({ category, tasks }) => (
          <div key={category.id} className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <h3 className="text-lg font-black">{category.name}</h3>
            </div>

            <div className="divide-y divide-neutral-200">
              {tasks.map((task) => (
                <TodoItem
                  key={task.id}
                  task={task}
                  category={category}
                  onCycleStatus={onCycleStatus}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                />
              ))}
            </div>
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
  onCycleStatus: (task: PlannerTask) => void
  onEditTask: (task: PlannerTask) => void
  onDeleteTask: (taskId?: number) => void
}

function TodoItem({
  task,
  category,
  onCycleStatus,
  onEditTask,
  onDeleteTask,
}: TodoItemProps) {
  const statusText = task.status === 'done' ? 'O' : task.status === 'partial' ? '△' : ''

  return (
    <div className="flex items-center gap-2 py-3">
      <button
        type="button"
        onClick={() => onCycleStatus(task)}
        className={clsx(
          'grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 text-sm font-black',
          task.status === 'todo' && 'border-neutral-200 text-neutral-400',
          task.status === 'done' && 'border-green-500 text-green-600',
          task.status === 'partial' && 'border-orange-400 text-orange-500',
        )}
      >
        {statusText}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={clsx(
            'truncate text-base font-black',
            task.status === 'done' && 'text-neutral-400 line-through',
            task.status === 'partial' && 'text-neutral-600',
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
  onChange: (draft: TaskDraft) => void
  onClose: () => void
  onSave: () => void
}

function TaskModal({ draft, categories, onChange, onClose, onSave }: TaskModalProps) {
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
              <input
                type="time"
                step={600}
                value={draft.startTime}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    startTime: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              />
            </label>

            <label className="block text-sm font-bold">
              종료 시간
              <input
                type="time"
                step={600}
                value={draft.endTime}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    endTime: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
              />
            </label>
          </div>

          <p className="text-xs leading-relaxed text-neutral-500">
            할 일 이름만 입력하면 투두리스트에만 생성되고, 시작/종료 시간을 같이 입력하면 시간 탭에도 표시됨.
          </p>

          <button
            type="button"
            onClick={onSave}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 font-black text-white"
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
  onClose: () => void
}

function MenuDrawer({ dayStart, categories, onClose }: MenuDrawerProps) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#9ec9ef')

  async function updateDayStart(value: string) {
    await db.settings.put({
      key: 'dayStart',
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

    const ok = window.confirm('이 카테고리를 삭제할까? 기존 투두는 남아 있지만 삭제된 카테고리로 표시됨.')
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

        <section className="mb-6">
          <h3 className="mb-2 text-base font-black">시간 표시</h3>

          <label className="block text-sm font-bold">
            하루의 시작
            <input
              type="time"
              step={600}
              value={dayStart}
              onChange={(event) => updateDayStart(event.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2"
            />
          </label>

          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            기본값은 08:00. 시간 탭은 이 시간을 기준으로 24시간을 보여줌.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-black">카테고리 관리</h3>

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
            className="mb-4 w-full rounded-xl bg-neutral-900 px-4 py-3 font-black text-white"
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
        </section>
      </aside>
    </div>
  )
}

export default App