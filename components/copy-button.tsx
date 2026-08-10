"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

export function CopyButton({
  value,
  label = "Копировать",
  className = "",
}: {
  value: string
  label?: string
  className?: string
}) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setDone(true)
    setTimeout(() => setDone(false), 1400)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs text-secondary-foreground transition-colors hover:bg-muted ${className}`}
    >
      {done ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
      <span>{done ? "Скопировано" : label}</span>
    </button>
  )
}
