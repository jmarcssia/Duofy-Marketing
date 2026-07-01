/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
]

const nextConfig = {
  poweredByHeader: false,
  // Imagem de produção enxuta (server standalone). Não afeta `next dev`.
  output: "standalone",
  // App não usa o otimizador de imagens do Next; desligar neutraliza o
  // endpoint /_next/image (mitiga a DoS do Image Optimization) sem custo.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  }
}

export default nextConfig
