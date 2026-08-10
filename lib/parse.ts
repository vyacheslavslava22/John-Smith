// Парсинг ответа подписки в единый список узлов + генерация share-ссылок.

export type Node = {
  id: string
  name: string
  profile: string
  protocol: string
  address: string
  port: number
  uuid?: string
  password?: string
  network?: string
  security?: string
  sni?: string
  host?: string
  path?: string
  publicKey?: string
  shortId?: string
  fingerprint?: string
  flow?: string
  alpn?: string[]
  method?: string
  hysteriaVersion?: number
  obfs?: string
  obfsPassword?: string
  allowInsecure?: boolean
  raw: unknown
  share?: string
}

export type ParsedSubscription = {
  format: "xray-json" | "clash" | "base64-links" | "plain-links" | "unknown"
  nodes: Node[]
  profiles: string[]
  rawText: string
  meta: SubMeta
}

export type SubMeta = {
  title?: string
  announce?: string
  supportUrl?: string
  webPageUrl?: string
  updateInterval?: string
  hwidActive?: boolean
  upload?: number
  download?: number
  total?: number
  expire?: number
  filename?: string
}

function b64decode(s: string): string {
  const clean = s.replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/")
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4)
  if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8")
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function maybeBase64Header(v?: string | null): string | undefined {
  if (!v) return undefined
  if (v.startsWith("base64:")) {
    try {
      return b64decode(v.slice(7))
    } catch {
      return v
    }
  }
  return v
}

const SKIP_PROTOCOLS = new Set(["freedom", "blackhole", "dns", "loopback", "http", "socks", "selector", "urltest"])

function firstOf<T>(v: T | T[] | undefined): T | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

/** Xray/V2Ray outbound -> Node */
function nodeFromXrayOutbound(o: any, profile: string, index: number): Node | null {
  const protocol = String(o?.protocol || "").toLowerCase()
  if (!protocol || SKIP_PROTOCOLS.has(protocol)) return null

  const ss = o.streamSettings || {}
  const tls = ss.tlsSettings || ss.realitySettings || {}
  const base: Partial<Node> = {
    id: `${profile}::${o.tag || protocol}::${index}`,
    name: String(o.tag || `${protocol}-${index}`),
    profile,
    protocol,
    network: ss.network || "tcp",
    security: ss.security || "none",
    sni: tls.serverName,
    fingerprint: tls.fingerprint,
    publicKey: ss.realitySettings?.publicKey,
    shortId: ss.realitySettings?.shortId,
    alpn: tls.alpn,
    allowInsecure: tls.allowInsecure,
    host: ss.wsSettings?.headers?.Host || ss.httpSettings?.host?.[0] || ss.httpupgradeSettings?.host,
    path: ss.wsSettings?.path || ss.httpSettings?.path || ss.httpupgradeSettings?.path || ss.grpcSettings?.serviceName,
    raw: o,
  }

  if (protocol === "vless" || protocol === "vmess") {
    const vnext = firstOf(o.settings?.vnext)
    const user = firstOf(vnext?.users)
    if (!vnext?.address) return null
    return {
      ...base,
      address: String(vnext.address),
      port: Number(vnext.port),
      uuid: user?.id,
      flow: user?.flow || undefined,
    } as Node
  }

  if (protocol === "trojan" || protocol === "shadowsocks") {
    const srv = firstOf(o.settings?.servers)
    if (!srv?.address) return null
    return {
      ...base,
      address: String(srv.address),
      port: Number(srv.port),
      password: srv.password,
      method: srv.method,
    } as Node
  }

  if (protocol === "hysteria" || protocol === "hysteria2" || protocol === "tuic") {
    const st = o.settings || {}
    const hy = ss.hysteriaSettings || {}
    const addr = st.address || st.server
    if (!addr) return null
    return {
      ...base,
      address: String(addr),
      port: Number(st.port ?? 443),
      password: hy.auth || st.auth || st.password,
      uuid: st.uuid,
      hysteriaVersion: Number(hy.version || st.version || 2),
      obfs: hy.obfs || st.obfs,
      obfsPassword: hy.obfsPassword || st.obfsPassword,
    } as Node
  }

  return null
}

/** Clash proxy -> Node */
function nodeFromClashProxy(p: any, profile: string, index: number): Node | null {
  const type = String(p?.type || "").toLowerCase()
  if (!type || !p.server) return null
  const proto = type === "ss" ? "shadowsocks" : type
  return {
    id: `${profile}::${p.name}::${index}`,
    name: String(p.name || `${proto}-${index}`),
    profile,
    protocol: proto,
    address: String(p.server),
    port: Number(p.port),
    uuid: p.uuid,
    password: p.password ?? p["auth-str"],
    method: p.cipher,
    network: p.network || "tcp",
    security: p.tls || p["reality-opts"] ? "tls" : "none",
    sni: p.sni || p.servername,
    host: p["ws-opts"]?.headers?.Host,
    path: p["ws-opts"]?.path || p["grpc-opts"]?.["grpc-service-name"],
    publicKey: p["reality-opts"]?.["public-key"],
    shortId: p["reality-opts"]?.["short-id"],
    fingerprint: p["client-fingerprint"],
    flow: p.flow,
    alpn: p.alpn,
    allowInsecure: p["skip-cert-verify"],
    obfs: p.obfs,
    raw: p,
  }
}

/** Готовая ссылка (vless://, ss:// и т.д.) -> Node */
function nodeFromLink(link: string, profile: string, index: number): Node | null {
  const trimmed = link.trim()
  const m = trimmed.match(/^([a-z0-9]+):\/\//i)
  if (!m) return null
  const scheme = m[1].toLowerCase()

  try {
    if (scheme === "vmess") {
      const cfg = JSON.parse(b64decode(trimmed.slice(8)))
      return {
        id: `${profile}::vmess::${index}`,
        name: cfg.ps || `vmess-${index}`,
        profile,
        protocol: "vmess",
        address: cfg.add,
        port: Number(cfg.port),
        uuid: cfg.id,
        network: cfg.net,
        security: cfg.tls || "none",
        sni: cfg.sni,
        host: cfg.host,
        path: cfg.path,
        raw: cfg,
        share: trimmed,
      }
    }

    const u = new URL(trimmed)
    const q = u.searchParams
    const name = decodeURIComponent(u.hash.replace(/^#/, "")) || `${scheme}-${index}`
    const node: Node = {
      id: `${profile}::${scheme}::${index}`,
      name,
      profile,
      protocol: scheme === "hy2" ? "hysteria2" : scheme === "ss" ? "shadowsocks" : scheme,
      address: u.hostname,
      port: Number(u.port || 443),
      uuid: scheme === "vless" ? decodeURIComponent(u.username) : undefined,
      password: scheme === "vless" ? undefined : decodeURIComponent(u.username || q.get("password") || ""),
      network: q.get("type") || "tcp",
      security: q.get("security") || (scheme.startsWith("hy") ? "tls" : "none"),
      sni: q.get("sni") || undefined,
      host: q.get("host") || undefined,
      path: q.get("path") || q.get("serviceName") || undefined,
      publicKey: q.get("pbk") || undefined,
      shortId: q.get("sid") || undefined,
      fingerprint: q.get("fp") || undefined,
      flow: q.get("flow") || undefined,
      alpn: q.get("alpn") ? q.get("alpn")!.split(",") : undefined,
      obfs: q.get("obfs") || undefined,
      obfsPassword: q.get("obfs-password") || undefined,
      allowInsecure: q.get("allowInsecure") === "1" || q.get("insecure") === "1",
      raw: trimmed,
      share: trimmed,
    }
    if (!node.address) return null
    return node
  } catch {
    return null
  }
}

/** Собираем share-ссылку из узла */
export function toShareLink(n: Node): string {
  if (n.share) return n.share
  const tag = encodeURIComponent(n.name)

  if (n.protocol === "vless") {
    const q = new URLSearchParams()
    q.set("type", n.network || "tcp")
    q.set("security", n.security || "none")
    if (n.sni) q.set("sni", n.sni)
    if (n.publicKey) q.set("pbk", n.publicKey)
    if (n.shortId) q.set("sid", n.shortId)
    if (n.fingerprint) q.set("fp", n.fingerprint)
    if (n.flow) q.set("flow", n.flow)
    if (n.host) q.set("host", n.host)
    if (n.path) q.set(n.network === "grpc" ? "serviceName" : "path", n.path)
    if (n.alpn?.length) q.set("alpn", n.alpn.join(","))
    if (n.allowInsecure) q.set("allowInsecure", "1")
    return `vless://${n.uuid}@${n.address}:${n.port}?${q.toString()}#${tag}`
  }

  if (n.protocol === "vmess") {
    const cfg = {
      v: "2",
      ps: n.name,
      add: n.address,
      port: String(n.port),
      id: n.uuid,
      aid: "0",
      scy: "auto",
      net: n.network || "tcp",
      type: "none",
      host: n.host || "",
      path: n.path || "",
      tls: n.security === "tls" ? "tls" : "",
      sni: n.sni || "",
    }
    const json = JSON.stringify(cfg)
    const b64 = typeof Buffer !== "undefined" ? Buffer.from(json, "utf8").toString("base64") : btoa(json)
    return `vmess://${b64}`
  }

  if (n.protocol === "trojan") {
    const q = new URLSearchParams()
    q.set("type", n.network || "tcp")
    q.set("security", n.security || "tls")
    if (n.sni) q.set("sni", n.sni)
    if (n.fingerprint) q.set("fp", n.fingerprint)
    if (n.path) q.set("path", n.path)
    if (n.host) q.set("host", n.host)
    return `trojan://${encodeURIComponent(n.password || "")}@${n.address}:${n.port}?${q.toString()}#${tag}`
  }

  if (n.protocol === "shadowsocks") {
    const userinfo = `${n.method || "aes-256-gcm"}:${n.password || ""}`
    const b64 = typeof Buffer !== "undefined" ? Buffer.from(userinfo, "utf8").toString("base64") : btoa(userinfo)
    return `ss://${b64}@${n.address}:${n.port}#${tag}`
  }

  if (n.protocol === "hysteria2" || (n.protocol === "hysteria" && (n.hysteriaVersion ?? 2) >= 2)) {
    const q = new URLSearchParams()
    if (n.sni) q.set("sni", n.sni)
    if (n.obfs) q.set("obfs", n.obfs)
    if (n.obfsPassword) q.set("obfs-password", n.obfsPassword)
    if (n.alpn?.length) q.set("alpn", n.alpn.join(","))
    if (n.allowInsecure) q.set("insecure", "1")
    const qs = q.toString()
    return `hy2://${encodeURIComponent(n.password || "")}@${n.address}:${n.port}${qs ? "?" + qs : ""}#${tag}`
  }

  if (n.protocol === "hysteria") {
    const q = new URLSearchParams()
    q.set("protocol", "udp")
    if (n.sni) q.set("peer", n.sni)
    if (n.password) q.set("auth", n.password)
    if (n.alpn?.length) q.set("alpn", n.alpn.join(","))
    return `hysteria://${n.address}:${n.port}?${q.toString()}#${tag}`
  }

  if (n.protocol === "tuic") {
    const q = new URLSearchParams()
    if (n.sni) q.set("sni", n.sni)
    if (n.alpn?.length) q.set("alpn", n.alpn.join(","))
    return `tuic://${n.uuid}:${encodeURIComponent(n.password || "")}@${n.address}:${n.port}?${q.toString()}#${tag}`
  }

  return `${n.protocol}://${n.address}:${n.port}#${tag}`
}

function parseClashYaml(text: string, nodes: Node[], profiles: Set<string>) {
  // Лёгкий разбор блока proxies из Clash YAML (строки вида "- {name: X, server: Y, ...}")
  const lines = text.split(/\r?\n/)
  let inProxies = false
  let idx = 0
  for (const line of lines) {
    if (/^proxies:\s*$/.test(line)) {
      inProxies = true
      continue
    }
    if (inProxies && /^[a-zA-Z"']/.test(line)) {
      if (!/^\s/.test(line)) inProxies = false
    }
    if (!inProxies) continue
    const t = line.trim()
    if (!t.startsWith("- ")) continue
    const body = t.slice(2).trim()
    if (!body.startsWith("{")) continue
    // превращаем flow-map YAML в JSON
    let jsonish = body
      .replace(/([{,]\s*)([A-Za-z0-9_\-.]+)\s*:/g, '$1"$2":')
      .replace(/:\s*([^",{[\]}]+?)\s*(?=[,}])/g, (_m, v) => {
        const val = String(v).trim()
        if (val === "true" || val === "false" || val === "null") return `: ${val}`
        if (/^-?\d+(\.\d+)?$/.test(val)) return `: ${val}`
        return `: "${val.replace(/"/g, '\\"')}"`
      })
    try {
      const obj = JSON.parse(jsonish)
      const n = nodeFromClashProxy(obj, "clash", idx++)
      if (n) {
        profiles.add("clash")
        nodes.push(n)
      }
    } catch {
      /* пропускаем нераспознанную строку */
    }
  }
}

export function parseSubscription(text: string, meta: SubMeta): ParsedSubscription {
  const nodes: Node[] = []
  const profiles = new Set<string>()
  let format: ParsedSubscription["format"] = "unknown"
  const trimmed = text.trim()

  // 1. Xray JSON (массив профилей или один объект)
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed)
      const list = Array.isArray(json) ? json : [json]
      format = "xray-json"
      list.forEach((profile: any, pi: number) => {
        const label = profile.remarks || profile.tag || `Profile ${pi + 1}`
        profiles.add(label)
        const obs = profile.outbounds || profile.outbound || []
        obs.forEach((o: any, oi: number) => {
          const n = nodeFromXrayOutbound(o, label, oi)
          if (n) nodes.push(n)
        })
      })
    } catch {
      format = "unknown"
    }
  }

  // 2. Clash / Mihomo YAML
  if (nodes.length === 0 && /(^|\n)proxies:/.test(trimmed)) {
    format = "clash"
    parseClashYaml(trimmed, nodes, profiles)
  }

  // 3. base64-список ссылок
  if (nodes.length === 0 && /^[A-Za-z0-9+/=_\-\s]+$/.test(trimmed) && trimmed.length > 40) {
    try {
      const decoded = b64decode(trimmed)
      if (/:\/\//.test(decoded)) {
        format = "base64-links"
        decoded
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((l, i) => {
            const n = nodeFromLink(l, "subscription", i)
            if (n) {
              profiles.add("subscription")
              nodes.push(n)
            }
          })
      }
    } catch {
      /* not base64 */
    }
  }

  // 4. Обычный список ссылок
  if (nodes.length === 0 && /(vless|vmess|trojan|ss|hy2|hysteria2?|tuic):\/\//.test(trimmed)) {
    format = "plain-links"
    trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l, i) => {
        const n = nodeFromLink(l, "subscription", i)
        if (n) {
          profiles.add("subscription")
          nodes.push(n)
        }
      })
  }

  for (const n of nodes) n.share = toShareLink(n)

  return { format, nodes, profiles: [...profiles], rawText: text, meta }
}
