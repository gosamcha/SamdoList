import Dexie, { type Transaction } from 'dexie'
import { addDays, startOfWeekMonday } from '../utils/time'
import { db } from '../db'
import {
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
} from '../plannerTypes'
import type {
  AppSetting,
  DailyRecord,
  DayTemplate,
  DayTemplateTask,
  PlannerTask,
  TaskStatus,
  WeeklyRecord,
} from '../types'
import { supabase } from './supabase'

const CATEGORY_ID_SETTING_KEYS = new Set([
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
])

type SyncItem = {
  id: string
  user_id: string
  collection: string
  item_key: string
  data: unknown
  updated_at: string
  deleted_at: string | null
}

type CloudCategory = {
  syncId: string
  name: string
  color: string
}

type CloudTask = {
  syncId: string
  date: string
  categorySyncId?: string
  order?: number
  title: string
  startTime?: string
  endTime?: string
  memo?: string
  status: TaskStatus
  createdAt: number
}

type CloudTemplateTask = {
  categorySyncId?: string
  categoryName: string
  order?: number
  title: string
  startTime?: string
  endTime?: string
  memo?: string
}

type CloudTemplate = {
  syncId: string
  name: string
  wakeTime?: string
  sleepTime?: string
  memo?: string
  tasks: CloudTemplateTask[]
  createdAt: number
  updatedAt: number
}

/*
 * 다음 단계에서
 * "Supabase에서 받아온 변경을 다시 Supabase에 올려버리는 현상"
 * 을 막을 때 사용함.
 */
const remoteTransactions = new WeakSet<Transaction>()

export function isApplyingRemoteChange() {
  return !!Dexie.currentTransaction && remoteTransactions.has(Dexie.currentTransaction)
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value)

    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string => typeof item === 'string',
        )
      : []
  } catch {
    return []
  }
}

async function findCategoryBySyncId(syncId: string) {
  return db.categories
    .where('syncId').equals(syncId)
    .first()
}

async function findTaskBySyncId(syncId: string) {
  return db.tasks
    .where('syncId').equals(syncId)
    .first()
}

async function findTemplateBySyncId(syncId: string) {
  return db.dayTemplates
    .where('syncId').equals(syncId)
    .first()
}

/*
 * Supabase category syncId 배열
 * ->
 * 현재 기기의 IndexedDB 숫자 categoryId 배열
 */
async function convertCategorySyncIdsToLocalIds(
  syncIds: string[],
) {
  const result: number[] = []

  for (const syncId of syncIds) {
    const category = await findCategoryBySyncId(syncId)

    if (category?.id !== undefined) {
      result.push(category.id)
    }
  }

  return result
}

/*
 * 클라우드의 INSERT / UPDATE를
 * 현재 기기 IndexedDB에 적용
 */
async function applyCloudItem(row: SyncItem) {
  /*
   * soft delete된 데이터라면 로컬에서도 삭제
   */
  if (row.deleted_at) {
    await deleteLocalItem(row)
    return
  }

  switch (row.collection) {
    /*
     * CATEGORY
     */
    case 'categories': {
      const category = row.data as CloudCategory

      const existing = await findCategoryBySyncId(row.item_key)

      if (existing?.id !== undefined) {
        await db.categories.update(existing.id, {
          syncId: row.item_key,
          name: category.name,
          color: category.color,
        })
      } else {
        await db.categories.add({
          syncId: row.item_key,
          name: category.name,
          color: category.color,
        })
      }

      break
    }

    /*
     * TASK
     */
    case 'tasks': {
      const task = row.data as CloudTask

      if (!task.categorySyncId) {
        console.warn(
          'Task에 categorySyncId가 없어 동기화를 건너뜀:',
          task,
        )
        return
      }

      const category = await findCategoryBySyncId(
        task.categorySyncId,
      )

      if (category?.id === undefined) {
        console.warn(
          'Task의 카테고리를 찾지 못함:',
          task.categorySyncId,
        )
        return
      }

      const existing = await findTaskBySyncId(row.item_key)

      const localTask: Omit<PlannerTask, 'id'> = {
        syncId: row.item_key,
        date: task.date,
        categoryId: category.id,
        order:
          task.order ??
          existing?.order ??
          task.createdAt,
        title: task.title,
        startTime: task.startTime,
        endTime: task.endTime,
        memo: task.memo,
        status: task.status,
        createdAt: task.createdAt,
      }

      if (existing?.id !== undefined) {
        await db.tasks.update(existing.id, localTask)
      } else {
        await db.tasks.add(localTask)
      }

      break
    }

    /*
     * DAILY RECORD
     */
    case 'records': {
      const record = row.data as DailyRecord

      await db.records.put(record)

      break
    }

    /*
     * SETTINGS
     */
    case 'settings': {
      const setting = row.data as AppSetting

      if (!CATEGORY_ID_SETTING_KEYS.has(setting.key)) {
        await db.settings.put(setting)
        break
      }

      /*
       * 이 세 설정은 클라우드에서는
       * category syncId 배열로 저장되어 있음.
       */
      const syncIds = parseStringArray(setting.value)

      const localIds =
        await convertCategorySyncIdsToLocalIds(syncIds)

      await db.settings.put({
        key: setting.key,
        value: JSON.stringify(localIds),
      })

      break
    }

    /*
     * DAY TEMPLATE
     */
    case 'dayTemplates': {
      const template = row.data as CloudTemplate

      const tasks: DayTemplateTask[] = []

      for (const task of template.tasks ?? []) {
        let categoryId: number | undefined

        if (task.categorySyncId) {
          const category = await findCategoryBySyncId(
            task.categorySyncId,
          )

          categoryId = category?.id
        }

        /*
         * 혹시 예전 데이터라 categorySyncId가 없다면
         * 이름으로 한 번 더 찾아봄.
         */
        if (categoryId === undefined) {
          const category = await db.categories
            .filter(
              (item) =>
                item.name.trim().toLowerCase() ===
                task.categoryName.trim().toLowerCase(),
            )
            .first()

          categoryId = category?.id
        }

        if (categoryId === undefined) {
          console.warn(
            'Template Task 카테고리를 찾지 못함:',
            task,
          )
          continue
        }

        tasks.push({
          categoryId,
          categoryName: task.categoryName,
          order: task.order,
          title: task.title,
          startTime: task.startTime,
          endTime: task.endTime,
          memo: task.memo,
        })
      }

      const restoredTemplate: Omit<DayTemplate, 'id'> = {
        syncId: row.item_key,
        name: template.name,
        wakeTime: template.wakeTime,
        sleepTime: template.sleepTime,
        memo: template.memo,
        tasks,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      }

      const existing = await findTemplateBySyncId(
        row.item_key,
      )

      if (existing?.id !== undefined) {
        await db.dayTemplates.update(
          existing.id,
          restoredTemplate,
        )
      } else {
        await db.dayTemplates.add(restoredTemplate)
      }

      break
    }

    /*
     * WEEKLY RECORD
     */
    case 'weeklyRecords': {
      const record = row.data as WeeklyRecord

      await db.weeklyRecords.put(record)

      break
    }
  }
}

/*
 * 클라우드에서 삭제된 데이터를
 * 현재 기기의 IndexedDB에서도 삭제
 */
async function deleteLocalItem(row: SyncItem) {
  switch (row.collection) {
    case 'categories': {
      const category = await findCategoryBySyncId(row.item_key)

      if (category?.id !== undefined) {
        await db.categories.delete(category.id)
      }

      break
    }

    case 'tasks': {
      const task = await findTaskBySyncId(row.item_key)

      if (task?.id !== undefined) {
        await db.tasks.delete(task.id)
      }

      break
    }

    case 'records': {
      await db.records.delete(row.item_key)
      break
    }

    case 'settings': {
      await db.settings.delete(row.item_key)
      break
    }

    case 'dayTemplates': {
      const template = await findTemplateBySyncId(
        row.item_key,
      )

      if (template?.id !== undefined) {
        await db.dayTemplates.delete(template.id)
      }

      break
    }

    case 'weeklyRecords': {
      await db.weeklyRecords.delete(row.item_key)
      break
    }
  }
}

type DateWindow = { start: string; end: string }

export function plannerWindow(date: string, surroundingWeeks: number): DateWindow {
  const monday = startOfWeekMonday(date)
  return { start: addDays(monday, -7 * surroundingWeeks), end: addDays(monday, 6 + 7 * surroundingWeeks) }
}

export function openPlannerSync(userId: string) {
  const controller = new AbortController()
  let initialEvents: SyncItem[] | null = []
  const liveVersions = new Map<string, string>()
  const keyOf = (row: SyncItem) => row.collection + '/' + row.item_key
  const apply = (rows: SyncItem[], live = false) =>
    db.transaction('rw', db.tables, async transaction => {
      remoteTransactions.add(transaction)
      for (const row of rows) {
        if (controller.signal.aborted) throw new DOMException('Connection closed', 'AbortError')
        const key = keyOf(row)
        const known = liveVersions.get(key)
        if (known && known > row.updated_at) continue
        await applyCloudItem(row)
        if (live) liveVersions.set(key, row.updated_at)
      }
    })

  const channel = supabase.channel('samdolist-sync-' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_items', filter: 'user_id=eq.' + userId }, payload => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const row = payload.new as SyncItem
        if (initialEvents) initialEvents.push(row)
        else void apply([row], true).catch(console.error)
      }
    }).subscribe()

  async function fetchGroup(collections: string[], dates?: DateWindow, keys?: string[]) {
    const rows: SyncItem[] = []
    let cursor = ''
    for (;;) {
      let query = supabase.from('sync_items').select('id,collection,item_key,data,updated_at,deleted_at')
        .eq('user_id', userId).in('collection', collections)
      if (dates) {
        const field = collections[0] === 'tasks' ? 'data->>date' : 'item_key'
        query = query.gte(field, dates.start).lte(field, dates.end)
      }
      if (keys) query = query.in('item_key', keys)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query.order('id').limit(250).abortSignal(controller.signal)
      if (error) throw error
      const page = data as SyncItem[]
      rows.push(...page)
      if (page.length < 250) return rows
      cursor = page[page.length - 1].id
    }
  }

  async function load(dates: DateWindow, initial: boolean, progress: (done: number, total: number) => void) {
    let done = 0
    const total = initial ? 6 : 4
    progress(done, total)
    const step = async (request: Promise<SyncItem[]>) => {
      const rows = await request
      progress(++done, total)
      return rows
    }
    const history = { start: addDays(dates.start, -1), end: addDays(dates.end, 1) }
    const [categories, shared, tasks, records, weeks] = await Promise.all([
      initial ? step(fetchGroup(['categories'])) : [],
      initial ? step(fetchGroup(['settings', 'dayTemplates'])) : [],
      step(fetchGroup(['tasks'], dates)),
      step(fetchGroup(['records'], history)),
      step(fetchGroup(['weeklyRecords'], dates)),
    ])
    // A cached task may have moved outside this window on another device.
    const found = new Set(tasks.map(row => row.item_key))
    const cached = await db.tasks.where('date').between(dates.start, dates.end, true, true).toArray()
    const missing = cached.flatMap(task => task.syncId && !found.has(task.syncId) ? [task.syncId] : [])
    for (let i = 0; i < missing.length; i += 50) {
      tasks.push(...await fetchGroup(['tasks'], undefined, missing.slice(i, i + 50)))
    }
    await apply([...categories, ...shared, ...tasks, ...records, ...weeks])
    if (initialEvents) {
      const events = initialEvents
      initialEvents = null
      // Ignore changes already included in the initial snapshot.
      const snapshot = new Map([...categories, ...shared, ...tasks, ...records, ...weeks].map(row => [keyOf(row), row.updated_at]))
      await apply(events.filter(row => row.updated_at > (snapshot.get(keyOf(row)) ?? "")), true)
    }
    progress(++done, total)
  }

  return { load, close() {
    controller.abort()
    void supabase.removeChannel(channel)
  } }
}
