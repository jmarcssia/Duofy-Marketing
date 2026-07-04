export type ExportFormat = "pdf" | "docx" | "md" | "html"

// C5: mesmo-origem (proxy /api) + cookie HttpOnly (credentials:include). `token` ignorado.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""

export async function downloadFile(path: string, _token: string, fallbackName: string) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include"
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Falha ao baixar arquivo.")
  }
  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") ?? ""
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.URL.revokeObjectURL(url)
}

export function exportPath(basePath: string, format: ExportFormat) {
  return `${basePath}/export?format=${format}`
}
