// "Add to Google Calendar" (the 31 icon): opens Google Calendar's new-event
// screen with the item filled in.
import { BASE, check, done, launch, shot, seed, isoFromToday } from './helpers.mjs'

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const tomorrowCode = DAYS[(new Date().getDay() + 1) % 7]
const cal = { plans: { title: 'Plans', children: {
  trip: { title: 'Trip, part 1', date: isoFromToday(3), context: 'Pack: bags; tickets\nCall @sara', children: { sub: { title: 'Sub', children: {} } } },
  gym: { title: 'Gym', repeat: `FREQ=WEEKLY;BYDAY=${tomorrowCode}`, children: {} },
  idea: { title: 'Idea', children: {} },
} } }
const compact = off => isoFromToday(off).replace(/-/g, '')

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
// Never actually reach Google from the tests.
await ctx.route('https://calendar.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }))
await seed(ctx, { cal }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const row = re => p.locator('.item-title', { hasText: re }).first()
const params = async re => {
  const href = await row(re).locator('.cal-add').getAttribute('href')
  const url = new URL(href)
  return { url, q: Object.fromEntries(url.searchParams) }
}

await p.goto(BASE + '/g/cal')
await p.waitForSelector('.item-title')
check('dated and repeating items get the 31 button, undated ones do not',
  (await row(/^Trip/).locator('.cal-add').count()) === 1 && (await row(/^Gym/).locator('.cal-add').count()) === 1 && (await row(/^Idea/).locator('.cal-add').count()) === 0)
await shot(p, 'calendar-button.png')

const trip = await params(/^Trip/)
check('links to Google Calendar new-event', trip.url.origin + trip.url.pathname === 'https://calendar.google.com/calendar/render' && trip.q.action === 'TEMPLATE', trip.url.href)
check('title and note filled in', trip.q.text === 'Trip, part 1' && trip.q.details === 'Pack: bags; tickets\nCall @sara', JSON.stringify(trip.q))
check('all-day on the item date', trip.q.dates === `${compact(3)}/${compact(4)}`, trip.q.dates)
check('no repeat on a one-off', trip.q.recur === undefined)

const gym = await params(/^Gym/)
check('repeating item: weekly rule', gym.q.recur === `RRULE:FREQ=WEEKLY;BYDAY=${tomorrowCode}`, gym.q.recur)
check('repeating undated item starts on its next repeat day', gym.q.dates === `${compact(1)}/${compact(2)}`, gym.q.dates)

const [popup] = await Promise.all([p.waitForEvent('popup'), row(/^Trip/).locator('.cal-add').click()])
check('click opens Google Calendar in a new tab', popup.url().startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'), popup.url())
await popup.close()
check('the app stays where it was', new URL(p.url()).pathname === '/g/cal', p.url())

// Phone: tapping doesn't open or select the item
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await phone.route('https://calendar.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }))
await seed(phone, { cal }, { 'active-depth': '3' })
const m = await phone.newPage()
m.on('pageerror', e => errors.push(e.message))
await m.goto(BASE + '/g/cal')
await m.waitForSelector('.item-title')
const [mPopup] = await Promise.all([m.waitForEvent('popup'), m.locator('.item-title', { hasText: /^Trip/ }).locator('.cal-add').tap()])
check('phone tap opens Google Calendar', mPopup.url().startsWith('https://calendar.google.com/'), mPopup.url())
await m.waitForTimeout(300)
check('phone tap does not select the item', (await m.locator('.user-highlighted').count()) === 0)
check('phone stays on the graph', new URL(m.url()).pathname === '/g/cal', m.url())

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
