"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

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

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
