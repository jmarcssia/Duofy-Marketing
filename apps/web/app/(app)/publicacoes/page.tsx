"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  ImageIcon,
  InstagramIcon,
  MetaIcon,
  PlusIcon,
  SendIcon,
  UploadIcon
} from "@/components/icons"
import {
  Badge,
  FieldSelect,
  GhostButton,
  PageHeader,
  SectionHeader,
  Segmented,
  Spinner,
  Tabs,
  type Tone
} from "@/components/ui"
import {
  apiFetch,
  type ContentOutput,
  type Publication,
  type PublicationChannel
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { useBrand } from "@/lib/brand-context"

const CHANNEL_STATUS: Record<string, { label: string; tone: Tone }> = {
  connected: { label: "Conectado", tone: "green" },
  pending: { label: "Pendente", tone: "amber" },
  expired: { label: "Expirado", tone: "slate" },
  error: { label: "Erro", tone: "red" }
}
const PUB_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "slate" },
  scheduled: { label: "Agendada", tone: "blue" },
  published: { label: "Publicada", tone: "green" },
  error: { label: "Erro", tone: "red" }
}
const POST_TYPES = [{ id: "feed", label: "Feed" }, { id: "stories", label: "Stories" }, { id: "reels", label: "Reels" }] as const
type PostType = (typeof POST_TYPES)[number]["id"]

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function PublicacoesPage() {
  const { selected: brand } = useBrand()
  const fileRef = useRef<HTMLInputElement>(null)

  const [channels, setChannels] = useState<PublicationChannel[]>([])
  const [pubs, setPubs] = useState<Publication[]>([])
  const [approved, setApproved] = useState<ContentOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [queueTab, setQueueTab] = useState<"draft" | "scheduled" | "published" | "error">("draft")

  // Compositor
  const [editingId, setEditingId] = useState<number | null>(null)
  const [outputId, setOutputId] = useState<string>("")
  const [channelId, setChannelId] = useState<string>("")
  const [postType, setPostType] = useState<PostType>("feed")
  const [caption, setCaption] = useState("")
  const [firstComment, setFirstComment] = useState("")
  const [hashtags, setHashtags] = useState("")
  const [mediaPaths, setMediaPaths] = useState<string[]>([])
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("09:00")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Conectar canal
  const [chPlatform, setChPlatform] = useState("instagram")
  const [chName, setChName] = useState("")

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token || !brand) { setLoading(false); return }
    setLoading(true)
    const bq = `?brand_slug=${encodeURIComponent(brand)}`
    try {
      const [ch, pb, ap] = await Promise.all([
        apiFetch<PublicationChannel[]>(`/api/publications/channels${bq}`, token).catch(() => []),
        apiFetch<Publication[]>(`/api/publications${bq}`, token).catch(() => []),
        apiFetch<ContentOutput[]>(`/api/outputs?limit=100&brand_slug=${encodeURIComponent(brand)}`, token).catch(() => [])
      ])
      setChannels(ch)
      setPubs(pb)
      setApproved(ap.filter((o) => o.status === "approved" && o.category !== "research"))
    } catch { /* vazio */ }
    setLoading(false)
  }, [brand])

  useEffect(() => { void load() }, [load])

  function resetComposer() {
    setEditingId(null); setOutputId(""); setChannelId(""); setPostType("feed")
    setCaption(""); setFirstComment(""); setHashtags(""); setMediaPaths([]); setScheduleDate(""); setMsg(null)
  }

  function pickOutput(id: string) {
    setOutputId(id)
    const out = approved.find((o) => String(o.id) === id)
    if (out && !caption) setCaption((out.current_content || out.briefing || "").slice(0, 400))
  }

  async function uploadMedia(files: FileList | null) {
    if (!files || files.length === 0 || !brand) return
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(true); setMsg("Enviando mídia…")
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await apiFetch<{ path: string }>(`/api/publications/media?brand_slug=${encodeURIComponent(brand)}`, token, { method: "POST", body: fd })
        setMediaPaths((m) => [...m, res.path])
      }
      setMsg("Mídia anexada.")
    } catch (e: unknown) {
      setMsg(friendlyError(e, "Falha no upload da mídia."))
    }
    setBusy(false)
  }

  function body() {
    const scheduled_at = scheduleDate ? new Date(`${scheduleDate}T${scheduleTime || "09:00"}:00`).toISOString() : null
    return {
      brand_slug: brand,
      channel_id: channelId ? Number(channelId) : null,
      output_id: outputId ? Number(outputId) : null,
      title: (approved.find((o) => String(o.id) === outputId)?.title ?? caption.slice(0, 60)) || "Publicação",
      caption, first_comment: firstComment || null, hashtags: hashtags || null,
      media_paths: mediaPaths, post_type: postType, scheduled_at
    }
  }

  async function save() {
    const token = getTokenFromCookie()
    if (!token || !brand) { setMsg("Selecione uma marca."); return }
    setBusy(true); setMsg(null)
    try {
      if (editingId) {
        await apiFetch(`/api/publications/${editingId}`, token, { method: "PATCH", body: JSON.stringify(body()) })
      } else {
        await apiFetch(`/api/publications`, token, { method: "POST", body: JSON.stringify(body()) })
      }
      setMsg("Publicação salva na fila.")
      resetComposer()
      await load()
    } catch (e: unknown) {
      setMsg(friendlyError(e, "Falha ao salvar."))
    }
    setBusy(false)
  }

  async function publish(id: number, target: "manual" | "meta") {
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(true); setMsg(null)
    try {
      await apiFetch(`/api/publications/${id}/publish?target=${target}`, token, { method: "POST", body: "{}" })
      setMsg("Publicação registrada.")
      await load()
    } catch (e: unknown) {
      // Meta stub: mensagem honesta do backend aparece aqui (não finge sucesso).
      setMsg(friendlyError(e, "Falha ao publicar."))
      await load()
    }
    setBusy(false)
  }

  async function remove(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    try { await apiFetch(`/api/publications/${id}`, token, { method: "DELETE" }); await load() } catch { /* ignore */ }
  }

  function edit(p: Publication) {
    setEditingId(p.id); setOutputId(p.output_id ? String(p.output_id) : ""); setChannelId(p.channel_id ? String(p.channel_id) : "")
    setPostType((p.post_type as PostType) || "feed"); setCaption(p.caption); setFirstComment(p.first_comment ?? "")
    setHashtags(p.hashtags ?? ""); setMediaPaths(p.media_paths ?? [])
    if (p.scheduled_at) { const d = new Date(p.scheduled_at); setScheduleDate(d.toISOString().slice(0, 10)); setScheduleTime(d.toTimeString().slice(0, 5)) }
    setMsg(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function connectChannel() {
    const token = getTokenFromCookie()
    if (!token || !brand || chName.trim().length < 1) return
    setBusy(true)
    try {
      await apiFetch(`/api/publications/channels`, token, { method: "POST", body: JSON.stringify({ brand_slug: brand, platform: chPlatform, display_name: chName.trim() }) })
      setChName(""); await load()
    } catch (e: unknown) { setMsg(friendlyError(e, "Falha ao conectar canal.")) }
    setBusy(false)
  }

  const queue = useMemo(() => pubs.filter((p) => p.status === queueTab), [pubs, queueTab])
  const counts = useMemo(() => ({
    draft: pubs.filter((p) => p.status === "draft").length,
    scheduled: pubs.filter((p) => p.status === "scheduled").length,
    published: pubs.filter((p) => p.status === "published").length,
    error: pubs.filter((p) => p.status === "error").length
  }), [pubs])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publicações e Canais"
        subtitle="Prepare publicações, gerencie canais e faça upload das mídias geradas fora do sistema."
        icon={<SendIcon className="h-5 w-5" />}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber/5 p-4">
        <MetaIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
        <div className="text-sm text-ink">
          <p className="font-semibold">Integração Meta pendente.</p>
          <p className="mt-0.5 text-muted">A publicação automática (Instagram/Facebook via Graph API) entra numa próxima fase. Por enquanto, prepare a publicação e registre-a como <strong>manual</strong> — o sistema nunca finge uma publicação na Meta.</p>
        </div>
      </div>

      {/* Canais */}
      <section className="duofy-card rounded-2xl p-5">
        <SectionHeader title="Canais conectados" subtitle={`Marca ${brand || "—"}`} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((c) => {
            const cs = CHANNEL_STATUS[c.status] ?? { label: c.status, tone: "slate" as Tone }
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple"><InstagramIcon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.display_name}</p>
                  <p className="text-[11px] capitalize text-muted">{c.platform}</p>
                </div>
                <Badge tone={cs.tone}>{cs.label}</Badge>
              </div>
            )
          })}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3">
            <select value={chPlatform} onChange={(e) => setChPlatform(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs text-ink focus:border-purple focus:outline-none">
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="meta">Outro (Meta)</option>
            </select>
            <input value={chName} onChange={(e) => setChName(e.target.value)} placeholder="Nome do canal" className="min-w-[120px] flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink focus:border-purple focus:outline-none" />
            <button onClick={connectChannel} disabled={busy || chName.trim().length < 1} className="duofy-tap inline-flex items-center gap-1 rounded-lg bg-purple px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep disabled:opacity-50"><PlusIcon className="h-3.5 w-3.5" /> Conectar</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Compositor */}
        <section className="duofy-card space-y-4 rounded-2xl p-5">
          <SectionHeader title={editingId ? "Editar publicação" : "Montar publicação"} subtitle="Conteúdo aprovado + mídia + legenda + agendamento" right={editingId ? <GhostButton className="text-xs" onClick={resetComposer}>Novo</GhostButton> : undefined} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldSelect label="Conteúdo aprovado (opcional)" value={outputId} onChange={pickOutput} options={[{ value: "", label: "Sem vínculo" }, ...approved.map((o) => ({ value: String(o.id), label: `#${o.id} · ${o.title}` }))]} />
            <FieldSelect label="Canal" value={channelId} onChange={setChannelId} options={[{ value: "", label: "Sem canal" }, ...channels.map((c) => ({ value: String(c.id), label: `${c.display_name} (${c.platform})` }))]} />
          </div>

          <div>
            <span className="text-xs font-semibold text-muted">Tipo de postagem</span>
            <div className="mt-1"><Segmented value={postType} onChange={setPostType} options={POST_TYPES.map((p) => ({ id: p.id, label: p.label }))} /></div>
          </div>

          {/* Mídia */}
          <div>
            <span className="text-xs font-semibold text-muted">Mídia (imagem/vídeo — gerada fora do sistema)</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => uploadMedia(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50">
                <UploadIcon className="h-4 w-4" /> Enviar mídia
              </button>
              {mediaPaths.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-[11px] text-ink">
                  <ImageIcon className="h-3.5 w-3.5 text-purple" /> {p.split(/[\\/]/).pop()}
                  <button onClick={() => setMediaPaths((m) => m.filter((_, j) => j !== i))} className="text-muted hover:text-red"><CloseIcon className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <label className="block text-xs font-semibold text-muted">Legenda
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2.5 text-sm text-ink focus:border-purple focus:outline-none" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">Primeiro comentário (opcional)
              <input value={firstComment} onChange={(e) => setFirstComment(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
            <label className="block text-xs font-semibold text-muted">Hashtags (legenda)
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#gestao #postos" className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">Agendar — data (opcional)
              <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
            <label className="block text-xs font-semibold text-muted">Hora
              <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
          </div>

          {msg && <p className="text-xs font-medium text-purple">{msg}</p>}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button onClick={save} disabled={busy || !brand} className="duofy-tap inline-flex items-center gap-2 rounded-xl bg-purple px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
              {busy ? <Spinner size={16} /> : <CheckCircleIcon className="h-4 w-4" />} {editingId ? "Salvar alterações" : "Salvar na fila"}
            </button>
          </div>
        </section>

        {/* Preview + Fila */}
        <div className="space-y-6">
          <section className="duofy-card rounded-2xl p-5">
            <SectionHeader title="Prévia" />
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <div className="grid aspect-square place-items-center bg-panel/60 text-center text-muted">
                {mediaPaths.length > 0 ? (
                  <div><ImageIcon className="mx-auto h-8 w-8 text-purple" /><p className="mt-1 text-xs">{mediaPaths.length} mídia(s) anexada(s)</p></div>
                ) : (
                  <p className="text-xs">Sem mídia — envie imagem/vídeo</p>
                )}
              </div>
              <div className="p-3">
                <p className="text-[11px] font-semibold uppercase text-muted">{POST_TYPES.find((p) => p.id === postType)?.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{caption || "Sua legenda aparece aqui…"}</p>
                {hashtags && <p className="mt-1 text-xs text-blue">{hashtags}</p>}
              </div>
            </div>
          </section>

          <section className="duofy-card rounded-2xl p-5">
            <SectionHeader title="Fila de publicação" />
            <div className="mt-3">
              <Tabs value={queueTab} onChange={setQueueTab} tabs={[
                { id: "draft", label: `Rascunhos (${counts.draft})` },
                { id: "scheduled", label: `Agendadas (${counts.scheduled})` },
                { id: "published", label: `Publicadas (${counts.published})` },
                { id: "error", label: `Erros (${counts.error})` }
              ]} />
            </div>
            <div className="mt-3 space-y-2">
              {loading && <p className="text-sm text-muted">Carregando…</p>}
              {!loading && queue.length === 0 && <p className="py-4 text-center text-sm text-muted">Nada nesta fila.</p>}
              {queue.map((p) => {
                const ps = PUB_STATUS[p.status] ?? { label: p.status, tone: "slate" as Tone }
                return (
                  <div key={p.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{p.title || "(sem título)"}</p>
                      <Badge tone={ps.tone}>{ps.label}</Badge>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {p.status === "published" ? `publicada ${fmt(p.published_at)}` : p.scheduled_at ? `agendada ${fmt(p.scheduled_at)}` : `atualizada ${fmt(p.updated_at)}`}
                      {p.media_paths.length > 0 && <span>· {p.media_paths.length} mídia</span>}
                    </p>
                    {p.last_error && <p className="mt-1 flex items-start gap-1 text-[11px] text-red"><AlertTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" />{p.last_error}</p>}
                    {p.status !== "published" && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => publish(p.id, "manual")} disabled={busy} className="duofy-tap rounded-lg bg-purple px-2.5 py-1 text-xs font-semibold text-white hover:bg-purple-deep disabled:opacity-50">Marcar publicada</button>
                        <button onClick={() => publish(p.id, "meta")} disabled={busy} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-purple/40" title="Integração Meta na próxima fase">Meta <span className="rounded bg-panel px-1 text-[9px] font-bold">em breve</span></button>
                        <button onClick={() => edit(p)} className="duofy-tap rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple">Editar</button>
                        <button onClick={() => remove(p.id)} className="duofy-tap rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-red/40 hover:text-red">Remover</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
