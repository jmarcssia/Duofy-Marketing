import { redirect } from "next/navigation"

// "Redes & Tráfego" está fora do escopo da V1: os dados de Instagram Insights /
// Meta Ads ainda não têm integração real (o painel era 100% mock). A rota fica
// oculta e redireciona para Operações. O painel mock anterior está preservado no
// histórico do git e volta quando a integração real entrar.
export default function RedesPage() {
  redirect("/operations")
}
