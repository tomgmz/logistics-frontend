// Live-panel test helper: marks or unmarks ONE text field on a SEED row, the
// way someone else's save would, so the open panel must follow it live.
// Run with cwd = logistics-backend (its .env and database pool):
//   npx tsx <this file> mark|mark2|unmark <target> <id>
// mark adds MARK, mark2 swaps it for MARK2, unmark removes either.
// Only the fields and seed rows below can be touched; unmark restores the text.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import 'dotenv/config'

export const MARK  = ' · live test'
export const MARK2 = ' · live test 2'

const TARGETS: Record<string, { table: string; col: string; key: string; seedCheck: string }> = {
  booking: {
    table: 'bookings', col: 'origin', key: 'booking_id',
    seedCheck: `EXISTS (SELECT 1 FROM clients c JOIN users u ON u.user_id = c.user_id
                WHERE c.client_id = t.client_id AND u.email LIKE '8338logisticsservice+seed.%')`,
  },
  report: {
    table: 'driver_reports', col: 'description', key: 'report_id',
    seedCheck: `EXISTS (SELECT 1 FROM drivers d JOIN users u ON u.user_id = d.user_id
                WHERE d.driver_id = t.driver_id AND u.email LIKE '8338logisticsservice+seed.%')`,
  },
  ticket: {
    table: 'support_tickets', col: 'subject', key: 'ticket_id',
    seedCheck: `EXISTS (SELECT 1 FROM clients c JOIN users u ON u.user_id = c.user_id
                WHERE c.client_id = t.client_id AND u.email LIKE '8338logisticsservice+seed.%')`,
  },
}

const [action, target, id] = process.argv.slice(2)
const t = TARGETS[target]
if (!t || !['mark', 'mark2', 'unmark'].includes(action) || !/^[0-9a-f-]{36}$/.test(id ?? '')) {
  console.error('usage: mark|mark2|unmark booking|report|ticket <uuid>'); process.exit(2)
}

const { pool } = await import(pathToFileURL(path.resolve('src/lib/database.ts')).href)
// MARK2 contains MARK, so it is stripped first.
const clean = `replace(replace(${t.col}, $3, ''), $2, '')`
const set = action === 'mark'  ? `${clean} || $2`
          : action === 'mark2' ? `${clean} || $3`
          : clean
const r = await pool.query(
  `UPDATE public.${t.table} t SET ${t.col} = ${set} WHERE t.${t.key} = $1 AND ${t.seedCheck} RETURNING t.${t.col} AS v`,
  [id, MARK, MARK2],
)
if (r.rowCount !== 1) { console.error(`no seed ${target} ${id}`); process.exit(1) }
console.log(r.rows[0].v)
await pool.end()
process.exit(0)
