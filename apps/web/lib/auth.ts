export const TOKEN_COOKIE = "duofy_token"

export function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const item = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${TOKEN_COOKIE}=`))

  return item ? decodeURIComponent(item.split("=")[1]) : null
}

export function setTokenCookie(token: string) {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(
    token
  )}; path=/; max-age=43200; SameSite=Lax`
}

export function clearTokenCookie() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}
