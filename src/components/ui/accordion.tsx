"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "radix-ui"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/*
 * shadcn/ui Accordion (Radix version: https://ui.shadcn.com/docs/components/radix/accordion)
 * for every "show / hide" toggle on the web (Earlier pauses, Earlier updates,
 * Driving record, What happened on the road, the booking panel's sections).
 * Tweaked (user 2026-11-16): each item is a full-outline box (rounded border
 * round the heading AND its content) instead of shadcn's bottom rule.
 *
 * **Rule: a heading that opens a list under it is an Accordion item, never a
 * hand-made button + useState.** A single toggle is an Accordion with one item
 * (type="single" collapsible); <ToggleBox> below does that with an open/close
 * state the page keeps, so its behaviour stays the page's own.
 */

function Accordion(props: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("rounded-[10px] border border-[#424242]", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  chevronClassName,
  chevronStyle,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  chevronClassName?: string
  chevronStyle?: React.CSSProperties
}) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion flex flex-1 cursor-pointer items-center justify-between gap-3 rounded-[9px] px-3 py-2.5 text-left font-bold outline-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4df9ed]/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/accordion:rotate-180", chevronClassName)}
          style={chevronStyle}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content data-slot="accordion-content" {...props}>
      <div className={cn("px-3 pb-3", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

/**
 * One outlined show/hide box: heading + chevron, content under it inside the
 * same outline. The page keeps `open`, so nothing about when it opens changes.
 * `keepMounted`: the content stays mounted (hidden) while closed.
 */
function ToggleBox({
  open, onOpenChange, title, children, keepMounted = false,
  className, triggerClassName, triggerStyle, chevronClassName, chevronStyle, contentClassName,
}: {
  open:            boolean
  onOpenChange:    (open: boolean) => void
  title:           React.ReactNode
  children:        React.ReactNode
  keepMounted?:    boolean
  className?:      string
  triggerClassName?: string
  triggerStyle?:   React.CSSProperties
  chevronClassName?: string
  chevronStyle?:   React.CSSProperties
  contentClassName?: string
}) {
  return (
    <Accordion
      type="single"
      collapsible
      value={open ? "item" : ""}
      onValueChange={(v) => onOpenChange(v === "item")}
    >
      <AccordionItem value="item" className={className}>
        <AccordionTrigger className={triggerClassName} style={triggerStyle} chevronClassName={chevronClassName} chevronStyle={chevronStyle}>
          {title}
        </AccordionTrigger>
        {/* forceMount makes Radix treat the content as always open, so `hidden` is set here. */}
        <AccordionContent forceMount={keepMounted ? true : undefined} hidden={keepMounted ? !open : undefined} className={contentClassName}>
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

/**
 * A ToggleBox that is a card of its own (What happened on the road, Earlier
 * pauses when alone): the card's look, and one heading height for all of them
 * so they line up when closed (user 2026-11-16).
 */
const CARD_TOGGLE = {
  className:        "rounded-[15px] border-[#424242] bg-[#1b1b1b]",
  // What happened on the road's size: 12 px above and below a 20 px line = 44 px.
  triggerClassName: "min-h-11 rounded-[14px] px-3.5 sm:px-4 py-3 text-base leading-tight",
  contentClassName: "px-3.5 sm:px-4 pb-4",
} as const

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger, CARD_TOGGLE, ToggleBox }
