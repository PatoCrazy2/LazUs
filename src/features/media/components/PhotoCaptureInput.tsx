import { Camera, ImagePlus, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { compressImageToWebP, type CompressedImageResult } from '../utils/image-compressor'

export interface SelectedPhotoMedia {
  blob: Blob
  contentType: 'image/webp' | 'image/jpeg'
  width: number
  height: number
  sizeBytes: number
  previewUrl: string
}

interface PhotoCaptureInputProps {
  value: SelectedPhotoMedia | null
  onChange: (photo: SelectedPhotoMedia | null) => void
  disabled?: boolean
}

function formatKb(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PhotoCaptureInput({
  value,
  onChange,
  disabled = false,
}: PhotoCaptureInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (value?.previewUrl) {
        URL.revokeObjectURL(value.previewUrl)
      }
    }
  }, [value?.previewUrl])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.')
      return
    }

    setError(null)
    setIsCompressing(true)
    try {
      const compressed: CompressedImageResult = await compressImageToWebP(file, {
        maxDimension: 1920,
        quality: 0.85,
      })

      if (value?.previewUrl) {
        URL.revokeObjectURL(value.previewUrl)
      }

      const previewUrl = URL.createObjectURL(compressed.blob)
      onChange({
        blob: compressed.blob,
        contentType: compressed.contentType,
        width: compressed.width,
        height: compressed.height,
        sizeBytes: compressed.sizeBytes,
        previewUrl,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la foto')
    } finally {
      setIsCompressing(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled || isCompressing}
        className="hidden"
        aria-label="Seleccionar o tomar fotografía"
      />

      {!value ? (
        <button
          type="button"
          disabled={disabled || isCompressing}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 hover:bg-zinc-100/70 hover:border-zinc-400 transition-colors p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer disabled:opacity-50"
        >
          <div className="w-11 h-11 rounded-full bg-white border border-[#EAEAEA] flex items-center justify-center shadow-2xs">
            {isCompressing ? (
              <RefreshCw className="w-5 h-5 text-zinc-600 animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-[#18181B]" />
            )}
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-[#18181B]">
              {isCompressing ? 'Optimizando foto en HD...' : 'Tomar o elegir una foto'}
            </p>
            <p className="text-[11px] text-zinc-500">
              Se guarda en HD privado (1920px WebP) solo para ustedes dos
            </p>
          </div>
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-[#EAEAEA] bg-zinc-50">
          <img
            src={value.previewUrl}
            alt="Vista previa de tu fotografía"
            className="w-full max-h-72 object-cover"
          />

          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || isCompressing}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/70 text-white text-[11px] font-medium backdrop-blur-xs hover:bg-black/85 cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>Cambiar</span>
            </button>
            <button
              type="button"
              disabled={disabled || isCompressing}
              onClick={() => onChange(null)}
              aria-label="Quitar foto"
              className="p-1.5 rounded-lg bg-black/70 text-white backdrop-blur-xs hover:bg-black/85 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 py-1.5 bg-white/95 border-t border-[#EAEAEA] flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              {value.width}×{value.height} HD
            </span>
            <span>{formatKb(value.sizeBytes)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}
