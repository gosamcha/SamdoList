import { db } from '../db'
import {
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
} from '../plannerTypes'
import { supabase } from './supabase'

function createSyncId() {
  return crypto.randomUUID()
}

const CATEGORY_ID_SETTING_KEYS = new Set([
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
])

function parseNumberArray(value: string) {
  try {
    const parsed = JSON.parse(value)

    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => typeof item === 'number')
      : []
  } catch {
    return []
  }
}

export async function uploadExistingDataToCloud() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error('로그인이 필요해.')

  /*
   * 로컬 숫자 ID를 사용하는 데이터에 syncId 부여
   */
  await db.transaction(
    'rw',
    db.categories,
    db.tasks,
    db.dayTemplates,
    async () => {
      const categories = await db.categories.toArray()

      for (const category of categories) {
        if (category.id === undefined || category.syncId) continue

        await db.categories.update(category.id, {
          syncId: createSyncId(),
        })
      }

      const tasks = await db.tasks.toArray()

      for (const task of tasks) {
        if (task.id === undefined || task.syncId) continue

        await db.tasks.update(task.id, {
          syncId: createSyncId(),
        })
      }

      const templates = await db.dayTemplates.toArray()

      for (const template of templates) {
        if (template.id === undefined || template.syncId) continue

        await db.dayTemplates.update(template.id, {
          syncId: createSyncId(),
        })
      }
    },
  )

  const [
    categories,
    tasks,
    records,
    settings,
    dayTemplates,
    weeklyRecords,
  ] = await Promise.all([
    db.categories.toArray(),
    db.tasks.toArray(),
    db.records.toArray(),
    db.settings.toArray(),
    db.dayTemplates.toArray(),
    db.weeklyRecords.toArray(),
  ])

  /*
   * 아이폰 local categoryId -> 공통 syncId
   */
  const categorySyncIds = new Map<number, string>()

  for (const category of categories) {
    if (category.id !== undefined && category.syncId) {
      categorySyncIds.set(category.id, category.syncId)
    }
  }

  const now = new Date().toISOString()

  const rows = [
    /*
     * Categories
     */
    ...categories
      .filter((category) => category.syncId)
      .map((category) => ({
        user_id: user.id,
        collection: 'categories',
        item_key: category.syncId!,
        data: {
          syncId: category.syncId,
          name: category.name,
          color: category.color,
        },
        updated_at: now,
        deleted_at: null,
      })),

    /*
     * Tasks
     */
    ...tasks
      .filter((task) => task.syncId)
      .map((task) => ({
        user_id: user.id,
        collection: 'tasks',
        item_key: task.syncId!,
        data: {
          syncId: task.syncId,
          date: task.date,
          categorySyncId: categorySyncIds.get(task.categoryId),
          title: task.title,
          startTime: task.startTime,
          endTime: task.endTime,
          memo: task.memo,
          status: task.status,
          createdAt: task.createdAt,
        },
        updated_at: now,
        deleted_at: null,
      })),

    /*
     * Daily Records
     */
    ...records.map((record) => ({
      user_id: user.id,
      collection: 'records',
      item_key: record.date,
      data: record,
      updated_at: now,
      deleted_at: null,
    })),

    /*
     * Settings

     * category.order
     * todo.foldedCategoryIds
     * capture.hiddenCategoryIds
     *
     * 이 세 개만 local categoryId -> syncId로 바꿔서 저장함.
     */
    ...settings.map((setting) => {
      if (!CATEGORY_ID_SETTING_KEYS.has(setting.key)) {
        return {
          user_id: user.id,
          collection: 'settings',
          item_key: setting.key,
          data: setting,
          updated_at: now,
          deleted_at: null,
        }
      }

      const localIds = parseNumberArray(setting.value)

      const syncIds = localIds.flatMap((localId) => {
        const syncId = categorySyncIds.get(localId)
        return syncId ? [syncId] : []
      })

      return {
        user_id: user.id,
        collection: 'settings',
        item_key: setting.key,
        data: {
          key: setting.key,
          value: JSON.stringify(syncIds),
        },
        updated_at: now,
        deleted_at: null,
      }
    }),

    /*
     * Day Templates

     * 템플릿 안 task도 categorySyncId를 같이 저장함.
     */
    ...dayTemplates
      .filter((template) => template.syncId)
      .map((template) => ({
        user_id: user.id,
        collection: 'dayTemplates',
        item_key: template.syncId!,
        data: {
          syncId: template.syncId,
          name: template.name,
          wakeTime: template.wakeTime,
          sleepTime: template.sleepTime,
          memo: template.memo,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,

          tasks: template.tasks.map((task) => ({
            categorySyncId: categorySyncIds.get(task.categoryId),
            categoryName: task.categoryName,
            title: task.title,
            startTime: task.startTime,
            endTime: task.endTime,
            memo: task.memo,
          })),
        },
        updated_at: now,
        deleted_at: null,
      })),

    /*
     * Weekly Records
     */
    ...weeklyRecords.map((record) => ({
      user_id: user.id,
      collection: 'weeklyRecords',
      item_key: record.weekStart,
      data: record,
      updated_at: now,
      deleted_at: null,
    })),
  ]

  if (rows.length === 0) {
    throw new Error('업로드할 로컬 데이터가 없어.')
  }

  /*
   * 현재 아이폰 데이터를 최초 원본으로 삼으므로
   * 기존 클라우드 데이터를 지우고 다시 작성함.
   */
  const { error: deleteError } = await supabase
    .from('sync_items')
    .delete()
    .eq('user_id', user.id)

  if (deleteError) throw deleteError

  const { error: uploadError } = await supabase
    .from('sync_items')
    .insert(rows)

  if (uploadError) throw uploadError

  return {
    total: rows.length,
    categories: categories.length,
    tasks: tasks.length,
    records: records.length,
    settings: settings.length,
    dayTemplates: dayTemplates.length,
    weeklyRecords: weeklyRecords.length,
  }
}