'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

/**
 * "Export Logs" for the logs toolbars. `run` fetches the filtered rows and
 * downloads the .xlsx; this only owns the busy state and the feedback.
 */
export default function ExportLogsButton({
  run,
  noun,
  cap,
  disabled,
}: {
  run:       () => Promise<{ count: number; truncated: boolean }>
  /** Plural, e.g. "audit logs". */
  noun:      string
  cap:       number
  disabled?: boolean
}) {
  const [exporting, setExporting] = useState(false)

  async function handleClick() {
    setExporting(true)
    try {
      const { count, truncated } = await run()
      if (count === 0) {
        appToast.error('Nothing to export for these filters.')
        return
      }
      appToast.success(`Exported ${count.toLocaleString()} ${noun}.`)
      if (truncated) {
        appToast.error(`Export was capped at ${cap.toLocaleString()} rows — narrow the filters for the rest.`)
      }
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={exporting || disabled}
      title="Download every row matching the current filters as an Excel file"
      className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
    >
      <FileSpreadsheet size={13} /> {exporting ? 'Exporting…' : 'Export Logs'}
    </button>
  )
}
