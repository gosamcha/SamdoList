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
let applyingRemoteChange = false

export function isApplyingRemoteChange() {
  return applyingRemoteChange
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
    .filter((category) => category.syncId === syncId)
    .first()
}

async function findTaskBySyncId(syncId: string) {
  return db.tasks
    .filter((task) => task.syncId === syncId)
    .first()
}

async function findTemplateBySyncId(syncId: string) {
  return db.dayTemplates
    .filter((template) => template.syncId === syncId)
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

      const localTask: Omit<PlannerTask, 'id'> = {
        syncId: row.item_key,
        date: task.date,
        categoryId: category.id,
        title: task.title,
        startTime: task.startTime,
        endTime: task.endTime,
        memo: task.memo,
        status: task.status,
        createdAt: task.createdAt,
      }

      const existing = await findTaskBySyncId(row.item_key)

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

/*
 * 실시간 구독 시작
 */
export function startRealtimeSync(userId: string) {
  const channel = supabase
    .channel(`samdolist-sync-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_items',
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        /*
         * 우리는 실제 DELETE 대신 deleted_at을 사용하는 방식이므로
         * INSERT / UPDATE의 new 데이터를 주로 사용함.
         */
        if (
          payload.eventType !== 'INSERT' &&
          payload.eventType !== 'UPDATE'
        ) {
          return
        }

        const row = payload.new as unknown as SyncItem

        try {
          applyingRemoteChange = true

          await applyCloudItem(row)
        } catch (error) {
          console.error(
            'Realtime 데이터를 로컬에 반영하지 못했어.',
            error,
          )
        } finally {
          applyingRemoteChange = false
        }
      },
    )
    .subscribe((status) => {
      console.log('SamdoList realtime:', status)
    })

  return () => {
    void supabase.removeChannel(channel)
  }
}