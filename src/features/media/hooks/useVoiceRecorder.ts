import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_VOICE_DURATION_SEC } from '../../../../shared'

export interface RecordedVoiceNote {
  blob: Blob
  mimeType: string
  durationSec: number
  previewUrl: string
}

function selectPreferredAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'

  const candidates = [
    'audio/mp4', // iOS Safari nativo
    'audio/webm;codecs=opus', // Chrome / Android / Desktop
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]

  for (const mime of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return 'audio/webm'
}

export function useVoiceRecorder(maxDurationSec: number = MAX_VOICE_DURATION_SEC) {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [recording, setRecording] = useState<RecordedVoiceNote | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)

  const isSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  const stopTracksAndTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    stopTracksAndTimer()
    setIsRecording(false)
  }, [stopTracksAndTimer])

  const clearRecording = useCallback(() => {
    setRecording((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setElapsedSec(0)
    setError(null)
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Tu navegador no soporta grabación de notas de voz.')
      return
    }

    setError(null)
    clearRecording()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = selectPreferredAudioMimeType()
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 48_000,
      })

      chunksRef.current = []
      startedAtRef.current = Date.now()
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const rawMime = (recorder.mimeType || mimeType).split(';')[0]?.trim() || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: rawMime })
        const durationSec = Math.max(
          1,
          Math.min(maxDurationSec, Math.round((Date.now() - startedAtRef.current) / 1000))
        )
        const previewUrl = URL.createObjectURL(blob)

        setRecording({
          blob,
          mimeType: rawMime,
          durationSec,
          previewUrl,
        })
        setIsRecording(false)
        stopTracksAndTimer()
      }

      recorder.start(250)
      setIsRecording(true)
      setElapsedSec(0)

      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setElapsedSec(sec)
        if (sec >= maxDurationSec) {
          stopRecording()
        }
      }, 250)
    } catch {
      stopTracksAndTimer()
      setIsRecording(false)
      setError('No pudimos acceder al micrófono. Revisa los permisos de tu navegador.')
    }
  }, [clearRecording, isSupported, maxDurationSec, stopRecording, stopTracksAndTimer])

  useEffect(() => {
    return () => {
      stopTracksAndTimer()
      if (recording?.previewUrl) {
        URL.revokeObjectURL(recording.previewUrl)
      }
    }
  }, [recording?.previewUrl, stopTracksAndTimer])

  return {
    isSupported,
    isRecording,
    elapsedSec,
    maxDurationSec,
    recording,
    error,
    startRecording,
    stopRecording,
    clearRecording,
  }
}
