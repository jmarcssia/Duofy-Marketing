import type { ExportFormat } from "@/components/document-workspace"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function downloadFile(path: string, token: string, fallbackName: string) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
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
