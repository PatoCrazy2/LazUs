import { ImageOff, Maximize2, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useSignedMediaUrl } from '../hooks/useSignedMediaUrl'

interface PrivateMediaImageProps {
  mediaKey: string
  alt?: string
  className?: string
}

export function PrivateMediaImage({
  mediaKey,
  alt = 'Fotografía compartida',
  className = 'w-full max-h-80 object-cover',
}: PrivateMediaImageProps) {
  const { viewUrl, isLoading, error, refreshUrl } = useSignedMediaUrl(mediaKey)
  const [hasRetriedExpiredUrl, setHasRetriedExpiredUrl] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  if (isLoading) {
    return (
      <div
        className="w-full h-52 rounded-xl bg-zinc-100 animate-pulse border border-[#EAEAEA]"
        aria-label="Cargando fotografía privada"
      />
    )
  }

  if (error || !viewUrl) {
    return (
      <div className="w-full rounded-xl border border-[#EAEAEA] bg-zinc-50 p-4 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <ImageOff className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>No se pudo cargar la fotografía privada</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setHasRetriedExpiredUrl(false)
            void refreshUrl()
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#EAEAEA] bg-white text-[#18181B] font-medium hover:bg-zinc-50 cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Reintentar</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="relative group rounded-xl overflow-hidden border border-[#EAEAEA] bg-zinc-50">
        <img
          src={viewUrl}
          alt={alt}
          loading="lazy"
          onClick={() => setIsLightboxOpen(true)}
          onError={() => {
            if (!hasRetriedExpiredUrl) {
              setHasRetriedExpiredUrl(true)
              void refreshUrl()
            }
          }}
          className={`${className} cursor-zoom-in transition-transform duration-200`}
        />
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          aria-label="Ver fotografía en pantalla completa"
          className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-black/60 text-white opacity-85 hover:opacity-100 backdrop-blur-xs transition-opacity cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            aria-label="Cerrar vista ampliada"
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={viewUrl}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[88vh] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  )
}
