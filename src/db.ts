import Dexie, { type Table } from 'dexie'
import { getTaskRange } from './utils/time'
import type {
  AppSetting,
  Category,
  DailyRecord,
  DayTemplate,
  PlannerTask,
  WeeklyRecord,
} from './types'
import {
  DEFAULT_WEEKLY_MOOD_LABELS,
  WEEKLY_HABITS_KEY,
  WEEKLY_MOOD_LABELS_KEY,
} from './plannerTypes'

class SamdoListDB extends Dexie {
  categories!: Table<Category, number>
  tasks!: Table<PlannerTask, number>
  records!: Table<DailyRecord, string>
  settings!: Table<AppSetting, string>
  dayTemplates!: Table<DayTemplate, number>
  weeklyRecords!: Table<WeeklyRecord, string>

  constructor() {
    super('SamdoListDB')

    this.version(1).stores({
      categories: '++id, name',
      tasks: '++id, date, categoryId, status',
      records: 'date',
      settings: 'key',
    })

    this.version(2).stores({
      categories: '++id,name',
      tasks: '++id,date,categoryId,status,createdAt',
      records: 'date',
      settings: 'key',
      dayTemplates: '++id,&name,updatedAt',
    })

    this.version(3).stores({
      categories: '++id,name',
      tasks: '++id,date,categoryId,status,createdAt',
      records: 'date',
      settings: 'key',
      dayTemplates: '++id,&name,updatedAt',
      weeklyRecords: 'weekStart',
    })

    this.version(4)
      .stores({
        categories: '++id,name',
        tasks: '++id,date,categoryId,status,createdAt',
        records: 'date',
        settings: 'key',
        dayTemplates: '++id,&name,updatedAt',
        weeklyRecords: 'weekStart',
      })
      .upgrade(async (transaction) => {
        const tasks =
          (await transaction.table('tasks').toArray()) as PlannerTask[]

        const dayStartSetting =
          (await transaction
            .table('settings')
            .get('dayStart')) as AppSetting | undefined

        const dayStart = dayStartSetting?.value ?? '08:00'
        const groups = new Map<string, PlannerTask[]>()

        for (const task of tasks) {
          const key = `${task.date}__${task.categoryId}`
          const group = groups.get(key) ?? []
          group.push(task)
          groups.set(key, group)
        }

        function compareLegacyTasks(
          a: PlannerTask,
          b: PlannerTask,
        ) {
          const aHasRange = Boolean(a.startTime && a.endTime)
          const bHasRange = Boolean(b.startTime && b.endTime)

          if (aHasRange !== bHasRange) {
            return aHasRange ? -1 : 1
          }

          if (aHasRange && bHasRange) {
            const aStart = getTaskRange(
              a.startTime!,
              a.endTime!,
              dayStart,
            ).startOffset

            const bStart = getTaskRange(
              b.startTime!,
              b.endTime!,
              dayStart,
            ).startOffset

            if (aStart !== bStart) return aStart - bStart
          }

          if (a.createdAt !== b.createdAt) {
            return a.createdAt - b.createdAt
          }

          return (
            (a.id ?? Number.MAX_SAFE_INTEGER) -
            (b.id ?? Number.MAX_SAFE_INTEGER)
          )
        }

        for (const group of groups.values()) {
          group.sort(compareLegacyTasks)

          for (let index = 0; index < group.length; index += 1) {
            const task = group[index]
            if (task.id === undefined) continue

            await transaction
              .table('tasks')
              .update(task.id, { order: index })
          }
        }
      })

  }
}

export const db = new SamdoListDB()

const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Study', color: '#9ec9ef' },
  { name: 'Schedule', color: '#b9a5ef' },
  { name: 'ETC', color: '#d1d5db' },
]

export async function seedInitialData() {
  await db.transaction('rw', db.categories, db.tasks, db.settings, async () => {
    const categories = await db.categories.toArray()
    const seen = new Map<string, Category>()

    for (const category of categories) {
      const key = `${category.name.trim()}__${category.color.toLowerCase()}`
      const savedCategory = seen.get(key)

      if (!savedCategory) {
        seen.set(key, category)
        continue
      }

      if (savedCategory.id && category.id) {
        await db.tasks
          .where('categoryId')
          .equals(category.id)
          .modify((task) => {
            task.categoryId = savedCategory.id!
          })

        await db.categories.delete(category.id)
      }
    }

    const latestCategories = await db.categories.toArray()

    if (latestCategories.length === 0) {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES)
    }

    const [dayStart, moodLabels, habits] = await Promise.all([
      db.settings.get('dayStart'),
      db.settings.get(WEEKLY_MOOD_LABELS_KEY),
      db.settings.get(WEEKLY_HABITS_KEY),
    ])

    if (!dayStart) {
      await db.settings.put({
        key: 'dayStart',
        value: '08:00',
      })
    }

    if (!moodLabels) {
      await db.settings.put({
        key: WEEKLY_MOOD_LABELS_KEY,
        value: JSON.stringify(DEFAULT_WEEKLY_MOOD_LABELS),
      })
    }

    if (!habits) {
      await db.settings.put({
        key: WEEKLY_HABITS_KEY,
        value: '[]',
      })
    }
  })
}