import { StructureItem } from '../api/localClient'
import { parseLocalDate } from './dates'
import { effectiveDate, parseDays, toISODate } from './recurrence'

// A link to Google Calendar's "new event" screen with the item filled in:
// title, an all-day date (items have no times), the note as the
// description, and a repeating item's weekly rule. Nothing is saved until
// the user taps Save there.

// The first day the event happens: the item's date — or, for a repeating
// item, its first repeat day on/after that date (from today if undated).
export function eventStartDate(item: StructureItem): string | undefined {
  if (item.repeat && parseDays(item.repeat)) {
    return effectiveDate(item, item.date ? parseLocalDate(item.date) : new Date())
  }
  return item.date
}

export function googleCalendarUrl(item: StructureItem): string | null {
  const start = eventStartDate(item)
  if (!start) return null
  const end = parseLocalDate(start)
  end.setDate(end.getDate() + 1)  // all-day events end on the next day (exclusive)
  const compact = (iso: string) => iso.replace(/-/g, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: item.title || 'Item',
    dates: `${compact(start)}/${compact(toISODate(end))}`,
  })
  if (item.context) params.set('details', item.context)
  if (item.repeat && parseDays(item.repeat)) params.set('recur', `RRULE:${item.repeat}`)
  return `https://calendar.google.com/calendar/render?${params}`
}
