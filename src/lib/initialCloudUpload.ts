import { db } from '../db'
import { supabase } from './supabase'

function createSyncId() {
  return crypto.randomUUID()
}

export async function uploadExistingDataToCloud() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    throw new Error('로그인이 필요해.')
  }

  // 이미 클라우드 데이터가 있다면 실수로 덮어쓰는 것을 방지함.
  const { data: existingItems, error: existingError } = await supabase
    .from('sync_items')
    .select('id')
    .limit(1)

  if (existingError) {
    throw existingError
  }

  if (existingItems && existingItems.length > 0) {
    throw new Error(
      'Supabase에 이미 데이터가 있어. 최초 업로드는 한 번만 실행할 수 있어.',
    )
  }

  /*
   * 1. 기존 IndexedDB 데이터에 syncId 부여
   */

  await db.transaction(
    'rw',
    db.categories,
    db.tasks,
    db.dayTemplates,
    async () => {
      const categories = await db.categories.toArray()

      for (const category of categories) {
        if (category.id === undefined) continue
        if (category.syncId) continue

        await db.categories.update(category.id, {
          syncId: createSyncId(),
        })
      }

      const tasks = await db.tasks.toArray()

      for (const task of tasks) {
        if (task.id === undefined) continue
        if (task.syncId) continue

        await db.tasks.update(task.id, {
          syncId: createSyncId(),
        })
      }

      const templates = await db.dayTemplates.toArray()

      for (const template of templates) {
        if (template.id === undefined) continue
        if (template.syncId) continue

        await db.dayTemplates.update(template.id, {
          syncId: createSyncId(),
        })
      }
    },
  )

  /*
   * syncId를 적용한 최신 데이터를 다시 읽음.
   */

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
   * 카테고리의 로컬 ID → syncId 변환표
   */

  const categorySyncIds = new Map<number, string>()

  for (const category of categories) {
    if (category.id !== undefined && category.syncId) {
      categorySyncIds.set(category.id, category.syncId)
    }
  }

  const now = new Date().toISOString()

  /*
   * Supabase sync_items에 들어갈 행 생성
   */

  const rows = [
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

    ...tasks
      .filter((task) => task.syncId)
      .map((task) => ({
        user_id: user.id,
        collection: 'tasks',
        item_key: task.syncId!,
        data: {
          syncId: task.syncId,
          date: task.date,

          // 다른 기기에서는 categoryId 숫자가 달라질 수 있으므로
          // 카테고리의 syncId도 같이 저장함.
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

    ...records.map((record) => ({
      user_id: user.id,
      collection: 'records',
      item_key: record.date,
      data: record,
      updated_at: now,
      deleted_at: null,
    })),

    ...settings.map((setting) => ({
      user_id: user.id,
      collection: 'settings',
      item_key: setting.key,
      data: setting,
      updated_at: now,
      deleted_at: null,
    })),

    ...dayTemplates
      .filter((template) => template.syncId)
      .map((template) => ({
        user_id: user.id,
        collection: 'dayTemplates',
        item_key: template.syncId!,
        data: {
          ...template,

          // IndexedDB의 숫자 PK는 클라우드 데이터로 사용하지 않음.
          id: undefined,
        },
        updated_at: now,
        deleted_at: null,
      })),

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

  const { error: uploadError } = await supabase
    .from('sync_items')
    .upsert(rows, {
      onConflict: 'user_id,collection,item_key',
    })

  if (uploadError) {
    throw uploadError
  }

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