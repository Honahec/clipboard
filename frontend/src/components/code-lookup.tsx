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
import { useI18n } from "@/lib/i18n"
import type { Clipboard } from "@/lib/types"

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
}

export function CodeLookup({ onFound }: { onFound: (clipboard: Clipboard) => void }) {
  const { t } = useI18n()
  const [code, setCode] = useState("")
  const lookup = useMutation({
    mutationFn: api.getClipboard,
    onSuccess: (clipboard) => {
      onFound(clipboard)
      window.history.replaceState(null, "", `/?code=${clipboard.code}`)
      toast.success(t("lookup.found", { code: clipboard.code }))
    },
    onError: (error) => toast.error(t("lookup.failed"), {
      description: errorMessage(error, t("errors.requestFailed")),
    }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeCode(code)
    if (normalized) lookup.mutate(normalized)
  }

  return (
    <form onSubmit={submit} className="min-w-0 flex-1 sm:max-w-56">
      <InputGroup>
        <InputGroupInput
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          placeholder={t("lookup.placeholder")}
          aria-label={t("lookup.label")}
          autoComplete="off"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-xs"
            aria-label={t("lookup.submit")}
            disabled={!code || lookup.isPending}
          >
            {lookup.isPending ? <Spinner /> : <SearchIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
