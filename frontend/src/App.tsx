import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { AppHeader } from "@/components/app-header"
import { ClipboardFeed } from "@/components/clipboard-feed"
import { CodeLookup } from "@/components/code-lookup"
import { ComposeForm } from "@/components/compose-form"
import { api } from "@/lib/api"
import type { Clipboard } from "@/lib/types"

export default function App() {
  const [pinned, setPinned] = useState<Clipboard>()
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    staleTime: 60_000,
  })

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error")
    if (authError) {
      toast.error("登录失败，请重试")
      window.history.replaceState(null, "", "/")
    }
  }, [])

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")
    if (!code) return
    void api
      .getClipboard(code)
      .then(setPinned)
      .catch(() => toast.error(`无法打开分享代码 ${code.toUpperCase()}`))
  }, [])

  return (
    <div className="min-h-dvh bg-muted/30">
      <AppHeader session={session.data} loading={session.isPending} />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <ComposeForm session={session.data} onCreated={setPinned} />
        </aside>
        <section className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-lg font-semibold">共享剪贴板</h2>
              <p className="text-sm text-muted-foreground">使用短代码快速取回一段文本。</p>
            </div>
            <CodeLookup onFound={setPinned} />
          </div>
          <ClipboardFeed
            session={session.data}
            pinned={pinned}
            onDeleted={(code) => {
              if (pinned?.code === code) setPinned(undefined)
            }}
            onUpdated={(clipboard) => {
              if (pinned?.code === clipboard.code) setPinned(clipboard)
            }}
          />
        </section>
      </main>
    </div>
  )
}
