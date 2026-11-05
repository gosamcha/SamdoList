import { useMemo, type ReactNode, type ComponentPropsWithRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Category, PlannerTask } from '../types'
import type { ThemeColors } from '../plannerTypes'

type TodoPanelProps = {
  categories: Category[]
  tasks: PlannerTask[]
  // CaptureView 등 기존 호출부와의 호환성을 위해 유지함.
  // Todo 정렬에는 더 이상 시간을 사용하지 않음.
  dayStart: string
  theme: ThemeColors
  onCreateTask: (category: Category) => void
  onEditTask: (task: PlannerTask) => void
  onCycleStatus: (task: PlannerTask) => void
  onMoveTask?: (
    taskId: number,
    targetCategoryId: number,
    targetTaskId?: number,
  ) => void | Promise<void>
  todayDate: string
  onMoveToTomorrow: (task: PlannerTask) => void | Promise<void>
  onBringToToday: (task: PlannerTask) => void | Promise<void>
  foldedCategoryIds?: number[]
  onToggleCategoryFold?: (categoryId: number) => void | Promise<void>
  hiddenCategoryIds?: number[]
  compact?: boolean
  onDeleteTask?: (task: PlannerTask) => void
  captureMode?: boolean
}

const todoCollision: CollisionDetection = args => {
  // Category containers also surround their tasks. Prefer the row under the pointer.
  const hits = pointerWithin(args)
  const row = hits.find(hit => hit.data?.droppableContainer.data.current?.type === 'task')
  return row ? [row] : hits.length ? hits : closestCenter(args)
}

function compareTasksByOrder(a: PlannerTask, b: PlannerTask) {
  const aOrder = a.order ?? Number.MAX_SAFE_INTEGER
  const bOrder = b.order ?? Number.MAX_SAFE_INTEGER

  if (aOrder !== bOrder) return aOrder - bOrder

  const createdDiff =
    (a.createdAt ?? Number.MAX_SAFE_INTEGER) -
    (b.createdAt ?? Number.MAX_SAFE_INTEGER)

  if (createdDiff !== 0) return createdDiff

  return (
    (a.id ?? Number.MAX_SAFE_INTEGER) -
    (b.id ?? Number.MAX_SAFE_INTEGER)
  )
}

function TodoPanel({
  categories,
  tasks,
  dayStart,
  theme,
  onCreateTask,
  onEditTask,
  onCycleStatus,
  onMoveTask,
  todayDate,
  onMoveToTomorrow,
  onBringToToday,
  foldedCategoryIds = [],
  onToggleCategoryFold,
  hiddenCategoryIds = [],
  compact = false,
  onDeleteTask,
  captureMode = false,
}: TodoPanelProps) {
  // 기존 CaptureView props와의 호환용. 정렬에는 사용하지 않음.
  void dayStart

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 2000, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 2000, tolerance: 8 } }),
  )

  const foldedCategoryIdSet = useMemo(
    () => new Set(foldedCategoryIds),
    [foldedCategoryIds],
  )

  const hiddenCategoryIdSet = useMemo(
    () => new Set(hiddenCategoryIds),
    [hiddenCategoryIds],
  )

  const grouped = categories
    .map((category) => ({
      category,
      tasks: tasks
        .filter((task) => task.categoryId === category.id)
        .sort(compareTasksByOrder),
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
      (task) =>
        !categories.some(
          (category) => category.id === task.categoryId,
        ),
    )
    .sort(compareTasksByOrder)

  function handleDragEnd(event: DragEndEvent) {
    if (captureMode || !onMoveTask) return

    const { active, over } = event
    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current

    if (
      activeData?.type !== 'task' ||
      typeof activeData.taskId !== 'number'
    ) {
      return
    }

    if (
      overData?.type !== 'task' &&
      overData?.type !== 'category'
    ) {
      return
    }

    if (typeof overData.categoryId !== 'number') return

    const targetTaskId =
      overData.type === 'task' &&
      typeof overData.taskId === 'number'
        ? overData.taskId
        : undefined

    void onMoveTask(
      activeData.taskId,
      overData.categoryId,
      targetTaskId,
    )
  }

  const content = (
    <section
      className={clsx(
        'overflow-hidden border border-neutral-200 bg-white',
        !captureMode && 'planner-todos',
        captureMode ? 'h-full rounded-[30px]' : 'rounded-2xl',
      )}
    >
      <div
        className={clsx(
          captureMode
            ? 'h-full overflow-hidden px-4 py-3.5'
            : compact ? 'max-h-[72vh] overflow-auto p-2 md:p-3' : 'max-h-[72vh] overflow-auto p-3',
        )}
      >
        {!captureMode && categories.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            empty category
          </div>
        )}

        <div className={captureMode ? undefined : "todo-category-flow"}>
        {grouped.map(({ category, tasks: categoryTasks }) => {
          const categoryId = category.id
          const isFolded =
            !captureMode &&
            categoryId !== undefined &&
            foldedCategoryIdSet.has(categoryId)

          const categoryBody = (
            <>
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
                      'desk-heading force-bold-text truncate font-black',
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

              {!isFolded &&
                (categoryTasks.length === 0 ? (
                  !captureMode && !compact && (
                    <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
                      empty
                    </div>
                  )
                ) : (
                  <SortableContext
                    items={categoryTasks.flatMap((task) =>
                      task.id === undefined
                        ? []
                        : [`task:${task.id}`],
                    )}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={captureMode ? "divide-y divide-neutral-200" : undefined}>
                      {categoryTasks.map((task, index) =>
                        task.id === undefined || captureMode || !onMoveTask ? (
                          <TodoItem
                            key={task.id ?? `task-${task.createdAt}`}
                            task={task}
                            theme={theme}
                            onCycleStatus={onCycleStatus}
                            onEditTask={onEditTask}
                            todayDate={todayDate}
                            onMoveToTomorrow={onMoveToTomorrow}
                            onBringToToday={onBringToToday}
                            compact={compact}
                            onDeleteTask={onDeleteTask}
                            captureMode={captureMode}
                          />
                        ) : (
                          <SortableTodoItem
                            key={task.id}
                            onStep={direction => {
                              const target = categoryTasks[index + direction]
                              if (target?.id !== undefined && task.id !== undefined) {
                                void onMoveTask(task.id, task.categoryId, target.id)
                              }
                            }}
                            canMoveUp={index > 0}
                            canMoveDown={index < categoryTasks.length - 1}
                            task={task}
                            theme={theme}
                            onCycleStatus={onCycleStatus}
                            onEditTask={onEditTask}
                            todayDate={todayDate}
                            onMoveToTomorrow={onMoveToTomorrow}
                            onBringToToday={onBringToToday}
                            compact={compact}
                            onDeleteTask={onDeleteTask}
                            captureMode={captureMode}
                          />
                        ),
                      )}
                    </div>
                  </SortableContext>
                ))}
            </>
          )

          return (
            <div
              key={category.id ?? category.syncId ?? category.name}
              className={captureMode ? 'mb-4.5' : 'mb-3'}
            >
              {categoryId === undefined ? (
                categoryBody
              ) : (
                <DroppableCategory
                  categoryId={categoryId}
                  disabled={captureMode || !onMoveTask}
                >
                  {categoryBody}
                </DroppableCategory>
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

            <div className={captureMode ? "divide-y divide-neutral-200" : undefined}>
              {uncategorized.map((task) => (
                <TodoItem
                  key={task.id ?? task.createdAt}
                  task={task}
                  theme={theme}
                  onCycleStatus={onCycleStatus}
                  onEditTask={onEditTask}
                  todayDate={todayDate}
                  onMoveToTomorrow={onMoveToTomorrow}
                  onBringToToday={onBringToToday}
                  compact={compact}
                  onDeleteTask={onDeleteTask}
                  captureMode={captureMode}
                />
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </section>
  )

  if (captureMode || !onMoveTask) {
    return content
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={todoCollision}
      onDragEnd={handleDragEnd}
    >
      {content}
    </DndContext>
  )
}

type DroppableCategoryProps = {
  categoryId: number
  disabled?: boolean
  children: ReactNode
}

function DroppableCategory({
  categoryId,
  disabled = false,
  children,
}: DroppableCategoryProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `category:${categoryId}`,
    disabled,
    data: {
      type: 'category',
      categoryId,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'rounded-xl transition-colors',
        isOver && !disabled && 'bg-neutral-50',
      )}
    >
      {children}
    </div>
  )
}

type TodoItemProps = {
  task: PlannerTask
  theme: ThemeColors
  onCycleStatus: (task: PlannerTask) => void
  onEditTask: (task: PlannerTask) => void
  todayDate: string
  onMoveToTomorrow: (task: PlannerTask) => void | Promise<void>
  onBringToToday: (task: PlannerTask) => void | Promise<void>

  compact?: boolean
  onDeleteTask?: (task: PlannerTask) => void
  captureMode?: boolean
  onStep?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  dragProps?: ComponentPropsWithRef<"button">
}

function SortableTodoItem(props: TodoItemProps) {
  const taskId = props.task.id

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `task:${taskId}`,
    disabled: taskId === undefined || props.captureMode,
    data: {
      type: 'task',
      taskId,
      categoryId: props.task.categoryId,
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        backgroundColor: isDragging ? "#f4f4f4" : undefined,
        boxShadow: isDragging ? "0 3px 12px #302a471f" : undefined,
        position: 'relative',
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <TodoItem {...props} dragProps={{
        ...attributes,
        ...listeners,
        ref: setActivatorNodeRef,
        title: "Hold for 2 seconds, then drag to reorder",
        onContextMenu: event => event.preventDefault(),
      }} />
    </div>
  )
}

function TodoItem({
  task,
  theme,
  onCycleStatus,
  onEditTask,
  todayDate,
  onMoveToTomorrow,
  onBringToToday,
  compact = false,
  onDeleteTask,
  captureMode = false,
  dragProps,
  onStep, canMoveUp, canMoveDown,
}: TodoItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const timeText = task.startTime
    ? task.endTime
      ? `${task.startTime} - ${task.endTime}`
      : task.startTime
    : null

  return (
    <div
      className={clsx(
        'relative flex flex-wrap items-center',
        captureMode ? 'gap-3 py-2.5' : compact ? 'gap-0 py-1' : 'gap-2 py-2',
      )}
    >

      <button
        type="button"
        aria-label={[task.title, task.status, "CHANGE STATUS"].join(" · ")}
        onClick={() => onCycleStatus(task)}
        className={clsx('todo-state', compact && 'is-compact', captureMode && 'is-capture')}
        style={{ color: task.status === 'done' ? theme.statusDone : task.status === 'partial' ? theme.statusPartial : theme.statusTodo }}
      >
        <span className="state-box" data-status={task.status} aria-hidden="true">
          {task.status !== 'todo' && <>
            <b className="state-symbol">{task.status === 'done' ? 'O' : '△'}</b>
            {!captureMode && <b className="state-check">✓</b>}
          </>}
        </span>
      </button>

      <button
        type="button"
        {...dragProps}
        onClick={() => onEditTask(task)}
        className={clsx(
          'todo-title min-w-0 flex-1 rounded-xl text-left hover:bg-neutral-100',
          captureMode ? 'px-2 py-1.5' : compact ? 'py-1' : 'px-2 py-1',
        )}
      >
        <div
          className={clsx(
            compact ? 'break-words font-bold leading-snug' : 'truncate font-bold leading-tight',
            captureMode ? 'text-[20px]' : 'text-sm',
            task.status === 'partial' && 'text-neutral-600',
          )}
        >
          {task.title}
        </div>

        {!compact && timeText && (
          <div
            className={clsx(
              'font-semibold text-neutral-400',
              captureMode
                ? 'mt-1 text-[15px]'
                : 'mt-0.5 text-xs',
            )}
          >
            {timeText}
          </div>
        )}
      </button>

      {!compact && !captureMode && (
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="
              grid
              h-9
              w-9
              place-items-center
              rounded-xl
              text-xl
              font-black
              text-neutral-400
              hover:bg-neutral-100
              hover:text-neutral-700
            "
            aria-label="Todo options"
          >
            ⋯
          </button>
        </div>
      )}
      {!compact && !captureMode && menuOpen && (
        <div className="basis-full flex justify-end">
            <div
              className="
                relative
                z-40
                w-44
                overflow-hidden
                rounded-xl
                border
                border-neutral-200
                bg-white
                py-1
                shadow-lg
              "
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void onMoveToTomorrow(task)
                }}
                className="
                  w-full
                  px-4
                  py-2.5
                  text-left
                  text-sm
                  font-bold
                  hover:bg-neutral-100
                "
              >
                → TOMORROW
              </button>

              {onStep && ([-1, 1] as const).map(direction => (
                <button key={direction} type="button"
                  disabled={direction === -1 ? !canMoveUp : !canMoveDown}
                  className="w-full px-4 py-2.5 text-left text-sm font-bold hover:bg-neutral-100 disabled:opacity-35"
                  onClick={() => { setMenuOpen(false); onStep(direction) }}>
                  {direction === -1 ? 'MOVE UP' : 'MOVE DOWN'}
                </button>
              ))}
              {onDeleteTask && (
                <button type="button" className="action-label w-full px-4 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50" onClick={() => {
                  setMenuOpen(false)
                  onDeleteTask(task)
                }}>DELETE</button>
              )}

              {task.date !== todayDate && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void onBringToToday(task)
                  }}
                  className="
                    w-full
                    px-4
                    py-2.5
                    text-left
                    text-sm
                    font-bold
                    hover:bg-neutral-100
                  "
                >
                  ↓ TODAY
                </button>
              )}
            </div>
        </div>
      )}
    </div>
  )
}

export default TodoPanel
