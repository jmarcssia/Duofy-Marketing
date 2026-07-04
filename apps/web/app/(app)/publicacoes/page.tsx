"use client"

import { EmptyState, PageHeader } from "@/components/ui"
import { MetaIcon, SendIcon } from "@/components/icons"

export default function PublicacoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Publicações e Canais"
        subtitle="Prepare publicações, gerencie canais e faça upload das mídias geradas."
        icon={<SendIcon className="h-5 w-5" />}
      />
      <EmptyState
        icon={<MetaIcon className="h-6 w-6" />}
        title="Em construção"
        subtitle="A área de Publicações — canais Meta (Instagram/Facebook), fila de publicação, upload de mídia, montagem do post e agendamento — chega na próxima entrega. Enquanto isso, a publicação manual já pode ser registrada pelo Calendário Editorial."
      />
    </div>
  )
}
