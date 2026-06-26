"use client"

import { useRouter } from "next/navigation"

import { clearTokenCookie } from "@/lib/auth"

export function LogoutButton() {
  const router = useRouter()

  function handleLogout() {
    clearTokenCookie()
    router.replace("/login")
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
    >
      Sair
    </button>
  )
}
