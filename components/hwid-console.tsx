"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Fingerprint,
  Link2,
  Loader2,
  RefreshCw,
  Smartphone,
  Zap,
} from "lucide-react"
import { DEVICE_PRESETS, generateIdentity, identityHeaders, normalizeSubUrl, type Identity } from "@/lib/hwid"
import type { Node, SubMeta } from "@/lib/parse"
import { CopyButton } from "./copy-button"
import { NodeList } from "./node-list"
import { ExportPanel } from "./export-panel"

type Result = {
  url: string
  status: number
  tookMs: number
  format: string
  meta: SubMeta
  profiles: string[]
  nodes: Node[]
  rawHeaders: Record<string, string>
  raw: string
}

const PATHS = [
  { value: "", label: "auto (по User-Agent)" },
  { value: "json", label: "/json — Xray JSON" },
  { value: "v2ray-json", label: "/v2ray-json" },
  { value: "clash", label: "/clash" },
  { value: "mihomo", label: "/mihomo" },
  { value: "sing-box", label: "/sing-box" },
  { value: "v2ray", label: "/v2ray (base64)" },
]

function bytes(n?: number) {
  if (!n) return "0 B"
  const u = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 0)} ${u[i]}`
}

export function HwidConsole() {
  const [input, setInput] = useState("sub.sosa.ink/yoqUGDBcSo9YqHKm")
  const [presetIndex, setPresetIndex] = useState(0)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [path, setPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    setIdentity(generateIdentity(DEVICE_PRESETS[presetIndex]))
  }, [presetIndex])

  function regenerate() {
    setIdentity(generateIdentity(DEVICE_PRESETS[presetIndex]))
  }

  async function run() {
    const url = normalizeSubUrl(input)
    if (!url) {
      setError("Не могу разобрать ссылку. Пример: sub.sosa.ink/yoqUGDBcSo9YqHKm")
      return
    }
    if (!identity) return

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/fetch-sub", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, path, headers: identityHeaders(identity) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Не удалось получить подписку")
        return
      }
      setResult(data as Result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const preset = DEVICE_PRESETS[presetIndex]
  const headerPairs = identity ? Object.entries(identityHeaders(identity)) : []
  const curl = identity
    ? `curl -s ${headerPairs.map(([k, v]) => `-H '${k}: ${v}'`).join(" ")} '${normalizeSubUrl(input) || ""}${path ? "/" + path : ""}'`
    : ""

  return (
    <div className="space-y-4">
      {/* Шаг 1 — ссылка */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 font-mono text-xs text-primary">1</span>
          <h2 className="text-sm font-semibold">Ссылка подписки</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) run()
              }}
              placeholder="sub.example.com/abcDEF123  ·  happ://add/..."
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-border bg-input pl-9 pr-3 font-mono text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <select
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="h-11 rounded-lg border border-border bg-input px-3 font-mono text-xs outline-none focus:border-ring"
          >
            {PATHS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Шаг 2 — HWID */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 font-mono text-xs text-primary">2</span>
          <h2 className="text-sm font-semibold">Устройство и X-HWID</h2>
          <button
            type="button"
            onClick={regenerate}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
          >
            <RefreshCw className="size-3.5" />
            Новый HWID
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {DEVICE_PRESETS.map((p, i) => (
            <button
              key={p.model}
              type="button"
              onClick={() => setPresetIndex(i)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors ${
                i === presetIndex
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <Smartphone className="size-3.5" />
              {p.model}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Fingerprint className="size-4 text-accent" />
            <code className="font-mono text-base tracking-[0.18em] text-accent">{identity?.hwid ?? "····"}</code>
            {identity && <CopyButton value={identity.hwid} label="HWID" />}
            <span className="font-mono text-[10px] uppercase text-muted-foreground">
              {preset.os === "iOS" ? "UUID" : "ANDROID_ID · 64 бита"}
            </span>
          </div>
          <div className="space-y-1 border-t border-border pt-2">
            {headerPairs.map(([k, v]) => (
              <div key={k} className="flex gap-2 font-mono text-[11px]">
                <span className="w-32 shrink-0 text-muted-foreground">{k}</span>
                <span className="min-w-0 flex-1 truncate">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
            <CopyButton value={curl} label="curl" />
            <CopyButton value={JSON.stringify(Object.fromEntries(headerPairs), null, 2)} label="Заголовки JSON" />
          </div>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-mono text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {loading ? "Регистрирую устройство…" : "Сгенерировать X-HWID и забрать конфиги"}
        </button>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Ошибка</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <>
          <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Профиль", result.meta.title || "—"],
              ["HWID принят", result.rawHeaders["x-hwid-active"] === "true" ? "да · привязан" : "не заявлен"],
              ["Формат", `${result.format} · ${result.nodes.length} узлов`],
              ["Ответ", `${result.status} · ${result.tookMs} ms`],
              ["Трафик", `${bytes(result.meta.download)} ↓ / ${bytes(result.meta.upload)} ↑`],
              ["Лимит", result.meta.total ? bytes(result.meta.total) : "безлимит"],
              [
                "Истекает",
                result.meta.expire ? new Date(result.meta.expire * 1000).toLocaleDateString("ru-RU") : "—",
              ],
              ["Профилей", String(result.profiles.length)],
            ].map(([k, v]) => (
              <div key={k} className="bg-card px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="mt-0.5 truncate text-sm font-medium" title={v}>
                  {v}
                </p>
              </div>
            ))}
          </section>

          {result.meta.announce && (
            <section className="rounded-xl border border-accent/30 bg-accent/10 p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-accent">Announce от панели</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.meta.announce}</p>
            </section>
          )}

          <NodeList nodes={result.nodes} />
          <ExportPanel nodes={result.nodes} raw={result.raw} />

          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Заголовки ответа подписки</summary>
            <div className="border-t border-border p-4">
              {Object.entries(result.rawHeaders).map(([k, v]) => (
                <div key={k} className="flex gap-2 border-b border-border py-1.5 font-mono text-[11px] last:border-b-0">
                  <span className="w-52 shrink-0 text-muted-foreground">{k}</span>
                  <span className="min-w-0 flex-1 break-all">{v}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
