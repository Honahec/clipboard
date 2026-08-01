import { ClipboardCopyIcon, CopyIcon, GlobeIcon, LockIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { copyContent, copyShareLink, formatDate, formatExpiry } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import type { Clipboard } from "@/lib/types"

export function ClipboardDetailDialog({
  clipboard,
  open,
  onOpenChange,
}: {
  clipboard?: Clipboard
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { locale, t } = useI18n()
  if (!clipboard) return null

  const copyClipboardContent = () => void copyContent(clipboard)
    .then(() => toast.success(t("actions.contentCopied")))
    .catch(() => toast.error(t("errors.clipboardAccess")))
  const copyClipboardLink = () => void copyShareLink(clipboard)
    .then(() => toast.success(t("actions.linkCopied")))
    .catch(() => toast.error(t("errors.clipboardAccess")))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="font-mono">{clipboard.code}</DialogTitle>
            <Badge variant={clipboard.is_public ? "secondary" : "outline"}>
              {clipboard.is_public ? <GlobeIcon /> : <LockIcon />}
              {clipboard.is_public ? t("feed.public") : t("feed.private")}
            </Badge>
          </div>
          <DialogDescription>
            {formatDate(clipboard.created_at, locale)} · {t("detail.expires", {
              date: formatExpiry(clipboard.expires_at, locale, t("feed.never")),
            })}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-4 font-sans text-sm leading-6">
          {clipboard.content}
        </pre>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={copyClipboardLink}
          >
            <ClipboardCopyIcon data-icon="inline-start" />
            {t("actions.copyLink")}
          </Button>
          <Button
            type="button"
            onClick={copyClipboardContent}
          >
            <CopyIcon data-icon="inline-start" />
            {t("actions.copyContent")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
