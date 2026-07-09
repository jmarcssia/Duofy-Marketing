// C5: o token JWT agora vive num cookie HttpOnly (`duofy_token`), invisível ao JS — imune a
// roubo por XSS. O JS só enxerga a flag não-secreta `duofy_auth`, que apenas sinaliza "há sessão".
export const AUTH_FLAG_COOKIE = "duofy_auth"

/**
 * Indica se há sessão ativa (lendo a flag não-secreta). Mantém o nome antigo porque é usado como
 * guarda em toda a app (`const token = getTokenFromCookie(); if (!token) return`). O valor é
 * passado ao apiFetch por compatibilidade, mas é IGNORADO — a sessão viaja no cookie HttpOnly.
 */
export function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null
  }
  const item = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${AUTH_FLAG_COOKIE}=`))
  return item ? item.split("=")[1] : null
}

// No-op: quem define a sessão é o backend (cookie HttpOnly no /api/auth/login). Mantido por compat.
export function setTokenCookie(_token: string) {
  /* backend define o cookie HttpOnly; nada a fazer no cliente */
}

// Limpa a flag legível; o cookie HttpOnly é limpo pelo backend em POST /api/auth/logout.
export function clearTokenCookie() {
  if (typeof document === "undefined") {
    return
  }
  document.cookie = `${AUTH_FLAG_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}
