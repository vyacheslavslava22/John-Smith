"use client"

import { useMemo, useState } from "react"
import { Activity, ChevronDown, Globe, Loader2, QrCode, Server, ShieldCheck } from "lucide-react"
import { NODES, plural } from "@/lib/format"
import type { Node } from "@/lib/parse"
import { CopyButton } from "./copy-button"
import { QrDialog } from "./qr-dialog"

export type PingMap = Record<string, { ok: boolean; ms: number | null; error?: string }>

const PROTO_COLORS: Record<string, string> = {
  vless: "text-primary",
  vmess: "text-primary",
  trojan: "text-accent",
  shadowsocks: "text-accent",
  hysteria: "text-accent",
  hysteria2: "text-accent",
  tuic: "text-accent",
}

function latencyClass(ms: number) {
  if (ms < 150) return "text-accent"
  if (ms < 400) return "text-primary"
  return "text-muted-foreground"
}

function PingBadge({ p }: { p?: { ok: boolean; ms: number | null } }) {
  if (!p) return null
  if (!p.ok) return <span className="shrink-0 font-mono text-[10px] uppercase text-destructive">мёртв</span>
  return <span className={`shrink-0 font-mono text-[11px] ${latencyClass(p.ms ?? 0)}`}>{p.ms} ms</span>
}

function NodeRow({
  node,
  index,
  selected,
  onToggle,
  ping,
  onQr,
}: {
  node: Node
  index: number
  selected: boolean
  onToggle: () => void
  ping?: { ok: boolean; ms: number | null; error?: string }
  onQr: () => void
}) {
  const [open, setOpen] = useState(false)
  const secret = node.uuid || node.password || ""

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex w-full items-center gap-2 pl-3 pr-2 transition-colors hover:bg-secondary/60">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Выбрать узел ${node.name}`}
          className="size-4 shrink-0 accent-[var(--primary)]"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
          aria-expanded={open}
        >
          <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{node.name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {node.address}:{node.port}
            </span>
          </span>
          <PingBadge p={ping} />
          <span
            className={`shrink-0 font-mono text-xs uppercase ${PROTO_COLORS[node.protocol] ?? "text-muted-foreground"}`}
          >
            {node.protocol}
          </span>
          <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground sm:inline">
            {node.security === "none" ? node.network : node.security}
          </span>
        </button>
        <button
          type="button"
          onClick={onQr}
          aria-label={`QR-код для ${node.name}`}
          title="QR-код"
          className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-secondary transition-colors hover:bg-muted"
        >
          <QrCode className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Свернуть детали" : "Развернуть детали"}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-3 bg-secondary/40 px-4 pb-4 pt-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
            {[
              ["Профиль", node.profile],
              ["Адрес", node.address],
              ["Порт", String(node.port)],
              ["Задержка", ping ? (ping.ok ? `${ping.ms} ms` : `нет связи (${ping.error || "timeout"})`) : undefined],
              ["Транспорт", node.network || "tcp"],
              ["Шифрование", node.security || "none"],
              ["SNI", node.sni],
              ["Fingerprint", node.fingerprint],
              ["Flow", node.flow],
              ["Public key", node.publicKey],
              ["Short ID", node.shortId],
              ["Path / service", node.path],
              ["Host", node.host],
              ["Method", node.method],
              ["ALPN", node.alpn?.join(", ")],
              ["Hysteria", node.hysteriaVersion ? `v${node.hysteriaVersion}` : undefined],
              ["Ключ / пароль", secret],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={String(k)} className="min-w-0">
                  <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono text-xs" title={String(v)}>
                    {String(v)}
                  </dd>
                </div>
              ))}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={node.share || ""} label="Ссылка" />
            <CopyButton value={JSON.stringify(node.raw, null, 2)} label="JSON" />
            {secret && <CopyButton value={secret} label="Ключ" />}
          </div>

          <pre className="max-h-32 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {node.share}
          </pre>
        </div>
      )}
    </div>
  )
}

export function NodeList({
  nodes,
  selected,
  onSelectionChange,
}: {
  nodes: Node[]
  selected: Set<string>
  onSelectionChange: (next: Set<string>) => void
}) {
  const [query, setQuery] = useState("")
  const [proto, setProto] = useState("all")
  const [profile, setProfile] = useState("all")
  const [sort, setSort] = useState<"default" | "latency" | "name">("default")
  const [ping, setPing] = useState<PingMap>({})
  const [pinging, setPinging] = useState(false)
  const [pingError, setPingError] = useState<string | null>(null)
  const [qrNode, setQrNode] = useState<Node | null>(null)

  const protocols = useMemo(() => [...new Set(nodes.map((n) => n.protocol))].sort(), [nodes])
  const profiles = useMemo(() => [...new Set(nodes.map((n) => n.profile))], [nodes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = nodes.filter((n) => {
      if (proto !== "all" && n.protocol !== proto) return false
      if (profile !== "all" && n.profile !== profile) return false
      if (!q) return true
      return (
        n.name.toLowerCase().includes(q) ||
        n.address.toLowerCase().includes(q) ||
        (n.sni || "").toLowerCase().includes(q) ||
        String(n.port).includes(q)
      )
    })

    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"))
    if (sort === "latency") {
      return [...list].sort((a, b) => {
        const pa = ping[a.id]
        const pb = ping[b.id]
        const va = pa?.ok ? (pa.ms ?? 9e6) : 9e6 + (pa ? 1 : 0)
        const vb = pb?.ok ? (pb.ms ?? 9e6) : 9e6 + (pb ? 1 : 0)
        return va - vb
      })
    }
    return list
  }, [nodes, query, proto, profile, sort, ping])

  const uniqueServers = useMemo(() => new Set(nodes.map((n) => n.address)).size, [nodes])
  const allVisibleSelected = filtered.length > 0 && filtered.every((n) => selected.has(n.id))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  function toggleAllVisible() {
    const next = new Set(selected)
    if (allVisibleSelected) filtered.forEach((n) => next.delete(n.id))
    else filtered.forEach((n) => next.add(n.id))
    onSelectionChange(next)
  }

  async function runPing() {
    const targets = filtered.slice(0, 80).map((n) => ({ id: n.id, host: n.address, port: n.port }))
    if (targets.length === 0) return
    setPinging(true)
    setPingError(null)
    try {
      const res = await fetch("/api/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setPingError(data.error || "Не удалось проверить узлы")
        return
      }
      const map: PingMap = { ...ping }
      for (const r of data.results as Array<{ id: string; ok: boolean; ms: number | null; error?: string }>) {
        map[r.id] = { ok: r.ok, ms: r.ms, error: r.error }
      }
      setPing(map)
      setSort("latency")
    } catch (e) {
      setPingError((e as Error).message)
    } finally {
      setPinging(false)
    }
  }

  function selectAlive() {
    const next = new Set(selected)
    filtered.forEach((n) => {
      if (ping[n.id]?.ok) next.add(n.id)
      else next.delete(n.id)
    })
    onSelectionChange(next)
  }

  const testedCount = filtered.filter((n) => ping[n.id]).length
  const aliveCount = filtered.filter((n) => ping[n.id]?.ok).length

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Server className="size-4 text-primary" />
          Конфиги
        </h2>
        <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5" />
            {nodes.length} {plural(nodes.length, NODES)}
          </span>
          <span className="flex items-center gap-1">
            <Globe className="size-3.5" />
            {uniqueServers} IP
          </span>
          {testedCount > 0 && (
            <span className="flex items-center gap-1 text-accent">
              <Activity className="size-3.5" />
              {aliveCount}/{testedCount} живых
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: страна, IP, SNI…"
            aria-label="Поиск по узлам"
            className="h-8 w-40 rounded-md border border-border bg-input px-2.5 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            aria-label="Фильтр по профилю"
            className="h-8 rounded-md border border-border bg-input px-2 font-mono text-xs outline-none focus:border-ring"
          >
            <option value="all">Все профили</option>
            {profiles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={proto}
            onChange={(e) => setProto(e.target.value)}
            aria-label="Фильтр по протоколу"
            className="h-8 rounded-md border border-border bg-input px-2 font-mono text-xs uppercase outline-none focus:border-ring"
          >
            <option value="all">Все</option>
            {protocols.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Сортировка"
            className="h-8 rounded-md border border-border bg-input px-2 font-mono text-xs outline-none focus:border-ring"
          >
            <option value="default">Как в подписке</option>
            <option value="latency">По задержке</option>
            <option value="name">По имени</option>
          </select>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={toggleAllVisible}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
        >
          {allVisibleSelected ? "Снять выбор" : "Выбрать всё"}
        </button>
        <button
          type="button"
          onClick={runPing}
          disabled={pinging || filtered.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 font-mono text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pinging ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
          {pinging ? "Проверяю…" : `Проверить (${Math.min(filtered.length, 80)})`}
        </button>
        {testedCount > 0 && (
          <button
            type="button"
            onClick={selectAlive}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-muted"
          >
            Оставить только живые
          </button>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">выбрано: {selected.size}</span>
      </div>

      {pingError && (
        <p className="border-b border-border px-4 py-2 font-mono text-xs text-destructive">{pingError}</p>
      )}

      <div className="max-h-[32rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ничего не найдено по этому фильтру.</p>
        ) : (
          filtered.map((n, i) => (
            <NodeRow
              key={n.id}
              node={n}
              index={i}
              selected={selected.has(n.id)}
              onToggle={() => toggle(n.id)}
              ping={ping[n.id]}
              onQr={() => setQrNode(n)}
            />
          ))
        )}
      </div>

      {qrNode && (
        <QrDialog value={qrNode.share || ""} title={qrNode.name} onClose={() => setQrNode(null)} />
      )}
    </section>
  )
}
