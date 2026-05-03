import toast, { type ToastOptions } from 'react-hot-toast'


export interface ToastContext {
  action?: string
  entityId?: string | number
}

type AppToastOptions = ToastOptions & ToastContext

function buildKey(ctx?: ToastContext): string | undefined {
  if (!ctx?.action && !ctx?.entityId) return undefined
  const parts = [ctx.action ?? 'action', ctx.entityId ?? 'entity'].map(String)
  return parts.join(':')
}

function splitOptions(opts?: AppToastOptions): {
  toastOpts: ToastOptions
  ctx: ToastContext
} {
  if (!opts) return { toastOpts: {}, ctx: {} }
  const { action, entityId, ...rest } = opts
  return { toastOpts: rest, ctx: { action, entityId } }
}

function success(message: string, opts?: AppToastOptions): string {
  const { toastOpts, ctx } = splitOptions(opts)
  const id = buildKey(ctx)
  return toast.success(message, { id, duration: 3000, ...toastOpts })
}

function error(message: string, opts?: AppToastOptions): string {
  const { toastOpts, ctx } = splitOptions(opts)
  const id = buildKey(ctx)
  return toast.error(message, { id, duration: 4500, ...toastOpts })
}

function loading(message: string, opts?: AppToastOptions): string {
  const { toastOpts, ctx } = splitOptions(opts)
  const id = buildKey(ctx)
  return toast.loading(message, { id, ...toastOpts })
}

function info(message: string, opts?: AppToastOptions): string {
  const { toastOpts, ctx } = splitOptions(opts)
  const id = buildKey(ctx)
  return toast(message, { id, duration: 3000, ...toastOpts })
}

function warn(message: string, opts?: AppToastOptions): string {
  const { toastOpts, ctx } = splitOptions(opts)
  const id = buildKey(ctx)
  return toast(message, {
    id,
    duration: 4000,
    icon: '⚠️',
    style: {
      background: '#2a2a2a',
      color: '#facc15',
      border: '1px solid rgba(234,179,8,0.3)',
    },
    ...toastOpts,
  })
}

function promise<T>(
  operation: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((err: unknown) => string)
  },
  ctx?: ToastContext,
  opts?: ToastOptions,
): Promise<T> {
  const id = buildKey(ctx)

  return toast.promise(
    operation,
    {
      loading: messages.loading,
      success: messages.success as string | ((data: T) => string),
      error:   messages.error   as string | ((err: unknown) => string),
    },
    { id, ...opts },
  )
}

function dismiss(ctx?: ToastContext): void {
  const id = buildKey(ctx)
  if (id) {
    toast.dismiss(id)
  } else {
    toast.dismiss()
  }
}

function dismissAll(): void {
  toast.dismiss()
}

export const appToast = {
  success,
  error,
  loading,
  info,
  warn,
  promise,
  dismiss,
  dismissAll,
} as const

export type AppToast = typeof appToast

export { toast as rawToast }