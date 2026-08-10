"use client"

import { useMemo, useState } from "react"
import { Download, FileCode2 } from "lucide-react"
import type { Node } from "@/lib/parse"
import { exportBase64, exportClash, exportLinks, exportSingBox, exportXray } from "@/lib/export"
import { CopyButton } from "./copy-button"

type Tab = { key: string; label: string; file: string; build: (n: Node[]) => string }

const TABS: Tab[] = [
  { key: "links", label: "Ссылки", file: "configs.txt", build: exportLinks },
  { key: "base64", label: "Base64", file: "subscription.txt", build: exportBase64 },
  { key: "clash", label: "Clash / Mihomo", file: "clash.yaml", build: exportClash },
  { key: "singbox", label: "sing-box", file: "sing-box.json", build: exportSingBox },
  { key: "xray", label: "Xray JSON", file: "xray.json", build: exportXray },
]

export function ExportPanel({ nodes, raw }: { nodes: Node[]; raw: string }) {
  const [tab, setTab] = useState("links")
  const active = TABS.find((t) => t.key === tab)!

  const content = useMemo(() => {
    if (tab === "raw") return raw
    try {
      return active.build(nodes)
    } catch (e) {
      return `Ошибка генерации: ${(e as Error).message}`
    }
  }, [tab, nodes, raw, active])

  const filename = tab === "raw" ? "raw-response.txt" : active.file

  function download() {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileCode2 className="size-4 text-primary" />
          Экспорт
        </h2>
        <div className="ml-auto flex flex-wrap gap-1">
          {[...TABS, { key: "raw", label: "Raw ответ" }].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="font-mono text-xs text-muted-foreground">
          {filename} · {(content.length / 1024).toFixed(1)} KB
        </span>
        <div className="ml-auto flex gap-2">
          <CopyButton value={content} label="Копировать всё" />
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 font-mono text-xs text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Download className="size-3.5" />
            Скачать
          </button>
        </div>
      </div>

      <pre className="max-h-96 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">{content}</pre>
    </section>
  )
}
