export type TaskStatus = 'todo' | 'done' | 'partial'

export interface Category {
  id?: number
  name: string
  color: string
}

export interface PlannerTask {
  id?: number
  date: string
  categoryId: number
  title: string
  startTime?: string
  endTime?: string
  memo?: string // 간단 메모
  status: TaskStatus
  createdAt: number
}

export interface DailyRecord {
  date: string
  wakeTime?: string
  sleepTime?: string

  memo?: string
}

export interface AppSetting {
  key: string
  value: string
}