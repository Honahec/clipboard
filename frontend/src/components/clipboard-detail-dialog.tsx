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
  if (!clipboard) return null

  const reportCopyFailure = () => toast.error("无法访问剪贴板")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="font-mono">{clipboard.code}</DialogTitle>
            <Badge variant={clipboard.is_public ? "secondary" : "outline"}>
              {clipboard.is_public ? <GlobeIcon /> : <LockIcon />}
              {clipboard.is_public ? "公开" : "私有"}
            </Badge>
          </div>
          <DialogDescription>
            {formatDate(clipboard.created_at)} · 到期 {formatExpiry(clipboard.expires_at)}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-4 font-sans text-sm leading-6">
          {clipboard.content}
        </pre>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyShareLink(clipboard).catch(reportCopyFailure)}
          >
            <ClipboardCopyIcon data-icon="inline-start" />
            复制链接
          </Button>
          <Button
            type="button"
            onClick={() => void copyContent(clipboard).catch(reportCopyFailure)}
          >
            <CopyIcon data-icon="inline-start" />
            复制内容
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
