import crypto from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { PORTAL, signInWithPassword, expectSignedInto, watch } from './support/session'
import { apiAs, phDay, PLACES, type Api } from './support/api'

/**
 * The main booking journey (docs/testing/8338 Test Cases.xlsx):
 *   client books → General Manager approves → Operations assigns →
 *   driver delivers → client confirms completion.
 *
 * Screens (Playwright in the browser): GM approval (GM-001), Operations
 * assignment (OPS-001), client confirmation (CLI-042, E2E-001).
 * Through the API: creating the booking (the booking form needs a live Google
 * map; it gets its own test) and the driver's steps (the driver app is not a
 * website). Each stage is its own test, run in order; if one fails the later
 * ones are skipped and show as Blocked in the workbook.
 */
test.describe.configure({ mode: 'serial' })

const CLIENT = 'client010'
const GM = 'gm001'
const OPS = 'ops001'

let ref = ''          // BK-YYYYMM-NNNNN
let bookingId = ''
let driverTag = ''    // seed tag of the driver Operations picked, e.g. driver023
let truckId = ''      // the vehicle Operations picked
const FLEET = 'fleet001'

/** Open a booking's details on a Booking Management screen by its reference. */
async function openBooking(page: Page, portal: string) {
  await page.goto(`${portal}/booking-management?booking=${encodeURIComponent(ref)}`)
  await expect(page.getByText(ref).first()).toBeVisible({ timeout: 30_000 })
}

async function statusOf(api: Api) {
  const b = await api.get(`booking/${bookingId}`)
  return (b.booking ?? b).status as string
}

test.beforeAll(async () => {
  // The client books for tomorrow, through the same API the booking form uses.
  const client = await apiAs(CLIENT)
  const docs = await client.upload('uploads/booking-documents', 'documents', 'delivery-receipt.pdf', 'application/pdf')
  const created = await client.post('booking', {
    idempotency_key: crypto.randomUUID(),
    origin: PLACES.pickup.address,
    origin_latitude: PLACES.pickup.latitude,
    origin_longitude: PLACES.pickup.longitude,
    schedule_date: phDay(1),
    call_time: '09:00',
    transaction_documents: docs.urls,
    destinations: [{ sequence_order: 1, ...PLACES.dropoff }],
    cargo_items: [{ commodity_text: 'Bottled water', product_text: '500 ml x 24 per case', quantity: 50, weight_kg: 600, dropoff_sequence_order: 1 }],
  })
  const b = created.booking ?? created
  bookingId = b.booking_id
  ref = b.reference_number
  expect(bookingId, 'booking created').toBeTruthy()
  expect(ref).toMatch(/^BK-\d{6}-\d{5}$/)
  expect(b.status).toBe('pending')
  await client.dispose()
})

// Back in the yard, a vehicle needs its return odometer and a new BLOWBAGETS
// check before it can be assigned again. Do the Fleet Manager's part so every
// run hands the vehicle back in service (otherwise each run uses one up).
test.afterAll(async () => {
  if (!truckId) return
  const fleet = await apiAs(FLEET)
  const truck = await fleet.get(`admin/trucks/${truckId}`)
  const t = truck.truck ?? truck
  const current = Number(t.current_odometer_km ?? t.odometer_km ?? t.current_odometer ?? 0)
  const photo = await fleet.upload('admin/upload/fleet-photo', 'image', 'proof.jpg', 'image/jpeg')
  const back = await fleet.tryCall('POST', `admin/trucks/${truckId}/odometer`, { reading_km: Math.round(current) + 15, photo_url: photo.url })
  const items = Object.fromEntries(['battery', 'lights', 'oil', 'water', 'brakes', 'air', 'gas', 'engine', 'tires', 'self'].map((k) => [k, true]))
  const check = await fleet.tryCall('POST', `admin/trucks/${truckId}/inspections`, { items, notes: 'Automated test: vehicle back in the yard.' })
  console.log(`[journey] vehicle back in service: odometer ${back.status}, BLOWBAGETS ${check.status}`)
  await fleet.dispose()
})

test('GM-001 General Manager approves the new booking with remarks', async ({ page }) => {
  const problems = watch(page)
  await signInWithPassword(page, GM)
  await expectSignedInto(page, PORTAL.gm)
  await openBooking(page, PORTAL.gm)

  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const dialog = page.locator('[aria-labelledby="remarks-modal-title"]')
  await expect(dialog.getByText('Approve this booking?')).toBeVisible()
  await dialog.getByRole('textbox').fill('Documents complete; schedule confirmed with the client (automated test).')
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('Approved — sent to the Operations Manager.')).toBeVisible()

  const ops = await apiAs(OPS)
  await expect.poll(() => statusOf(ops)).toBe('approved')
  await ops.dispose()
  expect(problems.serverErrors).toEqual([])
})

test('OPS-001 Operations Manager assigns a vehicle and a driver', async ({ page }) => {
  const problems = watch(page)
  await signInWithPassword(page, OPS)
  await expectSignedInto(page, PORTAL.ops)
  await openBooking(page, PORTAL.ops)

  await page.getByRole('button', { name: 'Choose vehicle and driver' }).click()
  const picker = page.getByRole('dialog').filter({ hasText: 'Choose vehicle and driver' })
  await expect(picker).toBeVisible()

  // First vehicle that can be picked.
  await picker.locator('button[aria-pressed]:not([disabled])').first().click()
  // Picking a vehicle fills in its usual driver when they are free; otherwise
  // pick the first driver the list offers.
  const driverButton = picker.getByRole('button', { name: 'Driver', exact: true })
  if (await driverButton.getByText('Select driver').isVisible()) {
    await driverButton.click()
    await page.locator('[role="option"]:not([aria-disabled="true"]):not([data-disabled="true"])')
      .filter({ hasNotText: /^(No driver|No second driver|Select driver)$/ })
      .first()
      .click()
  }
  await expect(driverButton.getByText('Select driver')).toHaveCount(0)

  await picker.getByRole('button', { name: 'Assign', exact: true }).click()
  // Assigning asks Yes / No first.
  await page.getByRole('button', { name: 'Yes', exact: true }).click()

  const ops = await apiAs(OPS)
  await expect.poll(() => statusOf(ops), { timeout: 30_000 }).toBe('assigned')
  const assignment = await ops.get(`admin/assignments/${bookingId}`)
  const email: string = JSON.stringify(assignment).match(/8338logisticsservice\+seed\.((?:driver|vendor)\d{3})@gmail\.com/)?.[1] ?? ''
  driverTag = email
  expect(driverTag, `the assigned driver is a seeded driver (${JSON.stringify(assignment).slice(0, 400)})`).toMatch(/^driver\d{3}$/)
  truckId = JSON.stringify(assignment).match(/"truck_id":"([0-9a-f-]{36})"/)?.[1] ?? ''
  await ops.dispose()
  expect(problems.serverErrors).toEqual([])
})

test('Driver delivers through the driver API (pickup, drop-off, return to yard)', async () => {
  const driver = await apiAs(driverTag)
  const at = (p: { latitude: number; longitude: number }) => ({ latitude: p.latitude, longitude: p.longitude, accuracy_m: 5 })

  // Start Navigation the day before the booking: the app asks "start early?" first.
  await driver.post(`driver/bookings/${bookingId}/start`, { early_start: true })

  const trips = await driver.get(`driver/bookings/${bookingId}/trips`)
  const list = Array.isArray(trips) ? trips : (trips.trips ?? [])
  expect(list.length, 'one planned trip').toBeGreaterThan(0)
  const trip = list[0]
  const stops = trip.booking_trip_stops ?? trip.stops ?? []
  expect(stops.length, 'the trip serves the drop-off').toBeGreaterThan(0)

  // Pickup: arrive, start loading, confirm with the proof-of-loading photo.
  await driver.post(`driver/bookings/${bookingId}/milestones`, { stage: 'arrived', trip_id: trip.trip_id, ...at(PLACES.pickup) })
  await driver.post(`driver/bookings/${bookingId}/milestones`, { stage: 'started', trip_id: trip.trip_id, ...at(PLACES.pickup) })
  const loading = await driver.upload('driver/proof-photo', 'image', 'proof.jpg', 'image/jpeg')
  await driver.patch(`driver/trips/${trip.trip_id}/pickup`, { proof_photo_url: loading.url, early_start: true, ...at(PLACES.pickup) })

  // Each drop-off: arrive, start unloading, confirm with the proof-of-delivery photo.
  for (const stop of stops) {
    const id = stop.trip_stop_id
    await driver.post(`driver/bookings/${bookingId}/milestones`, { stage: 'arrived', trip_id: trip.trip_id, trip_stop_id: id, ...at(PLACES.dropoff) })
    await driver.post(`driver/bookings/${bookingId}/milestones`, { stage: 'started', trip_id: trip.trip_id, trip_stop_id: id, ...at(PLACES.dropoff) })
    const pod = await driver.upload('driver/proof-photo', 'image', 'proof.jpg', 'image/jpeg')
    await driver.patch(`driver/trip-stops/${id}/delivered`, { proof_photo_url: pod.url, ...at(PLACES.dropoff) })
  }

  // Back at the yard.
  await driver.patch(`driver/bookings/${bookingId}/fleet-return`, at(PLACES.pickup))
  await expect.poll(() => statusOf(driver), { timeout: 30_000 }).toBe('delivered')
  await driver.dispose()
})

test('CLI-042 E2E-001 client confirms completion; the booking is Completed', async ({ page }) => {
  const problems = watch(page)
  await signInWithPassword(page, CLIENT)
  await expectSignedInto(page, PORTAL.client)
  await page.goto(`/client/history?booking=${encodeURIComponent(ref)}`)

  await page.getByRole('button', { name: 'Confirm booking is complete' }).click()
  await expect(page.getByText('Confirm the booking is complete?')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, confirm' }).click()

  const client = await apiAs(CLIENT)
  await expect.poll(() => statusOf(client), { timeout: 30_000 }).toBe('completed')
  await client.dispose()
  expect(problems.serverErrors).toEqual([])
})
