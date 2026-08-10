// Генерация Android-подобного HWID (X-HWID) и заголовков клиента Happ.

const HEX = "0123456789abcdef"

function randHex(len: number) {
  let out = ""
  const bytes = new Uint8Array(len)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  for (let i = 0; i < len; i++) out += HEX[bytes[i] % 16]
  return out
}

/** Android SSAID / ANDROID_ID — 16 hex-символов (64 бита) */
export function generateAndroidId(): string {
  return randHex(16)
}

/** UUID v4 (используется некоторыми панелями как HWID) */
export function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  const h = randHex(32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export const DEVICE_PRESETS = [
  { model: "Pixel 8 Pro", os: "Android", ver: "15", ua: "Happ/2.11.0 (Android 15; Pixel 8 Pro)" },
  { model: "Pixel 7", os: "Android", ver: "14", ua: "Happ/2.11.0 (Android 14; Pixel 7)" },
  { model: "SM-S928B", os: "Android", ver: "14", ua: "Happ/2.11.0 (Android 14; SM-S928B)" },
  { model: "SM-A536E", os: "Android", ver: "13", ua: "Happ/2.11.0 (Android 13; SM-A536E)" },
  { model: "Redmi Note 13 Pro", os: "Android", ver: "14", ua: "Happ/2.11.0 (Android 14; Redmi Note 13 Pro)" },
  { model: "POCO X6 Pro", os: "Android", ver: "14", ua: "Happ/2.11.0 (Android 14; POCO X6 Pro)" },
  { model: "OnePlus 12", os: "Android", ver: "15", ua: "Happ/2.11.0 (Android 15; OnePlus 12)" },
  { model: "iPhone 15 Pro", os: "iOS", ver: "18.2", ua: "Happ/2.11.0 (iOS 18.2; iPhone 15 Pro)" },
] as const

export type DevicePreset = (typeof DEVICE_PRESETS)[number]

export type Identity = {
  hwid: string
  model: string
  os: string
  osVer: string
  userAgent: string
}

export function generateIdentity(preset?: DevicePreset): Identity {
  const p = preset ?? DEVICE_PRESETS[Math.floor(Math.random() * DEVICE_PRESETS.length)]
  return {
    hwid: p.os === "iOS" ? generateUuid().toUpperCase() : generateAndroidId(),
    model: p.model,
    os: p.os,
    osVer: p.ver,
    userAgent: p.ua,
  }
}

/** Заголовки, которые Happ отправляет панели (Remnawave / Marzban HWID-режим) */
export function identityHeaders(id: Identity): Record<string, string> {
  return {
    "user-agent": id.userAgent,
    "x-hwid": id.hwid,
    "x-device-os": id.os,
    "x-ver-os": id.osVer,
    "x-device-model": id.model,
  }
}

/** Нормализация введённой ссылки подписки */
export function normalizeSubUrl(input: string): string | null {
  let raw = input.trim()
  if (!raw) return null

  // happ://add/<base64(url)> и подобные схемы
  const schemeMatch = raw.match(/^(?:happ|v2raytun|hiddify|streisand|sn|clash|sing-box):\/\/(?:add|install-config)?\/?(.+)$/i)
  if (schemeMatch) {
    let payload = schemeMatch[1]
    const urlParam = payload.match(/[?&]url=([^&]+)/)
    if (urlParam) payload = decodeURIComponent(urlParam[1])
    if (/^https?%3A/i.test(payload)) payload = decodeURIComponent(payload)
    if (!/^https?:\/\//i.test(payload)) {
      try {
        const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
        const decoded = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
        if (/^https?:\/\//i.test(decoded)) payload = decoded
      } catch {
        /* ignore */
      }
    }
    raw = payload
  }

  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw

  try {
    const u = new URL(raw)
    if (!u.hostname.includes(".")) return null
    return u.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}
