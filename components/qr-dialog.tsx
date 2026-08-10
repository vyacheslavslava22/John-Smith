"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { CopyButton } from "./copy-button"

export function QrDialog({
  value,
  title,
  onClose,
}: {
  value: string
  title: string
  onClose: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setError(null)
    // qrcode грузим лениво — он нужен только когда диалог открыт
    import("qrcode")
      .then((mod) =>
        mod.toDataURL(value, {
          errorCorrectionLevel: "L",
          margin: 2,
          width: 512,
          color: { dark: "#0b0e14", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR-код: ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-secondary transition-colors hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-border bg-white">
          {src ? (
            <img src={src} alt={`QR-код конфига ${title}`} className="size-full object-contain" />
          ) : error ? (
            <p className="px-4 text-center font-mono text-xs text-destructive">{error}</p>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          )}
        </div>

        <p className="mt-3 leading-relaxed text-xs text-muted-foreground">
          Отсканируй камерой в Happ или v2rayTun — конфиг добавится в приложение сразу.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton value={value} label="Ссылка" />
          {src && (
            <a
              href={src}
              download={`${title.replace(/[^\w.-]+/g, "_") || "config"}.png`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
            >
              Скачать PNG
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
