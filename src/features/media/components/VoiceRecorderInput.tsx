import { Mic, RotateCcw, Square } from 'lucide-react'
import { useEffect } from 'react'
import { useVoiceRecorder, type RecordedVoiceNote } from '../hooks/useVoiceRecorder'

interface VoiceRecorderInputProps {
  value: RecordedVoiceNote | null
  onChange: (note: RecordedVoiceNote | null) => void
  disabled?: boolean
}

function formatTimer(totalSec: number): string {
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function VoiceRecorderInput({
  value,
  onChange,
  disabled = false,
}: VoiceRecorderInputProps) {
  const {
    isSupported,
    isRecording,
    elapsedSec,
    maxDurationSec,
    recording,
    error,
    startRecording,
    stopRecording,
    clearRecording,
  } = useVoiceRecorder()

  useEffect(() => {
    onChange(recording)
  }, [recording, onChange])

  if (!isSupported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-800">
        Tu navegador no soporta grabación de audio directa. Intenta abrir LazUs desde Safari o Chrome
        móvil.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!value ? (
        <div className="rounded-xl border border-[#EAEAEA] bg-zinc-50/70 p-5 flex flex-col items-center gap-3 text-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => (isRecording ? stopRecording() : void startRecording())}
            aria-label={isRecording ? 'Detener grabación' : 'Grabar nota de voz'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 ${
              isRecording
                ? 'bg-rose-600 text-white shadow-md scale-105 animate-pulse'
                : 'bg-[#18181B] text-white hover:bg-zinc-800'
            }`}
          >
            {isRecording ? <Square className="w-5 h-5 fill-white" /> : <Mic className="w-6 h-6" />}
          </button>

          <div className="space-y-0.5">
            <p className="text-sm font-medium text-[#18181B]">
              {isRecording ? 'Grabando nota de voz...' : 'Toca para grabar tu voz'}
            </p>
            <p className="text-xs font-mono text-zinc-500">
              {formatTimer(elapsedSec)} / {formatTimer(maxDurationSec)}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#EAEAEA] bg-white p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span className="font-medium text-[#18181B]">
              Nota lista ({formatTimer(value.durationSec)})
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={clearRecording}
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-[#18181B] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Grabar de nuevo</span>
            </button>
          </div>
          <audio controls src={value.previewUrl} className="w-full h-10" />
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}
