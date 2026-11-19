import type { FilterField, FilterValues } from '@/components/ui/FilterBar'

/**
 * The Order toggle every table has in its Filters panel (user 2026-11-19: "in
 * all tables in the system put a sort toggle"). Each table keeps its own
 * natural order (newest first, A to Z, most urgent first…) and the toggle
 * flips it: the request carries `reverse=1` and the server flips the list
 * before cutting the page (backend lib/paginate.ts), so the order holds across
 * every page, not just the rows on screen.
 */

export const ORDER_FIELD = 'order'

/** [natural order, flipped] labels for the common orders. */
export const ORDER_LABELS = {
  newest:   ['Newest first', 'Oldest first'],
  oldest:   ['Oldest first', 'Newest first'],
  name:     ['Name A to Z', 'Name Z to A'],
  plate:    ['Plate A to Z', 'Plate Z to A'],
  code:     ['Code A to Z', 'Code Z to A'],
  urgent:   ['Most urgent first', 'Least urgent first'],
  schedule: ['Latest schedule first', 'Earliest schedule first'],
} as const satisfies Record<string, readonly [string, string]>

export type OrderLabels = readonly [string, string]

/** The Filters panel's "Order" dropdown. */
export function orderField([natural, flipped]: OrderLabels): FilterField {
  return {
    key: ORDER_FIELD, label: 'Order', single: true, anyLabel: natural,
    // Both listed, as Document Management's Order does; only 'reverse' is
    // kept as a rule (orderRules), so the natural order shows no filter count.
    options: [{ value: 'natural', label: natural }, { value: 'reverse', label: flipped }],
  }
}

/** The FilterBar rule for the current order (none while in the natural order). */
export function orderRules(reverse: boolean): FilterValues {
  return reverse ? [{ field: ORDER_FIELD, op: 'is', value: 'reverse' }] : []
}

/** Whether the FilterBar's rules ask for the flipped order. */
export function isReversed(rules: FilterValues): boolean {
  return rules.some((r) => r.field === ORDER_FIELD && r.op === 'is' && r.value === 'reverse')
}

/** Every rule except the order (what the table's own filters are made of). */
export function withoutOrder(rules: FilterValues): FilterValues {
  return rules.filter((r) => r.field !== ORDER_FIELD)
}

/** The request parameter: only sent when flipped. */
export function reverseParam(reverse: boolean): { reverse?: 1 } {
  return reverse ? { reverse: 1 } : {}
}
