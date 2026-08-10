"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  Fingerprint,
  History,
  Link2,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Zap,
} from "lucide-react"
import {
  checkHwid,
  DEVICE_PRESETS,
  generateIdentity,
  identityHeaders,
  normalizeSubUrl,
  type Identity,
} from "@/lib/hwid"
import { bytes, DAYS, daysLeft, NODES, plural } from "@/lib/format"
import type { Node, SubMeta } from "@/lib/parse"
import { CopyButton } from "./copy-button"
import { NodeList } from "./node-list"
import { ExportPanel } from "./export-panel"
import { QrDialog } from "./qr-dialog"

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

const HISTORY_KEY = "hwid-inspector:history"
const HISTORY_MAX = 8

/** Полоса прогресса: трафик и срок подписки. */
function UsageBars({ meta }: { meta: SubMeta }) {
  const used = (meta.download || 0) + (meta.upload || 0)
  const total = meta.total || 0
  const trafficPct = total > 0 ? Math.min(100, (used / total) * 100) : null
  const left = daysLeft(meta.expire)

  if (trafficPct === null && left === null) return null

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
      {trafficPct !== null && (
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Трафик</p>
            <p className="ml-auto font-mono text-xs">
              {bytes(used)} <span className="text-muted-foreground">/ {bytes(total)}</span>
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                trafficPct > 90 ? "bg-destructive" : trafficPct > 70 ? "bg-accent" : "bg-primary"
              }`}
              style={{ width: `${Math.max(trafficPct, 1.5)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(trafficPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Использовано трафика"
            />
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            осталось {bytes(Math.max(total - used, 0))} · {(100 - trafficPct).toFixed(1)}%
          </p>
        </div>
      )}

      {left !== null && (
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Срок
            </p>
            <p className="ml-auto font-mono text-xs">
              {new Date((meta.expire as number) * 1000).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                left <= 3 ? "bg-destructive" : left <= 10 ? "bg-accent" : "bg-primary"
              }`}
              style={{ width: `${Math.max(Math.min((left / 30) * 100, 100), 2)}%` }}
              role="progressbar"
              aria-valuenow={Math.max(left, 0)}
              aria-valuemin={0}
              aria-valuemax={30}
              aria-label="Дней до конца подписки"
            />
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {left > 0 ? `осталось ${left} ${plural(left, DAYS)}` : "подписка истекла"}
          </p>
        </div>
      )}
    </section>
  )
}

export function HwidConsole() {
  const [input, setInput] = useState("")
  const [presetIndex, setPresetIndex] = useState(0)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [manual, setManual] = useState(false)
  const [manualHwid, setManualHwid] = useState("")
  const [path, setPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<string[]>([])
  const [showSubQr, setShowSubQr] = useState(false)

  const preset = DEVICE_PRESETS[presetIndex]

  useEffect(() => {
    setIdentity(generateIdentity(preset))
  }, [preset])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      if (saved) setHistory(JSON.parse(saved).filter((s: unknown) => typeof s === "string").slice(0, HISTORY_MAX))
    } catch {
      /* история необязательна */
    }
  }, [])

  const pushHistory = useCallback((url: string) => {
    setHistory((prev) => {
      const next = [url, ...prev.filter((u) => u !== url)].slice(0, HISTORY_MAX)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* приватный режим — просто не сохраняем */
      }
      return next
    })
  }, [])

  function removeHistory(url: string) {
    setHistory((prev) => {
      const next = prev.filter((u) => u !== url)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const hwidCheck = useMemo(() => checkHwid(manualHwid), [manualHwid])

  const effectiveIdentity: Identity | null = useMemo(() => {
    if (!identity) return null
    if (manual && hwidCheck.ok) return { ...identity, hwid: manualHwid.trim() }
    return identity
  }, [identity, manual, manualHwid, hwidCheck.ok])

  const normalized = useMemo(() => normalizeSubUrl(input), [input])
  const headerPairs = effectiveIdentity ? Object.entries(identityHeaders(effectiveIdentity)) : []
  const curl = effectiveIdentity
    ? `curl -s ${headerPairs.map(([k, v]) => `-H '${k}: ${v}'`).join(" ")} '${normalized || ""}${path ? "/" + path : ""}'`
    : ""

  async function run() {
    if (!normalized) {
      setError("Не могу разобрать ссылку. Пример: sub.example.com/abcDEF123")
      return
    }
    if (manual && !hwidCheck.ok) {
      setError(`HWID введён неверно: ${hwidCheck.hint}`)
      return
    }
    if (!effectiveIdentity) return

    setLoading(true)
    setError(null)
    setResult(null)
    setSelected(new Set())
    try {
      const res = await fetch("/api/fetch-sub", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalized, path, headers: identityHeaders(effectiveIdentity) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Не удалось получить подписку")
        return
      }
      setResult(data as Result)
      pushHistory(normalized)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Шаг 1 — ссылка */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 font-mono text-xs text-primary">
            1
          </span>
          <h2 className="text-sm font-semibold">Ссылка подписки</h2>
          {normalized && (
            <button
              type="button"
              onClick={() => setShowSubQr(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
            >
              <QrCode className="size-3.5" />
              QR подписки
            </button>
          )}
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
              autoComplete="off"
              aria-label="Ссылка подписки"
              className="h-11 w-full rounded-lg border border-border bg-input pl-9 pr-3 font-mono text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <select
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label="Формат ответа подписки"
            className="h-11 rounded-lg border border-border bg-input px-3 font-mono text-xs outline-none focus:border-ring"
          >
            {PATHS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {input && (
          <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
            {normalized ? `→ ${normalized}${path ? "/" + path : ""}` : "→ ссылку разобрать не получилось"}
          </p>
        )}

        {history.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <History className="size-3.5" />
              Недавние
            </p>
            <div className="flex flex-wrap gap-1.5">
              {history.map((u) => (
                <span
                  key={u}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-secondary pl-2.5 font-mono text-xs"
                >
                  <button
                    type="button"
                    onClick={() => setInput(u)}
                    title={u}
                    className="max-w-[16rem] truncate py-1.5 transition-colors hover:text-primary"
                  >
                    {u.replace(/^https?:\/\//, "")}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistory(u)}
                    aria-label={`Удалить ${u} из истории`}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Шаг 2 — HWID */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 font-mono text-xs text-primary">
            2
          </span>
          <h2 className="text-sm font-semibold">Устройство и X-HWID</h2>
          <div className="ml-auto flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => setManual(e.target.checked)}
                className="size-3.5 accent-[var(--primary)]"
              />
              свой HWID
            </label>
            {!manual && (
              <button
                type="button"
                onClick={() => setIdentity(generateIdentity(preset))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
              >
                <RefreshCw className="size-3.5" />
                Новый HWID
              </button>
            )}
          </div>
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

        {manual && (
          <div className="mb-3">
            <input
              value={manualHwid}
              onChange={(e) => setManualHwid(e.target.value)}
              placeholder="например 3f9a1c04b7de2851 или UUID устройства"
              spellCheck={false}
              autoComplete="off"
              aria-label="Свой HWID"
              className={`h-10 w-full rounded-lg border bg-input px-3 font-mono text-sm outline-none placeholder:text-muted-foreground focus:border-ring ${
                manualHwid && !hwidCheck.ok ? "border-destructive" : "border-border"
              }`}
            />
            <p
              className={`mt-1 font-mono text-[11px] ${
                manualHwid && !hwidCheck.ok ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {hwidCheck.hint}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Fingerprint className="size-4 text-accent" />
            <code className="min-w-0 break-all font-mono text-base tracking-[0.18em] text-accent">
              {effectiveIdentity?.hwid ?? "····"}
            </code>
            {effectiveIdentity && <CopyButton value={effectiveIdentity.hwid} label="HWID" />}
            <span className="font-mono text-[10px] uppercase text-muted-foreground">
              {manual ? "вручную" : preset.os === "iOS" ? "UUID" : "ANDROID_ID · 64 бита"}
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
          disabled={loading || !normalized || (manual && !hwidCheck.ok)}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-mono text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {loading ? "Регистрирую устройство…" : "Забрать конфиги с этим X-HWID"}
        </button>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">Ошибка</p>
            <p className="mt-0.5 break-words text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <>
          <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Профиль", result.meta.title || "—"],
              ["HWID принят", result.rawHeaders["x-hwid-active"] === "true" ? "да · привязан" : "не заявлен"],
              ["Формат", `${result.format} · ${result.nodes.length} ${plural(result.nodes.length, NODES)}`],
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

          <UsageBars meta={result.meta} />

          {result.meta.announce && (
            <section className="rounded-xl border border-accent/30 bg-accent/10 p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-accent">Announce от панели</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.meta.announce}</p>
            </section>
          )}

          {result.nodes.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Панель ответила, но узлов в ответе нет. Попробуй другой формат в списке справа от ссылки.
            </p>
          ) : (
            <NodeList nodes={result.nodes} selected={selected} onSelectionChange={setSelected} />
          )}

          <ExportPanel nodes={result.nodes} selectedIds={selected} raw={result.raw} />

          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Заголовки ответа подписки</summary>
            <div className="border-t border-border p-4">
              {Object.entries(result.rawHeaders).map(([k, v]) => (
                <div
                  key={k}
                  className="flex gap-2 border-b border-border py-1.5 font-mono text-[11px] last:border-b-0"
                >
                  <span className="w-52 shrink-0 text-muted-foreground">{k}</span>
                  <span className="min-w-0 flex-1 break-all">{v}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {showSubQr && normalized && (
        <QrDialog value={normalized} title="Ссылка подписки" onClose={() => setShowSubQr(false)} />
      )}
    </div>
  )
}
