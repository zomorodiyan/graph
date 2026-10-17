import { parseLocalDate } from './dates'

// Repeating items repeat weekly on chosen days of the week — nothing more.
// Stored as the matching iCalendar RRULE, "FREQ=WEEKLY;BYDAY=MO,WE,FR" (the
// format Google Calendar uses), so it can pass straight through to it. The
// item's date, if it has one, is when the repeating starts; without one it
// repeats from today on.

// Indexed like Date.getDay() (Sunday = 0).
export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The weekdays of a repeat rule, Sunday-first, or null for anything that
// isn't a plain weekly-on-these-days rule.
export function parseDays(rule: string): string[] | null {
  const m = rule.trim().replace(/^RRULE:/, '').match(/^FREQ=WEEKLY;BYDAY=([A-Z,]+)$/)
  if (!m) return null
  const days = m[1].split(',')
  if (!days.every(d => WEEKDAYS.includes(d)) || new Set(days).size !== days.length) return null
  return WEEKDAYS.filter(d => days.includes(d))
}

// '' (no repeat) when no days are picked.
export function formatDays(days: string[]): string {
  const sorted = WEEKDAYS.filter(d => days.includes(d))
  return sorted.length ? `FREQ=WEEKLY;BYDAY=${sorted.join(',')}` : ''
}

// The date that matters right now for a (possibly repeating) item — its
// next repeat day from today (or from its start date, if that's later).
// Drives the date badge, the agenda strip and the date auto tags.
export function effectiveDate(item: { date?: string; repeat?: string }, today: Date = new Date()): string | undefined {
  const days = item.repeat ? parseDays(item.repeat) : null
  if (!days) return item.date
  let d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (item.date) {
    const start = parseLocalDate(item.date)
    if (start > d) d = start
  }
  while (!days.includes(WEEKDAYS[d.getDay()])) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return toISODate(d)
}

// "Every Monday, Wednesday", "Every weekday", "Every day".
export function describeRepeat(item: { repeat?: string }): string | undefined {
  const days = item.repeat ? parseDays(item.repeat) : null
  if (!days) return undefined
  if (days.length === 7) return 'Every day'
  if (days.join() === 'MO,TU,WE,TH,FR') return 'Every weekday'
  if (days.join() === 'SU,SA') return 'Every weekend'
  return 'Every ' + days.map(d => DAY_NAMES[WEEKDAYS.indexOf(d)]).join(', ')
}
