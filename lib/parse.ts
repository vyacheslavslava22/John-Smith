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
  format: "xray-json" | "sing-box" | "clash" | "base64-links" | "plain-links" | "unknown"
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

const SINGBOX_SKIP = new Set(["selector", "urltest", "direct", "block", "dns", "socks", "http", "tor", "ssh"])

/** sing-box outbound -> Node */
function nodeFromSingBoxOutbound(o: any, profile: string, index: number): Node | null {
  const type = String(o?.type || "").toLowerCase()
  if (!type || SINGBOX_SKIP.has(type) || !o.server) return null

  const tls = o.tls || {}
  const reality = tls.reality || {}
  const transport = o.transport || {}
  const security = reality.enabled ? "reality" : tls.enabled ? "tls" : "none"
  const network = transport.type ? String(transport.type) : "tcp"

  return {
    id: `${profile}::${o.tag || type}::${index}`,
    name: String(o.tag || `${type}-${index}`),
    profile,
    protocol: type === "ss" ? "shadowsocks" : type,
    address: String(o.server),
    port: Number(o.server_port ?? 443),
    uuid: o.uuid,
    password: o.password ?? o.auth_str ?? o.auth,
    method: o.method,
    network,
    security,
    sni: tls.server_name,
    host: firstOf(transport.headers?.Host) ?? firstOf(transport.headers?.host),
    path: network === "grpc" ? transport.service_name : transport.path,
    publicKey: reality.public_key,
    shortId: reality.short_id,
    fingerprint: tls.utls?.fingerprint,
    flow: o.flow || undefined,
    alpn: tls.alpn,
    allowInsecure: Boolean(tls.insecure),
    hysteriaVersion: type === "hysteria2" ? 2 : type === "hysteria" ? 1 : undefined,
    obfs: typeof o.obfs === "object" ? o.obfs?.type : o.obfs,
    obfsPassword: typeof o.obfs === "object" ? o.obfs?.password : undefined,
    raw: o,
  }
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
    security: p["reality-opts"]
      ? "reality"
      : p.tls || proto === "hysteria2" || proto === "hysteria" || proto === "tuic" || proto === "trojan"
        ? "tls"
        : "none",
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

/**
 * ss:// в двух видах:
 *   ss://base64(method:password)@host:port#tag   (SIP002, современный)
 *   ss://base64(method:password@host:port)#tag   (legacy, всё в base64)
 */
function nodeFromSsLink(link: string, profile: string, index: number): Node | null {
  const hashAt = link.indexOf("#")
  const tag = hashAt === -1 ? "" : decodeURIComponent(link.slice(hashAt + 1))
  let body = (hashAt === -1 ? link : link.slice(0, hashAt)).slice("ss://".length)

  // отделяем плагины (?plugin=...)
  const qAt = body.indexOf("?")
  const query = qAt === -1 ? "" : body.slice(qAt + 1)
  if (qAt !== -1) body = body.slice(0, qAt)

  let method = ""
  let password = ""
  let host = ""
  let port = 0

  const atAt = body.lastIndexOf("@")
  if (atAt !== -1) {
    // SIP002: userinfo может быть base64 или уже открытым "method:password"
    const userinfoRaw = body.slice(0, atAt)
    const hostPart = body.slice(atAt + 1)
    let userinfo = decodeURIComponent(userinfoRaw)
    if (!userinfo.includes(":")) {
      try {
        userinfo = b64decode(userinfoRaw)
      } catch {
        return null
      }
    }
    const ci = userinfo.indexOf(":")
    method = userinfo.slice(0, ci)
    password = userinfo.slice(ci + 1)
    const pi = hostPart.lastIndexOf(":")
    host = hostPart.slice(0, pi).replace(/^\[|\]$/g, "")
    port = Number(hostPart.slice(pi + 1))
  } else {
    // legacy: всё тело в base64
    let decoded: string
    try {
      decoded = b64decode(body)
    } catch {
      return null
    }
    const m = decoded.match(/^([^:]+):(.*)@(.+):(\d+)$/)
    if (!m) return null
    method = m[1]
    password = m[2]
    host = m[3].replace(/^\[|\]$/g, "")
    port = Number(m[4])
  }

  if (!host || !Number.isFinite(port) || port <= 0) return null

  const plugin = new URLSearchParams(query).get("plugin") || undefined

  return {
    id: `${profile}::ss::${index}`,
    name: tag || `shadowsocks-${index}`,
    profile,
    protocol: "shadowsocks",
    address: host,
    port,
    password,
    method,
    network: "tcp",
    security: "none",
    obfs: plugin,
    raw: link,
    share: link,
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

    if (scheme === "ss") return nodeFromSsLink(trimmed, profile, index)

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

/* ------------------------------------------------------------------ *
 * Мини-парсер подмножества YAML: хватает для блока proxies в Clash.
 * Поддерживает блочные списки, flow-мапы {a: 1}, flow-списки [a, b]
 * и вложенные мапы (ws-opts, reality-opts, grpc-opts, headers).
 * ------------------------------------------------------------------ */

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function isBlank(line: string): boolean {
  return !line.trim() || line.trim().startsWith("#")
}

/** Разбивает "a: 1, b: [x, y]" по запятым верхнего уровня. */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let buf = ""
  for (const ch of s) {
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === "{" || ch === "[") depth++
    if (ch === "}" || ch === "]") depth--
    if (ch === "," && depth === 0) {
      out.push(buf)
      buf = ""
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf)
  return out
}

function unquote(s: string): string {
  const v = s.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"')
  }
  return v
}

function parseFlowMap(s: string): Record<string, unknown> {
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "")
  const out: Record<string, unknown> = {}
  for (const part of splitTopLevel(inner)) {
    const ci = part.indexOf(":")
    if (ci === -1) continue
    out[unquote(part.slice(0, ci))] = parseYamlScalar(part.slice(ci + 1))
  }
  return out
}

function parseYamlScalar(raw: string): unknown {
  const v = raw.trim()
  if (!v || v === "~" || v === "null") return null
  if (v === "true") return true
  if (v === "false") return false
  if (/^-?\d+$/.test(v)) return Number(v)
  if (/^-?\d+\.\d+$/.test(v)) return Number(v)
  if (v.startsWith("{") && v.endsWith("}")) return parseFlowMap(v)
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim()
    return inner ? splitTopLevel(inner).map(parseYamlScalar) : []
  }
  return unquote(v)
}

/** Блочная мапа на заданном отступе. Возвращает объект и индекс следующей строки. */
function parseBlockMap(lines: string[], start: number, indent: number): [Record<string, unknown>, number] {
  const obj: Record<string, unknown> = {}
  let i = start
  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i++
      continue
    }
    const ind = indentOf(lines[i])
    if (ind < indent) break
    const t = lines[i].trim()
    if (ind > indent || t.startsWith("- ")) {
      i++
      continue
    }
    const ci = t.indexOf(":")
    if (ci === -1) {
      i++
      continue
    }
    const key = unquote(t.slice(0, ci))
    const rest = t.slice(ci + 1).trim()
    if (rest && !rest.startsWith("#")) {
      obj[key] = parseYamlScalar(rest)
      i++
      continue
    }
    // значение — вложенный блок
    let j = i + 1
    while (j < lines.length && isBlank(lines[j])) j++
    if (j < lines.length && indentOf(lines[j]) > indent) {
      const childIndent = indentOf(lines[j])
      if (lines[j].trim().startsWith("- ")) {
        const [arr, next] = parseBlockSeq(lines, j, childIndent)
        obj[key] = arr
        i = next
      } else {
        const [child, next] = parseBlockMap(lines, j, childIndent)
        obj[key] = child
        i = next
      }
    } else {
      obj[key] = null
      i = j
    }
  }
  return [obj, i]
}

/** Блочный список на заданном отступе. */
function parseBlockSeq(lines: string[], start: number, indent: number): [unknown[], number] {
  const arr: unknown[] = []
  let i = start
  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i++
      continue
    }
    const ind = indentOf(lines[i])
    const t = lines[i].trim()
    if (ind < indent || !t.startsWith("-")) break
    if (ind > indent) {
      i++
      continue
    }

    const content = t.replace(/^-\s*/, "")
    // собираем дополнительные строки элемента (вложенные ключи)
    const extra: string[] = []
    let j = i + 1
    while (j < lines.length) {
      if (isBlank(lines[j])) {
        extra.push(lines[j])
        j++
        continue
      }
      if (indentOf(lines[j]) <= ind) break
      extra.push(lines[j])
      j++
    }

    if (content.startsWith("{")) {
      const item = parseFlowMap(content)
      // некоторые панели дописывают вложенные опции под flow-мапой
      if (extra.some((l) => !isBlank(l))) {
        const childIndent = indentOf(extra.find((l) => !isBlank(l))!)
        const [child] = parseBlockMap(extra, 0, childIndent)
        Object.assign(item, child)
      }
      arr.push(item)
    } else if (content.includes(":")) {
      const sub = [" ".repeat(ind + 2) + content, ...extra]
      const [item] = parseBlockMap(sub, 0, ind + 2)
      arr.push(item)
    } else if (content) {
      arr.push(parseYamlScalar(content))
    }
    i = j
  }
  return [arr, i]
}

function parseClashYaml(text: string, nodes: Node[], profiles: Set<string>) {
  const lines = text.split(/\r?\n/)
  let idx = 0

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (indentOf(lines[i]) !== 0 || !t.startsWith("proxies:")) continue

    const inline = t.slice("proxies:".length).trim()
    let items: unknown[] = []

    if (inline.startsWith("[")) {
      items = (parseYamlScalar(inline) as unknown[]) || []
    } else {
      let j = i + 1
      while (j < lines.length && isBlank(lines[j])) j++
      if (j >= lines.length) break
      const itemIndent = indentOf(lines[j])
      if (!lines[j].trim().startsWith("-")) continue
      const [arr] = parseBlockSeq(lines, j, itemIndent)
      items = arr
    }

    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const n = nodeFromClashProxy(item as any, "clash", idx++)
      if (n) {
        profiles.add("clash")
        nodes.push(n)
      }
    }
    break
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
      // sing-box описывает outbound через "type", Xray — через "protocol"
      const isSingBox = list.some((p: any) =>
        (p?.outbounds || []).some((o: any) => o && typeof o.type === "string" && !o.protocol),
      )
      format = isSingBox ? "sing-box" : "xray-json"
      list.forEach((profile: any, pi: number) => {
        const label = profile.remarks || profile.tag || `Profile ${pi + 1}`
        const obs = profile.outbounds || profile.outbound || []
        obs.forEach((o: any, oi: number) => {
          const n = o?.protocol ? nodeFromXrayOutbound(o, label, oi) : nodeFromSingBoxOutbound(o, label, oi)
          if (n) {
            profiles.add(label)
            nodes.push(n)
          }
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
