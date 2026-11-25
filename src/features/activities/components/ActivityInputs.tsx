import { Check, Search } from 'lucide-react'
import { useState } from 'react'
import type {
  ActivityResponseType,
  MusicTrack,
  PromptConfig,
  SubmissionPayload,
} from '../../../../shared'
import { useMusicSearch } from '../hooks/useMusicSearch'
import { MusicPlayerCard } from './MusicPlayerCard'

interface ActivityInputsProps {
  responseType: ActivityResponseType
  promptConfig?: PromptConfig
  isSubmitting: boolean
  onSubmit: (data: { content?: string; payload?: SubmissionPayload }) => Promise<void>
}

export function ActivityInputs({
  responseType,
  promptConfig,
  isSubmitting,
  onSubmit,
}: ActivityInputsProps) {
  const [text, setText] = useState('')
  const [selectedOption, setSelectedOption] = useState('')
  const [scaleValue, setScaleValue] = useState<number | null>(null)
  const [scaleNote, setScaleNote] = useState('')
  const [myAnswer, setMyAnswer] = useState('')
  const [guessedAnswer, setGuessedAnswer] = useState('')
  const [musicQuery, setMusicQuery] = useState('')
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null)
  const [musicNote, setMusicNote] = useState('')

  const { tracks, isSearching } = useMusicSearch(musicQuery)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    switch (responseType) {
      case 'text_only': {
        if (!text.trim()) return
        await onSubmit({ content: text.trim() })
        break
      }
      case 'choice': {
        if (!selectedOption) return
        await onSubmit({ payload: { type: 'choice', selected_option: selectedOption } })
        break
      }
      case 'scale': {
        if (scaleValue === null) return
        await onSubmit({
          payload: {
            type: 'scale',
            value: scaleValue,
            note: scaleNote.trim() || undefined,
          },
        })
        break
      }
      case 'prediction': {
        if (!myAnswer.trim() || !guessedAnswer.trim()) return
        await onSubmit({
          payload: {
            type: 'prediction',
            my_answer: myAnswer.trim(),
            guessed_partner_answer: guessedAnswer.trim(),
          },
        })
        break
      }
      case 'music': {
        if (!selectedTrack) return
        await onSubmit({
          payload: {
            type: 'music',
            track: {
              ...selectedTrack,
              note: musicNote.trim() || undefined,
            },
          },
        })
        break
      }
    }
  }

  const canSubmit = (() => {
    switch (responseType) {
      case 'text_only':
        return text.trim().length > 0
      case 'choice':
        return selectedOption.length > 0
      case 'scale':
        return scaleValue !== null
      case 'prediction':
        return myAnswer.trim().length > 0 && guessedAnswer.trim().length > 0
      case 'music':
        return selectedTrack !== null
      default:
        return false
    }
  })()

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {responseType === 'text_only' && (
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Escribe tu respuesta aquí..."
            className="w-full rounded-xl border border-[#EAEAEA] bg-white/80 px-3.5 py-3 text-sm text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#18181B] transition-colors resize-none"
          />
          <div className="flex justify-end text-[11px] text-zinc-400">
            {text.length} / 2000
          </div>
        </div>
      )}

      {responseType === 'choice' && (
        <div className="space-y-2">
          {(promptConfig?.options ?? []).map((option) => {
            const active = selectedOption === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => setSelectedOption(option)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center justify-between cursor-pointer ${
                  active
                    ? 'border-[#18181B] bg-[#18181B] text-white font-medium'
                    : 'border-[#EAEAEA] bg-white text-[#18181B] hover:border-zinc-300'
                }`}
              >
                <span>{option}</span>
                {active && <Check className="w-4 h-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}

      {responseType === 'scale' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            {Array.from(
              { length: (promptConfig?.max ?? 5) - (promptConfig?.min ?? 1) + 1 },
              (_, idx) => {
                const min = promptConfig?.min ?? 1
                const val = min + idx
                const emoji = promptConfig?.emojis?.[idx]
                const active = scaleValue === val
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setScaleValue(val)}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      active
                        ? 'border-[#18181B] bg-[#18181B] text-white scale-[1.03]'
                        : 'border-[#EAEAEA] bg-white text-[#18181B] hover:border-zinc-300'
                    }`}
                  >
                    {emoji && <span className="text-lg leading-none">{emoji}</span>}
                    <span>{val}</span>
                  </button>
                )
              }
            )}
          </div>
          {(promptConfig?.min_label || promptConfig?.max_label) && (
            <div className="flex justify-between text-[11px] text-zinc-400 px-1">
              <span>{promptConfig?.min_label}</span>
              <span>{promptConfig?.max_label}</span>
            </div>
          )}
          <input
            type="text"
            value={scaleNote}
            onChange={(e) => setScaleNote(e.target.value)}
            maxLength={500}
            placeholder="Nota rápida opcional..."
            className="w-full rounded-xl border border-[#EAEAEA] bg-white px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#18181B]"
          />
        </div>
      )}

      {responseType === 'prediction' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600">Tu respuesta</label>
            <input
              type="text"
              value={myAnswer}
              onChange={(e) => setMyAnswer(e.target.value)}
              maxLength={500}
              placeholder="¿Qué responderías tú?"
              className="w-full rounded-xl border border-[#EAEAEA] bg-white px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#18181B]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600">
              ¿Qué crees que responderá tu pareja?
            </label>
            <input
              type="text"
              value={guessedAnswer}
              onChange={(e) => setGuessedAnswer(e.target.value)}
              maxLength={500}
              placeholder="Adivina su respuesta..."
              className="w-full rounded-xl border border-[#EAEAEA] bg-white px-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#18181B]"
            />
          </div>
        </div>
      )}

      {responseType === 'music' && (
        <div className="space-y-3">
          {!selectedTrack ? (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={musicQuery}
                  onChange={(e) => setMusicQuery(e.target.value)}
                  placeholder="Busca una canción o artista..."
                  className="w-full rounded-xl border border-[#EAEAEA] bg-white pl-9 pr-3.5 py-2.5 text-sm text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#18181B]"
                />
              </div>

              {isSearching && (
                <p className="text-xs text-zinc-400 px-1">Buscando canciones...</p>
              )}

              {tracks.length > 0 && (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {tracks.map((track) => (
                    <div
                      key={track.track_id}
                      className="flex items-center gap-3 p-2 rounded-xl border border-[#EAEAEA] bg-white hover:border-zinc-300 transition-colors"
                    >
                      <img
                        src={track.artwork_url}
                        alt={track.title}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#18181B] truncate">
                          {track.title}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{track.artist}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTrack(track)}
                        className="px-3 py-1.5 rounded-lg bg-[#18181B] text-white text-xs font-medium hover:bg-zinc-800 cursor-pointer shrink-0"
                      >
                        Elegir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2.5">
              <MusicPlayerCard track={selectedTrack} showExternalLink={false} />
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={musicNote}
                  onChange={(e) => setMusicNote(e.target.value)}
                  maxLength={500}
                  placeholder="¿Por qué elegiste esta canción? (opcional)"
                  className="flex-1 rounded-xl border border-[#EAEAEA] bg-white px-3 py-2 text-xs text-[#18181B] placeholder:text-zinc-400 focus:outline-none focus:border-[#18181B]"
                />
                <button
                  type="button"
                  onClick={() => setSelectedTrack(null)}
                  className="text-xs text-zinc-500 hover:text-[#18181B] px-2 py-1 cursor-pointer"
                >
                  Cambiar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || isSubmitting}
        className="w-full py-3 rounded-xl bg-[#18181B] text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
      >
        {isSubmitting ? 'Sellando respuesta...' : 'Sellar mi respuesta'}
      </button>
    </form>
  )
}
