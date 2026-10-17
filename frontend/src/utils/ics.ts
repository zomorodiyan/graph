import { StructureItem } from '../api/localClient'
import { parseLocalDate } from './dates'
import { effectiveDate, parseDays, toISODate } from './recurrence'

// An item as a one-event iCalendar (.ics) file (RFC 5545) — opening it adds
// the event to the phone's or computer's calendar (Apple Calendar, Google
// Calendar, Outlook). All-day, since items carry dates without times; a
// repeating item becomes a repeating event with the same weekly rule.

// Text values escape \ ; , and newlines.
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Lines longer than 75 characters continue on the next line after a space.
function fold(line: string): string {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74))
  return parts.join('\r\n ')
}

const compact = (iso: string) => iso.replace(/-/g, '')

// The first day the event happens: the item's date — or, for a repeating
// item, its first repeat day on/after that date (from today if undated).
export function eventStartDate(item: StructureItem): string | undefined {
  if (item.repeat && parseDays(item.repeat)) {
    return effectiveDate(item, item.date ? parseLocalDate(item.date) : new Date())
  }
  return item.date
}

export function itemToIcs(item: StructureItem, now: Date = new Date()): string | null {
  const start = eventStartDate(item)
  if (!start) return null
  const next = parseLocalDate(start)
  next.setDate(next.getDate() + 1)
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Knowledge Graph//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${stamp}-${Math.random().toString(36).slice(2, 10)}@knowledge-graph`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(start)}`,
    `DTEND;VALUE=DATE:${compact(toISODate(next))}`,
    `SUMMARY:${escapeText(item.title || 'Item')}`,
    ...(item.context ? [`DESCRIPTION:${escapeText(item.context)}`] : []),
    ...(item.repeat && parseDays(item.repeat) ? [`RRULE:${item.repeat}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

// Hands the .ics to the browser — on phones this opens the calendar's
// "add event" screen, on desktop it downloads a file to open.
export function downloadIcs(item: StructureItem) {
  const ics = itemToIcs(item)
  if (!ics) return
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${(item.title || 'event').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
