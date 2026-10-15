import * as React from "react"

import { cn } from "@/lib/utils"

const CONTROL_SELECTOR =
  'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], button'

function Label({ className, children, ...props }: React.ComponentProps<"label">) {
  const ref = React.useRef<HTMLLabelElement>(null)
  const htmlFor = props.htmlFor

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const forValue = el.getAttribute("for")
    // Already associated via a valid `for`.
    if (forValue && document.getElementById(forValue)) return
    // Already associated by wrapping a control.
    if (el.querySelector(CONTROL_SELECTOR)) return

    const parent = el.parentElement
    if (!parent) return

    // Find the first form control that appears after this label among its siblings
    // (including controls nested inside following sibling wrappers).
    const siblings = Array.from(parent.children)
    const after = siblings.slice(siblings.indexOf(el) + 1)
    const control = after
      .map((s: Element) => ((s.matches?.(CONTROL_SELECTOR) ? s : s.querySelector?.(CONTROL_SELECTOR)) as HTMLElement | null))
      .find(Boolean) as HTMLElement | null

    if (control) {
      const id = control.id || forValue || `lbl-${Math.random().toString(36).slice(2, 9)}`
      if (!control.id) control.id = id
      el.setAttribute("for", id)
    }
  }, [htmlFor])

  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </label>
  )
}

export { Label }
