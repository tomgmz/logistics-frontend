'use client'

import { EMPTY_FLAGS, ModuleFlags, ModuleKey, MODULE_LABELS } from '@/constants/modules'

// Granular write actions. "Access" (can_view) is shown as a dedicated leading
// column so it's clear, at a glance, which modules a user can reach at all.
const ACTIONS: { key: keyof ModuleFlags; label: string }[] = [
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit',   label: 'Edit'   },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_export', label: 'Export' },
]

interface ModulePermissionMatrixProps {
  modules:   ModuleKey[]
  value:     Record<string, ModuleFlags>
  onChange:  (moduleKey: ModuleKey, next: ModuleFlags) => void
  disabled?: boolean
}

export default function ModulePermissionMatrix({
  modules, value, onChange, disabled = false,
}: ModulePermissionMatrixProps) {
  const flagsFor = (m: ModuleKey): ModuleFlags => value[m] ?? EMPTY_FLAGS

  // Access master = module visibility. On => view-only baseline; off => clears all.
  const setAccess = (m: ModuleKey, on: boolean) =>
    onChange(m, on ? { ...EMPTY_FLAGS, can_view: true } : { ...EMPTY_FLAGS })

  // Toggling a write action implies access (you can't act on what you can't see).
  const toggleAction = (m: ModuleKey, key: keyof ModuleFlags) => {
    const cur = flagsFor(m)
    const next = { ...cur, [key]: !cur[key] }
    if (next[key]) next.can_view = true
    onChange(m, next)
  }

  const setAll = (m: ModuleKey, on: boolean) =>
    onChange(m, on
      ? { can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true }
      : { ...EMPTY_FLAGS })

  const cb = 'h-4 w-4 cursor-pointer accent-[#4df9ed] disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">Module</th>
            <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-[#4df9ed]">Access</th>
            {ACTIONS.map((a) => (
              <th key={a.key} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-[#818181]">
                {a.label}
              </th>
            ))}
            <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-[#818181]">All</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const f = flagsFor(m)
            const allOn = f.can_view && ACTIONS.every((a) => f[a.key])
            return (
              <tr key={m} className="border-b border-[#2a2a2a]/60 last:border-0 hover:bg-[#2a2a2a]/30">
                <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{MODULE_LABELS[m]}</td>
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox" checked={f.can_view} disabled={disabled}
                    onChange={(e) => setAccess(m, e.target.checked)}
                    className={cb} aria-label={`${MODULE_LABELS[m]} access`}
                  />
                </td>
                {ACTIONS.map((a) => (
                  <td key={a.key} className="px-3 py-3 text-center">
                    <input
                      type="checkbox" checked={!!f[a.key]} disabled={disabled}
                      onChange={() => toggleAction(m, a.key)}
                      className={cb} aria-label={`${MODULE_LABELS[m]} ${a.label}`}
                    />
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox" checked={allOn} disabled={disabled}
                    onChange={() => setAll(m, !allOn)}
                    className={cb} aria-label={`${MODULE_LABELS[m]} grant all`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
