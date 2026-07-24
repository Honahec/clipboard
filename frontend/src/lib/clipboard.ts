import { toast } from "sonner"

import type { Clipboard } from "@/lib/types"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export function formatExpiry(value?: string) {
  return value ? formatDate(value) : "永久"
}

export async function copyContent(clipboard: Clipboard) {
  await navigator.clipboard.writeText(clipboard.content)
  toast.success("内容已复制")
}

export async function copyShareLink(clipboard: Clipboard) {
  await navigator.clipboard.writeText(`${window.location.origin}/?code=${clipboard.code}`)
  toast.success("分享链接已复制")
}
