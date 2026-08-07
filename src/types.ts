export type TaskStatus = 'todo' | 'done' | 'partial'
export type HabitStatus = TaskStatus
export type MoodLevel = 0 | 1 | 2 | 3

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
  memo?: string
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
  memo?: string
  tasks: DayTemplateTask[]
  createdAt: number
  updatedAt: number
}

export type HabitDefinition = {
  id: string
  name: string
}

export interface WeeklyRecord {
  weekStart: string
  memo?: string
  moods?: MoodLevel[]
  habitStatuses?: Record<string, HabitStatus[]>
}