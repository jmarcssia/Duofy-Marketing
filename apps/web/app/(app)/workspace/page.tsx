"use client"

import { useState } from "react"

import type { AgentTask } from "@/lib/api"
import { useBrand } from "@/lib/brand-context"
import { ChatPanel } from "@/components/chat-panel"
import { KanbanBoard } from "@/components/kanban-board"
import { CardPopup } from "@/components/card-popup"
import { InspectorBar } from "@/components/inspector-bar"

type OpenCard = { id: number; type: string }

function popupType(outputType: string): string {
  const normalized = outputType.toLowerCase()
  if (normalized.includes("research") || normalized.includes("pesquisa")) {
    return "pesquisa"
  }
  return "conteudo"
}

export default function WorkspacePage() {
  const { selected } = useBrand()
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null)
  const [openCard, setOpenCard] = useState<OpenCard | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  function reloadBoard() {
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="flex h-[calc(100vh-150px)] flex-col gap-3 overflow-hidden">
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="hidden h-full w-[320px] shrink-0 lg:block">
          <ChatPanel
            brandSlug={selected}
            onArtifact={(outputType, outputId) => {
              reloadBoard()
              setOpenCard({ id: outputId, type: popupType(outputType) })
            }}
            onTaskActivity={setActiveTask}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <KanbanBoard
            key={reloadKey}
            brandSlug={selected}
            onOpenCard={(id, type) => setOpenCard({ id, type })}
          />
        </div>
      </div>

      <InspectorBar task={activeTask} />

      {openCard ? (
        <CardPopup
          outputId={openCard.id}
          type={openCard.type}
          onClose={() => setOpenCard(null)}
          onChanged={reloadBoard}
        />
      ) : null}
    </div>
  )
}
