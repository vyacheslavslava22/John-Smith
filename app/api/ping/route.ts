import { NextResponse } from "next/server"
import net from "node:net"

export const runtime = "nodejs"
export const maxDuration = 30

const MAX_TARGETS = 80
const CONCURRENCY = 16
const TIMEOUT_MS = 3500

type Target = { id: string; host: string; port: number }
type PingResult = { id: string; ok: boolean; ms: number | null; error?: string }

function isPrivateHost(host: string) {
  return (
    /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1|\[?::1\]?)/i.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

/** Один TCP-коннект: измеряем время до установления соединения. */
function tcpProbe(host: string, port: number): Promise<{ ok: boolean; ms: number | null; error?: string }> {
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const socket = new net.Socket()

    const finish = (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, ms: ok ? Date.now() - started : null, error })
    }

    socket.setTimeout(TIMEOUT_MS)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false, "timeout"))
    socket.once("error", (e: Error) => finish(false, e.message))

    try {
      socket.connect(port, host)
    } catch (e) {
      finish(false, (e as Error).message)
    }
  })
}

/** Пул с ограничением параллелизма, чтобы не упереться в лимиты рантайма. */
async function runPool(targets: Target[]): Promise<PingResult[]> {
  const results: PingResult[] = new Array(targets.length)
  let cursor = 0

  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++
      const t = targets[i]
      if (!t?.host || !Number.isInteger(t.port) || t.port < 1 || t.port > 65535 || isPrivateHost(t.host)) {
        results[i] = { id: t?.id ?? String(i), ok: false, ms: null, error: "недопустимый адрес" }
        continue
      }
      const r = await tcpProbe(t.host, t.port)
      results[i] = { id: t.id, ...r }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))
  return results
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
  }

  const raw = (body as { targets?: unknown })?.targets
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "Список узлов пуст" }, { status: 400 })
  }

  const targets: Target[] = raw.slice(0, MAX_TARGETS).map((t, i) => ({
    id: String((t as Target)?.id ?? i),
    host: String((t as Target)?.host ?? "").trim(),
    port: Number((t as Target)?.port),
  }))

  const started = Date.now()
  const results = await runPool(targets)
  const alive = results.filter((r) => r.ok).length

  console.log("[v0] ping:", targets.length, "targets,", alive, "alive in", Date.now() - started, "ms")

  return NextResponse.json({ ok: true, tookMs: Date.now() - started, alive, results })
}
