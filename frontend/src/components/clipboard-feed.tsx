import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ClipboardIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useI18n } from "@/lib/i18n"
import type { Clipboard, Session } from "@/lib/types"

function preview(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

type VisibilityFilter = "all" | "public" | "private"

function VisibilityBadge({ clipboard }: { clipboard: Clipboard }) {
  const { t } = useI18n()
  return (
    <Badge variant={clipboard.is_public ? "secondary" : "outline"}>
      {clipboard.is_public ? t("feed.public") : t("feed.private")}
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
  onUpdated: (clipboard: Clipboard, previousCode?: string) => void
}) {
  const { locale, t } = useI18n()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Clipboard>()
  const [search, setSearch] = useState("")
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all")
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

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()

    return items.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.code.toLocaleLowerCase().includes(normalizedSearch) ||
        item.content.toLocaleLowerCase().includes(normalizedSearch)
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "public" ? item.is_public : !item.is_public)

      return matchesSearch && matchesVisibility
    })
  }, [items, search, visibilityFilter])

  function handleUpdated(clipboard: Clipboard, previousCode = clipboard.code) {
    queryClient.setQueriesData<Clipboard[]>(
      { queryKey: ["clipboards"] },
      (current) => current?.map((item) =>
        item.code === previousCode ? clipboard : item,
      ),
    )
    setSelected((current) =>
      current?.code === previousCode ? clipboard : current,
    )
    const urlCode = new URLSearchParams(window.location.search).get("code")
    if (urlCode?.toUpperCase() === previousCode) {
      window.history.replaceState(null, "", `/?code=${clipboard.code}`)
    }
    onUpdated(clipboard, previousCode)
    void queryClient.invalidateQueries({ queryKey: ["clipboards"] })
  }

  function handleDeleted(code: string) {
    if (selected?.code === code) setSelected(undefined)
    onDeleted(code)
  }

  const title = mode === "mine" ? t("feed.mine") : t("feed.recent")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {filteredItems.length === 1
            ? t("feed.record")
            : t("feed.records", { count: filteredItems.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("feed.searchPlaceholder")}
                aria-label={t("feed.searchLabel")}
              />
            </InputGroup>
            <Select
              value={visibilityFilter}
              onValueChange={(value) => setVisibilityFilter(value as VisibilityFilter)}
            >
              <SelectTrigger
                className="w-full sm:w-36"
                aria-label={t("feed.visibilityFilterLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("feed.visibilityAll")}</SelectItem>
                  <SelectItem value="public">{t("feed.public")}</SelectItem>
                  <SelectItem value="private">{t("feed.private")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2 lg:ml-auto">
            {lookup}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("feed.refresh")}
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                >
                  <RefreshCwIcon
                    className={query.isFetching ? "animate-spin" : undefined}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("feed.refresh")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {query.isPending ? <LoadingFeed /> : null}
        {query.isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t("feed.loadFailed")}</AlertTitle>
            <AlertDescription>
              {errorMessage(query.error, t("errors.requestFailed"))}
            </AlertDescription>
          </Alert>
        ) : null}
        {query.isSuccess && items.length === 0 ? (
          <Empty className="min-h-56">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardIcon />
              </EmptyMedia>
              <EmptyTitle>{t("feed.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("feed.emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {query.isSuccess && items.length > 0 && filteredItems.length === 0 ? (
          <Empty className="min-h-56">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t("feed.noResultsTitle")}</EmptyTitle>
              <EmptyDescription>{t("feed.noResultsDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {query.isSuccess && filteredItems.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded-md border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("feed.code")}</TableHead>
                    <TableHead>{t("feed.content")}</TableHead>
                    <TableHead>{t("feed.visibility")}</TableHead>
                    <TableHead>{t("feed.expires")}</TableHead>
                    <TableHead>{t("feed.created")}</TableHead>
                    <TableHead className="text-right">{t("feed.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((clipboard) => (
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
                        {formatExpiry(clipboard.expires_at, locale, t("feed.never"))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(clipboard.created_at, locale)}
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
              {filteredItems.map((clipboard) => (
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
                      <div>
                        {t("feed.expiresPrefix", {
                          date: formatExpiry(
                            clipboard.expires_at,
                            locale,
                            t("feed.never"),
                          ),
                        })}
                      </div>
                      <div>{formatDate(clipboard.created_at, locale)}</div>
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
        onUpdated={handleUpdated}
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
