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
  const queryClient = useQueryClient()
  const visibility = useMutation({
    mutationFn: () => api.setVisibility(clipboard.code, !clipboard.is_public),
    onSuccess: async (updated) => {
      onUpdated(updated)
      await queryClient.invalidateQueries({ queryKey: ["clipboards"] })
      toast.success("可见性已更新")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteClipboard(clipboard.code),
    onSuccess: async () => {
      onDeleted(clipboard.code)
      await queryClient.invalidateQueries({ queryKey: ["clipboards"] })
      toast.success("剪贴板已删除")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const reportCopyFailure = () => toast.error("无法访问剪贴板")

  return (
    <div className="flex items-center justify-end gap-1">
      <IconAction label="查看内容" onClick={onOpen}>
        <EyeIcon />
      </IconAction>
      <IconAction
        label="复制内容"
        onClick={() => void copyContent(clipboard).catch(reportCopyFailure)}
      >
        <CopyIcon />
      </IconAction>
      <IconAction
        label="复制分享链接"
        onClick={() => void copyShareLink(clipboard).catch(reportCopyFailure)}
      >
        <LinkIcon />
      </IconAction>

      {clipboard.owned_by_me ? (
        <>
          <IconAction
            label={clipboard.is_public ? "设为私有" : "设为公开"}
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
                    aria-label="删除"
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? <Spinner /> : <Trash2Icon />}
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除 {clipboard.code}？</AlertDialogTitle>
                <AlertDialogDescription>
                  删除后，分享代码和链接将立即失效。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
                  删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  )
}
