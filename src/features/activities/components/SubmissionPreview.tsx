import type { SubmissionItem } from '../../../../shared'
import { MusicPlayerCard } from './MusicPlayerCard'

interface SubmissionPreviewProps {
  label: string
  submission: SubmissionItem | null | undefined
  accentColor?: string
}

export function SubmissionPreview({
  label,
  submission,
  accentColor = '#18181B',
}: SubmissionPreviewProps) {
  if (!submission) {
    return (
      <div className="rounded-xl border border-[#EAEAEA] bg-zinc-50/70 p-3.5">
        <p className="text-[11px] font-medium text-zinc-400 mb-1">{label}</p>
        <p className="text-xs text-zinc-400 italic">Sin respuesta</p>
      </div>
    )
  }

  const payload = submission.payload

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: accentColor }}
        >
          {label}
        </span>
      </div>

      {submission.content && (
        <p className="text-sm text-[#18181B] whitespace-pre-wrap leading-relaxed">
          {submission.content}
        </p>
      )}

      {payload?.type === 'choice' && (
        <p className="text-sm font-medium text-[#18181B]">{payload.selected_option}</p>
      )}

      {payload?.type === 'scale' && (
        <div className="space-y-1">
          <p className="text-lg font-semibold text-[#18181B]">{payload.value} / 5</p>
          {payload.note && <p className="text-xs text-zinc-600">{payload.note}</p>}
        </div>
      )}

      {payload?.type === 'prediction' && (
        <div className="space-y-1.5 text-sm">
          <div>
            <span className="text-[11px] text-zinc-400 block">Respondió:</span>
            <p className="font-medium text-[#18181B]">{payload.my_answer}</p>
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 block">Predijo sobre su pareja:</span>
            <p className="text-zinc-600 italic">{payload.guessed_partner_answer}</p>
          </div>
        </div>
      )}

      {payload?.type === 'music' && <MusicPlayerCard track={payload.track} compact />}
    </div>
  )
}
