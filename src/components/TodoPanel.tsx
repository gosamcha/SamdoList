import { useMemo, type ReactNode } from 'react'
import { ChevronDown, GripVertical } from 'lucide-react'
import clsx from 'clsx'
import {
  DndContext,
  PointerSensor,
  closestCenter,
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
  foldedCategoryIds?: number[]
  onToggleCategoryFold?: (categoryId: number) => void | Promise<void>
  hiddenCategoryIds?: number[]
  captureMode?: boolean
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
  foldedCategoryIds = [],
  onToggleCategoryFold,
  hiddenCategoryIds = [],
  captureMode = false,
}: TodoPanelProps) {
  // 기존 CaptureView props와의 호환용. 정렬에는 사용하지 않음.
  void dayStart

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
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

              {!isFolded &&
                (categoryTasks.length === 0 ? (
                  !captureMode && (
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
                    <div className="divide-y divide-neutral-200">
                      {categoryTasks.map((task) =>
                        task.id === undefined ? (
                          <TodoItem
                            key={`task-${task.createdAt}`}
                            task={task}
                            theme={theme}
                            onCycleStatus={onCycleStatus}
                            onEditTask={onEditTask}
                            captureMode={captureMode}
                          />
                        ) : (
                          <SortableTodoItem
                            key={task.id}
                            task={task}
                            theme={theme}
                            onCycleStatus={onCycleStatus}
                            onEditTask={onEditTask}
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

            <div className="divide-y divide-neutral-200">
              {uncategorized.map((task) => (
                <TodoItem
                  key={task.id ?? task.createdAt}
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

  if (captureMode || !onMoveTask) {
    return content
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
  captureMode?: boolean
  dragHandle?: ReactNode
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

  const dragHandle = props.captureMode ? undefined : (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className="grid h-9 w-6 shrink-0 touch-none place-items-center text-neutral-300 hover:text-neutral-500 active:text-neutral-600"
      aria-label="Move todo"
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical size={17} strokeWidth={2.5} />
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        position: 'relative',
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <TodoItem {...props} dragHandle={dragHandle} />
    </div>
  )
}

function TodoItem({
  task,
  theme,
  onCycleStatus,
  onEditTask,
  captureMode = false,
  dragHandle,
}: TodoItemProps) {
  const statusText =
    task.status === 'done'
      ? 'O'
      : task.status === 'partial'
        ? '△'
        : ''

  const statusColor =
    task.status === 'done'
      ? theme.statusDone
      : task.status === 'partial'
        ? theme.statusPartial
        : theme.statusTodo

  const timeText = task.startTime
    ? task.endTime
      ? `${task.startTime} - ${task.endTime}`
      : task.startTime
    : null

  return (
    <div
      className={clsx(
        'flex items-center',
        captureMode ? 'gap-3 py-2.5' : 'gap-2 py-2',
      )}
    >
      {!captureMode && dragHandle}

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

        {timeText && (
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
    </div>
  )
}

export default TodoPanel
