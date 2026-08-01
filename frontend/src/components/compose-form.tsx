import { useMemo, useState, type FormEvent } from "react"
import { PlusIcon } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { Clipboard, Session } from "@/lib/types"

type Expiry = "1h" | "24h" | "7d" | "never"

const expiryMilliseconds: Record<Exclude<Expiry, "never">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
}

function expirationFor(value: Expiry) {
  if (value === "never") return null
  return new Date(Date.now() + expiryMilliseconds[value]).toISOString()
}

export function ComposeForm({
  session,
  onCreated,
}: {
  session?: Session
  onCreated: (clipboard: Clipboard) => void
}) {
  const { locale, t } = useI18n()
  const queryClient = useQueryClient()
  const [content, setContent] = useState("")
  const [expiry, setExpiry] = useState<Expiry>("24h")
  const [isPrivate, setIsPrivate] = useState(false)
  const signedIn = Boolean(session?.authenticated)

  const create = useMutation({
    mutationFn: api.createClipboard,
    onSuccess: async (clipboard) => {
      setContent("")
      setIsPrivate(false)
      onCreated(clipboard)
      await queryClient.invalidateQueries({ queryKey: ["clipboards"] })
      toast.success(t("compose.created"), {
        description: t("compose.shareCode", { code: clipboard.code }),
      })
    },
    onError: (error) => toast.error(t("compose.createFailed"), {
      description: errorMessage(error, t("errors.requestFailed")),
    }),
  })

  const valid = useMemo(
    () => content.trim().length > 0 && content.length <= 100_000,
    [content],
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || create.isPending) return
    create.mutate({
      content: content.trim(),
      is_public: signedIn ? !isPrivate : true,
      expires_at: expirationFor(signedIn ? expiry : expiry === "never" ? "24h" : expiry),
    })
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{t("compose.title")}</CardTitle>
          <CardDescription>
            {signedIn ? t("compose.account") : t("compose.anonymous")}
          </CardDescription>
          <CardAction className="text-sm text-muted-foreground">
            {content.length.toLocaleString(locale)} / {(100_000).toLocaleString(locale)}
          </CardAction>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="clipboard-content">{t("compose.content")}</FieldLabel>
              <Textarea
                id="clipboard-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t("compose.placeholder")}
                className="min-h-64 resize-y"
                maxLength={100_000}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="clipboard-expiry">
                  {t("compose.retention")}
                </FieldLabel>
                <Select value={expiry} onValueChange={(value) => setExpiry(value as Expiry)}>
                  <SelectTrigger id="clipboard-expiry" className="w-full">
                    <SelectValue placeholder={t("compose.selectRetention")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="1h">{t("compose.oneHour")}</SelectItem>
                      <SelectItem value="24h">{t("compose.twentyFourHours")}</SelectItem>
                      <SelectItem value="7d">{t("compose.sevenDays")}</SelectItem>
                      {signedIn ? (
                        <SelectItem value="never">{t("compose.forever")}</SelectItem>
                      ) : null}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field orientation="horizontal" data-disabled={!signedIn} className="self-end">
                <FieldContent>
                  <FieldTitle id="private-title">{t("compose.privateTitle")}</FieldTitle>
                  <FieldDescription>
                    {signedIn
                      ? t("compose.privateDescription")
                      : t("compose.privateRequiresLogin")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  aria-labelledby="private-title"
                  checked={signedIn && isPrivate}
                  onCheckedChange={setIsPrivate}
                  disabled={!signedIn}
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!valid || create.isPending}>
                {create.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                {create.isPending ? t("compose.creating") : t("compose.create")}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}
