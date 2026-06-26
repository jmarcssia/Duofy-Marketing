"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { apiFetch, type LoginResponse } from "@/lib/api"
import { setTokenCookie } from "@/lib/auth"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("admin@duofy.com.br")
  const [password, setPassword] = useState("admin123456")
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
      router.replace(searchParams.get("next") ?? "/dashboard")
    } catch {
      setError("E-mail ou senha invalidos.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(199,102,61,0.22),transparent_28rem),linear-gradient(135deg,#f4efe6,#d5dfd0)] px-6 py-10 text-ink">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-ink/10 bg-linen/80 shadow-2xl shadow-moss/10 backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-between p-8 md:p-12">
          <div className="text-lg font-semibold tracking-[-0.03em]">DUOFY V1</div>
          <div>
            <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.05em] md:text-7xl">
              Operacao de marketing com base autenticada.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink/70">
              Fase 2: login JWT, roles simples, marcas e agentes iniciais persistidos no banco.
            </p>
          </div>
          <p className="text-sm text-ink/50">Sem agentes executaveis nesta fase.</p>
        </div>

        <div className="bg-ink p-8 text-linen md:p-12">
          <form onSubmit={handleSubmit} className="flex h-full flex-col justify-center">
            <div className="mb-8">
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">Entrar</h2>
              <p className="mt-2 text-linen/60">Use o admin criado pelo seed.</p>
            </div>

            <label className="text-sm text-linen/70" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 rounded-2xl border border-linen/15 bg-white/10 px-4 py-3 text-linen outline-none transition placeholder:text-linen/30 focus:border-clay"
              autoComplete="email"
              required
            />

            <label className="mt-5 text-sm text-linen/70" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 rounded-2xl border border-linen/15 bg-white/10 px-4 py-3 text-linen outline-none transition placeholder:text-linen/30 focus:border-clay"
              autoComplete="current-password"
              required
            />

            {error ? <p className="mt-4 text-sm text-clay">{error}</p> : null}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-8 rounded-full bg-clay px-5 py-3 font-semibold text-white transition hover:bg-clay/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Entrando..." : "Entrar no dashboard"}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
