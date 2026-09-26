/**
 * Builds and downloads a real .xlsx in the browser. The backend hands over rows
 * as JSON (the Next proxy re-serialises every response, so a binary body would
 * not survive it) and this turns them into the file.
 *
 * Unlike the CSV export in transaction-history.service.ts, no formula-injection
 * guard is needed: every value is written as a typed cell, never as a formula,
 * so a description starting with "=" stays text.
 */

export type XlsxValue = string | number | boolean | Date | null | undefined

export interface XlsxColumn<T> {
  label: string
  /** Column width in characters. */
  width: number
  value: (row: T) => XlsxValue
}

// Excel caps a cell at 32,767 characters and refuses to open the file if one
// is longer. Stack traces in system-log metadata can get there.
const MAX_CELL_CHARS = 32_000

export async function downloadXlsx<T>(
  fileName: string,
  sheet: string,
  rows: T[],
  columns: XlsxColumn<T>[],
): Promise<void> {
  // Loaded on click so the writer stays out of the page bundle.
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  await writeXlsxFile(rows, {
    sheet,
    stickyRowsCount: 1,
    columns: columns.map((c) => ({
      width:  c.width,
      header: { value: c.label, fontWeight: 'bold' as const },
      cell:   (row: T) => {
        const v = c.value(row)
        if (v instanceof Date) return { value: v, type: Date, format: 'yyyy-mm-dd hh:mm:ss' }
        if (typeof v === 'string' && v.length > MAX_CELL_CHARS) {
          return `${v.slice(0, MAX_CELL_CHARS)}… [truncated]`
        }
        return v ?? null
      },
    })),
  }).toFile(fileName)
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * An Excel date has no timezone, and the writer stores a Date by its UTC
 * fields. Shifting by Manila's fixed +08:00 (no DST) makes the cell read as
 * the same wall-clock time the logs pages show via timeFormat.ts, while still
 * being a real, sortable date.
 */
export function manilaCellDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  // Supabase sometimes omits the zone; those values are UTC (see timeFormat.ts).
  const utc = iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`
  const ms  = Date.parse(utc)
  return Number.isNaN(ms) ? null : new Date(ms + MANILA_OFFSET_MS)
}

/** yyyy-mm-dd in Manila, for file names. */
export function manilaDateStamp(): string {
  return new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}
