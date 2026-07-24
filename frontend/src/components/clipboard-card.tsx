import {
  ClipboardCopyIcon,
  ClockIcon,
  GlobeIcon,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api, errorMessage } from "@/lib/api"
import type { Clipboard } from "@/lib/types"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

async function copyShareLink(code: string) {
  const url = `${window.location.origin}/?code=${code}`
  await navigator.clipboard.writeText(url)
  toast.success("分享链接已复制")
}

export function ClipboardCard({
  clipboard,
  onDeleted,
  onUpdated,
}: {
  clipboard: Clipboard
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

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <code>{clipboard.code}</code>
        </CardTitle>
        <CardAction className="flex flex-wrap justify-end gap-1.5">
          <Badge variant={clipboard.is_public ? "secondary" : "outline"}>
            {clipboard.is_public ? <GlobeIcon /> : <LockIcon />}
            {clipboard.is_public ? "公开" : "私有"}
          </Badge>
          <Badge variant="outline">
            <ClockIcon />
            {clipboard.expires_at ? formatDate(clipboard.expires_at) : "永久"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans text-sm leading-relaxed">
          {clipboard.content}
        </pre>
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {formatDate(clipboard.created_at)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="复制分享链接"
                onClick={() =>
                  void copyShareLink(clipboard.code).catch(() =>
                    toast.error("无法复制分享链接"),
                  )
                }
              >
                <ClipboardCopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>复制分享链接</TooltipContent>
          </Tooltip>

          {clipboard.owned_by_me ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={clipboard.is_public ? "设为私有" : "设为公开"}
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
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {clipboard.is_public ? "设为私有" : "设为公开"}
                </TooltipContent>
              </Tooltip>

              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="删除剪贴板"
                        disabled={remove.isPending}
                      >
                        <Trash2Icon />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>删除剪贴板</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除 {clipboard.code}？</AlertDialogTitle>
                    <AlertDialogDescription>
                      此操作无法撤销，分享链接也会立即失效。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => remove.mutate()}
                    >
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  )
}
