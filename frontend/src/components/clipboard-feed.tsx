import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ClipboardIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { ClipboardActions } from "@/components/clipboard-actions"
import { ClipboardDetailDialog } from "@/components/clipboard-detail-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, errorMessage } from "@/lib/api"
import { formatDate, formatExpiry } from "@/lib/clipboard"
import type { Clipboard, Session } from "@/lib/types"

function preview(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

function VisibilityBadge({ clipboard }: { clipboard: Clipboard }) {
  return (
    <Badge variant={clipboard.is_public ? "secondary" : "outline"}>
      {clipboard.is_public ? "公开" : "私有"}
    </Badge>
  )
}

function LoadingFeed() {
  return (
    <div className="divide-y rounded-md border">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-4 p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  )
}

export function ClipboardFeed({
  mode,
  session,
  pinned,
  lookup,
  onPinnedDismissed,
  onDeleted,
  onUpdated,
}: {
  mode: "recent" | "mine"
  session?: Session
  pinned?: Clipboard
  lookup: ReactNode
  onPinnedDismissed: () => void
  onDeleted: (code: string) => void
  onUpdated: (clipboard: Clipboard) => void
}) {
  const [selected, setSelected] = useState<Clipboard>()
  const query = useQuery({
    queryKey: ["clipboards", session?.authenticated],
    queryFn: api.listClipboards,
  })

  useEffect(() => {
    if (pinned) setSelected(pinned)
  }, [pinned])

  const items = useMemo(() => {
    const values = query.data ?? []
    const combined = pinned && !values.some((item) => item.code === pinned.code)
      ? [pinned, ...values]
      : values
    return mode === "mine" ? combined.filter((item) => item.owned_by_me) : combined
  }, [mode, pinned, query.data])

  function handleUpdated(clipboard: Clipboard) {
    if (selected?.code === clipboard.code) setSelected(clipboard)
    onUpdated(clipboard)
  }

  function handleDeleted(code: string) {
    if (selected?.code === code) setSelected(undefined)
    onDeleted(code)
  }

  const title = mode === "mine" ? "我的剪贴板" : "最近内容"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{items.length} 条记录</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          {lookup}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="刷新列表"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCwIcon
                  className={query.isFetching ? "animate-spin" : undefined}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新列表</TooltipContent>
          </Tooltip>
        </div>

        {query.isPending ? <LoadingFeed /> : null}
        {query.isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>无法加载剪贴板</AlertTitle>
            <AlertDescription>{errorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : null}
        {query.isSuccess && items.length === 0 ? (
          <Empty className="min-h-56">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardIcon />
              </EmptyMedia>
              <EmptyTitle>暂无剪贴板</EmptyTitle>
              <EmptyDescription>没有符合当前范围的记录。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {query.isSuccess && items.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded-md border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead>可见性</TableHead>
                    <TableHead>到期</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((clipboard) => (
                    <TableRow key={clipboard.code}>
                      <TableCell className="font-mono font-medium">
                        {clipboard.code}
                      </TableCell>
                      <TableCell className="max-w-80">
                        <button
                          type="button"
                          className="block w-full truncate text-left text-muted-foreground hover:text-foreground"
                          onClick={() => setSelected(clipboard)}
                        >
                          {preview(clipboard.content)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <VisibilityBadge clipboard={clipboard} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatExpiry(clipboard.expires_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(clipboard.created_at)}
                      </TableCell>
                      <TableCell>
                        <ClipboardActions
                          clipboard={clipboard}
                          onOpen={() => setSelected(clipboard)}
                          onDeleted={handleDeleted}
                          onUpdated={handleUpdated}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y rounded-md border md:hidden">
              {items.map((clipboard) => (
                <div key={clipboard.code} className="flex flex-col gap-2.5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="font-mono text-sm font-medium"
                      onClick={() => setSelected(clipboard)}
                    >
                      {clipboard.code}
                    </button>
                    <VisibilityBadge clipboard={clipboard} />
                  </div>
                  <button
                    type="button"
                    className="line-clamp-2 text-left text-sm leading-5 text-muted-foreground"
                    onClick={() => setSelected(clipboard)}
                  >
                    {preview(clipboard.content)}
                  </button>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <div>到期 {formatExpiry(clipboard.expires_at)}</div>
                      <div>{formatDate(clipboard.created_at)}</div>
                    </div>
                    <ClipboardActions
                      clipboard={clipboard}
                      onOpen={() => setSelected(clipboard)}
                      onDeleted={handleDeleted}
                      onUpdated={handleUpdated}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>

      <ClipboardDetailDialog
        clipboard={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(undefined)
            onPinnedDismissed()
            if (new URLSearchParams(window.location.search).has("code")) {
              window.history.replaceState(null, "", "/")
            }
          }
        }}
      />
    </Card>
  )
}
