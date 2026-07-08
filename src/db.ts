import Dexie, { type Table } from 'dexie'
import type { AppSetting, Category, DailyRecord, PlannerTask } from './types'

class SamdoListDB extends Dexie {
  categories!: Table<Category, number>
  tasks!: Table<PlannerTask, number>
  records!: Table<DailyRecord, string>
  settings!: Table<AppSetting, string>

  constructor() {
    super('SamdoListDB')

    this.version(1).stores({
      categories: '++id, name',
      tasks: '++id, date, categoryId, status',
      records: 'date',
      settings: 'key',
    })
  }
}

export const db = new SamdoListDB()

export async function seedInitialData() {
  const categoryCount = await db.categories.count()

  if (categoryCount === 0) {
    await db.categories.bulkAdd([
      { name: 'TOEIC', color: '#b7e4a8' },
      { name: '코딩 공부', color: '#9ec9ef' },
      { name: 'Samcha', color: '#ef9fb7' },
      { name: '일정', color: '#b9a5ef' },
      { name: 'ETC', color: '#d1d5db' },
    ])
  }

  const dayStart = await db.settings.get('dayStart')

  if (!dayStart) {
    await db.settings.put({
      key: 'dayStart',
      value: '08:00',
    })
  }
}