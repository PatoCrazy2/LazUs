import { ExternalLink, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MusicTrack } from '../../../../shared'

interface MusicPlayerCardProps {
  track: MusicTrack
  showExternalLink?: boolean
  compact?: boolean
}

export function MusicPlayerCard({
  track,
  showExternalLink = true,
  compact = false,
}: MusicPlayerCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    const onEnded = () => {
      setIsPlaying(false)
      setProgress(0)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.pause()
    }
  }, [track.preview_url])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      void audio.play()
      setIsPlaying(true)
    }
  }

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-3 space-y-2.5">
      <audio ref={audioRef} src={track.preview_url} preload="none" />

      <div className="flex items-center gap-3">
        <img
          src={track.artwork_url}
          alt={track.title}
          className={`${compact ? 'w-11 h-11' : 'w-14 h-14'} rounded-lg object-cover shrink-0 border border-[#EAEAEA]`}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#18181B] truncate">{track.title}</p>
          <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pausar preview' : 'Reproducir preview'}
          className="w-9 h-9 rounded-full bg-[#18181B] text-white flex items-center justify-center shrink-0 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
      </div>

      <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0D9488] transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {track.note && <p className="text-xs text-zinc-600 italic">"{track.note}"</p>}

      {showExternalLink && track.external_url && (
        <a
          href={track.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0D9488] hover:underline"
        >
          <span>Escuchar completa</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
