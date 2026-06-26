import { Suspense } from "react"

import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-linen px-6 py-10 text-ink">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-ink/10 bg-white p-8">
            Carregando login...
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
