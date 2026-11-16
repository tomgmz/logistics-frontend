/*
 * A field's own error, under the field, with a red outline on the field: the
 * look of the booking form's MUI fields (FormHelperText: #f62626, 0.7rem, 3px
 * below). Material Design, GOV.UK and Apple all put a field's error next to
 * the field, not in a box at the end of the form (user 2026-11-16: "check the
 * whole system").
 *
 * **Rule: a check on what was typed into one field shows under that field
 * (errorBorder + FieldError). Only an error with no field of its own (the
 * server refused, the connection failed) goes in a box.** Show them all when
 * Save is pressed, then keep them live as the person types (see
 * VehicleManagementView: `showErrors` + a pure `formErrors()`).
 */

/** Red outline for a field with an error. `!` so it wins over the field's own border colour. */
export const ERROR_BORDER = 'border-[#f62626]/60! focus:border-[#f62626]!'

export function errorBorder(error: unknown): string {
  return error ? ERROR_BORDER : ''
}

/** The message under the field. Renders nothing without one. */
export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="mt-[3px] ml-0.5 text-[0.7rem] leading-[1.3] text-[#f62626]">
      {children}
    </p>
  )
}
