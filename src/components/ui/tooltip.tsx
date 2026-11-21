"use client"

import * as React from "react"
import { Slot, Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * shadcn/ui Tooltip (Radix version: https://ui.shadcn.com/docs/components/radix/tooltip),
 * in the app's dark look. A Radix tooltip opens on mouse hover and keyboard
 * focus only; touch never opens it. Where a phone user needs the text too,
 * control `open` and add a touch path (TruncatedText uses a long press).
 */

function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-[1500] w-fit max-w-[min(360px,calc(100vw-32px))] origin-(--radix-tooltip-content-transform-origin) rounded-md border border-white/10 bg-[#111] px-3 py-1.5 text-sm leading-snug text-white shadow-xl break-words whitespace-normal",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-[1500] size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] border-r border-b border-white/10 bg-[#111] fill-[#111]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/* Width/flex classes a disabled child's wrapper has to copy so the layout holds. */
const LAYOUT_CLASS = /^(?:[a-z0-9]+:)*(?:w-|min-w-|max-w-|flex-1$|flex-auto$|flex-none$|grow|shrink|basis-|self-)/

/**
 * The app's one way to show a hover hint: wrap any element instead of giving
 * it a native `title`. `label` empty/undefined = no tooltip, child as is.
 * Props and ref from a parent `asChild` trigger (Popover, Dialog…) pass
 * through to the child. A disabled control fires no pointer events, so it
 * gets a focusable span around it (Radix's documented pattern) that carries
 * the hover and its width classes.
 */
type TipOwnProps = {
  label?: React.ReactNode
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
  align?: React.ComponentProps<typeof TooltipPrimitive.Content>["align"]
  contentClassName?: string
  children: React.ReactElement
}

const Tip = React.forwardRef<
  HTMLElement,
  TipOwnProps & Omit<React.HTMLAttributes<HTMLElement>, keyof TipOwnProps>
>(function Tip({ label, side, align, contentClassName, children, ...rest }, ref) {
  const child = React.Children.only(children) as React.ReactElement<{
    disabled?: boolean
    className?: string
    style?: React.CSSProperties
  }>
  if (label == null || label === "" || label === false) {
    return (
      <Slot.Root ref={ref} {...rest}>
        {child}
      </Slot.Root>
    )
  }
  let trigger: React.ReactElement = child
  if (child.props.disabled) {
    const layout = String(child.props.className ?? "")
      .split(/\s+/)
      .filter((c) => LAYOUT_CLASS.test(c))
      .join(" ")
    trigger = (
      <span tabIndex={0} className={cn("inline-flex cursor-not-allowed", layout)}>
        {React.cloneElement(child, { style: { ...child.props.style, pointerEvents: "none" } })}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild ref={ref as React.Ref<HTMLButtonElement>} {...rest}>
        {trigger}
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className={contentClassName}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
})

export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
