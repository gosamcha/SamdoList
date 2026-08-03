import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ImageDown, Menu, X } from 'lucide-react'
import {toBlob} from 'html-to-image'
import { useLiveQuery } from 'dexie-react-hooks'
import clsx from 'clsx'
import { db, seedInitialData } from './db'
import type { Category, DailyRecord, PlannerTask, TaskStatus, DayTemplate } from './types'
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
const EXTRA_LANE_HEIGHT = 20 //투두 3개 이상 시 추가되는 줄 높이

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

    async function savePlannerImage() {
    if (!captureRef.current || captureSaving) return

    setCaptureSaving(true)

    try {
      // 웹 폰트가 있다면 폰트 로딩이 끝난 뒤 캡처
      await document.fonts.ready

      const blob = await toBlob(captureRef.current, {
        width: 1080,
        height: 1350,
        pixelRatio: 1,
        backgroundColor: '#f5f5f5',
        cacheBust: true,
      })

      if (!blob) {
        throw new Error('이미지를 생성하지 못함.')
      }

      const fileName = `samdolist-${selectedDate}.png`
      const file = new File([blob], fileName, {
        type: 'image/png',
      })

      // 아이폰·모바일에서 파일 공유를 지원하면 공유 메뉴 사용
      if (
        navigator.canShare &&
        navigator.canShare({
          files: [file],
        })
      ) {
        await navigator.share({
          files: [file],
          title: `SamdoList ${selectedDate}`,
        })

        return
      }

      // 공유를 지원하지 않으면 일반 파일 다운로드
      const imageUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = imageUrl
      link.download = fileName
      link.click()

      URL.revokeObjectURL(imageUrl)
    } catch (error) {
      // 사용자가 모바일 공유 메뉴를 직접 닫은 경우는 오류창을 띄우지 않음
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      console.error(error)
      alert('이미지 저장 중 오류가 발생함.')
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
      alert('시작 시간과 종료 시간을 모두 설정해야 함.')
      return
    }

    if (!draft.hideTime && startTime === endTime) {
      alert('시작 시간과 종료 시간이 같을 수 없음.')
      return
    }

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

  // 현재 날짜를 템플릿으로 저장
  async function saveDayTemplate(templateName: string) {
    const name = templateName.trim()

    if (!name) {
      alert('템플릿 이름을 입력해야 함.')
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
        '같은 이름의 템플릿이 있습니다. 현재 내용으로 덮어쓸까요?',
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
        '현재 날짜의 투두와 기상·취침 시간을 지우고 템플릿을 적용할까요?',
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
        `템플릿을 적용했지만, 존재하지 않는 카테고리의 투두 ${skippedTaskCount}개는 제외됨.`,
      )
    }
  }

  // 템플릿 삭제
  async function deleteDayTemplate(templateId?: number) {
    if (templateId === undefined) return

    const ok = window.confirm('이 템플릿을 삭제할까요?')
    if (!ok) return

    await db.dayTemplates.delete(templateId)
  }

  const visibleTabCount = Number(showTimeTab) + Number(showTodoTab)

  return (
    <main className="min-h-screen bg-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
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
            onClick={() => void savePlannerImage()}
            disabled={captureSaving}
            className="rounded-xl border border-neutral-200 p-2 disabled:opacity-40"
            aria-label="이미지 저장"
          >
            <ImageDown size={22} />
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
          dayTemplates={dayTemplates}
          onSaveTemplate={saveDayTemplate}
          onApplyTemplate={applyDayTemplate}
          onDeleteTemplate={deleteDayTemplate}
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
      />  
    </main>
  )
}

type CaptureViewProps = {
  captureRef: React.RefObject<HTMLDivElement | null>
  selectedDate: string
  displayDate: string
  dayStart: string
  categories: Category[]
  tasks: PlannerTask[]
  records: RecordSet
  theme: ThemeColors
  profileImage: string
  completionRate: number
}

function CaptureView({
  captureRef,
  selectedDate,
  displayDate,
  dayStart,
  categories,
  tasks,
  records,
  theme,
  profileImage,
  completionRate,
}: CaptureViewProps) {
  const currentRecord = records.current

  const noopCreate = () => {}
  const noopEdit = () => {}
  const noopStatus = () => {}

  return (
    <div
      className="pointer-events-none fixed left-[-10000px] top-0"
      aria-hidden="true"
    >
      <div
        ref={captureRef}
        className="overflow-hidden bg-neutral-100 p-8"
        style={{
          width: 1080,
          height: 1350,
        }}
      >
        <div
          className="mb-5 text-6xl font-black"
          style={{
            color: theme.primaryBg,
            letterSpacing: '-0.04em',
          }}
        >
          {displayDate}
        </div>

        <div className="mb-5 rounded-3xl border border-neutral-200 bg-white p-5">
          <div className="flex gap-5">
            <div className="shrink-0">
              <div className="grid h-36 w-36 place-items-center overflow-hidden rounded-2xl bg-white text-neutral-400">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-bold">No Image</span>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xl font-black">
                    Progress Bar
                  </span>

                  <span className="text-3xl font-black">
                    {completionRate}%
                  </span>
                </div>

                <div className="h-5 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${completionRate}%`,
                      backgroundColor: theme.primaryBg,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <div className="text-xl font-black">Wake-Up</div>
                  <div className="mt-1 text-2xl font-bold text-neutral-500">
                    {currentRecord?.wakeTime || 'XX:XX'}
                  </div>
                </div>

                <div>
                  <div className="text-xl font-black">Sleep</div>
                  <div className="mt-1 text-2xl font-bold text-neutral-500">
                    {currentRecord?.sleepTime || 'XX:XX'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-5"
          style={{
            height: 1040,
          }}
        >
          <TimePanel
            selectedDate={selectedDate}
            dayStart={dayStart}
            categories={categories}
            tasks={tasks}
            records={records}
            captureMode
            hourHeight={34}
            extraLaneHeight={12}
          />

          <TodoPanel
            categories={categories}
            tasks={tasks}
            theme={theme}
            onCreateTask={noopCreate}
            onEditTask={noopEdit}
            onCycleStatus={noopStatus}
            captureMode
          />
        </div>
      </div>
    </div>
  )
}

type TimePanelProps = {
  selectedDate: string
  dayStart: string
  categories: Category[]
  tasks: PlannerTask[]
  records: RecordSet
  captureMode?: boolean
  hourHeight?: number
  extraLaneHeight?: number
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
}: TimePanelProps) {
  const categoryMap = useMemo(() => {
      return new Map(categories.map((category) => [category.id, category]))
    }, [categories])

    const dayStartMinutes = timeToMinutes(dayStart)

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


          const height =
            maximumOverlap <= 2
              ? hourHeight
              : hourHeight  +
                (maximumOverlap - 2) * extraLaneHeight

          const laneEndOffsets: number[] = []

          const assignedSegments = [...segments]
            .sort((a, b) =>
              compareTaskRange(a.range, b.range),
            )
            .map((segment) => {

              let laneIndex = laneEndOffsets.findIndex(
                (endOffset) =>
                  endOffset <= segment.segmentStart,
              )

              if (laneIndex === -1) {
                laneIndex = laneEndOffsets.length
              }

              laneEndOffsets[laneIndex] =
                segment.segmentEnd

              return {
                ...segment,
                laneIndex,
              }
            })

          return {
            hourIndex,
            height,
            laneCount: maximumOverlap,
            assignedSegments,
          }
        },
      )

      
      let accumulatedTop = 0

      const hourLayouts: HourLayout[] =
        rawHourData.map((hourData) => {
          const layout: HourLayout = {
            hourIndex: hourData.hourIndex,
            top: accumulatedTop,
            height: hourData.height,
            laneCount: hourData.laneCount,
          }

          accumulatedTop += hourData.height

          return layout
        })

      const titleShownTasks = new Set<string>()
      const taskBlocks: TaskBlock[] = []

      rawHourData.forEach((hourData) => {
        const hourStart = hourData.hourIndex * 60

        hourData.assignedSegments.forEach(
          ({ range, segmentStart, segmentEnd, laneIndex }) => {
            const showTitle =
              !titleShownTasks.has(range.taskKey)

            titleShownTasks.add(range.taskKey)

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
    }, [tasks, dayStart, hourHeight, extraLaneHeight])

    const {
      hourLayouts,
      taskBlocks,
      totalHeight,
    } = timeLayout

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

          cursor = segmentEnd
        }
      }

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

      <div
          className={clsx(
            captureMode
              ? 'overflow-hidden'
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
                <div className="absolute left-0 top-1 w-6 text-right text-sm font-black text-neutral-400">
                  {label.slice(0, 2)}
                </div>

                <div className="ml-7 grid h-full grid-cols-6">
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
                className="pointer-events-none absolute left-7 right-0 z-0"
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
              const verticalPadding = 3
              const laneGap = 2

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
                  className="absolute left-8 right-2"
                  style={{
                    // 동적으로 계산된 시간 줄 위치와 높이 사용
                    top: hourLayout.top,
                    height: hourLayout.height,
                  }}
                >
                  <div
                    className="absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-xs font-black leading-tight shadow-sm"
                    style={{
                      /*
                      * 시간 위치와 길이는 가로축으로 유지함.
                      * 세로축만 겹치는 투두 개수에 따라 나눔.
                      */
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,

                      top: blockTop,
                      height: laneHeight,

                      borderColor: color,
                      backgroundColor: `${color}${strong ? '80' : '33'}`,
                      opacity: strong ? 1 : 0.72,
                    }}
                  >
                    {/* 제목은 투두가 처음 나타나는 블록에서만 표시 */}
                    {showTitle && (
                      <div
                        className={clsx(
                          'truncate text-[10px] font-bold leading-tight',
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
  captureMode?: boolean
}

function TodoPanel({
  categories,
  tasks,
  theme,
  onCreateTask,
  onEditTask,
  onCycleStatus,
  captureMode = false,
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
      <div
          className={clsx(
            'p-3',
            captureMode
              ? 'overflow-hidden'
              : 'max-h-[72vh] overflow-auto',
          )}
        >
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
  dayTemplates: DayTemplate[]
  onSaveTemplate: (name: string) => Promise<void>
  onApplyTemplate: (template: DayTemplate) => Promise<void>
  onDeleteTemplate: (templateId?: number) => Promise<void>
  onClose: () => void
}

function MenuDrawer({
    dayStart,
    categories,
    theme,
    dayTemplates,
    onSaveTemplate,
    onApplyTemplate,
    onDeleteTemplate,
    onClose,
  }: MenuDrawerProps) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#9ec9ef')
  const [templateName, setTemplateName] = useState('')

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
              allowEmpty={false}
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

        <CollapsibleSection title="Day Template">
          <div className="space-y-3">
            <input
              value={templateName}
              onChange={(event) =>
                setTemplateName(event.target.value)
              }
              placeholder="Template Name"
              maxLength={30}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2"
            />

            <button
              type="button"
              onClick={async () => {
                await onSaveTemplate(templateName)
                setTemplateName('')
              }}
              className="w-full rounded-xl px-4 py-3 font-black"
              style={{
                backgroundColor: theme.primaryBg,
                color: theme.primaryText,
              }}
            >
              SAVE CURRENT DAY
            </button>

            {dayTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400">
                No Template
              </div>
            ) : (
              <div className="space-y-2">
                {dayTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-2xl border border-neutral-200 p-3"
                  >
                    <div className="mb-2">
                      <div className="font-black">
                        {template.name}
                      </div>

                      <div className="mt-0.5 text-xs font-bold text-neutral-400">
                        {template.tasks.length} TO-DO
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await onApplyTemplate(template)
                          onClose()
                        }}
                        className="rounded-xl px-3 py-2 text-sm font-black"
                        style={{
                          backgroundColor: theme.primaryBg,
                          color: theme.primaryText,
                        }}
                      >
                        APPLY
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void onDeleteTemplate(template.id)
                        }
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-black text-red-500"
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
  allowEmpty?: boolean
}

function splitTime(value: string) {
  // 저장된 시간이 없으면 XX:XX로 표시함
  if (!value) {
    return {
      hour: 'XX',
      minute: 'XX',
    }
  }

  const [hour, minute] = value.split(':')

  return {
    hour: hour || 'XX',
    minute: minute || 'XX',
  }
}

function TimeSelect({
  value,
  onChange,
  disabled = false,
  allowEmpty = true,
}: TimeSelectProps) {
  /*
   * 값이 비어 있으면 현재 시간을 자동으로 표시하지 않고
   * XX:XX를 표시함.
   *
   * DayStart처럼 빈 값이 허용되지 않는 곳은
   * allowEmpty={false}를 전달함.
   */
  const { hour, minute } = value
    ? splitTime(value)
    : allowEmpty
      ? splitTime('')
      : splitTime('00:00')

  function updateHour(nextHour: string) {
    // XX를 선택하면 시간 전체를 미설정 상태로 바꿈
    if (nextHour === 'XX') {
      onChange('')
      return
    }

    // XX:XX 상태에서 시를 먼저 고르면 분은 00으로 설정함
    const nextMinute = minute === 'XX' ? '00' : minute

    onChange(`${nextHour}:${nextMinute}`)
  }

  function updateMinute(nextMinute: string) {
    // XX를 선택하면 시간 전체를 미설정 상태로 바꿈
    if (nextMinute === 'XX') {
      onChange('')
      return
    }

    // XX:XX 상태에서 분을 먼저 고르면 시는 00으로 설정함
    const nextHour = hour === 'XX' ? '00' : hour

    onChange(`${nextHour}:${nextMinute}`)
  }

  return (
    <div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
      <select
        value={hour}
        disabled={disabled}
        onChange={(event) =>
          updateHour(event.target.value)
        }
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {/* 기상·취침·투두 시간에서는 XX 선택 가능 */}
        {allowEmpty && (
          <option value="XX">XX</option>
        )}

        {HOUR_OPTIONS.map((hourOption) => (
          <option
            key={hourOption}
            value={hourOption}
          >
            {hourOption}
          </option>
        ))}
      </select>

      <span className="text-sm font-bold text-neutral-500">
        :
      </span>

      <select
        value={minute}
        disabled={disabled}
        onChange={(event) =>
          updateMinute(event.target.value)
        }
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
      >
        {/* 기상·취침·투두 시간에서는 XX 선택 가능 */}
        {allowEmpty && (
          <option value="XX">XX</option>
        )}

        {MINUTE_OPTIONS.map((minuteOption) => (
          <option
            key={minuteOption}
            value={minuteOption}
          >
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