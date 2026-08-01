import {
  CopyIcon,
  EyeIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  Trash2Icon,
} from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, errorMessage } from "@/lib/api"
import { copyContent, copyShareLink } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import type { Clipboard } from "@/lib/types"

function IconAction({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ClipboardActions({
  clipboard,
  onOpen,
  onDeleted,
  onUpdated,
}: {
  clipboard: Clipboard
  onOpen: () => void
  onDeleted: (code: string) => void
  onUpdated: (clipboard: Clipboard) => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const visibility = useMutation({
    mutationFn: () => api.setVisibility(clipboard.code, !clipboard.is_public),
    onSuccess: async (updated) => {
      onUpdated(updated)
      await queryClient.invalidateQueries({ queryKey: ["clipboards"] })
      toast.success(t("actions.visibilityUpdated"))
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.requestFailed"))),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteClipboard(clipboard.code),
    onSuccess: async () => {
      onDeleted(clipboard.code)
      await queryClient.invalidateQueries({ queryKey: ["clipboards"] })
      toast.success(t("actions.deleted"))
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.requestFailed"))),
  })

  const copyClipboardContent = () => void copyContent(clipboard)
    .then(() => toast.success(t("actions.contentCopied")))
    .catch(() => toast.error(t("errors.clipboardAccess")))
  const copyClipboardLink = () => void copyShareLink(clipboard)
    .then(() => toast.success(t("actions.linkCopied")))
    .catch(() => toast.error(t("errors.clipboardAccess")))

  return (
    <div className="flex items-center justify-end gap-1">
      <IconAction label={t("actions.view")} onClick={onOpen}>
        <EyeIcon />
      </IconAction>
      <IconAction
        label={t("actions.copyContent")}
        onClick={copyClipboardContent}
      >
        <CopyIcon />
      </IconAction>
      <IconAction
        label={t("actions.copyLink")}
        onClick={copyClipboardLink}
      >
        <LinkIcon />
      </IconAction>

      {clipboard.owned_by_me ? (
        <>
          <IconAction
            label={clipboard.is_public ? t("actions.makePrivate") : t("actions.makePublic")}
            onClick={() => visibility.mutate()}
            disabled={visibility.isPending || remove.isPending}
          >
            {visibility.isPending ? (
              <Spinner />
            ) : clipboard.is_public ? (
              <LockIcon />
            ) : (
              <GlobeIcon />
            )}
          </IconAction>

          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("actions.delete")}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? <Spinner /> : <Trash2Icon />}
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("actions.delete")}</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("actions.deleteTitle", { code: clipboard.code })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("actions.deleteDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                  {t("actions.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  )
}
