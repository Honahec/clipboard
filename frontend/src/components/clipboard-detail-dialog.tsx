import { useEffect, useState } from "react"
import { ClipboardCopyIcon, CopyIcon, GlobeIcon, LockIcon, PencilIcon } from "lucide-react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, errorMessage } from "@/lib/api"
import { copyContent, copyShareLink, formatDate, formatExpiry } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import type { Clipboard } from "@/lib/types"

const MAX_CONTENT_LENGTH = 100_000

export function ClipboardDetailDialog({
  clipboard,
  open,
  onOpenChange,
  onUpdated,
}: {
  clipboard?: Clipboard
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (clipboard: Clipboard) => void
}) {
  const { locale, t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const update = useMutation({
    mutationFn: ({ code, content }: { code: string; content: string }) =>
      api.updateClipboard(code, { content }),
    onSuccess: (updated) => {
      setDraft(updated.content)
      setEditing(false)
      onUpdated(updated)
      toast.success(t("detail.updateSucceeded"))
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("detail.updateFailed"))),
  })

  useEffect(() => {
    setDraft(clipboard?.content ?? "")
    setEditing(false)
  }, [clipboard?.code, clipboard?.content, open])

  if (!clipboard) return null

  const characterCount = Array.from(draft).length
  const contentError = !draft.trim()
    ? t("detail.contentRequired")
    : characterCount > MAX_CONTENT_LENGTH
      ? t("detail.contentTooLong", { max: MAX_CONTENT_LENGTH })
      : undefined
  const copyClipboardContent = () => void copyContent(clipboard)
    .then(() => toast.success(t("actions.contentCopied")))
    .catch(() => toast.error(t("errors.clipboardAccess")))
  const copyClipboardLink = () => void copyShareLink(clipboard)
    .then(() => toast.success(t("actions.linkCopied")))
    .catch(() => toast.error(t("errors.clipboardAccess")))

  function cancelEditing() {
    setDraft(clipboard?.content ?? "")
    setEditing(false)
  }

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

        {editing ? (
          <div className="grid gap-2">
            <label htmlFor="clipboard-content" className="text-sm font-medium">
              {t("detail.contentLabel")}
            </label>
            <Textarea
              id="clipboard-content"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("detail.contentPlaceholder")}
              aria-invalid={Boolean(contentError)}
              aria-describedby="clipboard-content-feedback clipboard-content-count"
              className="max-h-[60vh] min-h-48 resize-y font-sans text-sm leading-6"
              disabled={update.isPending}
              autoFocus
            />
            <div className="flex items-start justify-between gap-3 text-xs">
              <p id="clipboard-content-feedback" className="text-destructive">
                {contentError}
              </p>
              <p id="clipboard-content-count" className="ml-auto shrink-0 text-muted-foreground">
                {t("detail.characterCount", {
                  count: characterCount,
                  max: MAX_CONTENT_LENGTH,
                })}
              </p>
            </div>
          </div>
        ) : (
          <pre className="max-h-[60vh] min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-4 font-sans text-sm leading-6">
            {clipboard.content}
          </pre>
        )}

        <DialogFooter>
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={cancelEditing}
                disabled={update.isPending}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => update.mutate({ code: clipboard.code, content: draft })}
                disabled={
                  update.isPending || Boolean(contentError) || draft === clipboard.content
                }
              >
                {update.isPending ? <Spinner data-icon="inline-start" /> : null}
                {update.isPending ? t("actions.saving") : t("actions.save")}
              </Button>
            </>
          ) : (
            <>
              {clipboard.owned_by_me ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(clipboard.content)
                    setEditing(true)
                  }}
                >
                  <PencilIcon data-icon="inline-start" />
                  {t("actions.editContent")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={copyClipboardLink}
              >
                <ClipboardCopyIcon data-icon="inline-start" />
                {t("actions.copyLink")}
              </Button>
              <Button type="button" onClick={copyClipboardContent}>
                <CopyIcon data-icon="inline-start" />
                {t("actions.copyContent")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
