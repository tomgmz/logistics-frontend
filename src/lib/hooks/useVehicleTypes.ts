'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { systemMaintenanceService, type VehicleType } from '@/lib/services/admin/system-maintenance.service'
import { useLiveTable } from '@/lib/hooks/useLiveTable'

/**
 * The active vehicle types (System Maintenance → Vehicle Types) as picker
 * options, kept live. `keep` is a value the record already holds: when that
 * type has since been made inactive or renamed it would not be on the list,
 * and the picker would silently show it as unset, so it is added back.
 */
export function useVehicleTypeOptions(keep?: string | null, enabled = true) {
  const [types,   setTypes]   = useState<VehicleType[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error,   setError]   = useState(false)

  const load = useCallback(async () => {
    try {
      setTypes(await systemMaintenanceService.getVehicleTypes(true))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (enabled) void load() }, [enabled, load])
  useLiveTable(['live:catalog'], () => { if (enabled) void load() })

  const options = useMemo(() => {
    const names = types.map((t) => t.name)
    const k = keep?.trim()
    if (k && !names.some((n) => n.toLowerCase() === k.toLowerCase())) names.push(k)
    return names
  }, [types, keep])

  return { options, loading, error, reload: load }
}
