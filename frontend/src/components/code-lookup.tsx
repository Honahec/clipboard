import { useState, type FormEvent } from "react"
import { SearchIcon } from "lucide-react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage } from "@/lib/api"
import type { Clipboard } from "@/lib/types"

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
}

export function CodeLookup({ onFound }: { onFound: (clipboard: Clipboard) => void }) {
  const [code, setCode] = useState("")
  const lookup = useMutation({
    mutationFn: api.getClipboard,
    onSuccess: (clipboard) => {
      onFound(clipboard)
      window.history.replaceState(null, "", `/?code=${clipboard.code}`)
      toast.success(`已找到 ${clipboard.code}`)
    },
    onError: (error) => toast.error("无法查找", { description: errorMessage(error) }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeCode(code)
    if (normalized) lookup.mutate(normalized)
  }

  return (
    <form onSubmit={submit} className="w-full sm:w-64">
      <InputGroup>
        <InputGroupInput
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          placeholder="输入分享代码"
          aria-label="分享代码"
          autoComplete="off"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-xs"
            aria-label="查找剪贴板"
            disabled={!code || lookup.isPending}
          >
            {lookup.isPending ? <Spinner /> : <SearchIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
