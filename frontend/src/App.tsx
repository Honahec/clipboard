import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { AppHeader } from "@/components/app-header"
import { ClipboardFeed } from "@/components/clipboard-feed"
import { CodeLookup } from "@/components/code-lookup"
import { ComposeForm } from "@/components/compose-form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { Clipboard } from "@/lib/types"

export default function App() {
  const { t } = useI18n()
  const [pinned, setPinned] = useState<Clipboard>()
  const [tab, setTab] = useState("recent")
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    staleTime: 60_000,
  })

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error")
    if (authError) {
      toast.error(t("errors.authFailed"))
      window.history.replaceState(null, "", "/")
    }
  }, [t])

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")
    if (!code) return
    void api
      .getClipboard(code)
      .then((clipboard) => {
        setPinned(clipboard)
        setTab("recent")
      })
      .catch(() => toast.error(t("errors.openCode", { code: code.toUpperCase() })))
  }, [t])

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader session={session.data} loading={session.isPending} />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="create">{t("tabs.create")}</TabsTrigger>
            <TabsTrigger value="recent">{t("tabs.recent")}</TabsTrigger>
            {session.data?.authenticated ? (
              <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="create">
            <ComposeForm
              session={session.data}
              onCreated={(clipboard) => {
                setPinned(clipboard)
                setTab("recent")
              }}
            />
          </TabsContent>
          <TabsContent value="recent">
            <ClipboardFeed
              mode="recent"
              session={session.data}
              pinned={pinned}
              lookup={
                <CodeLookup
                  onFound={(clipboard) => {
                    setPinned(clipboard)
                    setTab("recent")
                  }}
                />
              }
              onPinnedDismissed={() => setPinned(undefined)}
              onDeleted={(code) => {
                if (pinned?.code === code) setPinned(undefined)
              }}
              onUpdated={(clipboard, previousCode = clipboard.code) => {
                if (pinned?.code === previousCode) setPinned(clipboard)
              }}
            />
          </TabsContent>
          {session.data?.authenticated ? (
            <TabsContent value="mine">
              <ClipboardFeed
                mode="mine"
                session={session.data}
                pinned={pinned}
                lookup={
                  <CodeLookup
                    onFound={(clipboard) => {
                      setPinned(clipboard)
                      setTab("recent")
                    }}
                  />
                }
                onPinnedDismissed={() => setPinned(undefined)}
                onDeleted={(code) => {
                  if (pinned?.code === code) setPinned(undefined)
                }}
                onUpdated={(clipboard, previousCode = clipboard.code) => {
                  if (pinned?.code === previousCode) setPinned(clipboard)
                }}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  )
}
