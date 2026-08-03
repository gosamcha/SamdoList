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

export type DayTemplateTask = {
  categoryId: number
  categoryName: string
  title: string
  startTime?: string
  endTime?: string
  memo?: string
}

export type DayTemplate = {
  id?: number
  name: string

  wakeTime?: string
  sleepTime?: string

  // DailyRecord에 memo가 실제로 존재할 때 사용
  memo?: string

  tasks: DayTemplateTask[]

  createdAt: number
  updatedAt: number
}