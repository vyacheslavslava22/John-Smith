import { NextResponse } from "next/server"
import { maybeBase64Header, parseSubscription, type SubMeta } from "@/lib/parse"

export const runtime = "nodejs"
export const maxDuration = 30

const ALLOWED_HEADERS = ["user-agent", "x-hwid", "x-device-os", "x-ver-os", "x-device-model"]

function parseUserInfo(v?: string | null): Partial<SubMeta> {
  if (!v) return {}
  const out: Record<string, number> = {}
  for (const part of v.split(";")) {
    const [k, val] = part.split("=").map((s) => s?.trim())
    if (k && val !== undefined && !Number.isNaN(Number(val))) out[k] = Number(val)
  }
  return { upload: out.upload, download: out.download, total: out.total, expire: out.expire }
}

function isPrivateHost(host: string) {
  return (
    /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1|\[?::1\]?)/i.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
  }

  const { url, headers = {}, path = "" } = body as { url?: string; headers?: Record<string, string>; path?: string }
  if (!url) return NextResponse.json({ error: "Не указана ссылка подписки" }, { status: 400 })

  let target: URL
  try {
    target = new URL(path ? `${url.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}` : url)
  } catch {
    return NextResponse.json({ error: "Ссылка выглядит некорректно" }, { status: 400 })
  }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: "Такой адрес запрещён" }, { status: 400 })
  }

  const outHeaders: Record<string, string> = { accept: "*/*" }
  for (const [k, v] of Object.entries(headers)) {
    if (ALLOWED_HEADERS.includes(k.toLowerCase()) && typeof v === "string") outHeaders[k.toLowerCase()] = v
  }

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(target.toString(), {
      headers: outHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
  } catch (e) {
    console.log("[v0] fetch-sub error:", (e as Error).message)
    return NextResponse.json({ error: `Не удалось подключиться: ${(e as Error).message}` }, { status: 502 })
  }

  const text = await res.text()
  const h = res.headers

  if (!res.ok) {
    return NextResponse.json(
      { error: `Сервер подписки ответил ${res.status}`, status: res.status, snippet: text.slice(0, 300) },
      { status: 502 },
    )
  }

  const meta: SubMeta = {
    title: maybeBase64Header(h.get("profile-title")),
    announce: maybeBase64Header(h.get("announce")),
    supportUrl: h.get("support-url") || undefined,
    webPageUrl: h.get("profile-web-page-url") || undefined,
    updateInterval: h.get("profile-update-interval") || undefined,
    hwidActive: h.get("x-hwid-active") === "true",
    filename: h.get("content-disposition")?.match(/filename=([^;]+)/)?.[1],
    ...parseUserInfo(h.get("subscription-userinfo")),
  }

  const parsed = parseSubscription(text, meta)

  const rawHeaders: Record<string, string> = {}
  h.forEach((v, k) => {
    rawHeaders[k] = v
  })

  console.log("[v0] fetch-sub ok:", target.hostname, parsed.format, parsed.nodes.length, "nodes in", Date.now() - started, "ms")

  return NextResponse.json({
    ok: true,
    url: target.toString(),
    status: res.status,
    tookMs: Date.now() - started,
    contentType: h.get("content-type") || "",
    format: parsed.format,
    meta: parsed.meta,
    profiles: parsed.profiles,
    nodes: parsed.nodes,
    rawHeaders,
    raw: text.length > 900_000 ? text.slice(0, 900_000) + "\n...[truncated]" : text,
  })
}
