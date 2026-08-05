import { X } from 'lucide-react'
import type { ThemeColors } from '../plannerTypes'
import TimeSelect from './TimeSelect'

export type TaskDraft = {
  editingId?: number
  categoryId: number
  title: string
  startTime: string
  endTime: string
  hideTime: boolean // 시간 탭에 표시하지 않을지
  memo: string
}

export type TaskModalProps = {
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


export default TaskModal