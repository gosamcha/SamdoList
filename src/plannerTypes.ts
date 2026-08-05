import type { DailyRecord } from './types'

export type RecordSet = {
  prev?: DailyRecord
  current?: DailyRecord
  next?: DailyRecord
}

export type ThemeColors = {
  primaryBg: string
  primaryText: string
  statusTodo: string
  statusDone: string
  statusPartial: string
}

export const DEFAULT_THEME: ThemeColors = {
  primaryBg: '#bdbbf0',
  primaryText: '#ffffff',
  statusTodo: '#a3a3a3',
  statusDone: '#918deb',
  statusPartial: '#525252',
}

export const THEME_SETTING_KEYS = {
  primaryBg: 'theme.primaryBg',
  primaryText: 'theme.primaryText',
  statusTodo: 'theme.statusTodo',
  statusDone: 'theme.statusDone',
  statusPartial: 'theme.statusPartial',
} as const

export const PROFILE_IMAGE_KEY = 'profile.image'
export const CATEGORY_ORDER_KEY = 'category.order'
export const TODO_FOLDED_CATEGORY_IDS_KEY = 'todo.foldedCategoryIds'
export const CAPTURE_TIME_LABELS_KEY = 'capture.showTimeLabels'
export const CAPTURE_HIDDEN_CATEGORY_IDS_KEY = 'capture.hiddenCategoryIds'

export const WEEKLY_MOOD_LABELS_KEY = 'weekly.moodLabels'
export const WEEKLY_HABITS_KEY = 'weekly.habits'

export const DEFAULT_WEEKLY_MOOD_LABELS = [
  'Good',
  'Calm',
  'Tired',
  'Sad',
] as const

export const DEFAULT_WEEKLY_MOOD_LEVEL = 1
export const MAX_WEEKLY_HABITS = 4