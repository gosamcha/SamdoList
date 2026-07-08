export const DAY_MINUTES = 1440

export function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function formatDateLocal(date = new Date()) {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())

  return `${year}-${month}-${day}`
}

export function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() + amount)

  return formatDateLocal(date)
}

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export function minutesToTimeLabel(totalMinutes: number) {
  const normalized = ((totalMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60

  return `${pad2(hour)}:${pad2(minute)}`
}

export function getTaskRange(startTime: string, endTime: string, dayStart: string) {
  const dayStartMinutes = timeToMinutes(dayStart)

  let startOffset = timeToMinutes(startTime) - dayStartMinutes
  if (startOffset < 0) startOffset += DAY_MINUTES

  let endOffset = timeToMinutes(endTime) - dayStartMinutes
  if (endOffset <= startOffset) endOffset += DAY_MINUTES

  return {
    startOffset,
    endOffset,
    duration: endOffset - startOffset,
  }
}

export function localDateAt(dateString: string, time: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export function sleepStartDateTime(dateString: string, sleepTime: string, dayStart: string) {
  const date = localDateAt(dateString, sleepTime)

  if (timeToMinutes(sleepTime) < timeToMinutes(dayStart)) {
    date.setDate(date.getDate() + 1)
  }

  return date
}