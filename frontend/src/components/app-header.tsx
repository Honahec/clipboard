import { LanguagesIcon, LogInIcon, LogOutIcon, RefreshCwIcon } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { ThemeMenu } from "@/components/theme-menu"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, errorMessage } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { Session } from "@/lib/types"

function AccountMenu({ session }: { session: Session }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success(t("header.loggedOut"))
    },
    onError: (error) => toast.error(errorMessage(error, t("errors.requestFailed"))),
  })

  if (!session.authenticated || !session.user) {
    if (!session.oidc_enabled) return null
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="outline" size="icon-sm" aria-label={t("header.login")}>
            <a href="/api/auth/login"><LogInIcon /></a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("header.login")}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("header.logout")}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? <Spinner /> : <LogOutIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("header.logout")}</TooltipContent>
    </Tooltip>
  )
}

export function AppHeader({
  session,
  loading,
}: {
  session?: Session
  loading: boolean
}) {
  const queryClient = useQueryClient()
  const { t, toggleLanguage } = useI18n()
  const user = session?.user

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Clipboard</h1>
          <p className="truncate text-sm text-muted-foreground">
            {user ? [user.name, user.email].filter(Boolean).join(" · ") : t("header.anonymous")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("header.refresh")}
                onClick={() =>
                  void queryClient.invalidateQueries({ queryKey: ["clipboards"] })
                }
              >
                <RefreshCwIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("header.refresh")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("header.switchLanguage")}
                onClick={toggleLanguage}
              >
                <LanguagesIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("header.switchLanguage")}</TooltipContent>
          </Tooltip>
          <ThemeMenu />
          {loading ? (
            <Skeleton className="size-8" />
          ) : session ? (
            <AccountMenu session={session} />
          ) : null}
        </div>
      </div>
    </header>
  )
}
