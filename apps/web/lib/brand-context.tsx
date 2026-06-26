"use client"

import { createContext, useContext, useEffect, useState } from "react"

import { apiFetch, type Brand } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

type BrandContextValue = {
  brands: Brand[]
  selected: string
  setSelected: (slug: string) => void
}

const BrandContext = createContext<BrandContextValue>({
  brands: [],
  selected: "",
  setSelected: () => {}
})

const STORAGE_KEY = "duofy.brand"

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selected, setSelectedState] = useState<string>("")

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return

    apiFetch<Brand[]>("/api/brands", token)
      .then((list) => {
        setBrands(list)
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
        const initial = stored && list.some((b) => b.slug === stored) ? stored : (list[0]?.slug ?? "")
        setSelectedState(initial)
      })
      .catch(() => {})
  }, [])

  function setSelected(slug: string) {
    setSelectedState(slug)
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, slug)
    }
  }

  return (
    <BrandContext.Provider value={{ brands, selected, setSelected }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand(): BrandContextValue {
  return useContext(BrandContext)
}
