"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { apiFetch, type LoginResponse } from "@/lib/api"
import { setTokenCookie } from "@/lib/auth"

const JOURNEY = ["Pesquisa", "Cocriação", "Calendário", "Revisão", "Publicação"]

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const data = await apiFetch<LoginResponse>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password })
      })
      setTokenCookie(data.access_token)
      router.replace(searchParams.get("next") ?? "/operations")
    } catch {
      setError("E-mail ou senha inválidos.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-paper text-ink lg:grid-cols-[1.05fr_0.95fr]">
      {/* Painel-tese: escuro, calmo, com o "fio de fluxo" da jornada (assinatura). */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60rem 40rem at 15% -10%, rgba(90,52,224,0.35), transparent 60%), radial-gradient(40rem 30rem at 100% 110%, rgba(193,119,34,0.18), transparent 60%)"
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 font-display text-lg font-bold">
            D
          </span>
          <span className="text-sm font-semibold tracking-[-0.01em] text-white/90">Duofy</span>
        </div>

        <div className="relative">
          <h1 className="max-w-xl font-display text-5xl font-bold leading-[1.03] tracking-[-0.03em] md:text-6xl">
            Marketing com IA,
            <br />
            sob supervisão humana.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-white/60">
            Pesquisa, cocriação e calendário para as suas marcas — com um Guardião de Qualidade que
            orienta cada aprovação.
          </p>
        </div>

        {/* Flowline — os cinco passos da jornada, conectados por um fio. */}
        <div className="relative flex items-center gap-0">
          {JOURNEY.map((step, i) => (
            <div key={step} className="flex items-center">
              <div className="flex flex-col items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: i === 0 ? "#c17722" : "rgba(255,255,255,0.55)" }}
                />
                <span className="text-[11px] font-medium text-white/45">{step}</span>
              </div>
              {i < JOURNEY.length - 1 ? (
                <span className="mx-2 mb-5 h-px w-8 bg-gradient-to-r from-white/30 to-white/10 md:w-12" />
              ) : null}
            </div>
          ))}
        </div>
      </aside>

      {/* Formulário — idioma do console. */}
      <div className="flex items-center justify-center px-6 py-12 md:px-16">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="font-display text-xl font-bold tracking-[-0.02em]">Duofy</span>
          </div>
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-ink">Entrar</h2>
          <p className="mt-2 text-sm text-muted">Use as credenciais fornecidas pelo administrador.</p>

          <label className="mt-8 block text-sm font-medium text-ink" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com"
            className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none placeholder:text-muted/60"
            autoComplete="email"
            required
          />

          <label className="mt-5 block text-sm font-medium text-ink" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none"
            autoComplete="current-password"
            required
          />

          {error ? (
            <p className="mt-4 rounded-lg bg-red/10 px-3 py-2 text-sm font-medium text-red">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="duofy-tap mt-8 flex w-full items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Entrando…" : "Entrar"}
          </button>

          <p className="mt-8 text-center text-xs text-muted">
            Pesquisa · Cocriação · Calendário · Revisão · Relatórios
          </p>
        </form>
      </div>
    </main>
  )
}
