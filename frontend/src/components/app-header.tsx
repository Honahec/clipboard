import { CloudIcon, LogInIcon, LogOutIcon, UserIcon } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { ThemeMenu } from "@/components/theme-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import type { Session } from "@/lib/types"

function initials(name?: string, email?: string) {
  const value = name || email || "U"
  return value.trim().slice(0, 2).toUpperCase()
}

function AccountMenu({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success("已退出登录")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (!session.authenticated || !session.user) {
    if (!session.oidc_enabled) return null
    return (
      <Button asChild>
        <a href="/api/auth/login">
          <LogInIcon data-icon="inline-start" />
          登录
        </a>
      </Button>
    )
  }

  const user = session.user
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="账户菜单">
          <Avatar size="sm">
            {user.picture ? <AvatarImage src={user.picture} alt="" /> : null}
            <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span>{user.name || "已登录用户"}</span>
            {user.email ? (
              <span className="truncate">{user.email}</span>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <UserIcon />
            我的剪贴板
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={logout.isPending}
            onSelect={() => logout.mutate()}
          >
            <LogOutIcon />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppHeader({
  session,
  loading,
}: {
  session?: Session
  loading: boolean
}) {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CloudIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Clipboard</h1>
            <p className="truncate text-xs text-muted-foreground">云朵角落</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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
