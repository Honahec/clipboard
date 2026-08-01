import type { Clipboard } from "@/lib/types"

export function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatExpiry(value: string | undefined, locale: string, never: string) {
  return value ? formatDate(value, locale) : never
}

export async function copyContent(clipboard: Clipboard) {
  await navigator.clipboard.writeText(clipboard.content)
}

export async function copyShareLink(clipboard: Clipboard) {
  await navigator.clipboard.writeText(`${window.location.origin}/?code=${clipboard.code}`)
}
