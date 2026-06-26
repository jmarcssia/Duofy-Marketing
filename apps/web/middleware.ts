import { NextResponse, type NextRequest } from "next/server"

const protectedPrefixes = ["/dashboard", "/admin", "/approvals", "/content", "/memory", "/research"]

export function middleware(request: NextRequest) {
  const token = request.cookies.get("duofy_token")?.value
  const { pathname } = request.nextUrl
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))

  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/admin/:path*",
    "/approvals/:path*",
    "/content/:path*",
    "/memory/:path*",
    "/research/:path*"
  ]
}
