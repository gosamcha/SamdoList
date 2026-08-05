import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import type { Category, PlannerTask } from '../types'
import type { ThemeColors } from '../plannerTypes'
import { getTaskRange } from '../utils/time'

type TodoPanelProps = {
  categories: Category[]
  tasks: PlannerTask[]
  dayStart: string
  theme: ThemeColors
  onCreateTask: (category: Category) => void
  onEditTask: (task: PlannerTask) => void
  onCycleStatus: (task: PlannerTask) => void
  foldedCategoryIds?: number[]
  onToggleCategoryFold?: (categoryId: number) => void | Promise<void>
  hiddenCategoryIds?: number[]
  captureMode?: boolean
}

function TodoPanel({
  categories,
  tasks,
  dayStart,
  theme,
  onCreateTask,
  onEditTask,
  onCycleStatus,
  foldedCategoryIds = [],
  onToggleCategoryFold,
  hiddenCategoryIds = [],
  captureMode = false,
}: TodoPanelProps) {
  const foldedCategoryIdSet = useMemo(
    () => new Set(foldedCategoryIds),
    [foldedCategoryIds],
  )
  const hiddenCategoryIdSet = useMemo(
    () => new Set(hiddenCategoryIds),
    [hiddenCategoryIds],
  )

  function compareTasksByStartTime(a: PlannerTask, b: PlannerTask) {
    const aHasTime = Boolean(a.startTime && a.endTime)
    const bHasTime = Boolean(b.startTime && b.endTime)

    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1

    if (aHasTime && bHasTime) {
      const aStart = getTaskRange(a.startTime!, a.endTime!, dayStart).startOffset
      const bStart = getTaskRange(b.startTime!, b.endTime!, dayStart).startOffset

      if (aStart !== bStart) return aStart - bStart
    }

    const createdDiff =
      (a.createdAt ?? Number.MAX_SAFE_INTEGER) -
      (b.createdAt ?? Number.MAX_SAFE_INTEGER)

    if (createdDiff !== 0) return createdDiff
    return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
  }

  const grouped = categories
    .map((category) => ({
      category,
      tasks: tasks
        .filter((task) => task.categoryId === category.id)
        .sort(compareTasksByStartTime),
    }))
    .filter(({ category, tasks: categoryTasks }) => {
      if (!captureMode) return true

      return (
        categoryTasks.length > 0 &&
        !hiddenCategoryIdSet.has(category.id ?? -1)
      )
    })

  const uncategorized = tasks
    .filter(
      (task) => !categories.some((category) => category.id === task.categoryId),
    )
    .sort(compareTasksByStartTime)

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
            ? 'h-full overflow-hidden px-4 py-3.5'
            : 'max-h-[72vh] overflow-auto p-3',
        )}
      >
        {!captureMode && categories.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            empty category
          </div>
        )}

        {grouped.map(({ category, tasks: categoryTasks }) => {
          const categoryId = category.id
          const isFolded =
            !captureMode &&
            categoryId !== undefined &&
            foldedCategoryIdSet.has(categoryId)

          return (
            <div
              key={category.id}
              className={captureMode ? 'mb-4.5' : 'mb-3'}
            >
              <div
                className={clsx(
                  'flex items-center',
                  captureMode ? 'mb-2' : 'mb-1',
                )}
              >
                <button
                  type="button"
                  onClick={() => onCreateTask(category)}
                  className={clsx(
                    'flex min-w-0 flex-1 items-center rounded-xl text-left hover:bg-neutral-100',
                    captureMode
                      ? 'gap-2 px-2 py-1.5'
                      : 'gap-2 px-2 py-2',
                  )}
                >
                  <span
                    className={clsx(
                      'shrink-0 rounded-full',
                      captureMode ? 'h-[13px] w-[13px]' : 'h-3 w-3',
                    )}
                    style={{ backgroundColor: category.color }}
                  />

                  <span
                    className={clsx(
                      'force-bold-text truncate font-black',
                      captureMode ? 'text-[25px]' : 'text-base',
                    )}
                  >
                    {category.name}
                  </span>
                </button>

                {!captureMode && categoryId !== undefined && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void onToggleCategoryFold?.(categoryId)
                    }}
                    className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    aria-label={`${isFolded ? 'Unfold' : 'Fold'} ${category.name}`}
                  >
                    <ChevronDown
                      size={19}
                      strokeWidth={2.6}
                      className={clsx(
                        'transition-transform',
                        isFolded && '-rotate-90',
                      )}
                    />
                  </button>
                )}
              </div>

              {!isFolded && (
                categoryTasks.length === 0 ? (
                  !captureMode && (
                    <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
                      empty
                    </div>
                  )
                ) : (
                  <div className="divide-y divide-neutral-200">
                    {categoryTasks.map((task) => (
                      <TodoItem
                        key={task.id}
                        task={task}
                        theme={theme}
                        onCycleStatus={onCycleStatus}
                        onEditTask={onEditTask}
                        captureMode={captureMode}
                      />
                    ))}
                  </div>
                )
              )}
            </div>
          )
        })}

        {uncategorized.length > 0 && (
          <div className="mb-5">
            <h3
              className={clsx(
                'mb-2 font-black',
                captureMode ? 'text-2xl' : 'text-lg',
              )}
            >
              Deleted Category
            </h3>

            <div className="divide-y divide-neutral-200">
              {uncategorized.map((task) => (
                <TodoItem
                  key={task.id}
                  task={task}
                  theme={theme}
                  onCycleStatus={onCycleStatus}
                  onEditTask={onEditTask}
                  captureMode={captureMode}
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
  captureMode?: boolean
}

function TodoItem({
  task,
  theme,
  onCycleStatus,
  onEditTask,
  captureMode = false,
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
    <div
      className={clsx(
        'flex items-center',
        captureMode ? 'gap-3 py-2.5' : 'gap-2 py-2',
      )}
    >
      {/* 체크박스만 상태 변경 담당 */}
      <button
        type="button"
        onClick={() => onCycleStatus(task)}
        className={clsx(
          'grid shrink-0 place-items-center font-extrabold',
          captureMode
            ? 'h-[46px] w-[46px] rounded-[15px] border-[3px] text-[19px]'
            : 'h-9 w-9 rounded-xl border-2 text-sm',
        )}
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
        className={clsx(
          'min-w-0 flex-1 rounded-xl text-left hover:bg-neutral-100',
          captureMode ? 'px-2 py-1.5' : 'px-2 py-1',
        )}
      >
        <div
          className={clsx(
            'truncate font-bold leading-tight',
            captureMode ? 'text-[20px]' : 'text-sm',
            task.status === 'partial' && 'text-neutral-600',
          )}
        >
          {task.title}
        </div>

        {hasTime && (
          <div
            className={clsx(
              'font-semibold text-neutral-400',
              captureMode
                ? 'mt-1 text-[15px]'
                : 'mt-0.5 text-xs',
            )}
          >
            {task.startTime} - {task.endTime}
          </div>
        )}
      </button>
    </div>
  )
}


export default TodoPanel