// Экспорт узлов в форматы клиентов: ссылки, base64, Clash, sing-box, Xray JSON.

import type { Node } from "./parse"
import { toShareLink } from "./parse"

export function exportLinks(nodes: Node[]): string {
  return nodes.map((n) => n.share || toShareLink(n)).join("\n")
}

export function exportBase64(nodes: Node[]): string {
  const text = exportLinks(nodes)
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64")
  return btoa(unescape(encodeURIComponent(text)))
}

function yamlValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(yamlValue).join(", ")}]`
  return String(v)
}

export function exportClash(nodes: Node[]): string {
  const proxies: string[] = []
  const names: string[] = []

  nodes.forEach((n, i) => {
    const name = `${n.name} #${i + 1}`
    const fields: [string, unknown][] = [
      ["name", name],
      ["server", n.address],
      ["port", n.port],
    ]

    if (n.protocol === "vless") {
      fields.splice(1, 0, ["type", "vless"])
      fields.push(["uuid", n.uuid || ""], ["udp", true], ["network", n.network || "tcp"])
      if (n.flow) fields.push(["flow", n.flow])
      if (n.security === "tls" || n.security === "reality") fields.push(["tls", true])
      if (n.sni) fields.push(["servername", n.sni])
      if (n.fingerprint) fields.push(["client-fingerprint", n.fingerprint])
      if (n.allowInsecure) fields.push(["skip-cert-verify", true])
    } else if (n.protocol === "vmess") {
      fields.splice(1, 0, ["type", "vmess"])
      fields.push(["uuid", n.uuid || ""], ["alterId", 0], ["cipher", "auto"], ["udp", true], ["network", n.network || "tcp"])
      if (n.security === "tls") fields.push(["tls", true])
      if (n.sni) fields.push(["servername", n.sni])
    } else if (n.protocol === "trojan") {
      fields.splice(1, 0, ["type", "trojan"])
      fields.push(["password", n.password || ""], ["udp", true])
      if (n.sni) fields.push(["sni", n.sni])
      if (n.allowInsecure) fields.push(["skip-cert-verify", true])
    } else if (n.protocol === "shadowsocks") {
      fields.splice(1, 0, ["type", "ss"])
      fields.push(["cipher", n.method || "aes-256-gcm"], ["password", n.password || ""], ["udp", true])
    } else if (n.protocol === "hysteria2" || (n.protocol === "hysteria" && (n.hysteriaVersion ?? 2) >= 2)) {
      fields.splice(1, 0, ["type", "hysteria2"])
      fields.push(["password", n.password || ""])
      if (n.sni) fields.push(["sni", n.sni])
      if (n.obfs) fields.push(["obfs", n.obfs])
      if (n.obfsPassword) fields.push(["obfs-password", n.obfsPassword])
      if (n.alpn?.length) fields.push(["alpn", n.alpn])
      fields.push(["skip-cert-verify", Boolean(n.allowInsecure)])
    } else if (n.protocol === "hysteria") {
      fields.splice(1, 0, ["type", "hysteria"])
      fields.push(["auth-str", n.password || ""], ["protocol", "udp"], ["up", "50"], ["down", "100"])
      if (n.sni) fields.push(["sni", n.sni])
      if (n.alpn?.length) fields.push(["alpn", n.alpn])
    } else {
      return
    }

    names.push(name)
    const inner = fields.map(([k, v]) => `${k}: ${yamlValue(v)}`).join(", ")

    let extra = ""
    if (n.network === "ws") {
      extra = `\n    ws-opts:\n      path: ${yamlValue(n.path || "/")}${n.host ? `\n      headers:\n        Host: ${yamlValue(n.host)}` : ""}`
    } else if (n.network === "grpc" && n.path) {
      extra = `\n    grpc-opts:\n      grpc-service-name: ${yamlValue(n.path)}`
    }
    if (n.security === "reality" && n.publicKey) {
      extra += `\n    reality-opts:\n      public-key: ${yamlValue(n.publicKey)}${n.shortId ? `\n      short-id: ${yamlValue(n.shortId)}` : ""}`
    }

    proxies.push(`  - { ${inner} }${extra}`)
  })

  if (proxies.length === 0) {
    return "# Нет узлов, которые Clash/Mihomo умеет импортировать.\n"
  }

  return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
external-controller: 127.0.0.1:9090

dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query

proxies:
${proxies.join("\n")}

proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - AUTO
${names.map((n) => `      - ${yamlValue(n)}`).join("\n")}
  - name: AUTO
    type: url-test
    url: http://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 50
    proxies:
${names.map((n) => `      - ${yamlValue(n)}`).join("\n")}

rules:
  - GEOIP,PRIVATE,DIRECT,no-resolve
  - MATCH,PROXY
`
}

export function exportSingBox(nodes: Node[]): string {
  const outbounds: any[] = []
  const tags: string[] = []

  nodes.forEach((n, i) => {
    const tag = `${n.name} #${i + 1}`
    const tlsBlock =
      n.security === "reality"
        ? {
            enabled: true,
            server_name: n.sni,
            insecure: Boolean(n.allowInsecure),
            utls: { enabled: true, fingerprint: n.fingerprint || "chrome" },
            reality: { enabled: true, public_key: n.publicKey, short_id: n.shortId || "" },
          }
        : n.security === "tls"
          ? {
              enabled: true,
              server_name: n.sni,
              insecure: Boolean(n.allowInsecure),
              alpn: n.alpn,
              utls: { enabled: true, fingerprint: n.fingerprint || "chrome" },
            }
          : undefined

    const transport =
      n.network === "ws"
        ? { type: "ws", path: n.path || "/", headers: n.host ? { Host: n.host } : undefined }
        : n.network === "grpc"
          ? { type: "grpc", service_name: n.path || "" }
          : undefined

    let ob: any = null
    if (n.protocol === "vless") {
      ob = { type: "vless", tag, server: n.address, server_port: n.port, uuid: n.uuid, flow: n.flow || "", tls: tlsBlock, transport }
    } else if (n.protocol === "vmess") {
      ob = { type: "vmess", tag, server: n.address, server_port: n.port, uuid: n.uuid, security: "auto", alter_id: 0, tls: tlsBlock, transport }
    } else if (n.protocol === "trojan") {
      ob = { type: "trojan", tag, server: n.address, server_port: n.port, password: n.password, tls: tlsBlock, transport }
    } else if (n.protocol === "shadowsocks") {
      ob = { type: "shadowsocks", tag, server: n.address, server_port: n.port, method: n.method || "aes-256-gcm", password: n.password }
    } else if (n.protocol === "hysteria2" || (n.protocol === "hysteria" && (n.hysteriaVersion ?? 2) >= 2)) {
      ob = {
        type: "hysteria2",
        tag,
        server: n.address,
        server_port: n.port,
        password: n.password,
        obfs: n.obfs ? { type: n.obfs, password: n.obfsPassword } : undefined,
        tls: { enabled: true, server_name: n.sni, insecure: Boolean(n.allowInsecure), alpn: n.alpn || ["h3"] },
      }
    } else if (n.protocol === "hysteria") {
      ob = {
        type: "hysteria",
        tag,
        server: n.address,
        server_port: n.port,
        auth_str: n.password,
        up_mbps: 50,
        down_mbps: 100,
        tls: { enabled: true, server_name: n.sni, insecure: Boolean(n.allowInsecure), alpn: n.alpn || ["h3"] },
      }
    } else if (n.protocol === "tuic") {
      ob = {
        type: "tuic",
        tag,
        server: n.address,
        server_port: n.port,
        uuid: n.uuid,
        password: n.password,
        tls: { enabled: true, server_name: n.sni, insecure: Boolean(n.allowInsecure), alpn: n.alpn || ["h3"] },
      }
    }
    if (!ob) return
    tags.push(tag)
    outbounds.push(JSON.parse(JSON.stringify(ob)))
  })

  if (outbounds.length === 0) {
    return JSON.stringify({ error: "Нет узлов, которые sing-box умеет импортировать" }, null, 2)
  }

  const config = {
    log: { level: "warn", timestamp: true },
    dns: {
      servers: [
        { tag: "remote", address: "https://1.1.1.1/dns-query", detour: "PROXY" },
        { tag: "local", address: "local", detour: "direct" },
      ],
      strategy: "ipv4_only",
    },
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        address: ["172.19.0.1/30"],
        auto_route: true,
        strict_route: true,
        stack: "mixed",
        sniff: true,
      },
    ],
    outbounds: [
      { type: "selector", tag: "PROXY", outbounds: ["AUTO", ...tags], default: "AUTO" },
      { type: "urltest", tag: "AUTO", outbounds: tags, url: "http://cp.cloudflare.com/generate_204", interval: "3m" },
      ...outbounds,
      { type: "direct", tag: "direct" },
    ],
    route: {
      rules: [{ action: "sniff" }, { protocol: "dns", action: "hijack-dns" }, { ip_is_private: true, outbound: "direct" }],
      final: "PROXY",
      auto_detect_interface: true,
    },
  }

  return JSON.stringify(config, null, 2)
}

export function exportXray(nodes: Node[]): string {
  if (nodes.length === 0) {
    return JSON.stringify({ error: "Нет узлов для экспорта" }, null, 2)
  }

  const outbounds = nodes.map((n, i) => {
    const tag = `${n.name}-${i + 1}`
    const streamSettings: any = { network: n.network || "tcp", security: n.security === "none" ? "none" : n.security }
    if (n.security === "reality") {
      streamSettings.realitySettings = {
        serverName: n.sni,
        publicKey: n.publicKey,
        shortId: n.shortId || "",
        fingerprint: n.fingerprint || "chrome",
      }
    } else if (n.security === "tls") {
      streamSettings.tlsSettings = {
        serverName: n.sni,
        fingerprint: n.fingerprint || "chrome",
        alpn: n.alpn,
        allowInsecure: Boolean(n.allowInsecure),
      }
    }
    if (n.network === "ws") streamSettings.wsSettings = { path: n.path || "/", headers: n.host ? { Host: n.host } : undefined }
    if (n.network === "grpc") streamSettings.grpcSettings = { serviceName: n.path || "" }

    if (n.protocol === "vless" || n.protocol === "vmess") {
      return {
        tag,
        protocol: n.protocol,
        settings: {
          vnext: [
            {
              address: n.address,
              port: n.port,
              users: [
                n.protocol === "vless"
                  ? { id: n.uuid, encryption: "none", flow: n.flow || "" }
                  : { id: n.uuid, alterId: 0, security: "auto" },
              ],
            },
          ],
        },
        streamSettings,
      }
    }

    if (n.protocol === "trojan" || n.protocol === "shadowsocks") {
      return {
        tag,
        protocol: n.protocol,
        settings: {
          servers: [
            {
              address: n.address,
              port: n.port,
              password: n.password,
              ...(n.protocol === "shadowsocks" ? { method: n.method || "aes-256-gcm" } : {}),
            },
          ],
        },
        streamSettings,
      }
    }

    return { tag, protocol: n.protocol, settings: n.raw, streamSettings }
  })

  const config = {
    log: { loglevel: "warning" },
    dns: { servers: ["https://1.1.1.1/dns-query", "localhost"], queryStrategy: "UseIPv4" },
    inbounds: [
      { tag: "socks", port: 10808, protocol: "socks", settings: { udp: true, auth: "noauth" }, sniffing: { enabled: true, destOverride: ["http", "tls"] } },
      { tag: "http", port: 10809, protocol: "http", settings: {} },
    ],
    outbounds: [...outbounds, { tag: "direct", protocol: "freedom" }, { tag: "block", protocol: "blackhole" }],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: [
        { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
        { type: "field", network: "tcp,udp", balancerTag: "balancer" },
      ],
      balancers: [{ tag: "balancer", selector: [""], strategy: { type: "leastPing" } }],
    },
    observatory: { subjectSelector: [""], probeInterval: "5m", probeUrl: "http://cp.cloudflare.com/generate_204" },
  }

  return JSON.stringify(config, null, 2)
}
