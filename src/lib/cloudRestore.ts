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
  TaskStatus,
  WeeklyRecord,
} from '../types'
import { supabase } from './supabase'

const CATEGORY_ID_SETTING_KEYS = new Set([
  CATEGORY_ORDER_KEY,
  TODO_FOLDED_CATEGORY_IDS_KEY,
  CAPTURE_HIDDEN_CATEGORY_IDS_KEY,
])

type CloudRow = {
  collection: string
  item_key: string
  data: unknown
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

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value)

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export async function restoreCloudDataToLocal() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error('로그인이 필요해.')

  const { data, error } = await supabase
    .from('sync_items')
    .select('collection, item_key, data')
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) throw error

  const rows = (data ?? []) as CloudRow[]

  if (rows.length === 0) {
    throw new Error('클라우드에 저장된 데이터가 없어.')
  }

  const categories = rows.filter(
    (row) => row.collection === 'categories',
  )

  const tasks = rows.filter(
    (row) => row.collection === 'tasks',
  )

  const records = rows.filter(
    (row) => row.collection === 'records',
  )

  const settings = rows.filter(
    (row) => row.collection === 'settings',
  )

  const templates = rows.filter(
    (row) => row.collection === 'dayTemplates',
  )

  const weeklyRecords = rows.filter(
    (row) => row.collection === 'weeklyRecords',
  )

  let skippedTasks = 0
  let skippedTemplateTasks = 0

  await db.transaction(
    'rw',
    [
        db.categories,
        db.tasks,
        db.records,
        db.settings,
        db.dayTemplates,
        db.weeklyRecords,
    ],
    async () => {
      /*
       * PC IndexedDB를 클라우드 데이터로 교체
       */
      await Promise.all([
        db.categories.clear(),
        db.tasks.clear(),
        db.records.clear(),
        db.settings.clear(),
        db.dayTemplates.clear(),
        db.weeklyRecords.clear(),
      ])

      /*
       * 1. Categories부터 생성
       *
       * Supabase syncId -> PC local categoryId
       * 매핑을 여기서 만듦.
       */
      const categoryIds = new Map<string, number>()
      const categoryIdsByName = new Map<string, number>()

      for (const row of categories) {
        const category = row.data as CloudCategory

        if (
          !category.syncId ||
          !category.name ||
          !category.color
        ) {
          continue
        }

        const localId = await db.categories.add({
          syncId: category.syncId,
          name: category.name,
          color: category.color,
        })

        categoryIds.set(category.syncId, localId)
        categoryIdsByName.set(
          category.name.trim().toLowerCase(),
          localId,
        )
      }

      /*
       * 2. Tasks
       */
      for (const row of tasks) {
        const task = row.data as CloudTask

        const categoryId = task.categorySyncId
          ? categoryIds.get(task.categorySyncId)
          : undefined

        if (categoryId === undefined) {
          skippedTasks += 1
          continue
        }

        await db.tasks.add({
          syncId: task.syncId,
          date: task.date,
          categoryId,
          title: task.title,
          startTime: task.startTime,
          endTime: task.endTime,
          memo: task.memo,
          status: task.status,
          createdAt: task.createdAt,
        })
      }

      /*
       * 3. Daily Records
       */
      for (const row of records) {
        const record = row.data as DailyRecord
        await db.records.put(record)
      }

      /*
       * 4. Settings
       */
      for (const row of settings) {
        const setting = row.data as AppSetting

        if (!CATEGORY_ID_SETTING_KEYS.has(setting.key)) {
          await db.settings.put(setting)
          continue
        }

        /*
         * Cloud의 category syncId 배열을
         * PC의 숫자 categoryId 배열로 변환.
         */
        const syncIds = parseStringArray(setting.value)

        const localIds = syncIds.flatMap((syncId) => {
          const localId = categoryIds.get(syncId)
          return localId === undefined ? [] : [localId]
        })

        await db.settings.put({
          key: setting.key,
          value: JSON.stringify(localIds),
        })
      }

      /*
       * 5. Day Templates
       */
      for (const row of templates) {
        const template = row.data as CloudTemplate

        const restoredTasks: DayTemplateTask[] =
          template.tasks.flatMap((task) => {
            const categoryId =
              (task.categorySyncId
                ? categoryIds.get(task.categorySyncId)
                : undefined) ??
              categoryIdsByName.get(
                task.categoryName.trim().toLowerCase(),
              )

            if (categoryId === undefined) {
              skippedTemplateTasks += 1
              return []
            }

            return [
              {
                categoryId,
                categoryName: task.categoryName,
                title: task.title,
                startTime: task.startTime,
                endTime: task.endTime,
                memo: task.memo,
              },
            ]
          })

        const restoredTemplate: DayTemplate = {
          syncId: template.syncId,
          name: template.name,
          wakeTime: template.wakeTime,
          sleepTime: template.sleepTime,
          memo: template.memo,
          tasks: restoredTasks,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        }

        await db.dayTemplates.add(restoredTemplate)
      }

      /*
       * 6. Weekly Records
       */
      for (const row of weeklyRecords) {
        const record = row.data as WeeklyRecord
        await db.weeklyRecords.put(record)
      }
    },
  )

  return {
    total: rows.length,
    categories: categories.length,
    tasks: tasks.length,
    records: records.length,
    settings: settings.length,
    templates: templates.length,
    weeklyRecords: weeklyRecords.length,
    skippedTasks,
    skippedTemplateTasks,
  }
}