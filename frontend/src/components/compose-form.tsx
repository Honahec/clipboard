import { useMemo, useState, type FormEvent } from "react"
import { SendIcon } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
      toast.success("剪贴板已创建", {
        description: `分享代码 ${clipboard.code}`,
      })
    },
    onError: (error) => toast.error("创建失败", { description: errorMessage(error) }),
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
          <CardTitle>新建剪贴板</CardTitle>
          <CardDescription>粘贴文本，生成一个便于分享的短代码。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="clipboard-content">内容</FieldLabel>
              <Textarea
                id="clipboard-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="在这里输入或粘贴文本..."
                className="min-h-44 resize-y"
                maxLength={100_000}
                required
              />
              <FieldDescription>{content.length.toLocaleString()} / 100,000</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="clipboard-expiry">保留时间</FieldLabel>
              <Select value={expiry} onValueChange={(value) => setExpiry(value as Expiry)}>
                <SelectTrigger id="clipboard-expiry" className="w-full">
                  <SelectValue placeholder="选择保留时间" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="1h">1 小时</SelectItem>
                    <SelectItem value="24h">24 小时</SelectItem>
                    <SelectItem value="7d">7 天</SelectItem>
                    {signedIn ? <SelectItem value="never">永久保留</SelectItem> : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal" data-disabled={!signedIn}>
              <FieldContent>
                <FieldTitle id="private-title">仅自己可见</FieldTitle>
                <FieldDescription>
                  {signedIn ? "不会出现在公共列表中。" : "登录后可以创建私有内容。"}
                </FieldDescription>
              </FieldContent>
              <Switch
                aria-labelledby="private-title"
                checked={signedIn && isPrivate}
                onCheckedChange={setIsPrivate}
                disabled={!signedIn}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!valid || create.isPending}>
            {create.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            {create.isPending ? "正在创建" : "创建"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
