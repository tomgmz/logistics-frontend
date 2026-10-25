'use client'

import {
  ACCESS_LEVELS,
  AccessLevel,
  EMPTY_FLAGS,
  ModuleFlags,
  ModuleKey,
  MODULE_LABELS,
  VIEW_ONLY_MODULES,
  flagsToLevel,
  levelToFlags,
} from '@/constants/modules'

/** The levels a module offers: a view-only module has nothing to change, so only Read Only. */
export function levelsFor(m: ModuleKey) {
  return ACCESS_LEVELS.filter((l) => !(l.key === 'all' && VIEW_ONLY_MODULES.includes(m)))
}

/** A module with one box has it ticked and locked: the access it gives can't be taken away here. */
export function lockedLevelFor(m: ModuleKey): Exclude<AccessLevel, 'none'> | null {
  const levels = levelsFor(m)
  return levels.length === 1 ? levels[0].key : null
}

interface ModulePermissionMatrixProps {
  modules:   ModuleKey[]
  value:     Record<string, ModuleFlags>
  onChange:  (moduleKey: ModuleKey, next: ModuleFlags) => void
  disabled?: boolean
}

export default function ModulePermissionMatrix({
  modules, value, onChange, disabled = false,
}: ModulePermissionMatrixProps) {
  const levelFor = (m: ModuleKey): AccessLevel =>
    flagsToLevel(value[m] ?? EMPTY_FLAGS)

  // Mutually exclusive: picking a level replaces the row; clicking the level it
  // already has clears it back to no access (keeps the user on their role default).
  const selectLevel = (m: ModuleKey, level: Exclude<AccessLevel, 'none'>) => {
    if (lockedLevelFor(m)) return
    const next = levelFor(m) === level ? EMPTY_FLAGS : levelToFlags(level)
    onChange(m, { ...next })
  }

  const cb = 'h-4 w-4 cursor-pointer accent-[#4df9ed] disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">Module</th>
            {ACCESS_LEVELS.map((l) => (
              <th key={l.key} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-[#4df9ed]">
                {l.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const current = levelFor(m)
            const locked  = lockedLevelFor(m)
            return (
              <tr key={m} className="border-b border-[#2a2a2a]/60 last:border-0 hover:bg-[#2a2a2a]/30">
                <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{MODULE_LABELS[m]}</td>
                {ACCESS_LEVELS.map((l) => (
                  <td key={l.key} className="px-3 py-3 text-center">
                    {/* Nothing to change in a view-only module, so only Read Only is offered. */}
                    {l.key === 'all' && VIEW_ONLY_MODULES.includes(m) ? (
                      <span className="text-[#424242]" title="This module has nothing to change">—</span>
                    ) : (
                    <input
                      type="checkbox"
                      // Its only box: always ticked, and locked so it can't be unticked.
                      checked={locked ? true : current === l.key}
                      disabled={disabled || !!locked}
                      onChange={() => selectLevel(m, l.key)}
                      className={`${cb} ${locked ? 'disabled:opacity-60' : ''}`}
                      title={locked ? 'This module only has Read Only, so it is always granted' : undefined}
                      aria-label={`${MODULE_LABELS[m]} ${l.label}`}
                    />
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
