import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { GripVertical, X } from 'lucide-react'
import clsx from 'clsx'
import { db } from '../db'
import type { Category, DayTemplate } from '../types'
import type { ThemeColors } from '../plannerTypes'
import { THEME_SETTING_KEYS } from '../plannerTypes'
import TimeSelect from './TimeSelect'

type MenuDrawerProps = {
  dayStart: string
  categories: Category[]
  theme: ThemeColors
  dayTemplates: DayTemplate[]
  onSaveTemplate: (name: string) => Promise<void>
  onApplyTemplate: (template: DayTemplate) => Promise<void>
  onDeleteTemplate: (templateId?: number) => Promise<void>
  onReorderCategory: (sourceId: number, targetId: number) => Promise<void>
  showCaptureTimeLabels: boolean
  hiddenCaptureCategoryIds: number[]
  onChangeCaptureTimeLabels: (show: boolean) => Promise<void>
  onToggleCaptureCategory: (categoryId: number) => Promise<void>
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
    onReorderCategory,
    showCaptureTimeLabels,
    hiddenCaptureCategoryIds,
    onChangeCaptureTimeLabels,
    onToggleCaptureCategory,
    onClose,
  }: MenuDrawerProps) {
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#9ec9ef')
  const [templateName, setTemplateName] = useState('')
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null)
  const categoryPressTimerRef = useRef<number | null>(null)

  function clearCategoryPressTimer() {
    if (categoryPressTimerRef.current !== null) {
      window.clearTimeout(categoryPressTimerRef.current)
      categoryPressTimerRef.current = null
    }
  }

  function startCategoryPress(categoryId: number) {
    clearCategoryPressTimer()

    categoryPressTimerRef.current = window.setTimeout(() => {
      setDraggedCategoryId(categoryId)
      categoryPressTimerRef.current = null
      navigator.vibrate?.(20)
    }, 350)
  }

  function movePressedCategory(event: PointerEvent) {
    if (draggedCategoryId === null) return

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-category-id]')

    const targetId = Number(target?.dataset.categoryId)

    if (!Number.isFinite(targetId) || targetId === draggedCategoryId) return
    void onReorderCategory(draggedCategoryId, targetId)
  }

  function endCategoryPress() {
    clearCategoryPressTimer()
    setDraggedCategoryId(null)
  }

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

    const ok = window.confirm('Delete this category Existing tasks will remain under Deleted Category')
    if (!ok) return

    await db.categories.delete(categoryId)
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/30">
      <aside className="ml-auto h-full w-[88vw] max-w-md overflow-auto bg-white p-4 shadow-xl [&_button]:font-black">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black">Menu</h2>

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

        <CollapsibleSection title="Capture Settings">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
              <div>
                <div className="text-sm font-black">Time Labels</div>
                <div className="mt-0.5 text-xs font-bold text-neutral-400">
                  Show task names in the captured time tab
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void onChangeCaptureTimeLabels(!showCaptureTimeLabels)
                }
                className={clsx(
                  'min-w-[72px] rounded-xl border px-3 py-2 text-xs font-black',
                  !showCaptureTimeLabels &&
                    'border-neutral-200 bg-white text-neutral-500',
                )}
                style={
                  showCaptureTimeLabels
                    ? {
                        borderColor: theme.primaryBg,
                        backgroundColor: theme.primaryBg,
                        color: theme.primaryText,
                      }
                    : undefined
                }
              >
                {showCaptureTimeLabels ? 'SHOW' : 'HIDE'}
              </button>
            </div>

            <div className="space-y-2">
              {categories.map((category) => {
                if (category.id === undefined) return null

                const hidden = hiddenCaptureCategoryIds.includes(category.id)

                return (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate text-sm font-black">
                        {category.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void onToggleCaptureCategory(category.id!)}
                      className={clsx(
                        'min-w-[72px] rounded-xl border px-3 py-2 text-xs font-black',
                        hidden &&
                          'border-neutral-200 bg-white text-neutral-500',
                      )}
                      style={
                        hidden
                          ? undefined
                          : {
                              borderColor: theme.primaryBg,
                              backgroundColor: theme.primaryBg,
                              color: theme.primaryText,
                            }
                      }
                    >
                      {hidden ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                )
              })}
            </div>
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
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 font-bold"
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
              className="rounded-xl border border-neutral-200 px-3 py-2 font-bold"
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
                data-category-id={category.id}
                className={clsx(
                  'rounded-2xl border border-neutral-200 p-3 transition',
                  draggedCategoryId === category.id &&
                    'scale-[1.01] border-neutral-400 bg-neutral-50 shadow-lg',
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Reorder ${category.name}`}
                    className="grid h-10 w-8 shrink-0 touch-none place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    onPointerDown={(event) => {
                      if (category.id === undefined) return
                      event.currentTarget.setPointerCapture(event.pointerId)
                      startCategoryPress(category.id)
                    }}
                    onPointerMove={movePressedCategory}
                    onPointerUp={endCategoryPress}
                    onPointerCancel={endCategoryPress}
                  >
                    <GripVertical size={20} strokeWidth={2.5} />
                  </button>

                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
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
                    className="force-bold-text min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 font-black"
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

export default MenuDrawer