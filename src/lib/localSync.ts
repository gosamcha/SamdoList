import { db } from '../db'
import {
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
} from '../plannerTypes'
import type {
  AppSetting,
} from '../types'
import { supabase } from './supabase'
import { isApplyingRemoteChange } from './realtimeSync'

const CATEGORY_ID_SETTING_KEYS = new Set([
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
])

let hooksInstalled = false

function createSyncId() {
  return crypto.randomUUID()
}

/*
 * Dexie 변경이 완전히 끝난 다음
 * Supabase 업로드를 실행하기 위한 간단한 예약 함수.
 */
function scheduleSync(callback: () => Promise<void>) {
  setTimeout(() => {
    void callback().catch((error) => {
      console.error('Cloud sync failed:', error)
    })
  }, 0)
}

async function getUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user.id) {
    throw new Error('로그인된 사용자가 없어.')
  }

  return session.user.id
}

async function upsertCloudItem(
  collection: string,
  itemKey: string,
  data: unknown,
) {
  const userId = await getUserId()

  const { error } = await supabase
    .from('sync_items')
    .upsert(
      {
        user_id: userId,
        collection,
        item_key: itemKey,
        data,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        onConflict: 'user_id,collection,item_key',
      },
    )

  if (error) throw error
}

async function softDeleteCloudItem(
  collection: string,
  itemKey: string,
) {
  const userId = await getUserId()

  const { error } = await supabase
    .from('sync_items')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('collection', collection)
    .eq('item_key', itemKey)

  if (error) throw error
}

/*
 * 현재 기기의 숫자 categoryId
 * ->
 * 모든 기기에서 공통으로 쓰는 category syncId
 */
async function getCategorySyncId(
  categoryId: number,
): Promise<string | undefined> {
  const category = await db.categories.get(categoryId)

  return category?.syncId
}

function parseNumberArray(value: string) {
  try {
    const parsed = JSON.parse(value)

    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is number => typeof item === 'number',
        )
      : []
  } catch {
    return []
  }
}

/*
 * CATEGORY
 */
async function pushCategory(syncId: string) {
  const category = await db.categories
    .filter((item) => item.syncId === syncId)
    .first()

  if (!category) return

  await upsertCloudItem(
    'categories',
    syncId,
    {
      syncId,
      name: category.name,
      color: category.color,
    },
  )
}

/*
 * TASK
 */
async function pushTask(syncId: string) {
  const task = await db.tasks
    .filter((item) => item.syncId === syncId)
    .first()

  if (!task) return

  const categorySyncId = await getCategorySyncId(
    task.categoryId,
  )

  if (!categorySyncId) {
    console.warn(
      'Todo의 categorySyncId를 찾지 못했어.',
      task,
    )
    return
  }

  await upsertCloudItem(
    'tasks',
    syncId,
    {
      syncId,
      date: task.date,
      categorySyncId,
      title: task.title,
      startTime: task.startTime,
      endTime: task.endTime,
      memo: task.memo,
      status: task.status,
      createdAt: task.createdAt,
    },
  )
}

/*
 * DAILY RECORD
 */
async function pushRecord(date: string) {
  const record = await db.records.get(date)

  if (!record) return

  await upsertCloudItem(
    'records',
    date,
    record,
  )
}

/*
 * SETTING
 */
async function pushSetting(key: string) {
  const setting = await db.settings.get(key)

  if (!setting) return

  /*
   * 일반 설정은 그대로 저장.
   *
   * 테마, DayStart, Weekly 설정 등은
   * 여기에 해당함.
   */
  if (!CATEGORY_ID_SETTING_KEYS.has(key)) {
    await upsertCloudItem(
      'settings',
      key,
      setting,
    )

    return
  }

  /*
   * 카테고리 ID를 저장하는 설정은
   * local categoryId -> syncId로 변환.
   */
  const categoryIds = parseNumberArray(
    setting.value,
  )

  const syncIds: string[] = []

  for (const categoryId of categoryIds) {
    const syncId = await getCategorySyncId(
      categoryId,
    )

    if (syncId) {
      syncIds.push(syncId)
    }
  }

  const cloudSetting: AppSetting = {
    key,
    value: JSON.stringify(syncIds),
  }

  await upsertCloudItem(
    'settings',
    key,
    cloudSetting,
  )
}

/*
 * DAY TEMPLATE
 */
async function pushDayTemplate(syncId: string) {
  const template = await db.dayTemplates
    .filter((item) => item.syncId === syncId)
    .first()

  if (!template) return

  const cloudTasks = []

  for (const task of template.tasks) {
    const categorySyncId =
      await getCategorySyncId(task.categoryId)

    cloudTasks.push({
      categorySyncId,
      categoryName: task.categoryName,
      title: task.title,
      startTime: task.startTime,
      endTime: task.endTime,
      memo: task.memo,
    })
  }

  await upsertCloudItem(
    'dayTemplates',
    syncId,
    {
      syncId,
      name: template.name,
      wakeTime: template.wakeTime,
      sleepTime: template.sleepTime,
      memo: template.memo,
      tasks: cloudTasks,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    },
  )
}

/*
 * WEEKLY RECORD
 */
async function pushWeeklyRecord(
  weekStart: string,
) {
  const record =
    await db.weeklyRecords.get(weekStart)

  if (!record) return

  await upsertCloudItem(
    'weeklyRecords',
    weekStart,
    record,
  )
}

/*
 * Dexie hook 설치
 */
export function startLocalChangeSync() {
  /*
   * React가 다시 렌더링되더라도
   * hook이 중복 등록되지 않도록 함.
   */
  if (hooksInstalled) return

  hooksInstalled = true

  /*
   * =============================
   * CATEGORIES
   * =============================
   */

  db.categories.hook(
    'creating',
    (_primaryKey, category) => {
      if (!category.syncId) {
        category.syncId = createSyncId()
      }

      if (isApplyingRemoteChange()) return

      const syncId = category.syncId

      scheduleSync(() =>
        pushCategory(syncId),
      )
    },
  )

  db.categories.hook(
    'updating',
    (_modifications, _primaryKey, category) => {
      if (isApplyingRemoteChange()) return

      if (!category.syncId) {
        const syncId = createSyncId()

        scheduleSync(() =>
          pushCategory(syncId),
        )

        return {
          syncId,
        }
      }

      scheduleSync(() =>
        pushCategory(category.syncId!),
      )
    },
  )

  db.categories.hook(
    'deleting',
    (_primaryKey, category) => {
      if (isApplyingRemoteChange()) return
      if (!category.syncId) return

      scheduleSync(() =>
        softDeleteCloudItem(
          'categories',
          category.syncId!,
        ),
      )
    },
  )

  /*
   * =============================
   * TASKS
   * =============================
   */

  db.tasks.hook(
    'creating',
    (_primaryKey, task) => {
      if (!task.syncId) {
        task.syncId = createSyncId()
      }

      if (isApplyingRemoteChange()) return

      const syncId = task.syncId

      scheduleSync(() =>
        pushTask(syncId),
      )
    },
  )

  db.tasks.hook(
    'updating',
    (_modifications, _primaryKey, task) => {
      if (isApplyingRemoteChange()) return

      if (!task.syncId) {
        const syncId = createSyncId()

        scheduleSync(() =>
          pushTask(syncId),
        )

        return {
          syncId,
        }
      }

      scheduleSync(() =>
        pushTask(task.syncId!),
      )
    },
  )

  db.tasks.hook(
    'deleting',
    (_primaryKey, task) => {
      if (isApplyingRemoteChange()) return
      if (!task.syncId) return

      scheduleSync(() =>
        softDeleteCloudItem(
          'tasks',
          task.syncId!,
        ),
      )
    },
  )

  /*
   * =============================
   * DAILY RECORDS
   * =============================
   */

  db.records.hook(
    'creating',
    (_primaryKey, record) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        pushRecord(record.date),
      )
    },
  )

  db.records.hook(
    'updating',
    (_modifications, primaryKey) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        pushRecord(String(primaryKey)),
      )
    },
  )

  db.records.hook(
    'deleting',
    (primaryKey) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        softDeleteCloudItem(
          'records',
          String(primaryKey),
        ),
      )
    },
  )

  /*
   * =============================
   * SETTINGS
   * =============================
   */

  db.settings.hook(
    'creating',
    (_primaryKey, setting) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        pushSetting(setting.key),
      )
    },
  )

  db.settings.hook(
    'updating',
    (_modifications, primaryKey) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        pushSetting(String(primaryKey)),
      )
    },
  )

  db.settings.hook(
    'deleting',
    (primaryKey) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        softDeleteCloudItem(
          'settings',
          String(primaryKey),
        ),
      )
    },
  )

  /*
   * =============================
   * DAY TEMPLATES
   * =============================
   */

  db.dayTemplates.hook(
    'creating',
    (_primaryKey, template) => {
      if (!template.syncId) {
        template.syncId = createSyncId()
      }

      if (isApplyingRemoteChange()) return

      const syncId = template.syncId

      scheduleSync(() =>
        pushDayTemplate(syncId),
      )
    },
  )

  db.dayTemplates.hook(
    'updating',
    (_modifications, _primaryKey, template) => {
      if (isApplyingRemoteChange()) return

      if (!template.syncId) {
        const syncId = createSyncId()

        scheduleSync(() =>
          pushDayTemplate(syncId),
        )

        return {
          syncId,
        }
      }

      scheduleSync(() =>
        pushDayTemplate(template.syncId!),
      )
    },
  )

  db.dayTemplates.hook(
    'deleting',
    (_primaryKey, template) => {
      if (isApplyingRemoteChange()) return
      if (!template.syncId) return

      scheduleSync(() =>
        softDeleteCloudItem(
          'dayTemplates',
          template.syncId!,
        ),
      )
    },
  )

  /*
   * =============================
   * WEEKLY RECORDS
   * =============================
   */

  db.weeklyRecords.hook(
    'creating',
    (_primaryKey, record) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        pushWeeklyRecord(record.weekStart),
      )
    },
  )

  db.weeklyRecords.hook(
    'updating',
    (_modifications, primaryKey) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        pushWeeklyRecord(String(primaryKey)),
      )
    },
  )

  db.weeklyRecords.hook(
    'deleting',
    (primaryKey) => {
      if (isApplyingRemoteChange()) return

      scheduleSync(() =>
        softDeleteCloudItem(
          'weeklyRecords',
          String(primaryKey),
        ),
      )
    },
  )

  console.log('SamdoList local sync hooks installed')
}