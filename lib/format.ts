// Общие форматтеры для интерфейса.

/** Байты в человекочитаемый вид. */
export function bytes(n?: number): string {
  if (!n) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 0)} ${units[i]}`
}

/** Русские склонения: plural(1, ["узел", "узла", "узлов"]) -> "узел" */
export function plural(n: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(n) % 100
  const mod10 = mod100 % 10
  if (mod100 > 10 && mod100 < 20) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

export const NODES = ["узел", "узла", "узлов"] as [string, string, string]
export const DAYS = ["день", "дня", "дней"] as [string, string, string]

/** Сколько дней осталось до unix-времени истечения. */
export function daysLeft(expire?: number): number | null {
  if (!expire) return null
  return Math.ceil((expire * 1000 - Date.now()) / 86_400_000)
}
