import { useMemo, useState } from "react"
import { ClipboardIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { ClipboardCard } from "@/components/clipboard-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api, errorMessage } from "@/lib/api"
import type { Clipboard, Session } from "@/lib/types"

function LoadingFeed() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex justify-between gap-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-7 w-28 self-end" />
        </div>
      ))}
    </div>
  )
}

function FeedContent({
  items,
  onDeleted,
  onUpdated,
}: {
  items: Clipboard[]
  onDeleted: (code: string) => void
  onUpdated: (clipboard: Clipboard) => void
}) {
  if (items.length === 0) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardIcon />
          </EmptyMedia>
          <EmptyTitle>暂无剪贴板</EmptyTitle>
          <EmptyDescription>创建第一条内容，它会出现在这里。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((clipboard) => (
        <ClipboardCard
          key={clipboard.code}
          clipboard={clipboard}
          onDeleted={onDeleted}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  )
}

export function ClipboardFeed({
  session,
  pinned,
  onDeleted,
  onUpdated,
}: {
  session?: Session
  pinned?: Clipboard
  onDeleted: (code: string) => void
  onUpdated: (clipboard: Clipboard) => void
}) {
  const [tab, setTab] = useState("all")
  const query = useQuery({
    queryKey: ["clipboards", session?.authenticated],
    queryFn: api.listClipboards,
  })

  const items = useMemo(() => {
    const values = query.data ?? []
    if (!pinned || values.some((item) => item.code === pinned.code)) return values
    return [pinned, ...values]
  }, [pinned, query.data])
  const mine = items.filter((item) => item.owned_by_me)

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">最近内容</h2>
          <p className="text-sm text-muted-foreground">公开内容和你自己的私有内容。</p>
        </div>
        <div className="flex items-center gap-1">
          {session?.authenticated ? (
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="mine">我的</TabsTrigger>
            </TabsList>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="刷新列表"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCwIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新列表</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {query.isPending ? <LoadingFeed /> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>无法加载剪贴板</AlertTitle>
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}
      {query.isSuccess ? (
        <>
          <TabsContent value="all">
            <FeedContent items={items} onDeleted={onDeleted} onUpdated={onUpdated} />
          </TabsContent>
          {session?.authenticated ? (
            <TabsContent value="mine">
              <FeedContent items={mine} onDeleted={onDeleted} onUpdated={onUpdated} />
            </TabsContent>
          ) : null}
        </>
      ) : null}
    </Tabs>
  )
}
