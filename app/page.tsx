import { Terminal } from "lucide-react"
import { HwidConsole } from "@/components/hwid-console"

export default function Page() {
  return (
    <main className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 grid-backdrop" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 md:py-14">
        <header className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground">
            <Terminal className="size-3.5 text-primary" />
            HWID · Happ · Remnawave
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Инспектор подписок с генерацией{" "}
            <span className="font-mono text-primary">X-HWID</span>
          </h1>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Вставь ссылку подписки, сгенерируй Android ID устройства — и панель отдаст все конфиги: VLESS Reality,
            Hysteria2, Trojan, Shadowsocks. Проверка живых узлов, QR для телефона и экспорт в Clash, sing-box, Xray JSON
            и base64.
          </p>
        </header>

        <HwidConsole />

        <footer className="mt-10 border-t border-border pt-6 font-mono text-xs leading-relaxed text-muted-foreground">
          <p>
            Запрос идёт через серверный роут с заголовками{" "}
            <span className="text-foreground">x-hwid · x-device-os · x-ver-os · x-device-model · user-agent</span> — так же,
            как их отправляет клиент Happ. Используй только со своими подписками.
          </p>
        </footer>
      </div>
    </main>
  )
}
