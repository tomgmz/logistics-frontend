'use client'

import { useEffect } from 'react'

/*
 * No browser autofill or past-entry suggestions in the system's fields
 * (user 2026-11-21: "remove autofill in the whole system input fields").
 *
 * Mounted once in the root layout. Every <input> and <textarea> that does not
 * set `autocomplete` itself gets autocomplete="off", including ones that appear
 * later (modals, side panels, new rows). A field that sets its own value keeps
 * it; that is how sign-in stays usable with password managers and emailed
 * codes (industry practice: Google, Apple, Microsoft, NIST 800-63B):
 *   - every password field (left alone here, whatever it sets),
 *   - the sign-in email: autoComplete="username",
 *   - the sign-in code boxes: autoComplete="one-time-code".
 * Rule: a new field needs nothing; only a sign-in field sets its own value.
 */

const SKIP_TYPES = new Set(['password', 'hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'range', 'color'])

function mark(el: Element) {
  if (el.hasAttribute('autocomplete')) return
  if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return
  el.setAttribute('autocomplete', 'off')
}

function markTree(root: ParentNode) {
  if (root instanceof Element && (root.tagName === 'INPUT' || root.tagName === 'TEXTAREA')) mark(root)
  root.querySelectorAll?.('input, textarea').forEach(mark)
}

export default function NoAutofill() {
  useEffect(() => {
    markTree(document)
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') { mark(r.target as Element); continue }
        r.addedNodes.forEach((n) => { if (n.nodeType === 1) markTree(n as Element) })
      }
    })
    // `type` is watched too: a show/hide password toggle turns a password field
    // into a text field, and back.
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] })
    return () => observer.disconnect()
  }, [])
  return null
}
