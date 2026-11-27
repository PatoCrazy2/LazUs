import { Mic, Pause, Play, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSignedMediaUrl } from '../hooks/useSignedMediaUrl'

interface PrivateVoicePlayerProps {
  mediaKey: string
  durationSec?: number
  accentColor?: string
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const total = Math.round(sec)
  const mins = Math.floor(total / 60)
  const rem = total % 60
  return `${mins}:${String(rem).padStart(2, '0')}`
}

export function PrivateVoicePlayer({
  mediaKey,
  durationSec,
  accentColor = '#18181B',
}: PrivateVoicePlayerProps) {
  const { viewUrl, isLoading, error, refreshUrl } = useSignedMediaUrl(mediaKey)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [resolvedDuration, setResolvedDuration] = useState<number>(durationSec ?? 0)
  const [hasRetriedExpiredUrl, setHasRetriedExpiredUrl] = useState(false)

  if (isLoading) {
    return (
      <div
        className="w-full h-14 rounded-xl bg-zinc-100 animate-pulse border border-[#EAEAEA]"
        aria-label="Cargando nota de voz privada"
      />
    )
  }

  if (error || !viewUrl) {
    return (
      <div className="w-full rounded-xl border border-[#EAEAEA] bg-zinc-50 p-3 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>No se pudo cargar la nota de voz</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setHasRetriedExpiredUrl(false)
            void refreshUrl()
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#EAEAEA] bg-white text-[#18181B] font-medium hover:bg-zinc-50 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Reintentar</span>
        </button>
      </div>
    )
  }

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      try {
        await audio.play()
        setIsPlaying(true)
      } catch {
        setIsPlaying(false)
      }
    }
  }

  const total = resolvedDuration > 0 ? resolvedDuration : durationSec ?? 0
  const progressPct = total > 0 ? Math.min(100, (currentTime / total) * 100) : 0

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-zinc-50/80 px-3.5 py-2.5 flex items-center gap-3">
      <audio
        ref={audioRef}
        src={viewUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const dur = e.currentTarget.duration
          if (Number.isFinite(dur) && dur > 0) {
            setResolvedDuration(dur)
          }
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
        }}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false)
          if (!hasRetriedExpiredUrl) {
            setHasRetriedExpiredUrl(true)
            void refreshUrl()
          }
        }}
      />

      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={isPlaying ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        style={{ backgroundColor: accentColor }}
        className="w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-white" />
        ) : (
          <Play className="w-4 h-4 fill-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{ width: `${progressPct}%`, backgroundColor: accentColor }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <span>{formatSeconds(currentTime)}</span>
          <span>{formatSeconds(total)}</span>
        </div>
      </div>
    </div>
  )
}
