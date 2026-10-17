// "Add to calendar" (the 31 icon): downloads an .ics for the item.
import { readFileSync } from 'node:fs'
import { BASE, check, done, launch, shot, seed, isoFromToday } from './helpers.mjs'

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const tomorrowCode = DAYS[(new Date().getDay() + 1) % 7]
const cal = { plans: { title: 'Plans', children: {
  trip: { title: 'Trip, part 1', date: isoFromToday(3), context: 'Pack: bags; tickets\nCall @sara', children: { sub: { title: 'Sub', children: {} } } },
  gym: { title: 'Gym', repeat: `FREQ=WEEKLY;BYDAY=${tomorrowCode}`, children: {} },
  idea: { title: 'Idea', children: {} },
} } }

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true })
await seed(ctx, { cal }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const row = re => p.locator('.item-title', { hasText: re }).first()

await p.goto(BASE + '/g/cal')
await p.waitForSelector('.item-title')
check('dated and repeating items get the 31 button, undated ones do not',
  (await row(/^Trip/).locator('.cal-add').count()) === 1 && (await row(/^Gym/).locator('.cal-add').count()) === 1 && (await row(/^Idea/).locator('.cal-add').count()) === 0)
await shot(p, 'calendar-button.png')

const download = async (re) => {
  const [dl] = await Promise.all([p.waitForEvent('download'), row(re).locator('.cal-add').click()])
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') }
}

const trip = await download(/^Trip/)
const tripLines = trip.text.split('\r\n')
check('file name from the title', trip.name === 'Trip-part-1.ics', trip.name)
check('all-day event on the item date', tripLines.includes(`DTSTART;VALUE=DATE:${isoFromToday(3).replace(/-/g, '')}`) && tripLines.includes(`DTEND;VALUE=DATE:${isoFromToday(4).replace(/-/g, '')}`), trip.text)
check('title and note escaped', tripLines.includes('SUMMARY:Trip\\, part 1') && tripLines.includes('DESCRIPTION:Pack: bags\\; tickets\\nCall @sara'), trip.text)
check('no repeat rule on a one-off', !trip.text.includes('RRULE'))
check('valid calendar wrapper', trip.text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0') && trip.text.trimEnd().endsWith('END:VCALENDAR'))
check('clicking the button does not open the item', new URL(p.url()).pathname === '/g/cal', p.url())

const gym = await download(/^Gym/)
check('repeating item: weekly rule', gym.text.includes(`RRULE:FREQ=WEEKLY;BYDAY=${tomorrowCode}`), gym.text)
check('repeating undated item starts on its next repeat day', gym.text.includes(`DTSTART;VALUE=DATE:${isoFromToday(1).replace(/-/g, '')}`), gym.text)

// Phone: tapping the button doesn't open or select the item
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true })
await seed(phone, { cal }, { 'active-depth': '3' })
const m = await phone.newPage()
m.on('pageerror', e => errors.push(e.message))
await m.goto(BASE + '/g/cal')
await m.waitForSelector('.item-title')
const [dl] = await Promise.all([m.waitForEvent('download'), m.locator('.item-title', { hasText: /^Trip/ }).locator('.cal-add').tap()])
check('phone tap gives the .ics', dl.suggestedFilename() === 'Trip-part-1.ics')
await m.waitForTimeout(300)
check('phone tap does not select the item', (await m.locator('.user-highlighted').count()) === 0)

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
