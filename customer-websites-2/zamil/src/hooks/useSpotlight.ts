import type { PointerEvent } from 'react'

/**
 * Writes the pointer's position inside an element to `--mx` / `--my`, which the
 * `.spot` rule turns into a pool of gold light under the cursor.
 *
 * Done on the element rather than on the page so nothing runs at all until a
 * pointer is actually over a card, and so four cards never fight over one
 * shared listener. There is deliberately no touch behaviour: with no pointer the
 * gradient stays parked at 50% 50% and at zero opacity, which is correct.
 */
export function spotlight(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
}
