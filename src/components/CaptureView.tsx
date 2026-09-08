import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { toBlob } from 'html-to-image'
import type { Category, PlannerTask } from '../types'
import type { RecordSet, ThemeColors } from '../plannerTypes'
import { addDays, localDateAt, sleepStartDateTime } from '../utils/time'
import TimePanel from './TimePanel'
import TodoPanel from './TodoPanel'

type CaptureProfileCanvasProps = {
  src: string
  size: number
}

function CaptureProfileCanvas({ src, size }: CaptureProfileCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    canvas.dataset.captureReady = 'false'
    context.clearRect(0, 0, size, size)

    let cancelled = false
    const image = new Image()

    const finish = () => {
      if (cancelled) return
      canvas.dataset.captureReady = 'true'
      canvas.dispatchEvent(new Event('capture-profile-ready'))
    }

    image.onload = () => {
      if (cancelled) return

      const scale = Math.max(
        size / image.naturalWidth,
        size / image.naturalHeight,
      )
      const drawWidth = image.naturalWidth * scale
      const drawHeight = image.naturalHeight * scale
      const drawX = (size - drawWidth) / 2
      const drawY = (size - drawHeight) / 2

      context.clearRect(0, 0, size, size)
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
      finish()
    }

    image.onerror = finish
    image.src = src

    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
    }
  }, [size, src])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      data-capture-profile
      data-capture-ready="false"
      className="h-full w-full"
      style={{ display: 'block' }}
    />
  )
}

async function waitForCaptureAssets(root: HTMLElement) {
  await document.fonts.ready

  const images = Array.from(root.querySelectorAll('img'))

  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          const finish = () => resolve()

          image.addEventListener('load', finish, { once: true })
          image.addEventListener('error', finish, { once: true })
        })
      }

      if (typeof image.decode === 'function') {
        try {
          await image.decode()
        } catch {
          // 브라우저가 이미지를 화면에는 표시하지만 decode를 거부하는 경우는 무시함
        }
      }
    }),
  )

  const captureCanvases = Array.from(
    root.querySelectorAll<HTMLCanvasElement>('canvas[data-capture-profile]'),
  )

  await Promise.all(
    captureCanvases.map(async (canvas) => {
      if (canvas.dataset.captureReady === 'true') return

      await new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(resolve, 3000)

        canvas.addEventListener(
          'capture-profile-ready',
          () => {
            window.clearTimeout(timeoutId)
            resolve()
          },
          { once: true },
        )
      })
    }),
  )

  // iOS Safari에서 Canvas의 최신 픽셀이 캡처 DOM에 반영될 시간을 확보함
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.setTimeout(resolve, 80),
      ),
    ),
  )

}

type CaptureProfileSlot = {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

function getCaptureProfileSlot(
  root: HTMLElement,
): CaptureProfileSlot | null {
  const slot = root.querySelector<HTMLElement>(
    '[data-capture-profile-slot]',
  )

  if (!slot) return null

  const rootRect = root.getBoundingClientRect()
  const slotRect = slot.getBoundingClientRect()
  const computedStyle = window.getComputedStyle(slot)

  return {
    x: slotRect.left - rootRect.left,
    y: slotRect.top - rootRect.top,
    width: slotRect.width,
    height: slotRect.height,
    radius: Number.parseFloat(computedStyle.borderTopLeftRadius) || 0,
  }
}

function loadImageForCanvas(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') {
          await image.decode()
        }
      } catch {
        // onload가 끝났다면 Safari의 decode 실패는 무시함
      }

      resolve(image)
    }

    image.onerror = () => {
      reject(new Error('Could not load an image for capture'))
    }

    image.src = src
  })
}

function addRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const resolvedRadius = Math.max(
    0,
    Math.min(radius, width / 2, height / 2),
  )

  context.beginPath()
  context.moveTo(x + resolvedRadius, y)
  context.lineTo(x + width - resolvedRadius, y)
  context.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + resolvedRadius,
  )
  context.lineTo(x + width, y + height - resolvedRadius)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - resolvedRadius,
    y + height,
  )
  context.lineTo(x + resolvedRadius, y + height)
  context.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - resolvedRadius,
  )
  context.lineTo(x, y + resolvedRadius)
  context.quadraticCurveTo(x, y, x + resolvedRadius, y)
  context.closePath()
}

async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (blob) return blob

  // 일부 구형 iOS Safari에서 toBlob이 null을 반환할 때의 fallback
  const response = await fetch(canvas.toDataURL('image/png'))
  return response.blob()
}

async function compositeProfileImage(
  baseBlob: Blob,
  profileImage: string,
  slot: CaptureProfileSlot,
) {
  const baseImageUrl = URL.createObjectURL(baseBlob)

  try {
    const [baseImage, profile] = await Promise.all([
      loadImageForCanvas(baseImageUrl),
      loadImageForCanvas(profileImage),
    ])

    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1350

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Could not create the final capture canvas')
    }

    context.drawImage(baseImage, 0, 0, canvas.width, canvas.height)

    const scale = Math.max(
      slot.width / profile.naturalWidth,
      slot.height / profile.naturalHeight,
    )

    const drawWidth = profile.naturalWidth * scale
    const drawHeight = profile.naturalHeight * scale
    const drawX = slot.x + (slot.width - drawWidth) / 2
    const drawY = slot.y + (slot.height - drawHeight) / 2

    context.save()
    addRoundedRectPath(
      context,
      slot.x,
      slot.y,
      slot.width,
      slot.height,
      slot.radius,
    )
    context.clip()
    context.drawImage(profile, drawX, drawY, drawWidth, drawHeight)
    context.restore()

    return await canvasToPngBlob(canvas)
  } finally {
    URL.revokeObjectURL(baseImageUrl)
  }
}

export async function createPlannerImageBlob(
  root: HTMLElement,
  profileImage: string,
) {
  await waitForCaptureAssets(root)

  const profileSlot = getCaptureProfileSlot(root)
  const baseBlob = await toBlob(root, {
    width: 1080,
    height: 1350,
    pixelRatio: 1,
    backgroundColor: '#f5f5f5',
    cacheBust: false,
  })

  if (!baseBlob) {
    throw new Error('Could not create the image')
  }

  return profileImage && profileSlot
    ? compositeProfileImage(baseBlob, profileImage, profileSlot)
    : baseBlob
}

type CaptureViewProps = {
  captureRef: RefObject<HTMLDivElement | null>
  selectedDate: string
  displayDate: string
  displayWeekday: string
  dayStart: string
  categories: Category[]
  tasks: PlannerTask[]
  records: RecordSet
  theme: ThemeColors
  profileImage: string
  completionRate: number
  showTimeLabels: boolean
  hiddenCategoryIds: number[]
}

function CaptureView({
  captureRef,
  selectedDate,
  displayDate,
  displayWeekday,
  dayStart,
  categories,
  tasks,
  records,
  theme,
  profileImage,
  completionRate,
  showTimeLabels,
  hiddenCategoryIds,
}: CaptureViewProps) {
  const currentRecord = records.current
  const captureBodyHeight = 1166
  const summaryCardHeight = 184
  const leftColumnGap = 20
  const timePanelHeight = captureBodyHeight - summaryCardHeight - leftColumnGap

  const sleepDurationText = useMemo(() => {
    const previousSleepTime = records.prev?.sleepTime
    const currentWakeTime = currentRecord?.wakeTime

    if (!previousSleepTime || !currentWakeTime) {
      return 'XXh XXm'
    }

    const prevDate = addDays(selectedDate, -1)
    const sleepStart = sleepStartDateTime(
      prevDate,
      previousSleepTime,
      dayStart,
    ).getTime()

    const wakeTime = localDateAt(
      selectedDate,
      currentWakeTime,
    ).getTime()

    if (wakeTime <= sleepStart) {
      return 'XXh XXm'
    }

    const durationMinutes = Math.round(
      (wakeTime - sleepStart) / (1000 * 60),
    )

    const hours = Math.floor(durationMinutes / 60)
    const minutes = durationMinutes % 60

    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }, [
    currentRecord?.wakeTime,
    dayStart,
    records.prev?.sleepTime,
    selectedDate,
  ])

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
        className="overflow-hidden bg-neutral-100"
        style={{
          width: 1080,
          height: 1350,
        }}
      >
        <div
          className="mb-6 bg-white px-8 pb-5 pt-7"
          style={{
            boxShadow: '0 10px 18px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div className="flex h-[88px] min-w-0 items-end gap-6">
            <div
              className="shrink-0 font-black leading-none"
              style={{
                color: theme.primaryBg,
                fontSize: 78,
                letterSpacing: '-0.055em',
              }}
            >
              <div className="date-display">
                <span className="date-main">{displayDate}</span>
                <span className="date-weekday">{displayWeekday}</span>
              </div>
            </div>

            <div className="flex min-h-[56px] min-w-0 flex-1 items-end pb-1">
              {currentRecord?.memo?.trim() ? (
                <div
                  className="truncate font-semibold text-neutral-400"
                  style={{
                    fontSize: 18,
                    letterSpacing: '0.01em',
                  }}
                >
                  {currentRecord.memo.trim()}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div
            className="grid gap-5"
            style={{
              height: captureBodyHeight,
              gridTemplateColumns: '6fr 4fr',
            }}
          >
            <div className="flex h-full flex-col gap-5">
              <div
                className="rounded-[30px] border border-neutral-200 bg-white px-5 py-4"
                style={{ height: summaryCardHeight }}
              >
                <div className="flex h-full items-center gap-5">
                  <div className="shrink-0">
                    <div
                      data-capture-profile-slot
                      className="grid h-[128px] w-[128px] place-items-center overflow-hidden rounded-[22px] bg-neutral-50 text-neutral-400"
                    >
                      {profileImage ? (
                        <CaptureProfileCanvas
                          src={profileImage}
                          size={128}
                        />
                      ) : (
                        <span className="text-base font-bold">No Image</span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[26px] font-black leading-none">
                          Progress Bar
                        </span>

                        <span className="text-[31px] font-black leading-none">
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

                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <div className="text-[20px] font-black leading-none">Sleep Time</div>
                        <div className="mt-2 text-[24px] font-bold leading-none text-neutral-500">
                          {sleepDurationText}
                        </div>
                      </div>

                      <div>
                        <div className="text-[20px] font-black leading-none">Wake-Up</div>
                        <div className="mt-2 text-[24px] font-bold leading-none text-neutral-500">
                          {currentRecord?.wakeTime || 'XX:XX'}
                        </div>
                      </div>

                      <div>
                        <div className="text-[20px] font-black leading-none">Sleep</div>
                        <div className="mt-2 text-[24px] font-bold leading-none text-neutral-500">
                          {currentRecord?.sleepTime || 'XX:XX'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <TimePanel
                  selectedDate={selectedDate}
                  dayStart={dayStart}
                  categories={categories}
                  tasks={tasks}
                  records={records}
                  captureMode
                  hourHeight={42}
                  extraLaneHeight={26}
                  captureTargetHeight={timePanelHeight}
                  showTaskLabels={showTimeLabels}
                  hiddenLabelCategoryIds={hiddenCategoryIds}
                />
              </div>
            </div>

            <TodoPanel
              categories={categories}
              tasks={tasks}
              dayStart={dayStart}
              theme={theme}
              onCreateTask={noopCreate}
              onEditTask={noopEdit}
              onCycleStatus={noopStatus}
              hiddenCategoryIds={hiddenCategoryIds}
              captureMode
            />
          </div>
        </div>
      </div>
    </div>
  )
}


export default CaptureView