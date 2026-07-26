// A plain "YYYY-MM-DD" string is parsed as UTC midnight by `new Date(str)`,
// per the JS spec — in any timezone behind UTC that lands on the *previous*
// calendar day locally (e.g. UTC-5: UTC midnight on the 26th is 7pm on the
// 25th locally). Comparing that against a locally-built "today" then reads
// as a day earlier than it should. Splitting the string and constructing
// the Date from local year/month/day components avoids the UTC step
// entirely, so it's always the calendar day the string actually names.
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Whole calendar days from `today` to `dateStr` (negative if in the past),
// both compared at local midnight.
export function daysUntil(dateStr: string, today: Date = new Date()): number {
  const t0 = new Date(today)
  t0.setHours(0, 0, 0, 0)
  const due = parseLocalDate(dateStr)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24))
}
