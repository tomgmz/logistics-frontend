'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, ShieldCheck, Loader2, Lock } from 'lucide-react'
import { EMPTY_FLAGS, ModuleFlags, ModuleKey } from '@/constants/modules'
import { permissionsService } from '@/lib/services/admin/permissions.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import ModulePermissionMatrix from './ModulePermissionMatrix'

interface PermissionsModalProps {
  userId:   string
  userName: string
  onClose:  () => void
  onSaved?: () => void
}

export default function PermissionsModal({ userId, userName, onClose, onSaved }: PermissionsModalProps) {
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [modules,     setModules]     = useState<ModuleKey[]>([])
  const [flags,       setFlags]       = useState<Record<string, ModuleFlags>>({})
  const [isProtected, setIsProtected] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await permissionsService.get(userId)
        if (!active) return
        const map: Record<string, ModuleFlags> = {}
        for (const m of res.modules) map[m] = { ...EMPTY_FLAGS }
        for (const p of res.permissions) {
          map[p.module_key] = {
            can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit,
            can_delete: p.can_delete, can_export: p.can_export,
          }
        }
        setModules(res.modules)
        setFlags(map)
        setIsProtected(res.protected)
      } catch (e) {
        if (active) setError(getApiErrorMessage(e, 'Failed to load permissions.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [userId])

  const grantedCount = useMemo(
    () => Object.values(flags).filter((f) => f.can_view).length,
    [flags],
  )

  async function handleSave() {
    setSaving(true)
    try {
      await appToast.promise(
        permissionsService.save(
          userId,
          modules.map((m) => ({ module_name: m, ...(flags[m] ?? EMPTY_FLAGS) })),
        ),
        {
          loading: 'Saving permissions…',
          success: 'Access permissions updated',
          error:   (e) => getApiErrorMessage(e, 'Failed to save permissions.'),
        },
        { action: 'save-permissions', entityId: userId },
      )
      onSaved?.()
      onClose()
    } catch { /* handled by toast */ }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70" onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#2a2a2a] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[#4df9ed]/30 bg-[#4df9ed]/10 p-2">
              <ShieldCheck size={18} className="text-[#4df9ed]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Manage Module Access</h2>
              <p className="text-xs text-[#818181]">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#818181]">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          ) : modules.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#818181]">
              This account type has no assignable modules.
            </p>
          ) : (
            <>
              {isProtected && (
                <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  <Lock size={15} className="shrink-0" />
                  <span>
                    This is the primary administrator account and cannot be restricted, so there is
                    always one administrator with full access.
                  </span>
                </div>
              )}
              <p className="mb-4 text-xs text-[#818181]">
                The <b>Access</b> column controls whether the user can open a module (view-only).
                The remaining checkboxes add Create / Edit / Delete / Export. Leave every module
                unchecked to keep the user on their default role access.
              </p>
              <ModulePermissionMatrix
                modules={modules}
                value={flags}
                onChange={(m, next) => setFlags((prev) => ({ ...prev, [m]: next }))}
                disabled={isProtected}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#2a2a2a] px-6 py-4">
          <span className="text-xs text-[#818181]">{grantedCount} module{grantedCount !== 1 ? 's' : ''} granted</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-[#424242] px-4 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || saving || !!error || isProtected}
              className="flex items-center gap-2 rounded-lg bg-[#4df9ed] px-5 py-2 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] disabled:opacity-40"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save Access
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
