"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Globe, Server, ShieldCheck } from "lucide-react"
import type { Node } from "@/lib/parse"
import { CopyButton } from "./copy-button"

const PROTO_COLORS: Record<string, string> = {
  vless: "text-primary",
  vmess: "text-primary",
  trojan: "text-accent",
  shadowsocks: "text-accent",
  hysteria: "text-accent",
  hysteria2: "text-accent",
  tuic: "text-accent",
}

function NodeRow({ node, index }: { node: Node; index: number }) {
  const [open, setOpen] = useState(false)
  const secret = node.uuid || node.password || ""

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
      >
        <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{node.name}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {node.address}:{node.port}
          </span>
        </span>
        <span className={`shrink-0 font-mono text-xs uppercase ${PROTO_COLORS[node.protocol] ?? "text-muted-foreground"}`}>
          {node.protocol}
        </span>
        <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground sm:inline">
          {node.security === "none" ? node.network : node.security}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 bg-secondary/40 px-4 pb-4 pt-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
            {[
              ["Профиль", node.profile],
              ["Адрес", node.address],
              ["Порт", String(node.port)],
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

export function NodeList({ nodes }: { nodes: Node[] }) {
  const [query, setQuery] = useState("")
  const [proto, setProto] = useState("all")
  const [profile, setProfile] = useState("all")

  const protocols = useMemo(() => [...new Set(nodes.map((n) => n.protocol))].sort(), [nodes])
  const profiles = useMemo(() => [...new Set(nodes.map((n) => n.profile))], [nodes])

  const filtered = nodes.filter((n) => {
    if (proto !== "all" && n.protocol !== proto) return false
    if (profile !== "all" && n.profile !== profile) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (
      n.name.toLowerCase().includes(q) ||
      n.address.toLowerCase().includes(q) ||
      (n.sni || "").toLowerCase().includes(q) ||
      String(n.port).includes(q)
    )
  })

  const uniqueServers = new Set(nodes.map((n) => n.address)).size

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
            {nodes.length} узлов
          </span>
          <span className="flex items-center gap-1">
            <Globe className="size-3.5" />
            {uniqueServers} IP
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: страна, IP, SNI…"
            className="h-8 w-40 rounded-md border border-border bg-input px-2.5 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
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
            className="h-8 rounded-md border border-border bg-input px-2 font-mono text-xs uppercase outline-none focus:border-ring"
          >
            <option value="all">Все</option>
            {protocols.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="max-h-[32rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ничего не найдено по этому фильтру.</p>
        ) : (
          filtered.map((n, i) => <NodeRow key={n.id} node={n} index={i} />)
        )}
      </div>
    </section>
  )
}
