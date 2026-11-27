import { Download, Images, Moon, RefreshCw, Share2, Sparkles, Sun } from 'lucide-react'
import { useState } from 'react'
import type { WeeklyCollageItem } from '../../../../shared'
import { mediaApi } from '../api/media.api'
import { useWeeklyCollages } from '../hooks/useWeeklyCollages'
import {
  formatWeekRangeLabel,
  shareOrDownloadCollageImage,
  type CollageTheme,
} from '../utils/collage-renderer'
import { PrivateMediaImage } from './PrivateMediaImage'

interface MomentsGalleryViewProps {
  collages: WeeklyCollageItem[]
  isLoading: boolean
  isRendering: boolean
  onGenerate: (collage: WeeklyCollageItem, theme: CollageTheme) => Promise<void>
  onShare: (collage: WeeklyCollageItem) => Promise<void>
  sharingId: string | null
  feedbackMessage: string | null
  errorMessage: string | null
}

export function MomentsGalleryView({
  collages,
  isLoading,
  isRendering,
  onGenerate,
  onShare,
  sharingId,
  feedbackMessage,
  errorMessage,
}: MomentsGalleryViewProps) {
  const [selectedTheme, setSelectedTheme] = useState<CollageTheme>('light')

  return (
    <section className="w-full space-y-3 text-left">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Images className="w-4 h-4 text-[#FF5C7A]" />
          <h3 className="text-sm font-semibold text-[#18181B]">Nuestros Momentos</h3>
        </div>

        {collages.length > 0 && (
          <div className="inline-flex items-center rounded-lg border border-[#EAEAEA] bg-white p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setSelectedTheme('light')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                selectedTheme === 'light'
                  ? 'bg-[#18181B] text-white font-medium'
                  : 'text-zinc-500 hover:text-[#18181B]'
              }`}
            >
              <Sun className="w-3 h-3" />
              <span>Claro</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTheme('night')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                selectedTheme === 'night'
                  ? 'bg-[#18181B] text-white font-medium'
                  : 'text-zinc-500 hover:text-[#18181B]'
              }`}
            >
              <Moon className="w-3 h-3" />
              <span>Noche</span>
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 text-xs text-zinc-400">
          Cargando collages semanales...
        </div>
      ) : collages.length === 0 ? (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 text-center space-y-1">
          <p className="text-xs font-medium text-zinc-600">Tu álbum semanal te espera</p>
          <p className="text-[11px] text-zinc-400">
            Al revelar retos de la semana, aquí podrás generar su collage 9:16 listo para guardar o
            compartir.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {collages.map((collage) => {
            const rangeLabel = formatWeekRangeLabel(
              collage.week_start_date,
              collage.week_end_date
            )
            const isRendered = collage.status === 'rendered' && Boolean(collage.media_key)
            const isSharingThis = sharingId === collage.id

            return (
              <article
                key={collage.id}
                className="rounded-2xl border border-[#EAEAEA] bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#18181B]">Semana {rangeLabel}</p>
                    <p className="text-[11px] text-zinc-500">
                      {collage.activities_count}{' '}
                      {collage.activities_count === 1
                        ? 'recuerdo revelado'
                        : 'recuerdos revelados'}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${
                      isRendered
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {isRendered ? 'Guardado' : 'Listo para crear'}
                  </span>
                </div>

                {isRendered && collage.media_key ? (
                  <div className="space-y-3">
                    <div className="max-w-[260px] mx-auto">
                      <PrivateMediaImage
                        mediaKey={collage.media_key}
                        alt={`Collage semanal ${rangeLabel}`}
                        className="w-full aspect-[9/16] object-cover"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSharingThis || isRendering}
                        onClick={() => void onShare(collage)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#18181B] text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {isSharingThis ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" />
                        )}
                        <span>Compartir / Guardar</span>
                      </button>

                      <button
                        type="button"
                        disabled={isRendering || isSharingThis}
                        onClick={() => void onGenerate(collage, selectedTheme)}
                        title="Regenerar collage con el tema seleccionado"
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-[#EAEAEA] bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`} />
                        <span>Actualizar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/40 p-4 space-y-3 text-center">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-[#18181B]">
                        ¡Su resumen semanal está listo!
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Compilaremos sus fotos y mejores frases en una tarjeta 9:16 privada.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isRendering}
                      onClick={() => void onGenerate(collage, selectedTheme)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181B] text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isRendering ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-[#FF5C7A]" />
                      )}
                      <span>
                        {isRendering ? 'Creando collage HD...' : 'Generar collage 9:16'}
                      </span>
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {feedbackMessage && (
        <p className="text-xs text-emerald-700 px-1 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />
          <span>{feedbackMessage}</span>
        </p>
      )}
      {errorMessage && <p className="text-xs text-rose-600 px-1">{errorMessage}</p>}
    </section>
  )
}

export function MomentsGallery() {
  const { collages, isLoading, renderCollage, isRendering, renderError } = useWeeklyCollages()
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  const handleGenerate = async (collage: WeeklyCollageItem, theme: CollageTheme) => {
    setFeedback(null)
    setShareError(null)
    await renderCollage({ collage, theme })
    setFeedback('Collage guardado en Nuestros Momentos ❤️')
  }

  const handleShare = async (collage: WeeklyCollageItem) => {
    if (!collage.media_key) return
    setSharingId(collage.id)
    setFeedback(null)
    setShareError(null)

    try {
      const { view_url } = await mediaApi.requestViewUrl(collage.media_key)
      const isSameOrigin =
        typeof window !== 'undefined' && view_url.startsWith(window.location.origin)
      const res = await fetch(view_url, {
        credentials: isSameOrigin ? 'include' : 'omit',
      })
      if (!res.ok) {
        throw new Error('No se pudo descargar el collage para compartir')
      }
      const blob = await res.blob()
      const outcome = await shareOrDownloadCollageImage({
        blob,
        filename: `lazus-semana-${collage.week_start_date}.png`,
      })

      if (outcome === 'shared') {
        setFeedback('Collage compartido ✨')
      } else if (outcome === 'downloaded') {
        setFeedback('Collage descargado en tu dispositivo')
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Error al compartir el collage')
    } finally {
      setSharingId(null)
    }
  }

  const combinedError =
    shareError || (renderError instanceof Error ? renderError.message : null)

  return (
    <MomentsGalleryView
      collages={collages}
      isLoading={isLoading}
      isRendering={isRendering}
      onGenerate={handleGenerate}
      onShare={handleShare}
      sharingId={sharingId}
      feedbackMessage={feedback}
      errorMessage={combinedError}
    />
  )
}
