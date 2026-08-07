import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, ImageDown, Menu } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import clsx from 'clsx'
import { db, seedInitialData } from '../db'
import type {
  Category,
  DailyRecord,
  DayTemplate,
  PlannerTask,
  TaskStatus,
} from '../types'
import {
  addDays,
  minutesToTimeLabel,
  timeToMinutes,
} from '../utils/time'
import type { TaskDraft } from '../components/TaskModal'
import type { RecordSet, ThemeColors } from '../plannerTypes'
import {
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
  CAPTURE_TIME_LABELS_KEY,
  CATEGORY_ORDER_KEY,
  DEFAULT_THEME,
  PROFILE_IMAGE_KEY,
  THEME_SETTING_KEYS,
  TODO_FOLDED_CATEGORY_IDS_KEY,
} from '../plannerTypes'
import CaptureView, {
  createPlannerImageBlob,
} from '../components/CaptureView'
import MenuDrawer from '../components/MenuDrawer'
import TaskModal from '../components/TaskModal'
import TimePanel from '../components/TimePanel'
import TimeSelect from '../components/TimeSelect'
import TodoPanel from '../components/TodoPanel'

function parseStoredNumberArray(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '[]')

    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => typeof item === 'number')
      : []
  } catch {
    return []
  }
}

function getCurrentFiveMinuteTime() {
  const now = new Date()
  const totalMinutes = now.getHours() * 60 + now.getMinutes()
  const roundedMinutes = Math.floor(totalMinutes / 5) * 5

  return minutesToTimeLabel(roundedMinutes)
}

function addMinutesToTime(time: string, amount: number) {
  const totalMinutes = timeToMinutes(time) + amount
  return minutesToTimeLabel(totalMinutes)
}

const nextStatus: Record<TaskStatus, TaskStatus> = {
  todo: 'done',
  done: 'partial',
  partial: 'todo',
}

type DailyPlannerPageProps = {
  selectedDate: string
  onSelectedDateChange: (date: string) => void
  onOpenWeekly: () => void
}

function DailyPlannerPage({
  selectedDate,
  onSelectedDateChange,
  onOpenWeekly,
}: DailyPlannerPageProps) {
  const [showTimeTab, setShowTimeTab] = useState(true)
  const [showTodoTab, setShowTodoTab] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [dailyMemo, setDailyMemo] = useState('')

  const dateInputRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const [captureSaving, setCaptureSaving] = useState(false)
  

// yyyy-mm-dd 형태를 07/09 형태로 바꿈
const displayDate = useMemo(() => {
  return selectedDate.slice(5).replace('-', '/')
}, [selectedDate])

const dayTemplates =
  useLiveQuery(
    () => db.dayTemplates.orderBy('updatedAt').reverse().toArray(),
    [],
  ) ?? []

function moveDate(amount: number) {
  onSelectedDateChange(addDays(selectedDate, amount))
}

  useEffect(() => {
    void seedInitialData()
  }, [])

  const categories =
    useLiveQuery(async () => {
      const [storedCategories, orderSetting] = await Promise.all([
        db.categories.toArray(),
        db.settings.get(CATEGORY_ORDER_KEY),
      ])

      let storedOrder: number[] = []

      try {
        const parsed = JSON.parse(orderSetting?.value ?? '[]')
        storedOrder = Array.isArray(parsed)
          ? parsed.filter((value): value is number => typeof value === 'number')
          : []
      } catch {
        storedOrder = []
      }

      const orderMap = new Map(
        storedOrder.map((categoryId, index) => [categoryId, index]),
      )

      return [...storedCategories].sort((a, b) => {
        const aOrder = a.id === undefined
          ? Number.MAX_SAFE_INTEGER
          : orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const bOrder = b.id === undefined
          ? Number.MAX_SAFE_INTEGER
          : orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER

        if (aOrder !== bOrder) return aOrder - bOrder
        return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
      })
    }, []) ?? []

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

  const foldedCategoryIds =
    useLiveQuery(async () => {
      const result = await db.settings.get(TODO_FOLDED_CATEGORY_IDS_KEY)
      return parseStoredNumberArray(result?.value)
    }, []) ?? []

  const captureSettings =
    useLiveQuery(async () => {
      const [timeLabelsSetting, hiddenCategorySetting] = await Promise.all([
        db.settings.get(CAPTURE_TIME_LABELS_KEY),
        db.settings.get(CAPTURE_HIDDEN_CATEGORY_IDS_KEY),
      ])

      return {
        showTimeLabels: timeLabelsSetting?.value !== 'false',
        hiddenCategoryIds: parseStoredNumberArray(hiddenCategorySetting?.value),
      }
    }, []) ?? {
      showTimeLabels: true,
      hiddenCategoryIds: [],
    }

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

  useEffect(() => {
    if (currentRecord?.date === selectedDate) {
      setDailyMemo(currentRecord.memo ?? '')
    } else {
      setDailyMemo('')
    }
  }, [
    selectedDate,
    currentRecord?.date,
    currentRecord?.memo,
  ])

  async function saveProfileImage(file?: File) {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Only image files can be uploaded')
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

  async function savePlannerImage() {
    if (!captureRef.current || captureSaving) return

    setCaptureSaving(true)

    try {
      const blob = await createPlannerImageBlob(
        captureRef.current,
        profileImage,
      )

      const fileName = `samdolist-${selectedDate}.png`
      const imageUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = imageUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()

      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
    } catch (error) {
      console.error(error)
      alert('An error occurred while saving the image')
    } finally {
      setCaptureSaving(false)
    }
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

  function changeDailyMemo(value: string) {
    const nextMemo = value.slice(0, 300)

    setDailyMemo(nextMemo)

    void updateDailyRecord({
      memo: nextMemo,
    })
  }

  async function saveTask() {
    if (!draft) return

    const title = draft.title.trim()
    if (!title) return

    // No Time이면 시간을 저장하지 않고,
    // XX:XX 상태인 빈 문자열도 undefined로 변환함
    const startTime = draft.hideTime
      ? undefined
      : draft.startTime || undefined

    const endTime = draft.hideTime
      ? undefined
      : draft.endTime || undefined

    // No Time을 해제했다면 시작·종료 시간을 모두 설정해야 함
    if (!draft.hideTime && (!startTime || !endTime)) {
      alert('Set both the start and end times')
      return
    }

    if (!draft.hideTime && startTime === endTime) {
      alert('Start and end times cannot be the same')
      return
    }

    if (!draft.hideTime && startTime === endTime) {
      alert('Start and end times cannot be the same')
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

    const ok = window.confirm('This task will be permanently deleted')
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

      startTime: task.startTime ?? '',
      endTime: task.endTime ?? '',

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

  async function reorderCategory(sourceId: number, targetId: number) {
    if (sourceId === targetId) return

    const orderedIds = categories.flatMap((category) =>
      category.id === undefined ? [] : [category.id],
    )

    const sourceIndex = orderedIds.indexOf(sourceId)
    const targetIndex = orderedIds.indexOf(targetId)

    if (sourceIndex === -1 || targetIndex === -1) return

    orderedIds.splice(sourceIndex, 1)
    orderedIds.splice(targetIndex, 0, sourceId)

    await db.settings.put({
      key: CATEGORY_ORDER_KEY,
      value: JSON.stringify(orderedIds),
    })
  }

  async function toggleTodoCategoryFold(categoryId: number) {
    const nextIds = foldedCategoryIds.includes(categoryId)
      ? foldedCategoryIds.filter((id) => id !== categoryId)
      : [...foldedCategoryIds, categoryId]

    await db.settings.put({
      key: TODO_FOLDED_CATEGORY_IDS_KEY,
      value: JSON.stringify(nextIds),
    })
  }

  async function updateCaptureTimeLabels(show: boolean) {
    await db.settings.put({
      key: CAPTURE_TIME_LABELS_KEY,
      value: String(show),
    })
  }

  async function toggleCaptureCategoryVisibility(categoryId: number) {
    const nextIds = captureSettings.hiddenCategoryIds.includes(categoryId)
      ? captureSettings.hiddenCategoryIds.filter((id) => id !== categoryId)
      : [...captureSettings.hiddenCategoryIds, categoryId]

    await db.settings.put({
      key: CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
      value: JSON.stringify(nextIds),
    })
  }

  // 현재 날짜를 템플릿으로 저장
  async function saveDayTemplate(templateName: string) {
    const name = templateName.trim()

    if (!name) {
      alert('Enter a template name')
      return
    }

    const categoryMap = new Map(
      categories.flatMap((category) =>
        category.id === undefined
          ? []
          : [[category.id, category] as const],
      ),
    )

    const now = Date.now()

    const templateData = {
      name,

      wakeTime: currentRecord?.wakeTime ?? '',
      sleepTime: currentRecord?.sleepTime ?? '',

      // DailyRecord에 memo가 있다면 주석을 제거
      // memo: currentRecord?.memo ?? '',

      tasks: tasks.map((task) => ({
        categoryId: task.categoryId,
        categoryName:
          categoryMap.get(task.categoryId)?.name ?? '',
        title: task.title,
        startTime: task.startTime,
        endTime: task.endTime,
        memo: task.memo ?? '',
      })),

      updatedAt: now,
    }

    const existingTemplate = await db.dayTemplates
      .where('name')
      .equals(name)
      .first()

    if (existingTemplate?.id !== undefined) {
      const overwrite = window.confirm(
        'A template with this name already exists Overwrite it with the current day',
      )

      if (!overwrite) return

      await db.dayTemplates.update(existingTemplate.id, templateData)
      return
    }

    await db.dayTemplates.add({
      ...templateData,
      createdAt: now,
    })
  }

  // 템플릿 불러오기
  async function applyDayTemplate(template: DayTemplate) {
    const hasCurrentData =
      tasks.length > 0 ||
      Boolean(currentRecord?.wakeTime) ||
      Boolean(currentRecord?.sleepTime)

    if (hasCurrentData) {
      const overwrite = window.confirm(
        'Delete the current tasks and wake sleep times and apply this template',
      )

      if (!overwrite) return
    }

    const categoriesById = new Map(
      categories.flatMap((category) =>
        category.id === undefined
          ? []
          : [[category.id, category] as const],
      ),
    )

    const categoriesByName = new Map(
      categories.map((category) => [
        category.name.trim().toLowerCase(),
        category,
      ]),
    )

    let skippedTaskCount = 0

    const newTasks = template.tasks.flatMap((templateTask, index) => {
      const matchedCategory =
        categoriesById.get(templateTask.categoryId) ??
        categoriesByName.get(
          templateTask.categoryName.trim().toLowerCase(),
        )

      if (matchedCategory?.id === undefined) {
        skippedTaskCount += 1
        return []
      }

      return [
        {
          date: selectedDate,
          categoryId: matchedCategory.id,
          title: templateTask.title,
          startTime: templateTask.startTime,
          endTime: templateTask.endTime,
          memo: templateTask.memo ?? '',
          status: 'todo' as const,
          createdAt: Date.now() + index,
        },
      ]
    })

    await db.transaction(
      'rw',
      db.tasks,
      db.records,
      async () => {
        await db.tasks
          .where('date')
          .equals(selectedDate)
          .delete()

        const previousRecord =
          await db.records.get(selectedDate)

        await db.records.put({
          ...previousRecord,
          date: selectedDate,
          wakeTime: template.wakeTime ?? '',
          sleepTime: template.sleepTime ?? '',

          // DailyRecord에 memo가 있다면 주석을 제거
          // memo: template.memo ?? '',
        })

        if (newTasks.length > 0) {
          await db.tasks.bulkAdd(newTasks)
        }
      },
    )

    if (skippedTaskCount > 0) {
      alert(
        `Applied the template but skipped ${skippedTaskCount} tasks whose categories do not exist`,
      )
    }
  }

  // 템플릿 삭제
  async function deleteDayTemplate(templateId?: number) {
    if (templateId === undefined) return

    const ok = window.confirm('Delete this template')
    if (!ok) return

    await db.dayTemplates.delete(templateId)
  }

  const visibleTabCount = Number(showTimeTab) + Number(showTodoTab)

  return (
    <main className="samdolist-app min-h-screen bg-neutral-100">
      <style>{`
        .samdolist-app button,
        .samdolist-app .force-bold-text {
          font-weight: 900 !important;
          -webkit-text-stroke: 0.22px currentColor;
        }
      `}</style>
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {/* 전날 이동 */}
            <button
              type="button"
              onClick={() => moveDate(-1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
              aria-label="Previous day"
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

              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={(event) => onSelectedDateChange(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Select date"
              />
            </div>

            {/* 다음날 이동 */}
            <button
              type="button"
              onClick={() => moveDate(1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
              aria-label="Next day"
            >
              <ChevronRight size={24} strokeWidth={3} />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenWeekly}
            className="rounded-xl border border-neutral-200 p-2"
            aria-label="Open weekly summary"
          >
            <CalendarRange size={22} />
          </button>

          <button
            type="button"
            onClick={() => void savePlannerImage()}
            disabled={captureSaving}
            className="rounded-xl border border-neutral-200 p-2 disabled:opacity-40"
            aria-label="Save image"
          >
            <ImageDown size={22} />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border border-neutral-200 p-2"
            aria-label="Open menu"
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
                    alt="Profile image"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>
                    Add
                    <br />
                    Photo
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

        {/* 하나 이상의 탭이 켜져 있을 때만 탭 내용을 표시함 */}
        {visibleTabCount > 0 && (
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
                dayStart={dayStart}
                theme={theme}
                foldedCategoryIds={foldedCategoryIds}
                onToggleCategoryFold={toggleTodoCategoryFold}
                onCreateTask={openNewTask}
                onEditTask={openEditTask}
                onCycleStatus={cycleTaskStatus}
              />
            )}
          </div>
        )}

        {/* 날짜 별 하루 메모 */}
        <div className="mt-3 rounded-3xl border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* 테마 색상 포인트 */}
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: theme.primaryBg,
                }}
              />

              <span className="text-sm font-black">
                Daily Memo
              </span>
            </div>

            <span className="text-xs font-bold text-neutral-400">
              {dailyMemo.length}/300
            </span>
          </div>

          <textarea
            value={dailyMemo}
            maxLength={300}
            onChange={(event) =>
              changeDailyMemo(event.target.value)
            }
            placeholder="A short note about today"
            className="
              min-h-24
              w-full
              resize-none
              rounded-2xl
              border
              border-neutral-200
              bg-neutral-50
              px-4
              py-3
              text-base
              font-medium
              leading-relaxed
              text-neutral-800
              outline-none
              transition
              placeholder:text-neutral-400
              focus:border-neutral-400
              focus:bg-white
              sm:text-sm
            "
          />
        </div>
      </section>

      {menuOpen && (
        <MenuDrawer
          dayStart={dayStart}
          categories={categories}
          theme={theme}
          dayTemplates={dayTemplates}
          onSaveTemplate={saveDayTemplate}
          onApplyTemplate={applyDayTemplate}
          onDeleteTemplate={deleteDayTemplate}
          onReorderCategory={reorderCategory}
          showCaptureTimeLabels={captureSettings.showTimeLabels}
          hiddenCaptureCategoryIds={captureSettings.hiddenCategoryIds}
          onChangeCaptureTimeLabels={updateCaptureTimeLabels}
          onToggleCaptureCategory={toggleCaptureCategoryVisibility}
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

      <CaptureView
        captureRef={captureRef}
        selectedDate={selectedDate}
        displayDate={displayDate}
        dayStart={dayStart}
        categories={categories}
        tasks={tasks}
        records={records}
        theme={theme}
        profileImage={profileImage}
        completionRate={completionRate}
        showTimeLabels={captureSettings.showTimeLabels}
        hiddenCategoryIds={captureSettings.hiddenCategoryIds}
      />  
    </main>
  )
}


export default DailyPlannerPage