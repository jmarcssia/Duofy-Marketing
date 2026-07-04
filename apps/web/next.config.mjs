/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
]

// C5: destino do proxy de API (server-side). Assim o browser fala com a MESMA origem
// (/api no host do front) e o cookie HttpOnly de sessão é enviado com SameSite=Lax (anti-CSRF).
// Em dev-docker aponte para o serviço da API (http://api:8000); em prod o Caddy já unifica origem.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:8000"

const nextConfig = {
  poweredByHeader: false,
  // Imagem de produção enxuta (server standalone). Não afeta `next dev`.
  output: "standalone",
  // App não usa o otimizador de imagens do Next; desligar neutraliza o
  // endpoint /_next/image (mitiga a DoS do Image Optimization) sem custo.
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_PROXY_TARGET}/api/:path*` }]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  }
}

export default nextConfig
