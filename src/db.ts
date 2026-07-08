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


const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Study', color: '#9ec9ef' },
  { name: 'Schedule', color: '#b9a5ef' },
  { name: 'ETC', color: '#d1d5db' }
]

export async function seedInitialData() {
  // React 개발 모드에서 seedInitialData가 2번 실행돼도
  // 기본 카테고리가 중복 생성되지 않도록 transaction으로 묶음
  await db.transaction('rw', db.categories, db.tasks, db.settings, async () => {
    const categories = await db.categories.toArray()

    // 이미 생긴 중복 카테고리 정리
    // 같은 이름 + 같은 색이면 중복으로 판단함
    const seen = new Map<string, Category>()

    for (const category of categories) {
      const key = `${category.name.trim()}__${category.color.toLowerCase()}`
      const savedCategory = seen.get(key)

      if (!savedCategory) {
        seen.set(key, category)
        continue
      }

      // 중복 카테고리에 연결된 기존 투두가 있다면
      // 첫 번째 카테고리로 categoryId를 옮겨줌
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

    // 카테고리가 아예 없을 때만 기본 카테고리 추가
    if (latestCategories.length === 0) {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES)
    }

    const dayStart = await db.settings.get('dayStart')

    // 하루 시작 시간 기본값
    if (!dayStart) {
      await db.settings.put({
        key: 'dayStart',
        value: '08:00',
      })
    }
  })
}