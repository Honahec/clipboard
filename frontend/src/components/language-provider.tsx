import { useEffect, useMemo, useState, type ReactNode } from "react"

import {
  I18nContext,
  translate,
  type I18nContextValue,
  type Language,
} from "@/lib/i18n"

const storageKey = "clipboard-language"

function initialLanguage(): Language {
  return window.localStorage.getItem(storageKey) === "zh-CN" ? "zh-CN" : "en"
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage)

  useEffect(() => {
    window.localStorage.setItem(storageKey, language)
    document.documentElement.lang = language
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", translate(language, "meta.description"))
  }, [language])

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: language === "zh-CN" ? "zh-CN" : "en-US",
      t: (key, values) => translate(language, key, values),
      toggleLanguage: () =>
        setLanguage((current) => (current === "en" ? "zh-CN" : "en")),
    }),
    [language],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
